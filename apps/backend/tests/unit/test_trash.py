"""Unit test thùng rác + xoá mềm CV đi — H3 (SEC.AUD)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.core.errors import Conflict, NotFound, PermissionDenied
from app.models.outgoing_document import OutgoingDocument
from app.services import outgoing as out_svc


class _Result:
    def __init__(self, obj: Any) -> None:
        self._obj = obj

    def scalar_one_or_none(self) -> Any:
        return self._obj


class _Scalars:
    def __init__(self, rows: list[Any]) -> None:
        self._rows = rows

    def all(self) -> list[Any]:
        return self._rows


class FakeDB:
    def __init__(
        self, doc: Any = None, rows: list[Any] | None = None, files: dict[int, Any] | None = None
    ) -> None:
        self.doc = doc
        self.rows = rows or []
        self.files = files or {}
        self.added: list[Any] = []
        self.deleted: list[Any] = []
        self.committed = False

    def execute(self, _stmt: Any) -> _Result:
        return _Result(self.doc)

    def scalars(self, _stmt: Any) -> _Scalars:
        return _Scalars(self.rows)

    def scalar(self, _stmt: Any) -> int:
        return len(self.rows)

    def get(self, _model: Any, file_id: Any) -> Any:
        return self.files.get(file_id)

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    def flush(self) -> None:
        pass

    def commit(self) -> None:
        self.committed = True

    def refresh(self, _obj: Any) -> None:
        pass

    def delete(self, obj: Any) -> None:
        self.deleted.append(obj)


def _doc(**kw: Any) -> OutgoingDocument:
    base: dict[str, Any] = {
        "id": 9,
        "unit_id": 1,
        "doc_type_id": 2,
        "subject": "x",
        "issue_date": datetime(2026, 6, 27).date(),
        "status": "draft",
        "number_int": None,
        "deleted_at": None,
        "original_file_id": None,
        "signed_file_id": None,
    }
    base.update(kw)
    return OutgoingDocument(**base)


# ── soft_delete: CV đã cấp số chỉ Quản lý xoá ───────────────────────
def test_soft_delete_draft_staff_ok() -> None:
    doc = _doc(status="draft", number_int=None)
    db = FakeDB(doc=doc)
    out_svc.soft_delete(db, 9, actor_id=1, actor_role="staff", ip=None, ua=None)  # type: ignore[arg-type]
    assert doc.deleted_at is not None
    assert "outgoing_delete" in [getattr(a, "action", None) for a in db.added]


def test_soft_delete_numbered_staff_denied() -> None:
    doc = _doc(status="numbered", number_int=247)
    with pytest.raises(PermissionDenied):
        out_svc.soft_delete(FakeDB(doc=doc), 9, actor_id=1, actor_role="staff", ip=None, ua=None)  # type: ignore[arg-type]


def test_soft_delete_numbered_manager_ok() -> None:
    doc = _doc(status="numbered", number_int=247)
    db = FakeDB(doc=doc)
    out_svc.soft_delete(db, 9, actor_id=1, actor_role="manager", ip=None, ua=None)  # type: ignore[arg-type]
    assert doc.deleted_at is not None


# ── restore ─────────────────────────────────────────────────────────
def test_restore_requires_trashed() -> None:
    doc = _doc(deleted_at=None)  # chưa xoá → không khôi phục được
    with pytest.raises(Conflict):
        out_svc.restore(FakeDB(doc=doc), 9, actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]


def test_restore_clears_deleted_at() -> None:
    doc = _doc(deleted_at=datetime(2026, 6, 20, tzinfo=UTC))
    db = FakeDB(doc=doc)
    out_svc.restore(db, 9, actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]
    assert doc.deleted_at is None
    assert "outgoing_restore" in [getattr(a, "action", None) for a in db.added]


def test_restore_not_found() -> None:
    with pytest.raises(NotFound):
        out_svc.restore(FakeDB(doc=None), 9, actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]


# ── purge_expired_trash: >30 ngày ───────────────────────────────────
def test_purge_expired_trash_deletes_old(monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime(2026, 7, 30, tzinfo=UTC)
    old = _doc(id=1, deleted_at=now - timedelta(days=40))
    old2 = _doc(id=2, deleted_at=now - timedelta(days=31))
    db = FakeDB(rows=[old, old2])  # query đã lọc <cutoff → trả 2 doc
    monkeypatch.setattr(out_svc, "delete_asset", lambda _k: None)
    removed = out_svc.purge_expired_trash(db, now=now, days=30)  # type: ignore[arg-type]
    assert removed == 2
    assert old in db.deleted and old2 in db.deleted
    assert db.committed is True


class _FakeFile:
    def __init__(self, storage_key: str) -> None:
        self.storage_key = storage_key


# ── purge: xoá VĨNH VIỄN kèm row File + unlink đĩa SAU commit ────────
def test_purge_deletes_doc_and_files(monkeypatch: pytest.MonkeyPatch) -> None:
    doc = _doc(deleted_at=datetime(2026, 6, 20, tzinfo=UTC), original_file_id=10, signed_file_id=11)
    f_goc, f_ky = _FakeFile("assets/k10"), _FakeFile("assets/k11")
    db = FakeDB(doc=doc, files={10: f_goc, 11: f_ky})
    unlinked: list[str] = []
    monkeypatch.setattr(out_svc, "delete_asset", lambda k: unlinked.append(k))
    out_svc.purge(db, 9, actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]
    # doc + 2 File đều bị delete; audit purge ghi TRƯỚC khi xoá
    assert doc in db.deleted and f_goc in db.deleted and f_ky in db.deleted
    assert "outgoing_purge" in [getattr(a, "action", None) for a in db.added]
    # unlink đĩa đúng storage_key, và CHỈ sau commit
    assert set(unlinked) == {"assets/k10", "assets/k11"}
    assert db.committed is True


# ── list_trash: chỉ CV đã xoá + tổng ────────────────────────────────
def test_list_trash_returns_rows_and_total() -> None:
    rows = [_doc(id=1, deleted_at=datetime(2026, 6, 20, tzinfo=UTC)), _doc(id=2)]
    items, total = out_svc.list_trash(FakeDB(rows=rows), page=1, size=20)  # type: ignore[arg-type]
    assert total == 2
    assert [d.id for d in items] == [1, 2]
