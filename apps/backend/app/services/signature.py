"""Nghiệp vụ chữ ký — C2 (SIG.SGN, chỉ Quản lý upload/sửa).

Bất biến (PRD C2 + TDD §dòng 310-319):
- 1 người nhiều chữ ký (cũ/mới) → KHÔNG unique theo họ tên.
- `default_unit_id` chỉ là đơn vị mặc định (đổi được, nullable).
- Ảnh chữ ký lưu asset KHÔNG mã hoá (file.wrapped_key NULL).
- KHÔNG xoá cứng — "ngừng dùng" = is_active=False.
Mọi thao tác ghi audit_logs.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.core.storage import delete_asset, save_asset
from app.models.file import File
from app.models.signature import Signature
from app.models.unit import Unit
from app.schemas.signature import SignatureUpdate
from app.services.audit import log_action


def list_signatures(
    db: Session, *, unit_id: int | None = None, include_inactive: bool = False
) -> list[Signature]:
    """Danh sách chữ ký. unit_id lọc theo đơn vị mặc định (cho luồng chọn chữ ký khi
    tạo hồ sơ ký). Mặc định chỉ chữ ký đang dùng."""
    stmt = select(Signature)
    if unit_id is not None:
        stmt = stmt.where(Signature.default_unit_id == unit_id)
    if not include_inactive:
        stmt = stmt.where(Signature.is_active.is_(True))
    stmt = stmt.order_by(Signature.full_name, Signature.id)
    return list(db.scalars(stmt).all())


def get_signature(db: Session, signature_id: int) -> Signature:
    sig = db.get(Signature, signature_id)
    if sig is None:
        raise NotFound("Không tìm thấy chữ ký")
    return sig


def _check_unit(db: Session, unit_id: int | None) -> None:
    if unit_id is not None and db.get(Unit, unit_id) is None:
        raise NotFound("Không tìm thấy đơn vị")


def create_signature(
    db: Session,
    *,
    full_name: str,
    title: str | None,
    default_unit_id: int | None,
    data: bytes,
    ext: str,
    mime: str | None,
    original_name: str | None,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> Signature:
    """Tạo chữ ký mới: lưu ảnh asset (không mã hoá) → File → Signature trỏ tới."""
    _check_unit(db, default_unit_id)

    asset = save_asset(data, ext=ext, subdir="signatures")
    try:
        file = File(
            storage_key=asset.storage_key,
            location="local",
            wrapped_key=None,  # asset chữ ký không mã hoá
            sha256=asset.sha256,
            size_bytes=asset.size_bytes,
            mime_type=mime,
            original_name=original_name,
        )
        db.add(file)
        db.flush()

        sig = Signature(
            full_name=full_name,
            title=title,
            default_unit_id=default_unit_id,
            file_id=file.id,
            uploaded_by=actor_id,
            is_active=True,
        )
        db.add(sig)
        db.flush()

        log_action(
            db,
            action="signature_create",
            user_id=actor_id,
            object_type="signature",
            object_id=sig.id,
            ip=ip,
            user_agent=ua,
            detail={"default_unit_id": default_unit_id, "file_id": file.id},
        )
        db.commit()
    except Exception:
        db.rollback()
        delete_asset(asset.storage_key)  # dọn ảnh mồ côi
        raise
    db.refresh(sig)
    return sig


def update_signature(
    db: Session,
    signature_id: int,
    data: SignatureUpdate,
    *,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> Signature:
    """Sửa chữ ký: đổi họ tên / chức danh / đơn vị mặc định / trạng thái."""
    sig = get_signature(db, signature_id)
    changes = data.model_dump(exclude_unset=True)
    if "default_unit_id" in changes:
        _check_unit(db, changes["default_unit_id"])
    for field, value in changes.items():
        setattr(sig, field, value)

    log_action(
        db,
        action="signature_update",
        user_id=actor_id,
        object_type="signature",
        object_id=sig.id,
        ip=ip,
        user_agent=ua,
        detail={"changed": sorted(changes.keys())},
    )
    db.commit()
    db.refresh(sig)
    return sig
