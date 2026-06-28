"""Unit test F1 — phần thuần của search service (không cần Postgres)."""

from __future__ import annotations

from datetime import date
from typing import Any

import pytest

from app.services import search as sv

pytestmark = pytest.mark.unit


class _DummyDB:
    """DB không bao giờ bị chạm khi q rỗng / type không khớp (short-circuit)."""

    def scalar(self, *_a: Any, **_k: Any) -> int:
        raise AssertionError("không được chạm DB khi q rỗng")

    def execute(self, *_a: Any, **_k: Any) -> Any:
        raise AssertionError("không được chạm DB khi q rỗng")


@pytest.mark.parametrize("q", [None, "", "   "])
def test_blank_query_returns_empty_without_db(q: str | None) -> None:
    items, total = sv.global_search(_DummyDB(), q, include_manager_only=True)  # type: ignore[arg-type]
    assert items == [] and total == 0


def test_unknown_type_returns_empty() -> None:
    items, total = sv.global_search(_DummyDB(), "abc", doc_type="xyz", include_manager_only=True)  # type: ignore[arg-type]
    assert items == [] and total == 0


def test_date_bounds_counts() -> None:
    from app.models.incoming_document import IncomingDocument

    col = IncomingDocument.created_at
    assert len(sv._date_bounds(None, None, col)) == 0
    assert len(sv._date_bounds(date(2026, 1, 1), None, col)) == 1
    assert len(sv._date_bounds(date(2026, 1, 1), date(2026, 12, 31), col)) == 2


def test_query_builders_compile() -> None:
    # smoke: dựng được Select cho cả 2 sổ (kể cả nhánh manager_only) — không cần DB.
    tsq = sv._tsquery("viet nam")
    inc = sv._incoming_select("viet nam", tsq, include_manager_only=False, status=None, urgency=None, date_from=None, date_to=None)
    out = sv._outgoing_select("viet nam", tsq, status=None, unit_id=None, date_from=None, date_to=None)
    assert str(inc) and str(out)  # compile được thành SQL text
