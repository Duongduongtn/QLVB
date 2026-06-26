"""Unit test quản lý người dùng A4 — gen pass, validate, bất biến service (fake DB)."""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.security import generate_temp_password
from app.models.user import User
from app.schemas.user import UserCreate, UserUpdate
from app.services import user as user_svc


# ── generate_temp_password ──────────────────────────────────────────
@pytest.mark.parametrize("_", range(20))
def test_generate_temp_password_has_letter_and_digit(_: int) -> None:
    pw = generate_temp_password()
    assert len(pw) == 12
    assert any(c.isalpha() for c in pw)
    assert any(c.isdigit() for c in pw)


# ── schema validate (PRD A3: ≥8, chữ+số; username chuẩn hoá) ─────────
def test_usercreate_rejects_weak_password() -> None:
    with pytest.raises(ValidationError):
        UserCreate(username="vanthu3", full_name="A", role="staff", password="abcabcab")  # thiếu số
    with pytest.raises(ValidationError):
        UserCreate(username="vanthu3", full_name="A", role="staff", password="abc123")  # < 8


def test_usercreate_lowercases_username_and_checks_format() -> None:
    u = UserCreate(username="VanThu.3", full_name="A", role="staff", password="abc12345")
    assert u.username == "vanthu.3"
    with pytest.raises(ValidationError):
        UserCreate(username="có dấu", full_name="A", role="staff", password="abc12345")


# ── FakeDB cho service ──────────────────────────────────────────────
class FakeDB:
    def __init__(self, get_obj: Any = None, scalar_return: Any = None) -> None:
        self.get_obj = get_obj
        self.scalar_return = scalar_return
        self.added: list[Any] = []
        self.committed = False

    def get(self, _model: Any, _id: Any) -> Any:
        return self.get_obj

    def scalar(self, _stmt: Any) -> Any:
        return self.scalar_return

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    def flush(self) -> None:
        pass

    def commit(self) -> None:
        self.committed = True

    def refresh(self, _obj: Any) -> None:
        pass

    def rollback(self) -> None:
        pass

    def execute(self, *_a: Any, **_k: Any) -> None:
        return None


def _user(**kw: Any) -> User:
    base: dict[str, Any] = {
        "id": 1,
        "username": "u",
        "full_name": "U",
        "password_hash": "x",
        "role": "staff",
        "is_active": True,
    }
    base.update(kw)
    return User(**base)


@pytest.fixture
def no_kick(monkeypatch: pytest.MonkeyPatch) -> dict[str, int]:
    calls = {"kick": 0}

    def fake_kick(user_id: int) -> int:
        calls["kick"] += 1
        return 3

    monkeypatch.setattr(user_svc, "kick_sessions", fake_kick)
    return calls


def _actor(uid: int = 100) -> User:
    return _user(id=uid, username="admin", role="manager")


# ── create: trùng username ──────────────────────────────────────────
def test_create_user_duplicate_username_conflict() -> None:
    db = FakeDB(scalar_return=_user(id=5))  # đã tồn tại
    data = UserCreate(username="dup", full_name="X", role="staff", password="abc12345")
    with pytest.raises(Conflict):
        user_svc.create_user(db, data, actor=_actor(), ip=None, ua=None)  # type: ignore[arg-type]


def test_create_user_ok_audits_and_commits(no_kick: dict[str, int]) -> None:
    db = FakeDB(scalar_return=None)  # chưa tồn tại
    data = UserCreate(username="new1", full_name="Người Mới", role="staff", password="abc12345")
    user_svc.create_user(db, data, actor=_actor(), ip=None, ua=None)  # type: ignore[arg-type]
    assert db.committed is True
    # db.added gồm cả User mới + AuditLog → lọc các bản ghi có .action
    actions = [getattr(a, "action", None) for a in db.added]
    assert "user_create" in actions


# ── update: tự khoá chính mình ──────────────────────────────────────
def test_update_self_lock_blocked(no_kick: dict[str, int]) -> None:
    target = _user(id=100, role="manager", is_active=True)
    db = FakeDB(get_obj=target, scalar_return=5)
    with pytest.raises(ValidationFailed):
        user_svc.update_user(
            db, 100, UserUpdate(is_active=False), actor=_actor(100), ip=None, ua=None  # type: ignore[arg-type]
        )
    assert no_kick["kick"] == 0


