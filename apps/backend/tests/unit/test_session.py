"""Unit test phiên + chống brute-force (A1) — không cần Redis/DB thật.

Dùng FakeRedis tối giản để kiểm:
- create_session chọn đúng TTL (8h vs 7 ngày) và ghi đủ khoá session + set liệt-kê.
- register_failure khoá tài khoản đúng sau MAX_FAILED_ATTEMPTS lần sai.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import pytest

from app.core.config import settings
from app.models.user import User
from app.services import session as sess


class FakeRedis:
    """Đủ method mà session.py dùng: set/get/incr/expire/sadd/delete."""

    def __init__(self) -> None:
        self.kv: dict[str, Any] = {}
        self.sets: dict[str, set[str]] = {}
        self.ttl: dict[str, int] = {}

    def set(self, key: str, value: str, ex: int | None = None) -> None:
        self.kv[key] = value
        if ex is not None:
            self.ttl[key] = ex

    def get(self, key: str) -> Any:
        return self.kv.get(key)

    def incr(self, key: str) -> int:
        self.kv[key] = int(self.kv.get(key, 0)) + 1
        return self.kv[key]

    def expire(self, key: str, seconds: int) -> None:
        self.ttl[key] = seconds

    def sadd(self, key: str, member: str) -> None:
        self.sets.setdefault(key, set()).add(member)

    def srem(self, key: str, member: str) -> None:
        self.sets.get(key, set()).discard(member)

    def delete(self, *keys: str) -> None:
        for key in keys:
            self.kv.pop(key, None)
            self.ttl.pop(key, None)


def _make_user() -> User:
    user = User(
        id=42,
        username="vanthu",
        full_name="Văn Thư",
        password_hash="x",
        role="staff",
        is_active=True,
    )
    return user


def test_create_session_default_ttl_8h() -> None:
    redis = FakeRedis()
    sid, ttl = sess.create_session(42, "staff", remember=False, redis=redis)  # type: ignore[arg-type]

    assert ttl == settings.session_ttl_seconds
    stored = json.loads(redis.kv[f"session:{sid}"])
    assert stored == {"user_id": 42, "role": "staff"}
    assert redis.ttl[f"session:{sid}"] == settings.session_ttl_seconds
    assert sid in redis.sets["session:user:42"]


def test_create_session_remember_7d() -> None:
    redis = FakeRedis()
    _sid, ttl = sess.create_session(42, "manager", remember=True, redis=redis)  # type: ignore[arg-type]

    assert ttl == settings.session_ttl_remember


def test_register_failure_locks_after_threshold() -> None:
    redis = FakeRedis()
    user = _make_user()

    for _ in range(sess.MAX_FAILED_ATTEMPTS - 1):
        sess.register_failure(user, redis=redis)  # type: ignore[arg-type]
    assert user.locked_until is None  # chưa đủ ngưỡng

    sess.register_failure(user, redis=redis)  # type: ignore[arg-type]
    assert user.locked_until is not None
    assert user.locked_until > datetime.now(UTC)
    # bộ đếm bị xoá sau khi khoá để vòng sau bắt đầu lại sạch
    assert redis.kv.get(f"login_fail:{user.id}") is None


def test_register_failure_sets_window_ttl_once() -> None:
    redis = FakeRedis()
    user = _make_user()

    sess.register_failure(user, redis=redis)  # type: ignore[arg-type]
    assert redis.ttl[f"login_fail:{user.id}"] == sess.FAIL_WINDOW_SECONDS


def test_destroy_session_removes_key_and_member() -> None:
    redis = FakeRedis()
    sid, _ = sess.create_session(5, "staff", remember=False, redis=redis)  # type: ignore[arg-type]
    assert redis.kv.get(f"session:{sid}") is not None
    assert sid in redis.sets["session:user:5"]

    sess.destroy_session(sid, 5, redis=redis)  # type: ignore[arg-type]

    assert redis.kv.get(f"session:{sid}") is None  # current_user sau đó → 401
    assert sid not in redis.sets["session:user:5"]


@pytest.mark.parametrize("remember", [True, False])
def test_create_session_returns_unique_ids(remember: bool) -> None:
    redis = FakeRedis()
    sid1, _ = sess.create_session(1, "staff", remember=remember, redis=redis)  # type: ignore[arg-type]
    sid2, _ = sess.create_session(1, "staff", remember=remember, redis=redis)  # type: ignore[arg-type]
    assert sid1 != sid2
    assert redis.sets["session:user:1"] == {sid1, sid2}
