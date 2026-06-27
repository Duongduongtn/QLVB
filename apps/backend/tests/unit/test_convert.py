"""Test convert Word→PDF — service thật (skip nếu môi trường chưa cài LibreOffice).

LibreOffice là app hệ thống (ở image worker), KHÔNG có trong job test CI mặc định → đánh
`slow` + skip khi thiếu soffice. _ensure_pdf (định tuyến PDF/Word) test được không cần soffice.
"""

from __future__ import annotations

import io
import zipfile

import pytest

from app.core.errors import AppError
from app.services import convert


def _has_soffice() -> bool:
    try:
        convert._soffice_bin()
        return True
    except AppError:
        return False


def _minimal_docx() -> bytes:
    ct = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        "</Relationships>"
    )
    doc = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body><w:p><w:r><w:t>Cong van thu nghiem</w:t></w:r></w:p></w:body></w:document>"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", ct)
        z.writestr("_rels/.rels", rels)
        z.writestr("word/document.xml", doc)
    return buf.getvalue()


def test_convert_rejects_unsupported_ext() -> None:
    with pytest.raises(AppError):
        convert.convert_word_to_pdf(b"x", ext="txt")


def test_libreoffice_missing_raises_503(monkeypatch: pytest.MonkeyPatch) -> None:
    # Không tìm thấy soffice → AppError 503 graceful (prod backend image không có LibreOffice).
    monkeypatch.setattr(convert.shutil, "which", lambda _c: None)
    monkeypatch.setattr(convert.Path, "exists", lambda _self: False)
    monkeypatch.setattr("app.core.config.settings.libreoffice_bin", "", raising=False)
    with pytest.raises(AppError) as exc:
        convert.convert_word_to_pdf(b"PK\x03\x04", ext="docx")
    assert exc.value.http_status == 503


# ── Convert thật (cần LibreOffice) ──────────────────────────────────
@pytest.mark.slow
def test_convert_docx_to_pdf_real() -> None:
    if not _has_soffice():
        pytest.skip("Cần LibreOffice (soffice) để convert")
    pdf = convert.convert_word_to_pdf(_minimal_docx(), ext="docx")
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 1000
