"""Phiên đăng nhập lưu Redis (QĐ #1) + chống brute-force (A1).

Vì sao Redis chứ không JWT: PRD đòi khoá user → kick mọi phiên < 5s (A4) và liệt kê/
logout từng phiên (4.6.1). Token stateless không thu hồi giữa chừng. Tra Redis mỗi
request là cách trực tiếp nhất (xem `app.core.deps.current_user`).

Cấu trúc khoá Redis:
    session:{sid}            → JSON {user_id, role}     TTL = 8h (hoặc 7 ngày nếu remember)
    session:user:{user_id}   → SET các sid đang active   (để liệt kê + kick)
    login_fail:{user_id}     → đếm số lần sai, TTL 15'   (cửa sổ cố định brute-force)
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from redis import Redis

from app.core.config import settings
from app.core.redis_client import redis_client
from app.core.security import new_session_id
from app.models.user import User

# Brute-force (A1): sai >= 5 lần trong 15' → khoá tạm 15'. Dùng cửa sổ CỐ ĐỊNH: TTL
# Redis chỉ set ở lần sai đầu (không gia hạn), tự hết hạn sau 15' nên không cần cột
# last_failed_at trong DB; trạng thái khoá ghi vào users.locked_until để sống sót cả
# khi Redis bị flush.
MAX_FAILED_ATTEMPTS = 5
FAIL_WINDOW_SECONDS = 15 * 60
LOCK_SECONDS = 15 * 60


def _session_key(sid: str) -> str:
    return f"session:{sid}"


def _user_sessions_key(user_id: int) -> str:
    return f"session:user:{user_id}"


def _fail_key(user_id: int) -> str:
    return f"login_fail:{user_id}"


def create_session(
    user_id: int,
    role: str,
    *,
    remember: bool,
    redis: Redis[str] = redis_client,
) -> tuple[str, int]:
    """Tạo session_id ngẫu nhiên, lưu Redis. Trả (session_id, ttl_seconds)."""
    sid = new_session_id()
    ttl = settings.session_ttl_remember if remember else settings.session_ttl_seconds
    redis.set(_session_key(sid), json.dumps({"user_id": user_id, "role": role}), ex=ttl)
    redis.sadd(_user_sessions_key(user_id), sid)
    # Set liệt-kê-phiên hết hạn theo TTL dài nhất để không phình mãi (member chết được
    # dọn lười khi kick/logout).
    redis.expire(_user_sessions_key(user_id), settings.session_ttl_remember)
    return sid, ttl


def register_failure(user: User, *, redis: Redis[str] = redis_client) -> None:
    """Đếm 1 lần đăng nhập sai. Đủ ngưỡng trong cửa sổ → set locked_until (caller commit)."""
    key = _fail_key(user.id)
    attempts = redis.incr(key)
    if attempts == 1:
        redis.expire(key, FAIL_WINDOW_SECONDS)
    if attempts >= MAX_FAILED_ATTEMPTS:
        user.locked_until = datetime.now(UTC) + timedelta(seconds=LOCK_SECONDS)
        redis.delete(key)


def clear_failures(user_id: int, *, redis: Redis[str] = redis_client) -> None:
    """Đăng nhập đúng → xoá bộ đếm sai."""
    redis.delete(_fail_key(user_id))
