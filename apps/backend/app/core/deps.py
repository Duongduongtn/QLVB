"""FastAPI dependencies — current_user, require_manager."""

from __future__ import annotations

import json

from fastapi import Cookie, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError, PermissionDenied
from app.core.redis_client import redis_client
from app.models.user import User


def current_user(
    db: Session = Depends(get_db),
    session_cookie: str | None = Cookie(default=None, alias=settings.session_cookie_name),
) -> User:
    """Đọc session từ Redis mỗi request (QĐ #1) — kick user < 5s khi bị khoá.

    Mọi lỗi auth raise AppError → đi qua exception handler chuẩn, trả envelope
    {error:{code,message}} đồng nhất với phần còn lại của API.
    """
    if not session_cookie:
        raise AppError("Chưa đăng nhập", code="UNAUTHENTICATED", http_status=401)

    raw = redis_client.get(f"session:{session_cookie}")
    if not raw:
        raise AppError("Phiên đã hết hạn, vui lòng đăng nhập lại", code="SESSION_EXPIRED", http_status=401)

    data = json.loads(raw)
    user = db.get(User, data["user_id"])
    if user is None or not user.is_active:
        raise AppError("Tài khoản đã bị khoá", code="ACCOUNT_DISABLED", http_status=403)
    return user


def require_manager(user: User = Depends(current_user)) -> User:
    if user.role != "manager":
        raise PermissionDenied("Chỉ Quản lý")
    return user
