"""Unit test tự dò vị trí mộc/chữ ký — D2 (OUT.MAP). Cách A (placeholder) đo được."""

from __future__ import annotations

import pytest

from app.services import stamp_autodetect as sad


def _has_fitz() -> bool:
    try:
        import fitz  # noqa: F401

        return True
    except ImportError:
        return False


def _pdf_with(texts: list[tuple[float, float, str]]) -> bytes:
    import fitz

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4
    for x, y, t in texts:
        page.insert_text((x, y), t, fontsize=12)
    return bytes(doc.tobytes())


pytestmark = pytest.mark.skipif(not _has_fitz(), reason="Cần PyMuPDF (fitz)")


def test_detect_placeholders_all_three() -> None:
    data = _pdf_with([(100, 700, "{{KY_TEN}}"), (320, 700, "{{DONG_DAU}}"), (100, 760, "Ngay {{NGAY}}")])
    pos = sad.detect_placeholders(data, want_seal=True, want_sig=True)
    kinds = {p["kind"] for p in pos}
    assert kinds == {"signature", "seal", "date"}
    for p in pos:
        assert 0.0 <= p["x_pct"] <= 1.0 and 0.0 <= p["y_pct"] <= 1.0
        assert p["page"] == 1


def test_placeholder_position_near_token() -> None:
    # {{KY_TEN}} ở ~x=100/595≈0.17, y=700/842≈0.83 → tâm chữ ký gần đó
    data = _pdf_with([(100, 700, "{{KY_TEN}}")])
    pos = sad.detect_placeholders(data, want_seal=False, want_sig=True)
    assert len(pos) == 1
    p = pos[0]
    cx = p["x_pct"] + p["w_pct"] / 2
    cy = p["y_pct"] + p["h_pct"] / 2
    assert abs(cx - 0.17) < 0.12 and abs(cy - 0.83) < 0.08


def test_detect_respects_wants() -> None:
    data = _pdf_with([(100, 700, "{{KY_TEN}}"), (320, 700, "{{DONG_DAU}}")])
    pos = sad.detect_placeholders(data, want_seal=False, want_sig=True)
    assert {p["kind"] for p in pos} == {"signature"}  # không lấy mộc khi want_seal=False


def test_detect_positions_placeholder_beats_template() -> None:
    data = _pdf_with([(100, 700, "{{KY_TEN}}")])
    template = [{"kind": "signature", "page": 1, "x_pct": 0.5, "y_pct": 0.5, "w_pct": 0.2, "h_pct": 0.1}]
    _, method = sad.detect_positions(data, want_seal=False, want_sig=True, template=template)
    assert method == "placeholder"  # A thắng C


def test_detect_positions_template_when_no_placeholder() -> None:
    data = _pdf_with([(100, 700, "Noi dung thuong khong co placeholder")])
    template = [{"kind": "signature", "page": 1, "x_pct": 0.5, "y_pct": 0.5, "w_pct": 0.2, "h_pct": 0.1}]
    pos, method = sad.detect_positions(data, want_seal=False, want_sig=True, template=template)
    assert method == "template" and pos == template


def test_detect_regex_title_phrase() -> None:
    data = _pdf_with([(100, 700, "GIAM DOC"), (100, 720, "GIÁM ĐỐC")])
    pos = sad.detect_by_regex(data, want_seal=True, want_sig=True)
    assert {p["kind"] for p in pos} == {"signature", "seal"}
