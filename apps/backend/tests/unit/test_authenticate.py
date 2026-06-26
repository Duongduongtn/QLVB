"""Unit test orchestration đăng nhập `authenticate` (A1) — các bất biến bảo mật.

Không cần Postgres/Redis thật: fake DB (scalar/add/flush/commit) + monkeypatch các
hàm session (create_session/register_failure/clear_failures). verify_password chạy
bcrypt thật để bám sát hành vi.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.core.errors import AppError
from app.core.security import hash_password
from app.models.user import User
from app.services import auth as auth_svc

_CORRECT = "matkhau-dung-123"
_PASSWORD_HASH = hash_password(_CORRECT)


class FakeDB:
    """Đủ method mà authenticate + log_action dùng."""

    def __init__(self, user: User | None) -> None:
        self._user = user
        self.added: list[Any] = []
        self.committed = False

    def scalar(self, _stmt: Any) -> User | None:
        return self._user

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    def flush(self) -> None:
        pass

    def commit(self) -> None:
        self.committed = True


def _make_user(**kw: Any) -> User:
    base: dict[str, Any] = {
        "id": 7,
        "username": "vanthu",
        "full_name": "Văn Thư",
        "password_hash": _PASSWORD_HASH,
        "role": "staff",
        "is_active": True,
    }
    base.update(kw)
    return User(**base)


@pytest.fixture
def fake_session(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Monkeypatch các hàm Redis trong namespace auth, ghi lại lời gọi."""
    calls: dict[str, Any] = {"register_failure": 0, "clear_failures": 0, "create_session": 0}

    def fake_create_session(user_id: int, role: str, *, remember: bool) -> tuple[str, int]:
        calls["create_session"] += 1
        return "sid-test", 7 * 24 * 3600 if remember else 8 * 3600

    def fake_register_failure(user: User) -> None:
        calls["register_failure"] += 1

    def fake_clear_failures(user_id: int) -> None:
        calls["clear_failures"] += 1

    monkeypatch.setattr(auth_svc, "create_session", fake_create_session)
    monkeypatch.setattr(auth_svc, "register_failure", fake_register_failure)
    monkeypatch.setattr(auth_svc, "clear_failures", fake_clear_failures)
    return calls


def _auth(db: FakeDB, password: str = _CORRECT, remember: bool = False) -> Any:
    return auth_svc.authenticate(
        db,  # type: ignore[arg-type]
        username="vanthu",
        password=password,
        remember=remember,
        ip="1.2.3.4",
        user_agent="pytest",
    )


def test_success_returns_session_and_audits_login(fake_session: dict[str, Any]) -> None:
    user = _make_user()
    db = FakeDB(user)

    result_user, sid, ttl = _auth(db)

    assert result_user is user
    assert sid == "sid-test"
    assert ttl == 8 * 3600
    assert db.committed is True
    assert fake_session["clear_failures"] == 1
    assert user.last_login_at is not None
    actions = [a.action for a in db.added]
    assert actions == ["login"]


def test_remember_uses_long_ttl(fake_session: dict[str, Any]) -> None:
    db = FakeDB(_make_user())
    _user, _sid, ttl = _auth(db, remember=True)
    assert ttl == 7 * 24 * 3600


def test_wrong_password_generic_error_and_counts_failure(fake_session: dict[str, Any]) -> None:
    db = FakeDB(_make_user())

    with pytest.raises(AppError) as exc:
        _auth(db, password="sai-be-bét")

    assert exc.value.http_status == 401
    assert exc.value.code == "INVALID_CREDENTIALS"
    assert exc.value.message == "Sai username hoặc mật khẩu"
    assert fake_session["register_failure"] == 1
    assert [a.action for a in db.added] == ["login_failed"]
    assert db.committed is True


def test_unknown_user_same_generic_error_no_failure_counter(fake_session: dict[str, Any]) -> None:
    db = FakeDB(None)  # username không tồn tại

    with pytest.raises(AppError) as exc:
        _auth(db, password="bất kỳ")

    assert exc.value.http_status == 401
    assert exc.value.code == "INVALID_CREDENTIALS"
    # không đếm fail cho user không tồn tại, nhưng vẫn ghi audit (user_id None)
    assert fake_session["register_failure"] == 0
    assert [a.action for a in db.added] == ["login_failed"]
    assert db.added[0].user_id is None


def test_locked_account_blocks_even_with_correct_password(fake_session: dict[str, Any]) -> None:
    user = _make_user(locked_until=datetime.now(UTC) + timedelta(minutes=10))
    db = FakeDB(user)

    with pytest.raises(AppError) as exc:
        _auth(db, password=_CORRECT)  # mật khẩu ĐÚNG vẫn bị chặn

    assert exc.value.http_status == 423
    assert exc.value.code == "ACCOUNT_LOCKED"
    assert fake_session["create_session"] == 0  # không cấp phiên


def test_disabled_account_message_after_correct_password(fake_session: dict[str, Any]) -> None:
    user = _make_user(is_active=False)
    db = FakeDB(user)

    with pytest.raises(AppError) as exc:
        _auth(db, password=_CORRECT)

    assert exc.value.http_status == 403
    assert exc.value.code == "ACCOUNT_DISABLED"
    assert exc.value.message == "Tài khoản đã bị khoá, liên hệ Quản lý"
    assert fake_session["create_session"] == 0