# ── update: khoá Quản lý cuối cùng ──────────────────────────────────
def test_update_lock_last_manager_blocked(no_kick: dict[str, int]) -> None:
    target = _user(id=1, role="manager", is_active=True)
    db = FakeDB(get_obj=target, scalar_return=0)  # không còn manager hoạt động nào khác
    with pytest.raises(ValidationFailed):
        user_svc.update_user(
            db, 1, UserUpdate(is_active=False), actor=_actor(100), ip=None, ua=None  # type: ignore[arg-type]
        )


# ── update: khoá staff bình thường → kick + commit ──────────────────
def test_update_lock_staff_kicks_sessions(no_kick: dict[str, int]) -> None:
    target = _user(id=2, role="staff", is_active=True)
    db = FakeDB(get_obj=target, scalar_return=5)
    user_svc.update_user(
        db, 2, UserUpdate(is_active=False), actor=_actor(100), ip=None, ua=None  # type: ignore[arg-type]
    )
    assert target.is_active is False
    assert no_kick["kick"] == 1
    assert db.committed is True


def test_update_demote_last_manager_blocked(no_kick: dict[str, int]) -> None:
    target = _user(id=1, role="manager", is_active=True)
    db = FakeDB(get_obj=target, scalar_return=0)  # không còn manager active khác
    with pytest.raises(ValidationFailed):
        user_svc.update_user(
            db, 1, UserUpdate(role="staff"), actor=_actor(100), ip=None, ua=None  # type: ignore[arg-type]
        )


def test_update_user_not_found(no_kick: dict[str, int]) -> None:
    db = FakeDB(get_obj=None)
    with pytest.raises(NotFound):
        user_svc.update_user(
            db, 999, UserUpdate(full_name="X"), actor=_actor(), ip=None, ua=None  # type: ignore[arg-type]
        )


# ── delete (soft) ───────────────────────────────────────────────────
def test_delete_self_blocked(no_kick: dict[str, int]) -> None:
    target = _user(id=100, role="manager", is_active=True)
    db = FakeDB(get_obj=target, scalar_return=5)
    with pytest.raises(ValidationFailed):
        user_svc.delete_user(db, 100, actor=_actor(100), ip=None, ua=None)  # type: ignore[arg-type]
    assert no_kick["kick"] == 0


def test_delete_last_manager_blocked(no_kick: dict[str, int]) -> None:
    target = _user(id=1, role="manager", is_active=True)
    db = FakeDB(get_obj=target, scalar_return=0)
    with pytest.raises(ValidationFailed):
        user_svc.delete_user(db, 1, actor=_actor(100), ip=None, ua=None)  # type: ignore[arg-type]


def test_delete_staff_soft_deletes_and_kicks(no_kick: dict[str, int]) -> None:
    target = _user(id=2, role="staff", is_active=True)
    db = FakeDB(get_obj=target, scalar_return=5)
    user_svc.delete_user(db, 2, actor=_actor(100), ip=None, ua=None)  # type: ignore[arg-type]
    assert target.deleted_at is not None
    assert no_kick["kick"] == 1
    assert db.committed is True
    assert "user_delete" in [getattr(a, "action", None) for a in db.added]


def test_reset_password_not_found(no_kick: dict[str, int]) -> None:
    db = FakeDB(get_obj=None)
    with pytest.raises(NotFound):
        user_svc.reset_password(db, 999, actor=_actor(), ip=None, ua=None)  # type: ignore[arg-type]


# ── reset password → trả pass mạnh + kick + commit ──────────────────
def test_reset_password_returns_strong_and_kicks(no_kick: dict[str, int]) -> None:
    target = _user(id=2, role="staff")
    db = FakeDB(get_obj=target)
    pw = user_svc.reset_password(db, 2, actor=_actor(), ip=None, ua=None)  # type: ignore[arg-type]
    assert len(pw) >= 8
    assert any(c.isalpha() for c in pw) and any(c.isdigit() for c in pw)
    assert no_kick["kick"] == 1
    assert db.committed is True
