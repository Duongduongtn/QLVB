"""Unit test H2 — watermark cá nhân khi tải PDF (engine fitz thật + service)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.services import pdf_stamp, watermark

pytestmark = pytest.mark.unit


def _make_pdf(text: str = "Noi dung cong van mat", pages: int = 2) -> bytes:
    import fitz

    doc = fitz.open()
    for _ in range(pages):
        page = doc.new_page()
        page.insert_text((72, 72), text, fontsize=12)
    data = bytes(doc.tobytes())
    doc.close()
    return data


def test_build_watermark_text_vn_format() -> None:
    # 28/06/2026 02:30 UTC → 09:30 giờ VN (+7).
    txt = watermark.build_watermark_text(
        "nv_an", "10.0.0.5", when=datetime(2026, 6, 28, 2, 30, tzinfo=UTC)
    )
    assert txt == "Tải bởi: nv_an - 28/06/2026 09:30 - IP 10.0.0.5"


def test_build_watermark_text_missing_ip() -> None:
    txt = watermark.build_watermark_text("admin", None, when=datetime(2026, 1, 1, tzinfo=UTC))
    assert "IP không rõ" in txt


def test_pdf_has_signature_false_on_plain_pdf() -> None:
    assert pdf_stamp.pdf_has_signature(_make_pdf()) is False


def test_pdf_has_signature_false_on_garbage() -> None:
    assert pdf_stamp.pdf_has_signature(b"not a pdf") is False


def test_watermark_pdf_preserves_pages_and_content() -> None:
    src = _make_pdf(pages=3)
    out = watermark.apply_download_watermark(src, username="nguyễn_an", ip="1.2.3.4")[0]
    import fitz

    assert pdf_stamp.pdf_page_count(out) == 3  # số trang không đổi
    with fitz.open(stream=out, filetype="pdf") as doc:
        t0 = doc[0].get_text()
    assert "Tải bởi" in t0  # watermark đã chèn
    assert "Noi dung cong van" in t0  # nội dung gốc còn nguyên (không bị che/xoá)


def test_apply_watermark_marks_unsigned() -> None:
    out, marked = watermark.apply_download_watermark(_make_pdf(), username="a", ip="1.1.1.1")
    assert marked is True
    assert out != _make_pdf()  # khác bản gốc


@pytest.mark.parametrize("raw,role,expected", [
    (True, "manager", True),
    (True, "staff", False),   # NV truyền raw=1 KHÔNG được bỏ watermark
    (False, "manager", False),
    (False, "staff", False),
])
def test_should_serve_raw(raw: bool, role: str, expected: bool) -> None:
    assert watermark.should_serve_raw(raw, role) is expected


def test_apply_watermark_skips_signed(monkeypatch: pytest.MonkeyPatch) -> None:
    # CV đã ký số → KHÔNG watermark (tránh phá chữ ký), trả nguyên bản.
    src = _make_pdf()
    monkeypatch.setattr(pdf_stamp, "pdf_has_signature", lambda _b: True)
    out, marked = watermark.apply_download_watermark(src, username="a", ip="1.1.1.1")
    assert marked is False
    assert out == src
