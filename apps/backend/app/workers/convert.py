"""Convert Word → PDF bằng LibreOffice headless (TDD §2.4 — chạy ở image WORKER).

Task mỏng bọc `services.convert`: đọc Word (asset tạm) → convert → ghi PDF (asset tạm) →
trả storage_key. Hiện luồng D1 gọi service đồng bộ (convert nhanh, ≤10s); task này để
chuyển sang async khi cần (file lớn / tải cao).
"""

from __future__ import annotations

from app.core.celery_app import celery


@celery.task(name="app.workers.convert.docx_to_pdf", bind=True, max_retries=2)
def docx_to_pdf(self, input_key: str, ext: str = "docx") -> dict:
    from app.core.storage import read_asset, save_asset
    from app.services.convert import convert_word_to_pdf

    data = read_asset(input_key)
    pdf = convert_word_to_pdf(data, ext=ext)
    asset = save_asset(pdf, ext="pdf", subdir="cv_tmp")
    return {"result_key": asset.storage_key}
