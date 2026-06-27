"""Nghiệp vụ mộc — C1 (SIG.SEL, chỉ Quản lý upload/sửa).

Bất biến (PRD C1 + TDD §dòng 298-308):
- Mộc gắn cứng đơn vị (unit_id NOT NULL) → KHÔNG đổi đơn vị sau khi tạo (chống nhầm).
- Ảnh mộc lưu asset KHÔNG mã hoá (file.wrapped_key NULL).
- KHÔNG xoá cứng — "ngừng dùng" = is_active=False (CV cũ vẫn hiển thị mộc đã dùng).
Mọi thao tác ghi audit_logs.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.core.storage import delete_asset, save_asset
from app.models.file import File
from app.models.seal import Seal
from app.models.unit import Unit
from app.schemas.seal import SealUpdate
from app.services.audit import log_action


def list_seals(
    db: Session, *, unit_id: int | None = None, include_inactive: bool = False
) -> list[Seal]:
    """Danh sách mộc. Mặc định chỉ mộc đang dùng (cho màn chọn mộc khi soạn CV);
    màn quản lý truyền include_inactive=True để thấy cả mộc đã ngừng."""
    stmt = select(Seal)
    if unit_id is not None:
        stmt = stmt.where(Seal.unit_id == unit_id)
    if not include_inactive:
        stmt = stmt.where(Seal.is_active.is_(True))
    stmt = stmt.order_by(Seal.unit_id, Seal.id)
    return list(db.scalars(stmt).all())


def get_seal(db: Session, seal_id: int) -> Seal:
    seal = db.get(Seal, seal_id)
    if seal is None:
        raise NotFound("Không tìm thấy mộc")
    return seal


def create_seal(
    db: Session,
    *,
    unit_id: int,
    name: str,
    seal_type: str,
    data: bytes,
    ext: str,
    mime: str | None,
    original_name: str | None,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> Seal:
    """Tạo mộc mới: lưu ảnh asset (không mã hoá) → File → Seal trỏ tới.

    Đơn vị phải tồn tại (chống tạo mộc cho đơn vị ma). seal_type đã validate ở schema
    router, DB còn CheckConstraint chặn lần 2.
    """
    if db.get(Unit, unit_id) is None:
        raise NotFound("Không tìm thấy đơn vị")

    # Ghi ảnh ra đĩa TRƯỚC khi đụng DB → nếu DB lỗi giữa chừng phải unlink lại,
    # nếu không file mồ côi (không bản ghi nào trỏ tới) tích rác mãi mãi.
    asset = save_asset(data, ext=ext, subdir="seals")
    try:
        file = File(
            storage_key=asset.storage_key,
            location="local",
            wrapped_key=None,  # asset mộc không mã hoá
            sha256=asset.sha256,
            size_bytes=asset.size_bytes,
            mime_type=mime,
            original_name=original_name,
        )
        db.add(file)
        db.flush()  # lấy file.id

        seal = Seal(
            unit_id=unit_id,
            name=name,
            seal_type=seal_type,
            file_id=file.id,
            uploaded_by=actor_id,
            is_active=True,
        )
        db.add(seal)
        db.flush()  # lấy seal.id

        log_action(
            db,
            action="seal_create",
            user_id=actor_id,
            object_type="seal",
            object_id=seal.id,
            ip=ip,
            user_agent=ua,
            detail={"unit_id": unit_id, "seal_type": seal_type, "file_id": file.id},
        )
        db.commit()
    except Exception:
        db.rollback()
        delete_asset(asset.storage_key)  # dọn ảnh mồ côi
        raise
    db.refresh(seal)
    return seal


def update_seal(
    db: Session,
    seal_id: int,
    data: SealUpdate,
    *,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> Seal:
    """Sửa mộc: đổi tên / loại / trạng thái (ngừng dùng hoặc dùng lại).

    KHÔNG đổi đơn vị (mộc gắn cứng đơn vị). KHÔNG xoá cứng — ngừng dùng = is_active=False.
    """
    seal = get_seal(db, seal_id)
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(seal, field, value)

    log_action(
        db,
        action="seal_update",
        user_id=actor_id,
        object_type="seal",
        object_id=seal.id,
        ip=ip,
        user_agent=ua,
        detail={"changed": sorted(changes.keys())},
    )
    db.commit()
    db.refresh(seal)
    return seal
