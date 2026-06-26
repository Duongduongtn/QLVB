"""OCR tiếng Việt bằng PaddleOCR (model `vie`).

Lazy-load model PaddleOCR ở worker process — KHÔNG import ở backend (nặng).
"""

from __future__ import annotations

from app.core.celery_app import celery


@celery.task(name="app.workers.ocr.extract_text", bind=True, max_retries=3)
def extract_text(self, job_id: str, file_id: int) -> dict:
    """TODO §6 GĐ1 — đọc text PDF scan + check trùng + auto-fill.

    Returns:
        {
            "ocr_text": str,
            "auto_fill": {"reference_number": ..., "document_date": ..., "sender": ...},
            "duplicates": [{"layer": 1|2|3, "level": "red"|"yellow", "doc_id": int}, ...],
        }
    """
    raise NotImplementedError("Implement ở giai đoạn 1 nhóm E")
