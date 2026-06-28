"""Unit test A3 — đổi mật khẩu (`auth.change_password`).

Fake DB + monkeypatch kick_sessions (Redis). verify_password/hash_password chạy bcrypt thật.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.core.errors import AppError
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.services import auth as auth_svc

pytestmark = pytest.mark.unit

_OLD = "matkhau-cu-123"


class FakeDB:
    def __init__(self) -> None:
        self.added: list[Any] = []
        self.committed = False

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    def flush(self) -> None:
        pass

    def commit(self) -> None:
        self.committed = True


def _user() -> User:
    return User(
        id=7, username="vanthu", full_name="Văn Thư",
        password_hash=hash_password(_OLD), role="staff", is_active=True,
    )


@pytest.fixture
def kicked(monkeypatch: pytest.MonkeyPatch) -> list[int]:
    seen: list[int] = []
    monkeypatch.setattr(auth_svc, "kick_sessions", lambda uid: seen.append(uid))
    return seen


def _change(db: FakeDB, user: User, cur: str, new: str) -> None:
    auth_svc.change_password(
        db, user, current_password=cur, new_password=new, ip="1.2.3.4", user_agent="pytest"  # type: ignore[arg-type]
    )


def test_change_password_success(kicked: list[int]) -> None:
    db, user = FakeDB(), _user()
    _change(db, user, _OLD, "matkhau-moi-456")
    assert verify_password("matkhau-moi-456", user.password_hash)  # đã đổi
    assert not verify_password(_OLD, user.password_hash)
    assert db.committed
    assert kicked == [7]  # kick mọi phiên → bắt đăng nhập lại
    assert any(getattr(a, "action", None) == "password_changed" for a in db.added)


def test_wrong_current_rejected(kicked: list[int]) -> None:
    db, user = FakeDB(), _user()
    with pytest.raises(AppError) as ei:
        _change(db, user, "sai-mat-khau-1", "matkhau-moi-456")
    assert ei.value.http_status == 400
    assert verify_password(_OLD, user.password_hash)  # KHÔNG đổi
    assert kicked == []  # không kick khi lỗi


def test_same_as_old_rejected(kicked: list[int]) -> None:
    db, user = FakeDB(), _user()
    with pytest.raises(AppError) as ei:
        _change(db, user, _OLD, _OLD)
    assert ei.value.code == "PASSWORD_UNCHANGED"
    assert kicked == []
