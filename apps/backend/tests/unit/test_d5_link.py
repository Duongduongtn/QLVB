"""Unit test D5 — liên kết CV đi ↔ CV đến."""

from __future__ import annotations

from typing import Any

import pytest

from app.core.errors import NotFound
from app.services import outgoing as out


class _Scalars:
    def __init__(self, rows: list[Any]) -> None:
        self._rows = rows

    def all(self) -> list[Any]:
        return self._rows


class FakeDB:
    def __init__(self, inc: Any = "missing", rows: list[Any] | None = None) -> None:
        self._inc = inc
        self._rows = rows or []

    def get(self, _model: Any, _id: Any) -> Any:
        return None if self._inc == "missing" else self._inc

    def scalars(self, _stmt: Any) -> _Scalars:
        return _Scalars(self._rows)


class _Inc:
    def __init__(self, deleted: bool = False) -> None:
        self.deleted_at = object() if deleted else None


def test_validate_in_reply_to_missing() -> None:
    with pytest.raises(NotFound):
        out._validate_in_reply_to(FakeDB(inc="missing"), 99)  # type: ignore[arg-type]


def test_validate_in_reply_to_deleted() -> None:
    with pytest.raises(NotFound):
        out._validate_in_reply_to(FakeDB(inc=_Inc(deleted=True)), 99)  # type: ignore[arg-type]


def test_validate_in_reply_to_ok() -> None:
    out._validate_in_reply_to(FakeDB(inc=_Inc()), 99)  # type: ignore[arg-type]  # không raise


def test_list_replies_returns_rows() -> None:
    rows = [object(), object()]
    assert out.list_replies(FakeDB(rows=rows), 5) == rows  # type: ignore[arg-type]
