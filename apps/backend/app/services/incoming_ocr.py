"""Trích text PDF + parse metadata CV đến (E1).

`extract_text_layer` (PyMuPDF, nhanh — cho PDF gốc có text) và `parse_autofill` (regex
số ký hiệu / ngày văn bản / cơ quan gửi) là LÕI thuần — test standalone, KHÔNG phụ thuộc
Celery. Nhánh OCR ảnh scan (PaddleOCR `vie`) nằm ở worker (nặng, lazy-load).
"""

from __future__ import annotations

import re

# "Số: 123/UBND-VP", "Số 45/QĐ-TTg" — cụm số ký hiệu cơ quan gửi.
_RE_REF = re.compile(r"S[ốôọ]\s*:?\s*([0-9]+\s*/\s*[0-9A-Za-zĐĐđ.\-]+)")
# "ngày 12 tháng 6 năm 2026".
_RE_DATE = re.compile(
    r"ng[àa]y\s+(\d{1,2})\s+th[áa]ng\s+(\d{1,2})\s+n[ăa]m\s+(\d{4})", re.IGNORECASE
)
# Trích yếu: cụm "V/v …" (về việc) hoặc dòng "Trích yếu: …" — lấy tới hết dòng.
_RE_SUBJECT = re.compile(r"(?:V/v|V/v\.|Tr[íi]ch y[ếê]u)\s*:?\s*(.+)", re.IGNORECASE)


def extract_text_layer(data: bytes) -> str:
    """Đọc text-layer PDF bằng PyMuPDF. Trả '' nếu PDF chỉ là ảnh scan (không text)."""
    import fitz  # lazy — chỉ worker/ảnh cần

    parts: list[str] = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for page in doc:
            parts.append(page.get_text())
    return "\n".join(parts).strip()


def parse_autofill(text: str) -> dict[str, str | None]:
    """Dò số ký hiệu, ngày văn bản (ISO), gợi ý cơ quan gửi từ text trích được."""
    ref = None
    m = _RE_REF.search(text)
    if m:
        ref = re.sub(r"\s+", "", m.group(1))

    doc_date = None
    md = _RE_DATE.search(text)
    if md:
        d, mo, y = int(md.group(1)), int(md.group(2)), int(md.group(3))
        if 1 <= d <= 31 and 1 <= mo <= 12:
            doc_date = f"{y:04d}-{mo:02d}-{d:02d}"

    # Gợi ý cơ quan gửi: dòng IN HOA dài nhất trong 12 dòng đầu (thường là tên cơ quan ban hành).
    sender_hint = None
    best = 0
    for line in (ln.strip() for ln in text.splitlines()[:12]):
        letters = [c for c in line if c.isalpha()]
        if len(letters) >= 6 and sum(c.isupper() for c in letters) / len(letters) > 0.7 and len(line) > best:
            sender_hint = line
            best = len(line)

    # Trích yếu: dòng "V/v …" / "Trích yếu: …" đầu tiên (cắt 1 dòng, bỏ khoảng trắng thừa).
    subject = None
    ms = _RE_SUBJECT.search(text)
    if ms:
        subject = re.sub(r"\s+", " ", ms.group(1).strip())[:500] or None

    return {
        "reference_number": ref,
        "document_date": doc_date,
        "sender_hint": sender_hint,
        "subject": subject,
    }
