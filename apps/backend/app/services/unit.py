"""Nghiệp vụ cấu hình đơn vị — B1 (CFG.UNT, chỉ Quản lý sửa).

Bất biến (PRD B1):
- 2 đơn vị cố định → KHÔNG tạo/xoá, chỉ sửa thông tin hiển thị.
- Mã màu (`color`) giữ nhất quán → không sửa qua API này.
- Logo PNG/JPG ≤ 2MB lưu dạng asset KHÔNG mã hoá (file.wrapped_key NULL).
Mọi thao tác sửa ghi audit_logs.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.core.storage import delete_asset, save_asset
from app.models.file import File
from app.models.unit import Unit
from app.schemas.unit import UnitUpdate
from app.services.audit import log_action


def list_units(db: Session) -> list[Unit]:
    return list(db.scalars(select(Unit).order_by(Unit.id)).all())


def get_unit(db: Session, unit_id: int) -> Unit:
    unit = db.get(Unit, unit_id)
    if unit is None:
        raise NotFound("Không tìm thấy đơn vị")
    return unit


def update_unit(
    db: Session, unit_id: int, data: UnitUpdate, *, actor_id: int, ip: str | None, ua: str | None
) -> Unit:
    unit = get_unit(db, unit_id)
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(unit, field, value)

    log_action(
        db,
        action="unit_update",
        user_id=actor_id,
        object_type="unit",
        object_id=unit.id,
        ip=ip,
        user_agent=ua,
        detail={"changed": sorted(changes.keys())},
    )
    db.commit()
    db.refresh(unit)
    return unit


def set_logo(
    db: Session,
    unit_id: int,
    *,
    data: bytes,
    ext: str,
    mime: str | None,
    original_name: str | None,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> Unit:
    """Lưu logo mới (asset không mã hoá) + trỏ unit.logo_file_id sang file mới.

    Logo cũ (nếu có) bị xoá khỏi DB + đĩa để tránh tích rác orphan — file đĩa unlink
    SAU commit (side-effect ngoài giao dịch, giống kick_sessions ở user service).
    """
    unit = get_unit(db, unit_id)

    old_logo = db.get(File, unit.logo_file_id) if unit.logo_file_id is not None else None
    old_key = old_logo.storage_key if old_logo is not None else None

    asset = save_asset(data, ext=ext, subdir="logos")
    logo = File(
        storage_key=asset.storage_key,
        location="local",
        wrapped_key=None,  # asset logo không mã hoá
        sha256=asset.sha256,
        size_bytes=asset.size_bytes,
        mime_type=mime,
        original_name=original_name,
    )
    db.add(logo)
    db.flush()  # lấy logo.id

    unit.logo_file_id = logo.id
    if old_logo is not None:  # unit đã trỏ sang logo mới → bỏ row file cũ
        db.delete(old_logo)
    log_action(
        db,
        action="unit_set_logo",
        user_id=actor_id,
        object_type="unit",
        object_id=unit.id,
        ip=ip,
        user_agent=ua,
        detail={"file_id": logo.id, "size": asset.size_bytes},
    )
    db.commit()
    db.refresh(unit)
    if old_key:
        delete_asset(old_key)
    return unit
