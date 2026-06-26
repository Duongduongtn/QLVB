"""Hash mật khẩu + sinh/kiểm session_id.

Session lưu Redis (QĐ #1). Module này KHÔNG tự tra Redis — chỉ helper crypto.
Middleware đọc cookie → query Redis ở `app.core.deps.current_user`.
"""

from __future__ import annotations

import secrets

import bcrypt

from app.core.config import settings


def hash_password(plain: str) -> str:
    salt = bcrypt.gensalt(rounds=settings.bcrypt_cost)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def new_session_id() -> str:
    return secrets.token_urlsafe(32)
