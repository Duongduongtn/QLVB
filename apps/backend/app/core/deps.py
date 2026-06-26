"""FastAPI dependencies — current_user, require_manager."""

from __future__ import annotations

import json

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.redis_client import redis_client

# Lưu ý: model User sẽ được tạo ở B3; ở đây dùng forward import để tránh circular.


def current_user(
    db: Session = Depends(get_db),
    session_cookie: str | None = Cookie(default=None, alias=settings.session_cookie_name),
):
    """Đọc session từ Redis mỗi request (QĐ #1) — kick user < 5s khi bị khoá."""
    from app.models.user import User  # local import: tránh circular ở khởi tạo

    if not session_cookie:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập")

    raw = redis_client.get(f"session:{session_cookie}")
    if not raw:
        raise HTTPException(status_code=401, detail="Phiên đã hết hạn")

    data = json.loads(raw)
    user = db.get(User, data["user_id"])
    if user is None or not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản đã bị khoá")
    return user


def require_manager(user=Depends(current_user)):
    if user.role != "manager":
        raise HTTPException(status_code=403, detail="Chỉ Quản lý")
    return user
