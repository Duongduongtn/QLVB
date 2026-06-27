"""Integration test cấp số B2 — vòng đời PG SEQUENCE thật (cần Postgres).

Bất biến cốt lõi (PRD B2 / TDD §3.3): nextval atomic không trùng, NULL→start=1,
setval migrate đúng off-by-one, reset theo kỳ. Chạy trên CI (Postgres service);
skip ở local nếu không có DATABASE_URL kết nối được.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.document_type import DocumentType
from app.services import numbering

pytestmark = pytest.mark.integration

_D = date(2026, 6, 27)


def _doctype(db: Session, code: str = "CV", reset: str = "year") -> DocumentType:
    dt = DocumentType(
        direction="out",
        unit_id=None,  # nullable — không cần FK units cho test cấp số
        name="Loại test",
        code=code,
        number_format="{STT}/{NĂM}",
        reset_policy=reset,
        zero_pad=3,
        is_active=True,
    )
    db.add(dt)
    db.flush()  # lấy id để dựng tên sequence
    return dt


def test_peek_is_one_before_first_allocate(db_session: Session) -> None:
    dt = _doctype(db_session)
    assert numbering.next_number(db_session, dt, _D) == 1


def test_allocate_is_atomic_and_sequential(db_session: Session) -> None:
    dt = _doctype(db_session)
    n1, f1 = numbering.allocate_number(db_session, dt, unit_code="GDNN", on_date=_D)
    n2, _ = numbering.allocate_number(db_session, dt, unit_code="GDNN", on_date=_D)
    assert (n1, n2) == (1, 2)  # không trùng, tăng đều
    assert f1 == "001/2026"
    assert numbering.next_number(db_session, dt, _D) == 3


def test_set_current_then_next_is_plus_one(db_session: Session) -> None:
    dt = _doctype(db_session)
    name = numbering.get_or_create_sequence(db_session, dt, "2026")
    numbering.set_current(db_session, name, 246)  # migrate: đã cấp tới 246
    assert numbering.peek_next(db_session, name) == 247
    n, _ = numbering.allocate_number(db_session, dt, unit_code=None, on_date=_D)
    assert n == 247


def test_reset_year_new_period_starts_over(db_session: Session) -> None:
    dt = _doctype(db_session, reset="year")
    numbering.allocate_number(db_session, dt, unit_code=None, on_date=date(2026, 12, 31))
    numbering.allocate_number(db_session, dt, unit_code=None, on_date=date(2026, 12, 31))
    # Sang năm 2027 → sequence kỳ mới → bắt đầu lại từ 1.
    assert numbering.next_number(db_session, dt, date(2027, 1, 1)) == 1
    n, _ = numbering.allocate_number(db_session, dt, unit_code=None, on_date=date(2027, 1, 1))
    assert n == 1


def test_get_or_create_sequence_idempotent(db_session: Session) -> None:
    dt = _doctype(db_session)
    name1 = numbering.get_or_create_sequence(db_session, dt, "2026")
    name2 = numbering.get_or_create_sequence(db_session, dt, "2026")  # gọi lại không lỗi
    assert name1 == name2
    rows = db_session.execute(
        text("SELECT count(*) FROM numbering_registry WHERE doc_type_id = :t"),
        {"t": dt.id},
    ).scalar_one()
    assert rows == 1  # ON CONFLICT DO NOTHING → chỉ 1 dòng registry
