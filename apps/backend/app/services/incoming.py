"""CV ĐẾN — Nhóm E (E1 vào sổ + E1.6 dedup 3 lớp).

Luồng: upload PDF → tạo draft (lưu mã hoá + asset tạm `in_tmp` cho worker OCR) → worker
trả text+autofill → user sửa metadata → `register` cấp số đến (sổ chung 2 đơn vị).
Dedup 3 lớp khi KHÔNG có chữ ký số hợp lệ: sha256 (đỏ) / metadata (vàng) / OCR text (nhẹ).
"""

from __future__ import annotations

import hashlib
from contextlib import suppress
from datetime import date
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.storage import delete_asset, save_asset, save_encrypted_file
from app.models.document_type import DocumentType
from app.models.file import File
from app.models.incoming_document import IncomingDocument
from app.services import numbering
from app.services.audit import log_action

_SIM_THRESHOLD = 0.9  # lớp 3: OCR text similarity > 90% → nghi trùng
_SIM_SCAN_LIMIT = 200  # giới hạn số bản ghi đối chiếu similarity (chống O(N) lớn)
_SIM_MAX_LEN = 4000  # cắt độ dài ocr_text khi so khớp (SequenceMatcher O(n·m))


def get_incoming(db: Session, doc_id: int) -> IncomingDocument:
    doc = db.get(IncomingDocument, doc_id)
    if doc is None or doc.deleted_at is not None:
        raise NotFound("Không tìm thấy công văn đến")
    return doc


def _lock(db: Session, doc_id: int) -> IncomingDocument:
    doc = db.execute(
        select(IncomingDocument)
        .where(IncomingDocument.id == doc_id, IncomingDocument.deleted_at.is_(None))
        .with_for_update()
    ).scalar_one_or_none()
    if doc is None:
        raise NotFound("Không tìm thấy công văn đến")
    return doc


def create_from_upload(
    db: Session, data: bytes, filename: str | None, *, actor_id: int, ip: str | None, ua: str | None
) -> tuple[IncomingDocument, str]:
    """Tạo bản nháp CV đến từ file PDF. Trả (doc, tmp_key) — tmp_key để enqueue OCR."""
    if not data.startswith(b"%PDF"):
        raise ValidationFailed("File công văn đến phải là PDF")
    sha = hashlib.sha256(data).hexdigest()
    enc = save_encrypted_file(data, ext="pdf", subdir="incoming")
    tmp = save_asset(data, ext="pdf", subdir="in_tmp")  # bản KHÔNG mã hoá cho worker OCR
    try:
        f = File(
            storage_key=enc.storage_key,
            location="local",
            wrapped_key=enc.wrapped_key,
            sha256=enc.sha256,
            size_bytes=enc.size_bytes,
            mime_type="application/pdf",
            original_name=filename or "cv-den.pdf",
        )
        db.add(f)
        db.flush()
        doc = IncomingDocument(file_id=f.id, sha256=sha, status="draft", created_by=actor_id)
        db.add(doc)
        db.flush()
        log_action(
            db,
            action="incoming_create",
            user_id=actor_id,
            object_type="incoming_document",
            object_id=doc.id,
            ip=ip,
            user_agent=ua,
            detail={"size": enc.size_bytes},
        )
        db.commit()
    except Exception:
        db.rollback()
        delete_asset(enc.storage_key)
        delete_asset(tmp.storage_key)
        raise
    db.refresh(doc)
    return doc, tmp.storage_key


def set_ocr_result(
    db: Session, doc_id: int, *, ocr_text: str, auto_fill: dict[str, Any]
) -> IncomingDocument:
    """Lưu text OCR + tự điền số ký hiệu/ngày VB nếu user CHƯA nhập (không đè tay)."""
    doc = _lock(db, doc_id)
    doc.ocr_text = ocr_text or None
    if not doc.reference_number and auto_fill.get("reference_number"):
        doc.reference_number = str(auto_fill["reference_number"])[:100]
    if not doc.document_date and auto_fill.get("document_date"):
        with suppress(ValueError):
            doc.document_date = date.fromisoformat(str(auto_fill["document_date"]))
    db.commit()
    db.refresh(doc)
    return doc


