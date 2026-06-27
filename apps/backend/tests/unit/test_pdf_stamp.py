"""Unit test engine chèn mộc PyMuPDF — D1/D3/D4, chạy trên PDF tự sinh."""

from __future__ import annotations

import io

import pytest

fitz = pytest.importorskip("fitz")
PILImage = pytest.importorskip("PIL.Image")
from PIL import ImageDraw  # noqa: E402

from app.services import pdf_stamp  # noqa: E402


def _make_pdf(pages: int = 4) -> bytes:
    doc = fitz.open()
    for i in range(pages):
        doc.new_page(width=595, height=842).insert_text((72, 72), f"Trang {i + 1}")
    out = bytes(doc.tobytes())
    doc.close()
    return out


def _png(size: tuple[int, int] = (200, 200)) -> bytes:
    img = PILImage.new("RGBA", size, (255, 255, 255, 0))
    ImageDraw.Draw(img).ellipse([10, 10, size[0] - 10, size[1] - 10], outline=(220, 30, 30, 255), width=8)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _img_counts(pdf_bytes: bytes) -> list[int]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    counts = [len(doc[i].get_images()) for i in range(doc.page_count)]
    doc.close()
    return counts


def test_pdf_page_count() -> None:
    assert pdf_stamp.pdf_page_count(_make_pdf(3)) == 3


def test_stamp_images_places_on_target_page_only() -> None:
    pdf = _make_pdf(4)
    placements = [
        {"kind": "seal", "page": 4, "x_pct": 0.6, "y_pct": 0.7, "w_pct": 0.14, "h_pct": 0.14},
        {"kind": "signature", "page": 4, "x_pct": 0.55, "y_pct": 0.72, "w_pct": 0.2, "h_pct": 0.1},
    ]
    out = pdf_stamp.stamp_images(pdf, placements, {"seal": _png(), "signature": _png((220, 90))})
    counts = _img_counts(out)
    assert counts[3] == 2  # trang cuối có mộc + chữ ký
    assert sum(counts[:3]) == 0  # các trang khác không bị chèn
    assert pdf_stamp.pdf_page_count(out) == 4  # giữ số trang


def test_stamp_images_skips_out_of_range_page_and_missing_kind() -> None:
    pdf = _make_pdf(2)
    placements = [
        {"kind": "seal", "page": 9, "x_pct": 0.1, "y_pct": 0.1, "w_pct": 0.1, "h_pct": 0.1},  # ngoài range
        {"kind": "unknown", "page": 1, "x_pct": 0.1, "y_pct": 0.1, "w_pct": 0.1, "h_pct": 0.1},  # thiếu ảnh
    ]
    out = pdf_stamp.stamp_images(pdf, placements, {"seal": _png()})
    assert _img_counts(out) == [0, 0]


def test_giap_lai_strip_each_page_in_range() -> None:
    pdf = _make_pdf(4)
    out = pdf_stamp.giap_lai(pdf, _png(), page_from=2, page_to=4)
    counts = _img_counts(out)
    assert counts[0] == 0  # trang 1 ngoài range
    assert counts[1] == counts[2] == counts[3] == 1  # mỗi trang trong range 1 dải


def test_ky_nhay_skips_last_page() -> None:
    pdf = _make_pdf(4)
    out = pdf_stamp.ky_nhay(pdf, _png((220, 90)), page_from=1, page_to=4)
    counts = _img_counts(out)
    assert counts[0] == counts[1] == counts[2] == 1
    assert counts[3] == 0  # trang cuối (có chữ ký chính) KHÔNG ký nháy


def test_ky_nhay_range_only_last_page_does_nothing() -> None:
    # Range chỉ chứa trang cuối → không chèn gì (PRD D4 edge).
    pdf = _make_pdf(3)
    out = pdf_stamp.ky_nhay(pdf, _png((220, 90)), page_from=3, page_to=3)
    assert _img_counts(out) == [0, 0, 0]
