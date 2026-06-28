"""Unit test parse metadata CV đến từ text OCR (E1)."""

from __future__ import annotations

from app.services.incoming_ocr import parse_autofill

_SAMPLE = """UBND TỈNH QUẢNG NAM
SỞ GIÁO DỤC VÀ ĐÀO TẠO

Số: 1234/SGDĐT-VP
V/v hướng dẫn tuyển sinh năm học 2026

Quảng Nam, ngày 12 tháng 6 năm 2026

Kính gửi: Các đơn vị trực thuộc
"""


def test_parse_reference_number() -> None:
    assert parse_autofill(_SAMPLE)["reference_number"] == "1234/SGDĐT-VP"


def test_parse_document_date_iso() -> None:
    assert parse_autofill(_SAMPLE)["document_date"] == "2026-06-12"


def test_parse_sender_hint_uppercase_line() -> None:
    hint = parse_autofill(_SAMPLE)["sender_hint"]
    assert hint is not None and "SỞ GIÁO DỤC" in hint


def test_parse_subject_vv_line() -> None:
    assert parse_autofill(_SAMPLE)["subject"] == "hướng dẫn tuyển sinh năm học 2026"


def test_sender_hint_skips_quoc_hieu() -> None:
    # Quốc hiệu là dòng IN HOA dài nhất nhưng KHÔNG phải cơ quan gửi → phải bỏ qua.
    text = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐỘC LẬP - TỰ DO - HẠNH PHÚC\nỦY BAN NHÂN DÂN TỈNH ĐỒNG NAI\nSố: 99/UBND"
    hint = parse_autofill(text)["sender_hint"]
    assert hint == "ỦY BAN NHÂN DÂN TỈNH ĐỒNG NAI"


def test_parse_empty_text() -> None:
    out = parse_autofill("nội dung thường không có số hay ngày")
    assert out["reference_number"] is None
    assert out["document_date"] is None
    assert out["subject"] is None


def test_parse_rejects_invalid_date() -> None:
    # tháng 13 không hợp lệ → bỏ qua
    assert parse_autofill("ngày 5 tháng 13 năm 2026")["document_date"] is None
