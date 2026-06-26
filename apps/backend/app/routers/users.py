"""Router quản lý người dùng — A4 (USR.MNG). Tất cả endpoint require_manager.

Router mỏng: validate + gọi service + map sang schema ra. Logic/bất biến ở service.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_manager
from app.core.errors import NotFound
from app.core.http import client_ip
from app.models.user import User
from app.schemas.user import (
    ResetPasswordOut,
    UserCreate,
    UserDetail,
    UserListItem,
    UserListResponse,
    UserUpdate,
)
from app.services import user as user_service
from app.services.session import active_session_count

router = APIRouter(dependencies=[Depends(require_manager)])


def _to_detail(user: User) -> UserDetail:
    detail = UserDetail.model_validate(user)
    detail.active_sessions = active_session_count(user.id)
    return detail


@router.get("", response_model=UserListResponse)
def list_users(
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> UserListResponse:
    items, total, stats = user_service.list_users(db, q=q, page=page, size=size)
    return UserListResponse(
        items=[UserListItem.model_validate(u) for u in items],
        total=total,
        page=page,
        size=size,
        stats=stats,
    )


@router.post("", response_model=UserDetail, status_code=201)
def create_user(
    payload: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> UserDetail:
    user = user_service.create_user(
        db, payload, actor=actor, ip=client_ip(request), ua=request.headers.get("user-agent")
    )
    return _to_detail(user)


@router.get("/{user_id}", response_model=UserDetail)
def get_user(user_id: int, db: Session = Depends(get_db)) -> UserDetail:
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise NotFound("Không tìm thấy người dùng")
    return _to_detail(user)


@router.put("/{user_id}", response_model=UserDetail)
def update_user(
    user_id: int,
    payload: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> UserDetail:
    user = user_service.update_user(
        db, user_id, payload, actor=actor, ip=client_ip(request), ua=request.headers.get("user-agent")
    )
    return _to_detail(user)


@router.post("/{user_id}/reset-password", response_model=ResetPasswordOut)
def reset_password(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> ResetPasswordOut:
    password = user_service.reset_password(
        db, user_id, actor=actor, ip=client_ip(request), ua=request.headers.get("user-agent")
    )
    return ResetPasswordOut(password=password)


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> Response:
    user_service.delete_user(
        db, user_id, actor=actor, ip=client_ip(request), ua=request.headers.get("user-agent")
    )
    return Response(status_code=204)
