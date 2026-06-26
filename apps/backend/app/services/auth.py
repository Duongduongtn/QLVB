"""Nghiệp vụ đăng nhập (A1) — router chỉ gọi `authenticate` rồi set cookie.

Flow (TDD §5.1):
  tìm user → nếu đang khoá tạm (locked_until) → 423
  → bcrypt.verify → sai: đếm fail, đủ 5/15' thì khoá; báo lỗi CHUNG (chống dò username)
  → đúng nhưng bị Quản lý khoá (is_active=false) → 403 "liên hệ Quản lý"
  → đúng: tạo session Redis + last_login_at + audit(login)
Mọi nhánh đều ghi audit_logs (PRD A1: log cả thành công lẫn thất bại).
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.services.audit import log_action
from app.services.session import clear_failures, create_session, register_failure

_GENERIC_ERROR = "Sai username hoặc mật khẩu"


@lru_cache(maxsize=1)
def _dummy_hash() -> str:
    """Hash bcrypt để verify "rỗng" khi username không tồn tại → cân bằng thời gian
    phản hồi (không lộ user nào có thật qua timing; PRD A1 edge: lỗi chung).

    Sinh theo settings.bcrypt_cost để cùng cost với hash thật — nếu hardcode cost cũ
    mà nâng bcrypt_cost thì dummy nhanh hơn → lại lộ timing. Cache 1 lần.
    """
    return hash_password("timing-equalizer-not-a-real-pw")


def authenticate(
    db: Session,
    *,
    username: str,
    password: str,
    remember: bool,
    ip: str | None,
    user_agent: str | None,
) -> tuple[User, str, int]:
    """Trả (user, session_id, ttl) khi thành công. Raise AppError ở mọi nhánh lỗi."""
    user = db.scalar(select(User).where(User.username == username, User.deleted_at.is_(None)))
    now = datetime.now(UTC)

    # 1) Khoá tạm do brute-force — chặn cả khi mật khẩu đúng.
    if user is not None and user.locked_until is not None and user.locked_until > now:
        minutes = math.ceil((user.locked_until - now).total_seconds() / 60)
        log_action(
            db,
            action="login_failed",
            user_id=user.id,
            object_type="user",
            object_id=user.id,
            ip=ip,
            user_agent=user_agent,
            detail={"reason": "locked"},
        )
        db.commit()
        raise AppError(
            f"Tài khoản đã bị khoá tạm thời, thử lại sau {minutes} phút",
            code="ACCOUNT_LOCKED",
            http_status=423,
        )

    # 2) Verify mật khẩu (luôn chạy bcrypt kể cả user không tồn tại — chống timing).
    valid = verify_password(password, user.password_hash if user is not None else _dummy_hash())

    if user is None or not valid:
        if user is not None:
            register_failure(user)
        log_action(
            db,
            action="login_failed",
            user_id=user.id if user is not None else None,
            object_type="user",
            object_id=user.id if user is not None else None,
            ip=ip,
            user_agent=user_agent,
            detail={"reason": "bad_credentials", "username": username},
        )
        db.commit()
        raise AppError(_GENERIC_ERROR, code="INVALID_CREDENTIALS", http_status=401)

    # 3) Mật khẩu đúng nhưng bị Quản lý khoá.
    if not user.is_active:
        log_action(
            db,
            action="login_failed",
            user_id=user.id,
            object_type="user",
            object_id=user.id,
            ip=ip,
            user_agent=user_agent,
            detail={"reason": "inactive"},
        )
        db.commit()
        raise AppError(
            "Tài khoản đã bị khoá, liên hệ Quản lý",
            code="ACCOUNT_DISABLED",
            http_status=403,
        )

    # 4) Thành công.
    clear_failures(user.id)
    user.locked_until = None
    user.last_login_at = now
    sid, ttl = create_session(user.id, user.role, remember=remember)
    log_action(
        db,
        action="login",
        user_id=user.id,
        object_type="user",
        object_id=user.id,
        ip=ip,
        user_agent=user_agent,
        detail={"remember": remember},
    )
    db.commit()
    return user, sid, ttl