def check_duplicates(db: Session, doc: IncomingDocument) -> list[dict[str, Any]]:
    """3 lớp dedup. Trả [{layer, level, doc_id, number, reference_number}]."""
    dups: list[dict[str, Any]] = []

    def _row(d: IncomingDocument, layer: int, level: str) -> dict[str, Any]:
        return {
            "layer": layer,
            "level": level,
            "doc_id": d.id,
            "number": d.number,
            "reference_number": d.reference_number,
        }

    base = (IncomingDocument.deleted_at.is_(None), IncomingDocument.id != doc.id)

    # Lớp 1 — SHA-256 trùng tuyệt đối (đỏ).
    if doc.sha256:
        for d in db.scalars(
            select(IncomingDocument).where(*base, IncomingDocument.sha256 == doc.sha256)
        ).all():
            dups.append(_row(d, 1, "red"))

    # Lớp 2 — metadata (số ký hiệu + cơ quan gửi + ngày VB) (vàng).
    if doc.reference_number and doc.sender_org_id and doc.document_date:
        for d in db.scalars(
            select(IncomingDocument).where(
                *base,
                IncomingDocument.reference_number == doc.reference_number,
                IncomingDocument.sender_org_id == doc.sender_org_id,
                IncomingDocument.document_date == doc.document_date,
            )
        ).all():
            if not any(x["doc_id"] == d.id for x in dups):
                dups.append(_row(d, 2, "yellow"))

    # Lớp 3 — OCR text similarity > 90% (nhẹ). Đối chiếu tập gần đây có ocr_text.
    if doc.ocr_text and len(doc.ocr_text) > 80:
        seen = {x["doc_id"] for x in dups}
        mine = doc.ocr_text[:_SIM_MAX_LEN]  # cắt độ dài để chặn O(n·m) bùng nổ
        cands = db.scalars(
            select(IncomingDocument)
            .where(*base, IncomingDocument.ocr_text.is_not(None))
            .order_by(IncomingDocument.created_at.desc())
            .limit(_SIM_SCAN_LIMIT)
        ).all()
        for d in cands:
            if d.id in seen or not d.ocr_text:
                continue
            sm = SequenceMatcher(None, mine, d.ocr_text[:_SIM_MAX_LEN])
            if sm.quick_ratio() < _SIM_THRESHOLD:  # prefilter rẻ trước khi ratio() đắt
                continue
            if sm.ratio() >= _SIM_THRESHOLD:
                dups.append(_row(d, 3, "green"))
    return dups


