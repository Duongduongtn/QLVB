"""Unit test G4 — dựng ZIP export theo năm (lõi thuần, read_file tiêm ngoài)."""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest

from app.services import export
from app.services.export import ExportItem

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("raw,fallback,expected", [
    ("247/CV-GDNN", "cv", "247_CV-GDNN"),
    ("../../etc/passwd", "cv", "etc_passwd"),
    ("   ", "cv", "cv"),
    ("Tờ trình số 5", "cv", "Tờ_trình_số_5"),
])
def test_safe_component(raw: str, fallback: str, expected: str) -> None:
    assert export._safe_component(raw, fallback) == expected


def test_unique_dedups_within_folder() -> None:
    seen: dict[str, int] = {}
    a = export._unique(seen, "2026-CV-Den", 1, "001")
    b = export._unique(seen, "2026-CV-Den", 1, "001")  # trùng → thêm hậu tố
    assert a == "0001_001"
    assert b == "0001_001_2"


def _items() -> list[ExportItem]:
    return [
        ExportItem("2026-CV-Di-GDNN", "0001_CV", "k1", b"wk", {"số": "1/CV", "loại": "Công văn đi"}),
        ExportItem("2026-CV-Den", "0007_REF", "k2", b"wk", {"số đến": "7"}),
    ]


def test_build_year_zip_structure(tmp_path: Path) -> None:
    dest = tmp_path / "out.zip"
    stats = export.build_year_zip(
        _items(), dest_path=dest, index_bytes=b"INDEXBYTES",
        read_file=lambda it: b"%PDF-1.4 fake",
    )
    with zipfile.ZipFile(dest) as zf:
        names = set(zf.namelist())
        assert "2026-CV-Di-GDNN/0001_CV.pdf" in names
        assert "2026-CV-Di-GDNN/0001_CV.metadata.json" in names
        assert "2026-CV-Den/0007_REF.pdf" in names
        assert "index.xlsx" in names
        meta = json.loads(zf.read("2026-CV-Di-GDNN/0001_CV.metadata.json"))
        assert meta["số"] == "1/CV"  # tiếng Việt có dấu giữ nguyên (ensure_ascii=False)
    assert stats["total"] == 2
    assert stats["counts"]["2026-CV-Den"] == 1
    assert stats["errors"] == 0
    assert stats["oversize"] is False


def test_build_year_zip_includes_index_pdf(tmp_path: Path) -> None:
    dest = tmp_path / "out.zip"
    export.build_year_zip(
        _items(), dest_path=dest, index_bytes=b"X", index_pdf=b"%PDF-1.4 fake",
        read_file=lambda it: b"d",
    )
    with zipfile.ZipFile(dest) as zf:
        names = zf.namelist()
        assert "index.xlsx" in names
        assert "index.pdf" in names


def test_build_year_zip_no_index_pdf_when_none(tmp_path: Path) -> None:
    dest = tmp_path / "out.zip"
    export.build_year_zip(_items(), dest_path=dest, index_bytes=b"X", read_file=lambda it: b"d")
    with zipfile.ZipFile(dest) as zf:
        assert "index.pdf" not in zf.namelist()


def test_build_year_zip_read_error_isolated(tmp_path: Path) -> None:
    # 1 file lỗi đọc → đếm errors, KHÔNG phá cả gói.
    def bad_read(it: ExportItem) -> bytes:
        if it.folder == "2026-CV-Den":
            raise FileNotFoundError("mất file")
        return b"ok"

    dest = tmp_path / "out.zip"
    stats = export.build_year_zip(
        _items(), dest_path=dest, index_bytes=b"X", read_file=bad_read,
    )
    assert stats["errors"] == 1
    assert stats["total"] == 1  # chỉ item GDNN vào gói
    with zipfile.ZipFile(dest) as zf:
        assert "index.xlsx" in zf.namelist()


def test_build_year_zip_oversize_flag(tmp_path: Path) -> None:
    dest = tmp_path / "out.zip"
    stats = export.build_year_zip(
        _items(), dest_path=dest, index_bytes=b"X",
        read_file=lambda it: b"data", max_bytes=1,
    )
    assert stats["oversize"] is True


def test_vn_year_bounds_edges() -> None:
    from datetime import UTC, datetime

    lo, hi = export._vn_year_bounds(2026)
    # 31/12/2026 23:00 giờ VN = 16:00 UTC → vẫn thuộc năm 2026 (< hi).
    assert lo <= datetime(2026, 12, 31, 16, 0, tzinfo=UTC) < hi
    # 01/01/2027 00:30 giờ VN = 31/12/2026 17:30 UTC → KHÔNG thuộc 2026 (>= hi).
    assert datetime(2026, 12, 31, 17, 30, tzinfo=UTC) >= hi
    # 01/01/2026 00:30 giờ VN = 31/12/2025 17:30 UTC → thuộc 2026 (>= lo).
    assert datetime(2025, 12, 31, 17, 30, tzinfo=UTC) >= lo


def test_build_year_zip_progress_called(tmp_path: Path) -> None:
    calls: list[tuple[int, int]] = []
    export.build_year_zip(
        _items(), dest_path=tmp_path / "o.zip", index_bytes=b"X",
        read_file=lambda it: b"d", progress=lambda d, n: calls.append((d, n)),
    )
    assert calls == [(1, 2), (2, 2)]
