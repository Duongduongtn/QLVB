"""CV ĐẾN — Nhóm E (E1 vào sổ + E1.6 dedup 3 lớp).

Luồng: upload PDF → tạo draft (lưu mã hoá + asset tạm `in_tmp` cho worker OCR) → worker
trả text+autofill → user sửa metadata → `register` cấp số đến (sổ chung 2 đơn vị).
Dedup 3 lớp khi KHÔNG có chữ ký số hợp lệ: sha256 (đỏ) / metadata (vàng) / OCR text (nhẹ).
"""

from __future__ import annotations

import hashlib
from contextlib import suppress
from datetime import UTC, date, datetime, timedelta, timezone
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
from app.models.organization import Organization
from app.services import numbering
from app.services.audit import log_action

_VN_TZ = timezone(timedelta(hours=7))  # Asia/Saigon — biên ngày lọc theo giờ VN
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


def _auto_register_on_upload(
    db: Session, doc: IncomingDocument, *, actor_id: int, ip: str | None, ua: str | None
) -> None:
    """Tự động vào sổ (cấp SỐ ĐẾN) ngay khi tải lên — quyết định 02/07/2026.

    Bỏ ràng buộc trích yếu + KHÔNG chặn trùng (dedup thành cảnh báo, xem sau). Chưa cấu
    hình sổ đến ('in' doc_type) → GIỮ nháp để vào sổ tay sau. Số đã cấp không tái dùng.
    """
    dt = db.scalars(
        select(DocumentType).where(DocumentType.direction == "in").order_by(DocumentType.id)
    ).first()
    if dt is None:
        # Chưa cấu hình sổ đến → TỪ CHỐI (create_from_upload rollback + xoá asset) thay vì
        # tạo nháp mồ côi không lối vào sổ (FE đã bỏ nút cấp số tay).
        raise ValidationFailed(
            "Chưa cấu hình sổ công văn đến — vào Cấu hình → Sổ công văn để tạo sổ trước khi tải lên"
        )
    today = datetime.now(_VN_TZ).date()
    number_int, formatted = numbering.allocate_number(db, dt, unit_code=None, on_date=today)
    doc.doc_type_id = dt.id
    doc.number_int = number_int
    doc.number = formatted
    doc.period_key = numbering.period_key(dt.reset_policy, today)
    doc.status = "registered"
    log_action(
        db,
        action="incoming_register",
        user_id=actor_id,
        object_type="incoming_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
        detail={"number": formatted, "auto": True},
    )


def create_from_upload(
    db: Session, data: bytes, filename: str | None, *, actor_id: int, ip: str | None, ua: str | None
) -> tuple[IncomingDocument, str, str]:
    """Tạo bản nháp CV đến từ file PDF.

    Trả (doc, ocr_tmp_key, sig_tmp_key): 2 bản tạm KHÔNG mã hoá cho worker OCR (E1) và
    verify PAdES (E1.5). Mỗi worker tự xoá bản của mình sau khi xử lý (beat purge backstop).
    """
    if not data.startswith(b"%PDF"):
        raise ValidationFailed("File công văn đến phải là PDF")
    sha = hashlib.sha256(data).hexdigest()
    enc = save_encrypted_file(data, ext="pdf", subdir="incoming")
    tmp = save_asset(data, ext="pdf", subdir="in_tmp")  # bản KHÔNG mã hoá cho worker OCR
    sig_tmp = save_asset(data, ext="pdf", subdir="sig_tmp")  # bản cho worker verify PAdES
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
        # Tự động vào sổ ngay khi tải lên (cấp số đến) — user điền/sửa metadata sau.
        _auto_register_on_upload(db, doc, actor_id=actor_id, ip=ip, ua=ua)
        db.commit()
    except Exception:
        db.rollback()
        delete_asset(enc.storage_key)
        delete_asset(tmp.storage_key)
        delete_asset(sig_tmp.storage_key)
        raise
    db.refresh(doc)
    return doc, tmp.storage_key, sig_tmp.storage_key


def _match_sender_org(db: Session, name: str | None) -> int | None:
    """Dò cơ quan gửi trong danh bạ theo tên (khớp chính xác, không phân biệt hoa/thường).

    Chỉ khớp tuyệt đối full_name/short_name của org `is_sender` — tránh tự gắn nhầm.
    """
    if not name or not name.strip():
        return None
    needle = name.strip().lower()
    base = (Organization.deleted_at.is_(None), Organization.is_sender.is_(True))
    for col in (Organization.full_name, Organization.short_name):
        oid = db.scalar(select(Organization.id).where(*base, func.lower(col) == needle))
        if oid is not None:
            return oid
    return None


def _autofill_sender(doc: IncomingDocument, db: Session, name: str | None) -> None:
    """Điền tên cơ quan gửi (free-text) + thử gắn danh bạ. Không đè khi đã có id xác nhận."""
    if not name or not name.strip():
        return
    name = name.strip()[:200]
    if doc.sender_org_id is not None:
        return  # đã khớp danh bạ rồi → giữ nguyên
    doc.sender_org_name = name
    matched = _match_sender_org(db, name)
    if matched is not None:
        doc.sender_org_id = matched


