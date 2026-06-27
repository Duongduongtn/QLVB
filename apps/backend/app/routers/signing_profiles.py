"""Router hồ sơ ký — C4 (SIG.PRO).

GET list cho mọi user đã đăng nhập (Nhân viên cần xem để chọn hồ sơ khi soạn CV).
POST/PATCH chỉ Quản lý. Router mỏng: validate (Pydantic) + gọi service + map schema.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user, require_manager
from app.core.http import client_ip
from app.models.user import User
from app.schemas.signing_profile import (
    ProfileCreate,
    ProfileListResponse,
    ProfileOut,
    ProfileUpdate,
)
from app.services import signing_profile as profile_service

router = APIRouter()


@router.get("", response_model=ProfileListResponse)
def list_profiles(
    unit_id: int | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> ProfileListResponse:
    # Chỉ Quản lý xem được hồ sơ đã ngừng (NV chỉ chọn hồ sơ đang dùng khi soạn CV).
    show_inactive = include_inactive and user.role == "manager"
    items = profile_service.list_profiles(
        db, unit_id=unit_id, include_inactive=show_inactive
    )
    return ProfileListResponse(items=[ProfileOut.model_validate(p) for p in items])


@router.post("", response_model=ProfileOut, status_code=201)
def create_profile(
    payload: ProfileCreate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> ProfileOut:
    profile = profile_service.create_profile(
        db,
        payload,
        actor_id=actor.id,
        ip=client_ip(request),
        ua=request.headers.get("user-agent"),
    )
    return ProfileOut.model_validate(profile)


@router.patch("/{profile_id}", response_model=ProfileOut)
def update_profile(
    profile_id: int,
    payload: ProfileUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> ProfileOut:
    profile = profile_service.update_profile(
        db,
        profile_id,
        payload,
        actor_id=actor.id,
        ip=client_ip(request),
        ua=request.headers.get("user-agent"),
    )
    return ProfileOut.model_validate(profile)
