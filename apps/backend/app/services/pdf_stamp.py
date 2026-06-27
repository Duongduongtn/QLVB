"""Chèn mộc / chữ ký lên PDF bằng PyMuPDF (fitz) — Nhóm D (D1 chèn, D3 giáp lai, D4 ký nháy).

Toạ độ lưu dạng % so với kích thước trang (QĐ #2) → page resize không lệch. LÕI thuần,
test standalone trên PDF tự sinh. `fitz`/`PIL` import TRỄ. Mọi hàm nhận + trả `bytes` PDF.
"""

from __future__ import annotations

import io
from typing import Any


def pdf_page_count(pdf_bytes: bytes) -> int:
    import fitz

    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        return int(doc.page_count)


def stamp_images(
    pdf_bytes: bytes, placements: list[dict[str, Any]], images: dict[str, bytes]
) -> bytes:
    """Chèn ảnh theo toạ độ %.

    placements: [{kind, page (1-based), x_pct, y_pct, w_pct, h_pct}] — % so với trang.
    images: {kind: png_bytes}. kind không có ảnh hoặc page ngoài phạm vi → bỏ qua.
    """
    import fitz

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        for p in placements:
            img = images.get(str(p["kind"]))
            if img is None:
                continue
            idx = int(p["page"]) - 1
            if not 0 <= idx < doc.page_count:
                continue
            page = doc[idx]
            w_pt, h_pt = page.rect.width, page.rect.height
            x0 = float(p["x_pct"]) * w_pt
            y0 = float(p["y_pct"]) * h_pt
            x1 = x0 + float(p["w_pct"]) * w_pt
            y1 = y0 + float(p["h_pct"]) * h_pt
            page.insert_image(
                fitz.Rect(x0, y0, x1, y1), stream=img, keep_proportion=True, overlay=True
            )
        return bytes(doc.tobytes())
    finally:
        doc.close()


def giap_lai(
    pdf_bytes: bytes,
    seal_png: bytes,
    *,
    page_from: int,
    page_to: int,
    band_width_pct: float = 0.07,
    band_height_pct: float = 0.5,
) -> bytes:
    """Đóng giáp lai (D3): cắt mộc thành N cột dọc (N = số trang trong range), đặt cột k
    lên trang k ở mép phải sao cho XẾP trang ghép lại liền mạch.

    Cột k đặt ở dải [W - ow, W] tại offset k*(ow/N) → khi các trang in xếp mép phải trùng
    nhau, các cột tái tạo đủ con mộc. keep_proportion=False để lấp đúng ô.
    """
    import fitz
    from PIL import Image

    n = page_to - page_from + 1
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        if n < 1:
            return bytes(doc.tobytes())
        seal = Image.open(io.BytesIO(seal_png)).convert("RGBA")
        sw, sh = seal.size
        col_w = sw / n
        for k in range(n):
            idx = page_from - 1 + k
            if not 0 <= idx < doc.page_count:
                continue
            left = int(k * col_w)
            right = sw if k == n - 1 else int((k + 1) * col_w)
            strip = seal.crop((left, 0, max(left + 1, right), sh))
            buf = io.BytesIO()
            strip.save(buf, format="PNG")

            page = doc[idx]
            w_pt, h_pt = page.rect.width, page.rect.height
            ow = band_width_pct * w_pt
            oh = band_height_pct * h_pt
            cell_w = ow / n
            y0 = (h_pt - oh) / 2
            x0 = w_pt - ow + k * cell_w
            page.insert_image(
                fitz.Rect(x0, y0, x0 + cell_w, y0 + oh),
                stream=buf.getvalue(),
                keep_proportion=False,
                overlay=True,
            )
        return bytes(doc.tobytes())
    finally:
        doc.close()


def ky_nhay(
    pdf_bytes: bytes,
    signature_png: bytes,
    *,
    page_from: int,
    page_to: int,
    size_pct: float = 0.12,
    margin_pct: float = 0.04,
    skip_last_page: bool = True,
) -> bytes:
    """Ký nháy (D4): chèn chữ ký mini ở góc dưới phải mỗi trang trong range, TRỪ trang
    cuối của tài liệu (trang cuối đã có chữ ký chính)."""
    import fitz
    from PIL import Image

    sig = Image.open(io.BytesIO(signature_png)).convert("RGBA")
    sw, sh = sig.size
    aspect = sh / sw if sw else 1.0

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        last_page = doc.page_count  # 1-based
        for page_num in range(page_from, page_to + 1):
            if skip_last_page and page_num == last_page:
                continue
            idx = page_num - 1
            if not 0 <= idx < doc.page_count:
                continue
            page = doc[idx]
            w_pt, h_pt = page.rect.width, page.rect.height
            w = size_pct * w_pt
            h = w * aspect
            margin = margin_pct * w_pt
            x1 = w_pt - margin
            y1 = h_pt - margin
            page.insert_image(
                fitz.Rect(x1 - w, y1 - h, x1, y1),
                stream=signature_png,
                keep_proportion=True,
                overlay=True,
            )
        return bytes(doc.tobytes())
    finally:
        doc.close()
