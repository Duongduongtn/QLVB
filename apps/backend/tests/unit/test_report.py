"""Unit test G2 — cấu trúc Excel sổ NĐ 30 (mở lại bằng openpyxl) + stats rỗng."""

from __future__ import annotations

from datetime import date
from io import BytesIO
from typing import Any

import pytest

from app.core.errors import ValidationFailed
from app.services import report

pytestmark = pytest.mark.unit


class _Empty:
    def all(self) -> list[Any]:
        return []


class FakeDB:
    """DB rỗng — sổ không có dòng dữ liệu (kiểm header + tiêu đề chuẩn NĐ 30)."""

    def scalar(self, _stmt: Any) -> Any:
        return None

    def scalars(self, _stmt: Any) -> _Empty:
        return _Empty()

    def execute(self, _stmt: Any) -> _Empty:
        return _Empty()


def _open(data: bytes) -> Any:
    from openpyxl import load_workbook

    return load_workbook(BytesIO(data)).active


@pytest.mark.parametrize("book,cols,title_kw", [
    ("di_gdnn", report._COLS_DI, "ĐI"),
    ("di_dvdl", report._COLS_DI, "ĐI"),
    ("den", report._COLS_DEN, "ĐẾN"),
])
def test_register_xlsx_headers(book: str, cols: list[Any], title_kw: str) -> None:
    ws = _open(report.build_register_xlsx(FakeDB(), year=2026, book=book))  # type: ignore[arg-type]
    assert title_kw in ws.cell(row=1, column=1).value
    assert "2026" in ws.cell(row=1, column=1).value
    headers = [ws.cell(row=3, column=c).value for c in range(1, len(cols) + 1)]
    assert headers == [label for _key, label, _w in cols]


def test_register_xlsx_invalid_book() -> None:
    with pytest.raises(ValidationFailed):
        report.build_register_xlsx(FakeDB(), year=2026, book="xyz")  # type: ignore[arg-type]


@pytest.mark.parametrize("raw,expected", [
    ("=SUM(A1)", "'=SUM(A1)"),
    ("+1+1", "'+1+1"),
    ("-cmd", "'-cmd"),
    ("@x", "'@x"),
    ("\tTab", "'\tTab"),
    ("Bình thường", "Bình thường"),
    (5, 5),
])
def test_excel_safe(raw: object, expected: object) -> None:
    assert report._excel_safe(raw) == expected


def test_dashboard_stats_empty() -> None:
    s = report.dashboard_stats(FakeDB(), year=2026, today=date(2026, 6, 28))  # type: ignore[arg-type]
    assert s["year"] == 2026
    assert s["kpi"] == {"di_year": 0, "den_year": 0, "di_month": 0, "den_month": 0}
    assert len(s["months"]) == 12
    assert s["months"][0] == {"month": 1, "di": 0, "den": 0}
