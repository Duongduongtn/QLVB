"""Nghiệp vụ CV đi — Nhóm D (D1 phát hành, D6 sổ). Chèn mộc/chữ ký + cấp số atomic.

Máy trạng thái: draft → numbered (đốt 1 số, file _CHUA_KY_SO) → published (upload file ký
số, D1.12 — defer). Cấp số dùng `numbering.allocate_number` (nextval ATOMIC, chống trùng
kể cả 2 user đồng thời). "Dùng số có sẵn" → check trùng + sync sequence (setval không lùi).

Phân quyền: cả Quản lý + Nhân viên CRUD mọi CV của CẢ 2 đơn vị (đội nhỏ dùng chung, user
KHÔNG gắn đơn vị; CV đi không có cờ "chỉ Quản lý xem" như E1). KHÔNG chặn truy cập xuyên
đơn vị — theo thiết kế; truy vết qua audit (gồm cả tải file). Đây KHÔNG phải IDOR lỗi.

Mọi thao tác ghi audit. Render stamped tái dùng `pdf_stamp` + ảnh mộc/chữ ký đã tách nền.
Defer: convert Word (LibreOffice-worker), verify chữ ký số PDF đầu vào (pyHanko), watermark
on-the-fly khi tải (D1.11), upload file đã ký (D1.12), D5 in_reply_to.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.errors import Conflict, NotFound, PermissionDenied, ValidationFailed
from app.core.storage import (
    delete_asset,
    read_asset,
    read_encrypted_file,
    save_encrypted_file,
)
from app.models.document_type import DocumentType
from app.models.file import File
from app.models.organization import Organization
from app.models.outgoing_document import OutgoingDocument, OutgoingRecipient
from app.models.seal import Seal
from app.models.signature import Signature
from app.models.signing_profile import SigningProfile
from app.models.unit import Unit
from app.schemas.outgoing import OutgoingCreate, OutgoingUpdate
from app.services import numbering, pdf_stamp
from app.services.audit import log_action


def get_outgoing(db: Session, doc_id: int) -> OutgoingDocument:
    doc = db.get(OutgoingDocument, doc_id)
    if doc is None or doc.deleted_at is not None:
        raise NotFound("Không tìm thấy công văn")
    return doc


def _lock_doc(db: Session, doc_id: int) -> OutgoingDocument:
    """Lấy + KHOÁ row (SELECT ... FOR UPDATE) → 2 request ghi song song không xen kẽ
    (cấp số / upload ký số / huỷ). Dùng cho mọi thao tác đổi trạng thái."""
    doc = db.execute(
        select(OutgoingDocument).where(OutgoingDocument.id == doc_id).with_for_update()
    ).scalar_one_or_none()
    if doc is None or doc.deleted_at is not None:
        raise NotFound("Không tìm thấy công văn")
    return doc


def get_recipients(db: Session, outgoing_id: int) -> list[Organization]:
    stmt = (
        select(Organization)
        .join(OutgoingRecipient, OutgoingRecipient.organization_id == Organization.id)
        .where(OutgoingRecipient.outgoing_id == outgoing_id)
        .order_by(Organization.full_name)
    )
    return list(db.scalars(stmt).all())


def _validate_profile(db: Session, profile_id: int, unit_id: int) -> SigningProfile:
    """CHỐNG NHẦM MỘC (bất biến C4/D1.9): hồ sơ ký PHẢI thuộc đúng đơn vị phát hành +
    đang dùng. Enforce ở server — FE lọc + bước xác nhận chỉ là lớp UX."""
    profile = db.get(SigningProfile, profile_id)
    if profile is None:
        raise NotFound("Không tìm thấy hồ sơ ký")
    if profile.unit_id != unit_id:
        raise ValidationFailed("Hồ sơ ký không thuộc đơn vị phát hành (chống nhầm mộc)")
    if not profile.is_active:
        raise ValidationFailed("Hồ sơ ký đã ngừng dùng")
    return profile


def _validate_in_reply_to(db: Session, incoming_id: int) -> None:
    """D5 — CV đến được phản hồi phải tồn tại + chưa xoá."""
    from app.models.incoming_document import IncomingDocument

    inc = db.get(IncomingDocument, incoming_id)
    if inc is None or inc.deleted_at is not None:
        raise NotFound("Không tìm thấy công văn đến để liên kết")


def list_replies(db: Session, incoming_id: int) -> list[OutgoingDocument]:
    """D5 — danh sách CV đi phản hồi 1 CV đến (2 chiều)."""
    return list(
        db.scalars(
            select(OutgoingDocument)
            .where(
                OutgoingDocument.in_reply_to_incoming_id == incoming_id,
                OutgoingDocument.deleted_at.is_(None),
            )
            .order_by(OutgoingDocument.created_at.desc())
        ).all()
    )


def _set_recipients(db: Session, doc_id: int, recipient_ids: list[int]) -> None:
    db.query(OutgoingRecipient).filter(OutgoingRecipient.outgoing_id == doc_id).delete()
    for oid in dict.fromkeys(recipient_ids):  # giữ thứ tự, loại trùng
        if db.get(Organization, oid) is not None:
            db.add(OutgoingRecipient(outgoing_id=doc_id, organization_id=oid))


def create_draft(
    db: Session, data: OutgoingCreate, *, actor_id: int, ip: str | None, ua: str | None
) -> OutgoingDocument:
    if db.get(Unit, data.unit_id) is None:
        raise NotFound("Không tìm thấy đơn vị phát hành")
    if db.get(DocumentType, data.doc_type_id) is None:
        raise NotFound("Không tìm thấy loại văn bản")
    if data.signing_profile_id is not None:
        _validate_profile(db, data.signing_profile_id, data.unit_id)
    if data.in_reply_to_incoming_id is not None:
        _validate_in_reply_to(db, data.in_reply_to_incoming_id)

    doc = OutgoingDocument(
        unit_id=data.unit_id,
        doc_type_id=data.doc_type_id,
        subject=data.subject,
        issue_date=data.issue_date,
        status="draft",
        signing_profile_id=data.signing_profile_id,
        in_reply_to_incoming_id=data.in_reply_to_incoming_id,
        stamp_positions=[p.model_dump() for p in data.stamp_positions]
        if data.stamp_positions
        else None,
        sealing_option=data.sealing_option.model_dump() if data.sealing_option else None,
        created_by=actor_id,
    )
    db.add(doc)
    db.flush()
    _set_recipients(db, doc.id, data.recipient_ids)
    log_action(
        db,
        action="outgoing_create",
        user_id=actor_id,
        object_type="outgoing_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
        detail={"unit_id": data.unit_id, "doc_type_id": data.doc_type_id},
    )
    db.commit()
    db.refresh(doc)
    return doc


def update_draft(
    db: Session, doc_id: int, data: OutgoingUpdate, *, actor_id: int, ip: str | None, ua: str | None
) -> OutgoingDocument:
    doc = get_outgoing(db, doc_id)
    if doc.status != "draft":
        raise Conflict("Chỉ sửa được khi công văn còn ở trạng thái nháp")
    changes = data.model_dump(exclude_unset=True)
    if changes.get("signing_profile_id") is not None:
        _validate_profile(db, changes["signing_profile_id"], doc.unit_id)
    if changes.get("in_reply_to_incoming_id") is not None:
        _validate_in_reply_to(db, changes["in_reply_to_incoming_id"])
    if "recipient_ids" in changes:
        _set_recipients(db, doc.id, changes.pop("recipient_ids") or [])
    if "stamp_positions" in changes and changes["stamp_positions"] is not None:
        changes["stamp_positions"] = [
            p.model_dump() if hasattr(p, "model_dump") else p for p in changes["stamp_positions"]
        ]
    if "sealing_option" in changes and changes["sealing_option"] is not None:
        so = changes["sealing_option"]
        changes["sealing_option"] = so.model_dump() if hasattr(so, "model_dump") else so
    for field, value in changes.items():
        setattr(doc, field, value)
    log_action(
        db,
        action="outgoing_update",
        user_id=actor_id,
        object_type="outgoing_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
        detail={"changed": sorted(changes.keys())},
    )
    db.commit()
    db.refresh(doc)
    return doc


def set_file(
    db: Session,
    doc_id: int,
    data: bytes,
    filename: str | None,
    *,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> OutgoingDocument:
    doc = get_outgoing(db, doc_id)
    if doc.status != "draft":
        raise Conflict("Chỉ thay file khi công văn còn nháp")
    if not data.startswith(b"%PDF"):
        # Word convert THÀNH PDF ở worker (router), tới đây luôn là PDF.
        raise ValidationFailed("File công văn phải là PDF")
    pdf_bytes = data

    old = db.get(File, doc.original_file_id) if doc.original_file_id is not None else None
    old_key = old.storage_key if old is not None else None
    enc = save_encrypted_file(pdf_bytes, ext="pdf", subdir="cv")
    try:
        new_file = File(
            storage_key=enc.storage_key,
            location="local",
            wrapped_key=enc.wrapped_key,
            sha256=enc.sha256,
            size_bytes=enc.size_bytes,
            mime_type="application/pdf",
            original_name=filename or "goc.pdf",
        )
        db.add(new_file)
        db.flush()
        doc.original_file_id = new_file.id
        if old is not None:
            db.delete(old)
        log_action(
            db,
            action="outgoing_set_file",
            user_id=actor_id,
            object_type="outgoing_document",
            object_id=doc.id,
            ip=ip,
            user_agent=ua,
            detail={"size": enc.size_bytes},
        )
        db.commit()
    except Exception:
        db.rollback()
        delete_asset(enc.storage_key)
        raise
    db.refresh(doc)
    if old_key:
        delete_asset(old_key)
    return doc


def _load_profile_images(db: Session, profile_id: int | None) -> tuple[bytes | None, bytes | None]:
    """Trả (seal_png, signature_png) của hồ sơ ký (ảnh asset đã tách nền, không mã hoá)."""
    if profile_id is None:
        return None, None
    profile = db.get(SigningProfile, profile_id)
    if profile is None:
        return None, None
    seal_png = sig_png = None
    seal = db.get(Seal, profile.seal_id)
    if seal is not None and (sf := db.get(File, seal.file_id)) is not None:
        seal_png = read_asset(sf.storage_key)
    sig = db.get(Signature, profile.signature_id)
    if sig is not None and (gf := db.get(File, sig.file_id)) is not None:
        sig_png = read_asset(gf.storage_key)
    return seal_png, sig_png


def _default_positions(page_count: int, *, have_seal: bool, have_sig: bool) -> list[dict[str, Any]]:
    """Vị trí mặc định khi user chưa đặt thủ công (D2 cách D editor kéo-thả defer): chữ ký
    + mộc đè 1/3 ở góc dưới phải TRANG CUỐI (chỗ ký tên thường gặp)."""
    pos: list[dict[str, Any]] = []
    if have_sig:
        pos.append(
            {"kind": "signature", "page": page_count, "x_pct": 0.58, "y_pct": 0.74, "w_pct": 0.24, "h_pct": 0.10}
        )
    if have_seal:
        pos.append(
            {"kind": "seal", "page": page_count, "x_pct": 0.62, "y_pct": 0.68, "w_pct": 0.16, "h_pct": 0.16}
        )
    return pos


def _resolve_range(opt: dict[str, Any], page_count: int) -> tuple[int, int]:
    kind = opt.get("kind")
    if kind == "all":
        return 1, page_count
    pf = int(opt.get("page_from") or 1)
    pt = int(opt.get("page_to") or page_count)
    if pf > pt:
        raise ValidationFailed("Trang bắt đầu phải ≤ trang kết thúc")
    if pf < 1 or pt > page_count:
        raise ValidationFailed(f"Phạm vi trang vượt quá số trang thực ({page_count})")
    return pf, pt


def auto_detect_positions(
    db: Session, doc_id: int, *, actor_id: int, ip: str | None, ua: str | None
) -> tuple[OutgoingDocument, str]:
    """D2 — tự dò vị trí mộc/chữ ký (A placeholder → C template → B regex → default)."""
    from app.services import stamp_autodetect

    doc = _lock_doc(db, doc_id)
    if doc.status != "draft":
        raise Conflict("Chỉ dò vị trí khi công văn còn nháp")
    if doc.original_file_id is None:
        raise ValidationFailed("Chưa upload file công văn")
    if doc.signing_profile_id is None:
        raise ValidationFailed("Chọn hồ sơ ký trước khi dò vị trí")
    f = db.get(File, doc.original_file_id)
    if f is None or f.wrapped_key is None:
        raise ValidationFailed("Không đọc được file công văn gốc")
    data = read_encrypted_file(f.storage_key, f.wrapped_key)
    dt = db.get(DocumentType, doc.doc_type_id)
    template = dt.stamp_template if dt is not None else None
    positions, method = stamp_autodetect.detect_positions(
        data, want_seal=True, want_sig=True, template=template
    )
    if not positions:  # PDF scan / không khớp → góc dưới phải trang cuối (cách D fallback)
        positions = _default_positions(pdf_stamp.pdf_page_count(data), have_seal=True, have_sig=True)
        method = "default"
    doc.stamp_positions = positions
    log_action(
        db,
        action="outgoing_autodetect",
        user_id=actor_id,
        object_type="outgoing_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
        detail={"method": method},
    )
    db.commit()
    db.refresh(doc)
    return doc, method


def save_stamp_template(
    db: Session, doc_id: int, *, actor_id: int, ip: str | None, ua: str | None
) -> None:
    """D2 — lưu vị trí hiện tại làm template cho loại VB (lần sau tự áp — cách C)."""
    doc = get_outgoing(db, doc_id)
    if not doc.stamp_positions:
        raise ValidationFailed("Chưa có vị trí mộc/chữ ký để lưu làm template")
    dt = db.get(DocumentType, doc.doc_type_id)
    if dt is None:
        raise NotFound("Không tìm thấy loại văn bản")
    dt.stamp_template = list(doc.stamp_positions)
    log_action(
        db,
        action="doctype_save_template",
        user_id=actor_id,
        object_type="document_type",
        object_id=dt.id,
        ip=ip,
        user_agent=ua,
    )
    db.commit()


def render_stamped(db: Session, doc: OutgoingDocument) -> bytes:
    """Chèn mộc/chữ ký theo stamp_positions + giáp lai (D3) + ký nháy (D4). Trả PDF bytes."""
    if doc.original_file_id is None:
        raise ValidationFailed("Chưa upload file công văn")
    f = db.get(File, doc.original_file_id)
    if f is None or f.wrapped_key is None:
        raise ValidationFailed("Không đọc được file công văn gốc")
    raw = read_encrypted_file(f.storage_key, f.wrapped_key)

    seal_png, sig_png = _load_profile_images(db, doc.signing_profile_id)
    images: dict[str, bytes] = {}
    if seal_png is not None:
        images["seal"] = seal_png
    if sig_png is not None:
        images["signature"] = sig_png

    page_count = pdf_stamp.pdf_page_count(raw)
    placements = list(doc.stamp_positions or [])
    if not placements and images:  # chưa đặt thủ công → auto góc dưới phải trang cuối
        placements = _default_positions(
            page_count, have_seal="seal" in images, have_sig="signature" in images
        )
    out = pdf_stamp.stamp_images(raw, placements, images)
    so = doc.sealing_option or {}

    gl = so.get("giap_lai") or {}
    if gl.get("kind") in ("all", "range"):
        if seal_png is None:
            raise ValidationFailed("Giáp lai cần mộc — chọn hồ sơ ký trước")
        pf, pt = _resolve_range(gl, page_count)
        out = pdf_stamp.giap_lai(out, seal_png, page_from=pf, page_to=pt)

    kn = so.get("ky_nhay") or {}
    if kn.get("kind") in ("all", "range"):
        if sig_png is None:
            raise ValidationFailed("Ký nháy cần chữ ký — chọn hồ sơ ký trước")
        pf, pt = _resolve_range(kn, page_count)
        out = pdf_stamp.ky_nhay(out, sig_png, page_from=pf, page_to=pt)
    return out


def _assert_number_free(
    db: Session, doc_type_id: int, period_key: str, number_int: int, *, exclude_id: int
) -> None:
    stmt = select(OutgoingDocument.id).where(
        OutgoingDocument.deleted_at.is_(None),
        OutgoingDocument.doc_type_id == doc_type_id,
        OutgoingDocument.period_key == period_key,
        OutgoingDocument.number_int == number_int,
        OutgoingDocument.id != exclude_id,
    )
    if db.scalar(stmt) is not None:
        raise Conflict(f"Số {number_int} đã tồn tại trong sổ kỳ {period_key}")


def issue(
    db: Session,
    doc_id: int,
    *,
    manual_number: int | None,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> OutgoingDocument:
    """Chèn mộc + CẤP SỐ + lưu PDF _CHUA_KY_SO. draft → numbered."""
    doc = _lock_doc(db, doc_id)  # khoá row chống double-issue
    if doc.status != "draft":
        raise Conflict("Công văn đã được cấp số")
    if doc.signing_profile_id is None:
        raise ValidationFailed("Phải chọn hồ sơ ký trước khi cấp số")
    _validate_profile(db, doc.signing_profile_id, doc.unit_id)  # chống nhầm mộc

    doc_type = db.get(DocumentType, doc.doc_type_id)
    unit = db.get(Unit, doc.unit_id)
    if doc_type is None or unit is None:
        raise NotFound("Thiếu loại văn bản hoặc đơn vị")

    stamped = render_stamped(db, doc)  # validate file/range trước khi đốt số
    period = numbering.period_key(doc_type.reset_policy, doc.issue_date)

    if manual_number is None:
        number_int, formatted = numbering.allocate_number(
            db, doc_type, unit_code=unit.code, on_date=doc.issue_date
        )
    else:
        _assert_number_free(db, doc.doc_type_id, period, manual_number, exclude_id=doc.id)
        seq = numbering.get_or_create_sequence(db, doc_type, period)
        if manual_number >= numbering.peek_next(db, seq):  # đồng bộ để số tự cấp sau không trùng
            numbering.set_current(db, seq, manual_number)
        number_int = manual_number
        formatted = numbering.format_number(
            doc_type.number_format,
            stt=manual_number,
            zero_pad=doc_type.zero_pad,
            unit_code=unit.code,
            type_code=doc_type.code,
            on_date=doc.issue_date,
        )

    old = db.get(File, doc.original_file_id) if doc.original_file_id is not None else None
    old_key = old.storage_key if old is not None else None
    enc = save_encrypted_file(stamped, ext="pdf", subdir="cv")
    try:
        new_file = File(
            storage_key=enc.storage_key,
            location="local",
            wrapped_key=enc.wrapped_key,
            sha256=enc.sha256,
            size_bytes=enc.size_bytes,
            mime_type="application/pdf",
            original_name=f"{formatted.replace('/', '_')}_CHUA_KY_SO.pdf",
        )
        db.add(new_file)
        db.flush()
        doc.original_file_id = new_file.id
        if old is not None:
            db.delete(old)
        doc.number = formatted
        doc.number_int = number_int
        doc.period_key = period
        doc.status = "numbered"
        log_action(
            db,
            action="outgoing_issue",
            user_id=actor_id,
            object_type="outgoing_document",
            object_id=doc.id,
            ip=ip,
            user_agent=ua,
            detail={"number": formatted, "manual": manual_number is not None},
        )
        db.commit()
    except IntegrityError as exc:  # đua số cấp tay → unique index DB chặn
        db.rollback()
        delete_asset(enc.storage_key)
        raise Conflict("Số công văn vừa bị người khác dùng — chọn số khác") from exc
    except Exception:
        db.rollback()
        delete_asset(enc.storage_key)
        raise
    db.refresh(doc)
    if old_key:
        delete_asset(old_key)
    return doc


def read_original(db: Session, doc: OutgoingDocument) -> tuple[bytes, str]:
    """Trả (pdf_bytes, filename) của file gốc (đã giải mã) để tải về."""
    if doc.original_file_id is None:
        raise NotFound("Công văn chưa có file")
    f = db.get(File, doc.original_file_id)
    if f is None or f.wrapped_key is None:
        raise NotFound("Không tìm thấy file công văn")
    data = read_encrypted_file(f.storage_key, f.wrapped_key)
    return data, f.original_name or "cong-van.pdf"


def read_file_for_download(
    db: Session,
    doc: OutgoingDocument,
    *,
    signed: bool,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> tuple[bytes, str]:
    """Tải file CV (bản chưa ký = original, hoặc bản đã ký số = signed) + GHI AUDIT."""
    file_id = doc.signed_file_id if signed else doc.original_file_id
    if file_id is None:
        raise NotFound("Công văn chưa có file" if not signed else "Chưa có bản đã ký số")
    f = db.get(File, file_id)
    if f is None or f.wrapped_key is None:
        raise NotFound("Không tìm thấy file công văn")
    data = read_encrypted_file(f.storage_key, f.wrapped_key)
    log_action(
        db,
        action="outgoing_download",
        user_id=actor_id,
        object_type="outgoing_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
        detail={"file_id": file_id, "signed": signed},
    )
    db.commit()
    return data, f.original_name or "cong-van.pdf"


def _filename_has_number(filename: str | None, number_int: int) -> bool:
    """Số CV xuất hiện như TOKEN trong tên file (không phải chuỗi con của số khác)."""
    import re

    return re.search(rf"(?<!\d){number_int}(?!\d)", filename or "") is not None


def set_signed_file(
    db: Session,
    doc_id: int,
    pdf_bytes: bytes,
    filename: str | None,
    *,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> OutgoingDocument:
    """D1.12: tải bản ĐÃ KÝ SỐ → numbered → published. Check số CV trong tên file (chống
    nhầm file của CV khác). Lưu signed_file_id mã hoá."""
    doc = _lock_doc(db, doc_id)
    if doc.status != "numbered":
        raise Conflict("Chỉ tải bản ký số cho công văn đã cấp số (chưa phát hành)")
    if not pdf_bytes.startswith(b"%PDF"):
        raise ValidationFailed("File phải là PDF")
    # Edge D1: ký nhầm file CV khác → tên file phải chứa số CV (so khớp token, tránh
    # '247' lọt vào '1247').
    if doc.number_int is not None and not _filename_has_number(filename, doc.number_int):
        raise ValidationFailed(
            f"Tên file không chứa số CV {doc.number} — kiểm tra tránh tải nhầm file của công văn khác"
        )

    old = db.get(File, doc.signed_file_id) if doc.signed_file_id is not None else None
    old_key = old.storage_key if old is not None else None
    enc = save_encrypted_file(pdf_bytes, ext="pdf", subdir="cv")
    try:
        new_file = File(
            storage_key=enc.storage_key,
            location="local",
            wrapped_key=enc.wrapped_key,
            sha256=enc.sha256,
            size_bytes=enc.size_bytes,
            mime_type="application/pdf",
            original_name=filename or "da-ky-so.pdf",
        )
        db.add(new_file)
        db.flush()
        doc.signed_file_id = new_file.id
        if old is not None:
            db.delete(old)
        doc.status = "published"
        log_action(
            db,
            action="outgoing_publish",
            user_id=actor_id,
            object_type="outgoing_document",
            object_id=doc.id,
            ip=ip,
            user_agent=ua,
            detail={"number": doc.number},
        )
        db.commit()
    except Exception:
        db.rollback()
        delete_asset(enc.storage_key)
        raise
    db.refresh(doc)
    if old_key:
        delete_asset(old_key)
    return doc


def cancel(
    db: Session,
    doc_id: int,
    reason: str,
    *,
    actor_id: int,
    actor_role: str,
    ip: str | None,
    ua: str | None,
) -> OutgoingDocument:
    """Huỷ CV (draft/numbered/published → cancelled). Bắt buộc lý do. Số đã cấp KHÔNG tái
    dùng (sequence không lùi). **Thu hồi CV ĐÃ PHÁT HÀNH chỉ Quản lý** (PRD máy trạng thái)."""
    doc = _lock_doc(db, doc_id)
    if doc.status == "cancelled":
        raise Conflict("Công văn đã huỷ")
    if doc.status == "published" and actor_role != "manager":
        raise PermissionDenied("Chỉ Quản lý được thu hồi công văn đã phát hành")
    if not reason or not reason.strip():
        raise ValidationFailed("Phải nhập lý do huỷ")
    doc.status = "cancelled"
    doc.cancel_reason = reason.strip()
    log_action(
        db,
        action="outgoing_cancel",
        user_id=actor_id,
        object_type="outgoing_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
        detail={"reason": reason.strip(), "number": doc.number},
    )
    db.commit()
    db.refresh(doc)
    return doc


TRASH_KEEP_DAYS = 30  # CV trong thùng rác giữ tối đa ngần này ngày rồi tự xoá vĩnh viễn


def _lock_trashed(db: Session, doc_id: int) -> OutgoingDocument:
    doc = db.execute(
        select(OutgoingDocument).where(OutgoingDocument.id == doc_id).with_for_update()
    ).scalar_one_or_none()
    if doc is None:
        raise NotFound("Không tìm thấy công văn")
    if doc.deleted_at is None:
        raise Conflict("Công văn không nằm trong thùng rác")
    return doc


def soft_delete(
    db: Session, doc_id: int, *, actor_id: int, actor_role: str, ip: str | None, ua: str | None
) -> OutgoingDocument:
    """Xoá mềm CV → thùng rác (giữ 30 ngày). CV ĐÃ CẤP SỐ chỉ Quản lý xoá được (PRD edge)."""
    doc = _lock_doc(db, doc_id)
    if doc.number_int is not None and actor_role != "manager":
        raise PermissionDenied("Công văn đã cấp số — chỉ Quản lý được xoá")
    doc.deleted_at = func.now()
    log_action(
        db,
        action="outgoing_delete",
        user_id=actor_id,
        object_type="outgoing_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
        detail={"number": doc.number},
    )
    db.commit()
    db.refresh(doc)
    return doc


def restore(
    db: Session, doc_id: int, *, actor_id: int, ip: str | None, ua: str | None
) -> OutgoingDocument:
    """Khôi phục CV từ thùng rác."""
    doc = _lock_trashed(db, doc_id)
    doc.deleted_at = None
    log_action(
        db,
        action="outgoing_restore",
        user_id=actor_id,
        object_type="outgoing_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
        detail={"number": doc.number},
    )
    db.commit()
    db.refresh(doc)
    return doc


def _delete_doc_files(db: Session, doc: OutgoingDocument) -> list[str]:
    """Xoá row File (gốc + đã ký) của CV; trả storage_key để unlink đĩa SAU commit."""
    file_ids = [fid for fid in (doc.original_file_id, doc.signed_file_id) if fid is not None]
    db.delete(doc)
    db.flush()  # bỏ ràng buộc FK files trước khi xoá File
    keys: list[str] = []
    for fid in file_ids:
        f = db.get(File, fid)
        if f is not None:
            keys.append(f.storage_key)
            db.delete(f)
    return keys


def purge(db: Session, doc_id: int, *, actor_id: int, ip: str | None, ua: str | None) -> None:
    """Xoá VĨNH VIỄN 1 CV trong thùng rác (audit log giữ lại để truy vết)."""
    doc = _lock_trashed(db, doc_id)
    number = doc.number
    log_action(
        db,
        action="outgoing_purge",
        user_id=actor_id,
        object_type="outgoing_document",
        object_id=doc.id,
        ip=ip,
        user_agent=ua,
        detail={"number": number},
    )
    keys = _delete_doc_files(db, doc)
    db.commit()
    for key in keys:
        delete_asset(key)


def purge_expired_trash(db: Session, *, now: datetime, days: int = TRASH_KEEP_DAYS) -> int:
    """Cron: xoá vĩnh viễn CV trong thùng rác quá `days` ngày. Trả số CV đã xoá."""
    cutoff = now - timedelta(days=days)
    docs = list(
        db.scalars(
            select(OutgoingDocument).where(
                OutgoingDocument.deleted_at.is_not(None), OutgoingDocument.deleted_at < cutoff
            )
        ).all()
    )
    keys: list[str] = []
    for doc in docs:
        keys.extend(_delete_doc_files(db, doc))
    db.commit()
    for key in keys:
        delete_asset(key)
    return len(docs)


def list_trash(db: Session, *, page: int = 1, size: int = 20) -> tuple[list[OutgoingDocument], int]:
    conds = [OutgoingDocument.deleted_at.is_not(None)]
    total = db.scalar(select(func.count()).select_from(OutgoingDocument).where(*conds)) or 0
    stmt = (
        select(OutgoingDocument)
        .where(*conds)
        .order_by(OutgoingDocument.deleted_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(db.scalars(stmt).all()), total


def list_outgoing(
    db: Session,
    *,
    unit_id: int | None = None,
    status: str | None = None,
    q: str | None = None,
    page: int = 1,
    size: int = 20,
) -> tuple[list[OutgoingDocument], int]:
    conds: list[ColumnElement[bool]] = [OutgoingDocument.deleted_at.is_(None)]
    if unit_id is not None:
        conds.append(OutgoingDocument.unit_id == unit_id)
    if status:
        conds.append(OutgoingDocument.status == status)
    if q:
        esc = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like = f"%{esc}%"
        conds.append(
            OutgoingDocument.subject.ilike(like, escape="\\")
            | OutgoingDocument.number.ilike(like, escape="\\")
        )

    total = db.scalar(select(func.count()).select_from(OutgoingDocument).where(*conds)) or 0
    stmt = (
        select(OutgoingDocument)
        .where(*conds)
        .order_by(OutgoingDocument.issue_date.desc(), OutgoingDocument.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(db.scalars(stmt).all()), total
