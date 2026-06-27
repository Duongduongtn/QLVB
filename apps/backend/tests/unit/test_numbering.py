"""Unit test cấp số B2 — logic thuần (period_key, sequence_name, format, validate).

Phần chạm DB (nextval/setval/pg_sequences) cần Postgres → test integration riêng.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.core.errors import ValidationFailed
from app.services import numbering


# ── period_key ──────────────────────────────────────────────────────
def test_period_key_year() -> None:
    assert numbering.period_key("year", date(2026, 6, 27)) == "2026"


def test_period_key_month() -> None:
    assert numbering.period_key("month", date(2026, 6, 27)) == "2026-06"
    assert numbering.period_key("month", date(2026, 12, 1)) == "2026-12"


def test_period_key_none() -> None:
    assert numbering.period_key("none", date(2026, 6, 27)) == "all"


# ── sequence_name (whitelist ASCII, chống injection identifier) ─────
def test_sequence_name_year_and_month() -> None:
    assert numbering.sequence_name(3, "2026") == "seq_3_2026"
    assert numbering.sequence_name(12, "2026-06") == "seq_12_2026_06"  # '-' → '_'
    assert numbering.sequence_name(5, "all") == "seq_5_all"


def test_sequence_name_rejects_injection() -> None:
    # Kỳ chứa ký tự lạ (giả định bị tiêm) → regex whitelist từ chối.
    with pytest.raises(ValueError):
        numbering.sequence_name(1, "2026; DROP TABLE x")
    with pytest.raises(ValueError):
        numbering.sequence_name(1, "2026'")


# ── validate_format ─────────────────────────────────────────────────
def test_validate_format_requires_stt() -> None:
    with pytest.raises(ValidationFailed):
        numbering.validate_format("{NĂM}/{LOẠI}")  # thiếu {STT}


def test_validate_format_rejects_unknown_token() -> None:
    with pytest.raises(ValidationFailed):
        numbering.validate_format("{STT}/{NGAY}")  # {NGAY} không hợp lệ


def test_validate_format_accepts_both_alias_styles() -> None:
    assert numbering.validate_format("{STT}/{NĂM}/{LOẠI}-{ĐƠN VỊ}")
    assert numbering.validate_format("{STT}/{NAM}/{LOAI}-{DONVI}")


# ── format_number ───────────────────────────────────────────────────
def test_format_number_full_with_padding() -> None:
    out = numbering.format_number(
        "{STT}/{NĂM}/{LOẠI}-{ĐƠN VỊ}",
        stt=7,
        zero_pad=3,
        unit_code="GDNN",
        type_code="CV",
        on_date=date(2026, 6, 27),
    )
    assert out == "007/2026/CV-GDNN"


def test_format_number_no_padding_when_zero() -> None:
    out = numbering.format_number(
        "{STT}/{NĂM}", stt=247, zero_pad=0, unit_code=None, type_code="CV", on_date=date(2026, 1, 1)
    )
    assert out == "247/2026"


def test_format_number_month_and_alias_tokens() -> None:
    out = numbering.format_number(
        "{STT}-{THANG}/{NAM}/{LOAI}",
        stt=1,
        zero_pad=2,
        unit_code="DVDL",
        type_code="QĐ",
        on_date=date(2026, 3, 9),
    )
    assert out == "01-03/2026/QĐ"


def test_format_number_unit_none_renders_empty() -> None:
    # Sổ đến chung (unit_id NULL) → {ĐƠN VỊ} thành rỗng.
    out = numbering.format_number(
        "{STT}/{ĐƠN VỊ}", stt=5, zero_pad=3, unit_code=None, type_code="CV", on_date=date(2026, 1, 1)
    )
    assert out == "005/"
