"""Nghiệp vụ branding — B3b (CFG.BRD, chỉ Quản lý sửa).

1 dòng cấu hình duy nhất (id=1, đã seed migration 0003). Logo lưu asset KHÔNG mã hoá,
tái dùng tầng storage như logo đơn vị; đổi logo dọn file cũ. Mọi thao tác ghi audit.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.core.storage import delete_asset, save_asset
from app.models.app_settings import AppSettings
from app.models.file import File
from app.schemas.settings import SettingsUpdate
from app.services.audit import log_action

_SETTINGS_ID = 1


def get_settings_row(db: Session) -> AppSettings:
    row = db.get(AppSettings, _SETTINGS_ID)
    if row is None:  # phòng trường hợp seed thiếu (KHÔNG xảy ra khi migration chạy đủ)
        raise NotFound("Chưa khởi tạo cấu hình hệ thống")
    return row


def update_settings(
    db: Session, data: SettingsUpdate, *, actor_id: int, ip: str | None, ua: str | None
) -> AppSettings:
    row = get_settings_row(db)
    changes = data.model_dump(exclude_unset=True)
    if not changes:
        return row  # không gửi field nào → khỏi ghi audit/commit thừa
    for field, value in changes.items():
        setattr(row, field, value)
    log_action(
        db,
        action="settings_update",
        user_id=actor_id,
        object_type="app_settings",
        object_id=row.id,
        ip=ip,
        user_agent=ua,
        detail={"changed": sorted(changes.keys())},
    )
    db.commit()
    db.refresh(row)
    return row


def set_logo(
    db: Session,
    *,
    data: bytes,
    ext: str,
    mime: str | None,
    original_name: str | None,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> AppSettings:
    """Lưu logo app mới + dọn logo cũ (row File + file đĩa, unlink sau commit)."""
    row = get_settings_row(db)
    old_logo = db.get(File, row.logo_file_id) if row.logo_file_id is not None else None
    old_key = old_logo.storage_key if old_logo is not None else None

    asset = save_asset(data, ext=ext, subdir="logos")
    logo = File(
        storage_key=asset.storage_key,
        location="local",
        wrapped_key=None,
        sha256=asset.sha256,
        size_bytes=asset.size_bytes,
        mime_type=mime,
        original_name=original_name,
    )
    db.add(logo)
    db.flush()

    row.logo_file_id = logo.id
    if old_logo is not None:
        db.delete(old_logo)
    log_action(
        db,
        action="settings_set_logo",
        user_id=actor_id,
        object_type="app_settings",
        object_id=row.id,
        ip=ip,
        user_agent=ua,
        detail={"file_id": logo.id, "size": asset.size_bytes},
    )
    db.commit()
    db.refresh(row)
    if old_key:
        delete_asset(old_key)
    return row
