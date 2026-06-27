"""Nghiệp vụ hồ sơ ký — C4 (SIG.PRO, chỉ Quản lý). Chống nhầm mộc.

Bất biến CỐT LÕI (PRD C4):
- `seal.unit_id` PHẢI bằng `unit_id` của hồ sơ → KHÔNG thể gán mộc đơn vị khác.
- Khi tạo: chữ ký + mộc phải đang active (không dựng hồ sơ trên asset đã ngừng).
- KHÔNG xoá cứng — người ký nghỉ → is_active=False.
- Đổi người ký/mộc → tạo hồ sơ MỚI (giữ vết hồ sơ cũ), update chỉ sửa chức danh/tên/trạng thái.
Mọi thao tác ghi audit_logs.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFound, ValidationFailed
from app.models.seal import Seal
from app.models.signature import Signature
from app.models.signing_profile import SigningProfile
from app.models.unit import Unit
from app.schemas.signing_profile import ProfileCreate, ProfileUpdate
from app.services.audit import log_action


def list_profiles(
    db: Session, *, unit_id: int | None = None, include_inactive: bool = False
) -> list[SigningProfile]:
    stmt = select(SigningProfile)
    if unit_id is not None:
        stmt = stmt.where(SigningProfile.unit_id == unit_id)
    if not include_inactive:
        stmt = stmt.where(SigningProfile.is_active.is_(True))
    stmt = stmt.order_by(SigningProfile.unit_id, SigningProfile.name, SigningProfile.id)
    return list(db.scalars(stmt).all())


def get_profile(db: Session, profile_id: int) -> SigningProfile:
    profile = db.get(SigningProfile, profile_id)
    if profile is None:
        raise NotFound("Không tìm thấy hồ sơ ký")
    return profile


def create_profile(
    db: Session, data: ProfileCreate, *, actor_id: int, ip: str | None, ua: str | None
) -> SigningProfile:
    """Tạo hồ sơ ký — kiểm mộc thuộc đúng đơn vị (chống nhầm) + asset đang active."""
    if db.get(Unit, data.unit_id) is None:
        raise NotFound("Không tìm thấy đơn vị")

    signature = db.get(Signature, data.signature_id)
    if signature is None:
        raise NotFound("Không tìm thấy chữ ký")
    if not signature.is_active:
        raise ValidationFailed("Chữ ký đã ngừng dùng, không thể tạo hồ sơ")

    seal = db.get(Seal, data.seal_id)
    if seal is None:
        raise NotFound("Không tìm thấy mộc")
    if not seal.is_active:
        raise ValidationFailed("Mộc đã ngừng dùng, không thể tạo hồ sơ")
    # CHỐNG NHẦM MỘC: mộc phải thuộc đúng đơn vị của hồ sơ.
    if seal.unit_id != data.unit_id:
        raise ValidationFailed("Mộc không thuộc đơn vị đã chọn")

    profile = SigningProfile(
        unit_id=data.unit_id,
        signature_id=data.signature_id,
        seal_id=data.seal_id,
        display_title=data.display_title,
        name=data.name,
        is_active=True,
    )
    db.add(profile)
    db.flush()

    log_action(
        db,
        action="profile_create",
        user_id=actor_id,
        object_type="signing_profile",
        object_id=profile.id,
        ip=ip,
        user_agent=ua,
        detail={
            "unit_id": data.unit_id,
            "signature_id": data.signature_id,
            "seal_id": data.seal_id,
        },
    )
    db.commit()
    db.refresh(profile)
    return profile


def update_profile(
    db: Session,
    profile_id: int,
    data: ProfileUpdate,
    *,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> SigningProfile:
    """Sửa hồ sơ: chức danh hiển thị / tên / trạng thái. KHÔNG đổi người ký/mộc/đơn vị."""
    profile = get_profile(db, profile_id)
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(profile, field, value)

    log_action(
        db,
        action="profile_update",
        user_id=actor_id,
        object_type="signing_profile",
        object_id=profile.id,
        ip=ip,
        user_agent=ua,
        detail={"changed": sorted(changes.keys())},
    )
    db.commit()
    db.refresh(profile)
    return profile
