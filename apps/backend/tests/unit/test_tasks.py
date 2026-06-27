"""Unit test phân công + theo dõi xử lý — E2/E3."""

from __future__ import annotations

from datetime import date
from typing import Any

import pytest

from app.core.errors import PermissionDenied, ValidationFailed
from app.models.processing_task import ProcessingTask
from app.services import tasks as svc


class _Scalars:
    def __init__(self, rows: list[Any]) -> None:
        self._rows = rows

    def first(self) -> Any:
        return self._rows[0] if self._rows else None

    def all(self) -> list[Any]:
        return self._rows


class _Res:
    def __init__(self, obj: Any) -> None:
        self._obj = obj

    def scalar_one_or_none(self) -> Any:
        return self._obj


class _Inc:
    deleted_at = None
    number = "0125/2026"


class _Unit:
    pass


class _User:
    def __init__(self, active: bool = True) -> None:
        self.deleted_at = None
        self.is_active = active


class FakeDB:
    def __init__(self, *, gets: dict[str, Any] | None = None, existing: Any = None, lock: Any = None) -> None:
        self.gets = gets or {}
        self.existing = existing
        self.lock = lock
        self.added: list[Any] = []
        self.committed = False

    def get(self, model: Any, _id: Any) -> Any:
        return self.gets.get(model.__name__)

    def scalars(self, _s: Any) -> _Scalars:
        return _Scalars([self.existing] if self.existing is not None else [])

    def execute(self, _s: Any) -> _Res:
        return _Res(self.lock)

    def add(self, o: Any) -> None:
        self.added.append(o)

    def flush(self) -> None: ...
    def commit(self) -> None:
        self.committed = True

    def refresh(self, _o: Any) -> None: ...


def _gets(active: bool = True) -> dict[str, Any]:
    return {"IncomingDocument": _Inc(), "Unit": _Unit(), "User": _User(active)}


# ── assign ──────────────────────────────────────────────────────────
def test_assign_creates_task_and_notifications() -> None:
    db = FakeDB(gets=_gets())
    out = svc.assign(db, 5, [{"unit_id": 1, "assignee_id": 2}], actor_id=9, ip=None, ua=None)  # type: ignore[arg-type]
    assert len(out) == 1
    actions = [type(a).__name__ for a in db.added]
    assert "ProcessingTask" in actions
    assert "Notification" in actions  # noti người được giao
    assert db.committed


def test_assign_locked_user_rejected() -> None:
    db = FakeDB(gets=_gets(active=False))
    with pytest.raises(ValidationFailed):
        svc.assign(db, 5, [{"unit_id": 1, "assignee_id": 2}], actor_id=9, ip=None, ua=None)  # type: ignore[arg-type]


def test_assign_empty_rejected() -> None:
    with pytest.raises(ValidationFailed):
        svc.assign(FakeDB(gets=_gets()), 5, [], actor_id=9, ip=None, ua=None)  # type: ignore[arg-type]


# ── update_status ───────────────────────────────────────────────────
def test_update_status_assignee_ok() -> None:
    t = ProcessingTask(id=1, incoming_id=5, unit_id=1, assignee_id=2, status="new")
    db = FakeDB(lock=t)
    out = svc.update_status(db, 1, status="done", result_note="xong", actor_id=2, actor_role="staff", ip=None, ua=None)  # type: ignore[arg-type]
    assert out.status == "done" and out.result_note == "xong"


def test_update_status_other_staff_denied() -> None:
    t = ProcessingTask(id=1, incoming_id=5, unit_id=1, assignee_id=2, status="new")
    with pytest.raises(PermissionDenied):
        svc.update_status(FakeDB(lock=t), 1, status="done", result_note=None, actor_id=999, actor_role="staff", ip=None, ua=None)  # type: ignore[arg-type]


