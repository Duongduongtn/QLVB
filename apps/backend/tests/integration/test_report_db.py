"""Integration test G2 — sổ NĐ 30 + stats có dữ liệu thật (Postgres CI)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from io import BytesIO

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document_type import DocumentType
from app.models.incoming_document import IncomingDocument
from app.models.outgoing_document import OutgoingDocument
from app.models.unit import Unit
from app.services import report

pytestmark = pytest.mark.integration


def _gdnn(db: Session) -> Unit:
    unit = db.scalar(select(Unit).where(Unit.code == "GDNN"))
    assert unit is not None, "seed thiếu đơn vị GDNN"
    return unit


def _doctype(db: Session, unit_id: int) -> DocumentType:
    dt = DocumentType(
        direction="out", unit_id=unit_id, name="Công văn", code="CV",
        number_format="{STT}/{NĂM}", reset_policy="year", zero_pad=3, is_active=True,
    )
    db.add(dt)
    db.flush()
    return dt


def test_outgoing_register_has_row(db_session: Session) -> None:
    unit = _gdnn(db_session)
    dt = _doctype(db_session, unit.id)
    db_session.add(OutgoingDocument(
        unit_id=unit.id, doc_type_id=dt.id, number="001/2026/CV", number_int=1,
        subject="Báo cáo quyết toán năm 2026", issue_date=date(2026, 6, 1), status="published",
    ))
    db_session.flush()

    data = report.build_register_xlsx(db_session, year=2026, book="di_gdnn")
    from openpyxl import load_workbook

    ws = load_workbook(BytesIO(data)).active
    # Dòng dữ liệu đầu (header ở row 3 → data từ row 4).
    assert ws.cell(row=4, column=1).value == 1  # STT
    assert ws.cell(row=4, column=2).value == "001/2026/CV"
    assert "quyết toán" in ws.cell(row=4, column=4).value


def test_dashboard_stats_counts(db_session: Session) -> None:
    unit = _gdnn(db_session)
    dt = _doctype(db_session, unit.id)
    db_session.add(OutgoingDocument(
        unit_id=unit.id, doc_type_id=dt.id, number="002/2026/CV", number_int=2,
        subject="CV tháng 6", issue_date=date(2026, 6, 15), status="published",
    ))
    db_session.add(IncomingDocument(
        number="0001", number_int=1, subject="CV đến test", status="registered",
    ))
    db_session.flush()

    s = report.dashboard_stats(db_session, year=2026, today=date(2026, 6, 28))
    assert s["kpi"]["di_year"] >= 1
    assert s["kpi"]["den_year"] >= 1
    assert s["kpi"]["di_month"] >= 1  # tháng 6


def test_incoming_register_arrival_number_is_real(db_session: Session) -> None:
    # Cột "Số đến" phải là số đã cấp THẬT, không phải thứ tự dòng.
    db_session.add(IncomingDocument(
        number="0042", number_int=42, subject="CV đến số 42", status="registered",
        created_at=datetime(2026, 5, 2, tzinfo=UTC),
    ))
    db_session.flush()
    data = report.build_register_xlsx(db_session, year=2026, book="den")
    from openpyxl import load_workbook

    ws = load_workbook(BytesIO(data)).active
    col1 = [ws.cell(row=r, column=1).value for r in range(4, ws.max_row + 1)]
    assert "0042" in col1  # số đến thật xuất hiện ở cột 1
