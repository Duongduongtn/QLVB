"""OCR tiếng Việt bằng PaddleOCR (model `vie`).

Lazy-load model PaddleOCR ở worker process — KHÔNG import ở backend (nặng).
"""

from __future__ import annotations

import logging

from app.core.celery_app import celery

logger = logging.getLogger(__name__)

_MIN_TEXT_LEN = 40  # dưới ngưỡng này coi như PDF scan → chạy OCR ảnh


def _ocr_scanned(data: bytes) -> str:
    """PDF scan ảnh → render trang → PaddleOCR tiếng Việt. Lazy-load model (nặng)."""
    import fitz
    import numpy as np
    from paddleocr import PaddleOCR

    ocr = PaddleOCR(use_angle_cls=True, lang="vie", show_log=False)
    out: list[str] = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for page in doc:
            pix = page.get_pixmap(dpi=200)
            img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            for line in ocr.ocr(img[:, :, :3], cls=True)[0] or []:
                out.append(line[1][0])
    return "\n".join(out).strip()


@celery.task(name="app.workers.ocr.extract_text", bind=True, max_retries=3)
def extract_text(self, tmp_key: str) -> dict:
    """E1 — đọc text CV đến (PDF gốc: text-layer; scan: PaddleOCR) + auto-fill metadata.

    Returns {"ocr_text": str, "auto_fill": {reference_number, document_date, sender_hint}}.
    """
    from app.core.storage import delete_asset, read_asset
    from app.services.incoming_ocr import extract_text_layer, parse_autofill

    data = read_asset(tmp_key)
    text = extract_text_layer(data)
    if len(text) < _MIN_TEXT_LEN:
        try:
            text = _ocr_scanned(data)
        except Exception as exc:  # OCR fail toàn phần → vẫn trả '' để user nhập tay (PRD edge)
            logger.warning("ocr.scan_failed: %s", exc)
            text = text or ""
    result = {"ocr_text": text, "auto_fill": parse_autofill(text)}
    # Dọn NGAY bản tạm KHÔNG mã hoá sau khi OCR xong (chống rò rỉ CV mật trên đĩa).
    # Chỉ xoá khi thành công → lần retry vẫn còn file. Beat purge_bg_tmp dọn nốt trường hợp lạc.
    delete_asset(tmp_key)
    return result


def _extract_text(data: bytes) -> str:
    """Text-layer PDF (nhanh) → fallback PaddleOCR scan. Lỗi OCR toàn phần → text rỗng."""
    from app.services.incoming_ocr import extract_text_layer

    text = extract_text_layer(data)
    if len(text) < _MIN_TEXT_LEN:
        try:
            text = _ocr_scanned(data)
        except Exception as exc:  # OCR fail → vẫn lưu text rỗng
            logger.warning("ocr.attachment_scan_failed: %s", exc)
            text = text or ""
    return text


@celery.task(name="app.workers.ocr.ocr_attachment", bind=True, max_retries=3)
def ocr_attachment(self, attachment_id: int, tmp_key: str) -> dict:
    """E4 — OCR phụ lục PDF rồi GHI THẲNG `ocr_text` vào DB (fire-and-forget, không FE poll).

    Khác `extract_text` (CV chính, poll-back): phụ lục không cần tương tác → worker tự ghi DB
    qua SessionLocal (worker reach Postgres ở cả qlcv_net + qlcv_worker_net).
    """
    from app.core.database import SessionLocal
    from app.core.storage import delete_asset, read_asset
    from app.services.incoming_attachments import set_ocr_text

    data = read_asset(tmp_key)
    text = _extract_text(data)
    with SessionLocal() as db:
        set_ocr_text(db, attachment_id, text)
    delete_asset(tmp_key)
    return {"attachment_id": attachment_id, "chars": len(text)}