def test_update_status_manager_override() -> None:
    t = ProcessingTask(id=1, incoming_id=5, unit_id=1, assignee_id=2, status="new")
    out = svc.update_status(FakeDB(lock=t), 1, status="in_progress", result_note=None, actor_id=9, actor_role="manager", ip=None, ua=None)  # type: ignore[arg-type]
    assert out.status == "in_progress"


def test_update_status_invalid() -> None:
    with pytest.raises(ValidationFailed):
        svc.update_status(FakeDB(lock=ProcessingTask(id=1, assignee_id=2)), 1, status="weird", result_note=None, actor_id=2, actor_role="staff", ip=None, ua=None)  # type: ignore[arg-type]


# ── reassign ────────────────────────────────────────────────────────
def test_reassign_notifies_old_and_new() -> None:
    t = ProcessingTask(id=1, incoming_id=5, unit_id=1, assignee_id=2, status="new")
    db = FakeDB(gets=_gets(), lock=t)
    svc.reassign(db, 1, 3, actor_id=2, actor_role="staff", ip=None, ua=None)  # type: ignore[arg-type]  # assignee tự chuyển
    assert t.assignee_id == 3
    notis = [a for a in db.added if type(a).__name__ == "Notification"]
    assert len(notis) == 2  # người cũ + người mới


def test_reassign_other_staff_denied() -> None:
    t = ProcessingTask(id=1, incoming_id=5, unit_id=1, assignee_id=2, status="new")
    with pytest.raises(PermissionDenied):  # không phải assignee + không manager → chặn IDOR
        svc.reassign(FakeDB(gets=_gets(), lock=t), 1, 3, actor_id=999, actor_role="staff", ip=None, ua=None)  # type: ignore[arg-type]


def test_reassign_manager_ok() -> None:
    t = ProcessingTask(id=1, incoming_id=5, unit_id=1, assignee_id=2, status="done")
    svc.reassign(FakeDB(gets=_gets(), lock=t), 1, 3, actor_id=9, actor_role="manager", ip=None, ua=None)  # type: ignore[arg-type]
    assert t.assignee_id == 3 and t.status == "new"  # giao lại done → mở lại


# ── overdue ─────────────────────────────────────────────────────────
def test_overdue_true_when_past_and_not_done() -> None:
    t = ProcessingTask(id=1, deadline=date(2026, 6, 1), status="in_progress")
    assert svc.overdue(t, today=date(2026, 6, 27)) is True


def test_overdue_false_when_done() -> None:
    t = ProcessingTask(id=1, deadline=date(2026, 6, 1), status="done")
    assert svc.overdue(t, today=date(2026, 6, 27)) is False


def test_overdue_false_when_no_deadline() -> None:
    t = ProcessingTask(id=1, deadline=None, status="new")
    assert svc.overdue(t, today=date(2026, 6, 27)) is False


# ── notify_deadlines (cron E3) ──────────────────────────────────────
class _DueDB:
    def __init__(self, rows: list[Any]) -> None:
        self.rows = rows
        self.added: list[Any] = []
        self.committed = False

    def scalars(self, _s: Any) -> _Scalars:
        return _Scalars(self.rows)

    def add(self, o: Any) -> None:
        self.added.append(o)

    def flush(self) -> None: ...
    def commit(self) -> None:
        self.committed = True


def test_notify_deadlines_sends_and_marks() -> None:
    today = date(2026, 6, 27)
    over = ProcessingTask(id=1, assignee_id=2, deadline=date(2026, 6, 25), status="in_progress")
    soon = ProcessingTask(id=2, assignee_id=3, deadline=date(2026, 6, 28), status="new")
    db = _DueDB([over, soon])  # query đã lọc deadline<=ngày mai + chưa nhắc hôm nay
    sent = svc.notify_deadlines(db, today=today)  # type: ignore[arg-type]
    assert sent == 2
    assert over.reminded_on == today and soon.reminded_on == today
    assert len([a for a in db.added if type(a).__name__ == "Notification"]) == 2
    assert db.committed
