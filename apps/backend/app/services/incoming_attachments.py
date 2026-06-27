"""Phụ lục đính kèm CV đến — E4 (INC.ATT).

Phụ lục lưu mã hoá phong bì như file CV chính (`save_encrypted_file` subdir 'incoming_att').
Ràng buộc: ≤50MB/file, tổng ≤500MB/CV. Phụ lục PDF được enqueue OCR (worker ghi `ocr_text`
qua SessionLocal — fire-and-forget, không cần FE poll). Tải lẻ từng phụ lục hoặc gộp ZIP
(CV chính + tất cả phụ lục).
"""

from __future__ import annotations

import io
import zipfile
from pathlib import PurePosixPath

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound, PermissionDenied, ValidationFailed
from app.core.storage import (
    delete_asset,
    read_encrypted_file,
    save_asset,
    save_encrypted_file,
)
from app.models.file import File
from app.models.incoming_attachment import IncomingAttachment
from app.models.incoming_document import IncomingDocument
from app.services import incoming as inc_service
from app.services.audit import log_action

MAX_FILE_BYTES = 50 * 1024 * 1024  # 50MB/phụ lục
MAX_TOTAL_BYTES = 500 * 1024 * 1024  # 500MB tổng phụ lục/CV

# Allowlist phần mở rộng phụ lục (PDF / Office / ảnh) — chặn upload tuỳ tiện.
_ALLOWED_EXT = frozenset(
    {"pdf", "doc", "docx", "xls", "xlsx", "csv", "png", "jpg", "jpeg", "gif", "webp", "tif", "tiff"}
)
_EXT_MIME = {
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "csv": "text/csv",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "tif": "image/tiff",
    "tiff": "image/tiff",
}


def _ext_of(filename: str | None) -> str:
    return PurePosixPath(filename or "").suffix.lower().lstrip(".")


def total_size(db: Session, incoming_id: int) -> int:
    return int(
        db.scalar(
            select(func.coalesce(func.sum(IncomingAttachment.size_bytes), 0)).where(
                IncomingAttachment.incoming_id == incoming_id
            )
        )
        or 0
    )