def update(
    db: Session,
    doc_id: int,
    fields: dict[str, Any],
    *,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> IncomingDocument:
    """Sửa metadata khi còn nháp."""
    doc = _lock(db, doc_id)
    if doc.status != "draft":
        raise Conflict("Chỉ sửa khi công văn còn nháp")
    for k, v in fields.items():
        setattr(doc, k, v)
    log_action(
        db,
        action="incoming_update",
        user_id=actor_id,
        object_type="incoming_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
    )
    db.commit()
    db.refresh(doc)
    return doc


def register(
    db: Session,
    doc_id: int,
    *,
    doc_type_id: int,
    override_reason: str | None,
    actor_id: int,
    ip: str | None,
    ua: str | None,
    today: date,
) -> IncomingDocument:
    """Cấp SỐ ĐẾN (sổ chung) + chuyển 'registered'. Trùng tuyệt đối (lớp 1) cần lý do."""
    doc = _lock(db, doc_id)
    if doc.status != "draft":
        raise Conflict("Công văn đã được vào sổ")
    if not doc.subject:
        raise ValidationFailed("Thiếu trích yếu")

    # Bỏ qua dedup nếu đã verify chữ ký số hợp lệ (E1.5).
    if doc.signature_status != "valid":
        exact = [d for d in check_duplicates(db, doc) if d["layer"] == 1]
        if exact and not (override_reason and override_reason.strip()):
            raise Conflict("Công văn TRÙNG TUYỆT ĐỐI trong sổ — nhập lý do nếu vẫn muốn lưu")
    if override_reason and override_reason.strip():
        doc.duplicate_note = override_reason.strip()

    dt = db.get(DocumentType, doc_type_id)
    if dt is None or dt.direction != "in":
        raise ValidationFailed("Loại văn bản đến không hợp lệ")
    # Số đến cấp theo NGÀY TIẾP NHẬN (today) — sổ reset theo năm nhận, KHÔNG theo ngày VB.
    on_date = today
    number_int, formatted = numbering.allocate_number(db, dt, unit_code=None, on_date=on_date)
    doc.doc_type_id = doc_type_id
    doc.number_int = number_int
    doc.number = formatted
    doc.period_key = numbering.period_key(dt.reset_policy, on_date)
    doc.status = "registered"
    log_action(
        db,
        action="incoming_register",
        user_id=actor_id,
        object_type="incoming_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
        detail={"number": formatted, "duplicate_override": bool(doc.duplicate_note)},
    )
    try:
        db.commit()
    except IntegrityError as exc:  # đụng uq_inc_number (đua hiếm)
        db.rollback()
        raise Conflict("Số đến vừa bị cấp trùng, thử lại") from exc
    db.refresh(doc)
    return doc


def list_incoming(
    db: Session,
    *,
    include_manager_only: bool,
    status: str | None = None,
    sender_org_id: int | None = None,
    urgency: str | None = None,
    q: str | None = None,
    page: int = 1,
    size: int = 20,
) -> tuple[list[IncomingDocument], int]:
    conds: list[ColumnElement[bool]] = [IncomingDocument.deleted_at.is_(None)]
    if not include_manager_only:  # Nhân viên KHÔNG thấy CV "Chỉ Quản lý xem"
        conds.append(IncomingDocument.manager_only.is_(False))
    if status:
        conds.append(IncomingDocument.status == status)
    if sender_org_id is not None:
        conds.append(IncomingDocument.sender_org_id == sender_org_id)
    if urgency:
        conds.append(IncomingDocument.urgency == urgency)
    if q:
        like = f"%{q.strip().replace('%', chr(92) + '%').replace('_', chr(92) + '_')}%"
        conds.append(
            IncomingDocument.number.ilike(like, escape="\\")
            | IncomingDocument.reference_number.ilike(like, escape="\\")
            | IncomingDocument.subject.ilike(like, escape="\\")
        )
    total = db.scalar(select(func.count()).select_from(IncomingDocument).where(*conds)) or 0
    stmt = (
        select(IncomingDocument)
        .where(*conds)
        .order_by(IncomingDocument.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(db.scalars(stmt).all()), total


def read_file(db: Session, doc: IncomingDocument) -> tuple[bytes, str]:
    """Giải mã file gốc CV đến để tải/preview."""
    from app.core.storage import read_encrypted_file

    if doc.file_id is None:
        raise NotFound("Công văn chưa có file")
    f = db.get(File, doc.file_id)
    if f is None:
        raise NotFound("Không tìm thấy file")
    data = read_encrypted_file(f.storage_key, f.wrapped_key) if f.wrapped_key else b""
    return data, f.original_name or "cv-den.pdf"


def log_download(
    db: Session, doc: IncomingDocument, *, actor_id: int, ip: str | None, ua: str | None
) -> None:
    """Ghi audit khi tải file gốc CV đến (có thể là tài liệu mật)."""
    log_action(
        db,
        action="incoming_download",
        user_id=actor_id,
        object_type="incoming_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
    )
    db.commit()


def cancel(
    db: Session, doc_id: int, reason: str, *, actor_id: int, ip: str | None, ua: str | None
) -> IncomingDocument:
    """Huỷ CV đến — GIỮ số đến (không tái dùng), trạng thái 'cancelled'."""
    doc = _lock(db, doc_id)
    if doc.status == "cancelled":
        raise Conflict("Công văn đã huỷ")
    doc.status = "cancelled"
    doc.cancel_reason = reason
    log_action(
        db,
        action="incoming_cancel",
        user_id=actor_id,
        object_type="incoming_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
        detail={"number": doc.number},
    )
    db.commit()
    db.refresh(doc)
    return doc


def set_manager_only(
    db: Session, doc_id: int, value: bool, *, actor_id: int, ip: str | None, ua: str | None
) -> IncomingDocument:
    """Đổi cờ 'Chỉ Quản lý xem' (chỉ Quản lý gọi — enforce ở router)."""
    doc = _lock(db, doc_id)
    doc.manager_only = value
    log_action(
        db,
        action="incoming_set_manager_only",
        user_id=actor_id,
        object_type="incoming_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
        detail={"manager_only": value},
    )
    db.commit()
    db.refresh(doc)
    return doc