def set_ocr_result(
    db: Session, doc_id: int, *, ocr_text: str, auto_fill: dict[str, Any]
) -> IncomingDocument:
    """Lưu text OCR + tự điền tối đa metadata nếu user CHƯA nhập (không đè tay)."""
    doc = _lock(db, doc_id)
    doc.ocr_text = ocr_text or None
    if not doc.reference_number and auto_fill.get("reference_number"):
        doc.reference_number = str(auto_fill["reference_number"])[:100]
    if not doc.document_date and auto_fill.get("document_date"):
        with suppress(ValueError):
            doc.document_date = date.fromisoformat(str(auto_fill["document_date"]))
    if not doc.subject and auto_fill.get("subject"):
        doc.subject = str(auto_fill["subject"])[:500]
    # Cơ quan gửi: gợi ý OCR (dòng IN HOA) — chữ ký số (nếu có) sẽ ưu tiên đè sau.
    if not doc.sender_org_name and not doc.sender_org_id and auto_fill.get("sender_hint"):
        _autofill_sender(doc, db, str(auto_fill["sender_hint"]))
    db.commit()
    db.refresh(doc)
    return doc


_SIG_STATUSES = ("none", "valid", "invalid")


def set_signature_result(
    db: Session, doc_id: int, *, status: str, info: dict[str, Any] | None
) -> IncomingDocument:
    """E1.5 — lưu kết quả verify PAdES (worker trả qua poll). status hợp lệ → ghi DB.

    'valid' → register() sẽ BỎ QUA dedup 3 lớp (chữ ký số tin cậy đảm bảo duy nhất).
    """
    doc = _lock(db, doc_id)
    if status in _SIG_STATUSES:
        doc.signature_status = status
        doc.signature_info = info
        # Auto-fill từ chứng thư ký số (nguồn 'cơ quan phát hành' chính xác nhất).
        sigs = (info or {}).get("signatures") or []
        first = sigs[0] if isinstance(sigs, list) and sigs else {}
        if isinstance(first, dict):
            org = first.get("signer_org")
            if org:
                _autofill_sender(doc, db, str(org))
            # Ngày văn bản fallback từ thời điểm ký (khi OCR không bắt được ngày).
            if not doc.document_date and first.get("signed_at"):
                with suppress(ValueError):
                    doc.document_date = datetime.fromisoformat(
                        str(first["signed_at"])
                    ).date()
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


def _json_safe(v: Any) -> Any:
    """Đưa giá trị về dạng JSON-hoá được để ghi vào audit detail (date → ISO)."""
    if isinstance(v, date):
        return v.isoformat()
    return v


# Whitelist trường được sửa qua update() — hàng rào chống mass-assignment: dù sau này ai
# thêm field vào IncomingUpdate cũng KHÔNG tự động ghi được nếu chưa thêm vào đây. `number`
# (số đến) cố tình KHÔNG có mặt → bất biến. `manager_only` được router chặn theo vai trò.
_UPDATABLE_FIELDS = frozenset(
    {
        "reference_number",
        "document_date",
        "sender_org_id",
        "sender_org_name",
        "subject",
        "urgency",
        "confidentiality",
        "deadline",
        "manager_only",
    }
)


def update(
    db: Session,
    doc_id: int,
    fields: dict[str, Any],
    *,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> IncomingDocument:
    """Sửa metadata công văn đến.

    Cho sửa cả khi ĐÃ vào sổ (sửa số ký hiệu/ngày/cơ quan/trích yếu...) — chỉ chặn
    khi đã huỷ. Ghi lịch sử tác động: trường nào đổi + giá trị cũ→mới vào audit.
    """
    doc = _lock(db, doc_id)
    if doc.status == "cancelled":
        raise Conflict("Công văn đã huỷ vào sổ — không sửa được")
    changed: dict[str, dict[str, Any]] = {}
    for k, v in fields.items():
        if k not in _UPDATABLE_FIELDS:
            continue  # chống mass-assignment (không ghi field ngoài whitelist)
        old = getattr(doc, k, None)
        if old == v:
            continue  # không đổi → không ghi nhận
        changed[k] = {"old": _json_safe(old), "new": _json_safe(v)}
        setattr(doc, k, v)
    if not changed:
        return doc  # không có thay đổi thực → khỏi ghi log
    log_action(
        db,
        action="incoming_update",
        user_id=actor_id,
        object_type="incoming_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
        detail={"fields": list(changed.keys()), "changed": changed},
    )
    db.commit()
    db.refresh(doc)
    return doc


def soft_delete(
    db: Session, doc_id: int, *, actor_id: int, ip: str | None, ua: str | None
) -> None:
    """Xoá mềm công văn đến (ẩn khỏi sổ) — audit log giữ lại. Số đến đã cấp KHÔNG tái dùng."""
    doc = _lock(db, doc_id)
    doc.deleted_at = datetime.now(UTC)
    log_action(
        db,
        action="incoming_delete",
        user_id=actor_id,
        object_type="incoming_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
        detail={"number": doc.number},
    )
    db.commit()


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
        detail={
            "number": formatted,
            "duplicate_override": bool(doc.duplicate_note),
            "signature_status": doc.signature_status,  # truy vết: 'valid' = bỏ dedup hợp lệ
        },
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
    confidentiality: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
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
    if confidentiality:
        conds.append(IncomingDocument.confidentiality == confidentiality)
    if date_from is not None:
        conds.append(IncomingDocument.created_at >= datetime.combine(date_from, datetime.min.time(), _VN_TZ))
    if date_to is not None:
        conds.append(
            IncomingDocument.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), _VN_TZ)
        )
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