def add_attachment(
    db: Session,
    incoming_id: int,
    data: bytes,
    filename: str | None,
    *,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> tuple[IncomingAttachment, str | None]:
    """Đính kèm 1 phụ lục. Trả (attachment, ocr_tmp_key | None) — tmp_key để enqueue OCR (chỉ PDF)."""
    if not data:
        raise ValidationFailed("File phụ lục rỗng")
    if len(data) > MAX_FILE_BYTES:
        raise ValidationFailed("Phụ lục vượt quá 50MB")
    ext = _ext_of(filename)
    if ext not in _ALLOWED_EXT:
        raise ValidationFailed("Định dạng phụ lục không được hỗ trợ (PDF, Word, Excel, ảnh)")
    if total_size(db, incoming_id) + len(data) > MAX_TOTAL_BYTES:
        raise Conflict("Tổng dung lượng phụ lục của công văn vượt quá 500MB")

    enc_key: str | None = None
    tmp_key: str | None = None
    try:
        enc = save_encrypted_file(data, ext=ext, subdir="incoming_att")
        enc_key = enc.storage_key
        # PDF → bản tạm KHÔNG mã hoá cho worker OCR (xoá ngay sau OCR + beat purge backstop).
        if ext == "pdf":
            tmp_key = save_asset(data, ext="pdf", subdir="att_tmp").storage_key
        f = File(
            storage_key=enc.storage_key,
            location="local",
            wrapped_key=enc.wrapped_key,
            sha256=enc.sha256,
            size_bytes=enc.size_bytes,
            mime_type=_EXT_MIME.get(ext),
            original_name=filename or f"phu-luc.{ext}",
        )
        db.add(f)
        db.flush()
        att = IncomingAttachment(
            incoming_id=incoming_id,
            file_id=f.id,
            original_name=filename or f"phu-luc.{ext}",
            mime_type=_EXT_MIME.get(ext),
            size_bytes=enc.size_bytes,
            uploaded_by=actor_id,
        )
        db.add(att)
        db.flush()
        log_action(
            db,
            action="incoming_attachment_add",
            user_id=actor_id,
            object_type="incoming_document",
            object_id=incoming_id,
            ip=ip,
            user_agent=ua,
            detail={"attachment_id": att.id, "name": att.original_name, "size": enc.size_bytes},
        )
        db.commit()
    except Exception:
        db.rollback()
        if enc_key:  # dọn file mã hoá + bản tạm mồ côi nếu lỗi giữa chừng
            delete_asset(enc_key)
        if tmp_key:
            delete_asset(tmp_key)
        raise
    db.refresh(att)
    return att, tmp_key


def list_attachments(db: Session, incoming_id: int) -> list[IncomingAttachment]:
    return list(
        db.scalars(
            select(IncomingAttachment)
            .where(IncomingAttachment.incoming_id == incoming_id)
            .order_by(IncomingAttachment.created_at.asc(), IncomingAttachment.id.asc())
        ).all()
    )


def get_attachment(db: Session, incoming_id: int, att_id: int) -> IncomingAttachment:
    att = db.get(IncomingAttachment, att_id)
    if att is None or att.incoming_id != incoming_id:
        raise NotFound("Không tìm thấy phụ lục")
    return att


def read_attachment(db: Session, att: IncomingAttachment) -> tuple[bytes, str, str]:
    """Giải mã 1 phụ lục → (bytes, tên file, mime)."""
    f = db.get(File, att.file_id)
    if f is None or f.wrapped_key is None:
        raise NotFound("Không tìm thấy file phụ lục")
    data = read_encrypted_file(f.storage_key, f.wrapped_key)
    return data, att.original_name or "phu-luc", att.mime_type or "application/octet-stream"


def _safe_zip_name(name: str, seen: set[str]) -> str:
    """Tên file an toàn + không trùng trong ZIP (chống path traversal khi giải nén)."""
    base = PurePosixPath(name).name.replace("\\", "_") or "file"
    candidate = base
    i = 1
    while candidate in seen:
        stem = PurePosixPath(base).stem
        suffix = PurePosixPath(base).suffix
        candidate = f"{stem}_{i}{suffix}"
        i += 1
    seen.add(candidate)
    return candidate


def build_zip(db: Session, doc: IncomingDocument) -> bytes:
    """Gộp CV chính + tất cả phụ lục thành 1 ZIP (E4 'tải gộp')."""
    seen: set[str] = set()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        main_data, main_name = inc_service.read_file(db, doc)
        zf.writestr(_safe_zip_name(main_name, seen), main_data)
        for att in list_attachments(db, doc.id):
            data, name, _ = read_attachment(db, att)
            zf.writestr(_safe_zip_name(name, seen), data)
    return buf.getvalue()


def set_ocr_text(db: Session, att_id: int, text: str) -> None:
    """Worker ghi text OCR phụ lục PDF (full-text search F1). Bỏ qua nếu phụ lục đã bị xoá."""
    att = db.get(IncomingAttachment, att_id)
    if att is None:
        return
    att.ocr_text = text or None
    db.commit()


def delete_attachment(
    db: Session,
    incoming_id: int,
    att_id: int,
    *,
    actor_id: int,
    actor_role: str,
    ip: str | None,
    ua: str | None,
) -> None:
    """Xoá 1 phụ lục (xoá hẳn row + file đĩa). Chỉ người tải lên hoặc Quản lý. Audit để truy vết."""
    att = get_attachment(db, incoming_id, att_id)
    if actor_role != "manager" and att.uploaded_by != actor_id:
        raise PermissionDenied("Chỉ người tải lên hoặc Quản lý mới xoá được phụ lục")
    f = db.get(File, att.file_id)
    storage_key = f.storage_key if f is not None else None
    name = att.original_name
    db.delete(att)
    if f is not None:
        db.delete(f)
    log_action(
        db,
        action="incoming_attachment_delete",
        user_id=actor_id,
        object_type="incoming_document",
        object_id=incoming_id,
        ip=ip,
        user_agent=ua,
        detail={"attachment_id": att_id, "name": name},
    )
    db.commit()
    if storage_key:  # xoá file đĩa SAU commit (DB là nguồn chân lý)
        delete_asset(storage_key)
