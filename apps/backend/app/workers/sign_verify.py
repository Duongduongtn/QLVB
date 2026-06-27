"""Verify chữ ký số PAdES bằng pyHanko + cache trust list NEAC (E1.5).

Task mỏng bọc ``services.sign_verify`` (lõi + pyHanko import trễ). Chạy ở image WORKER
(Dockerfile.worker có pyHanko). KHÔNG đụng DB — backend poll ``/sig-status`` rồi ghi kết
quả vào ``incoming_documents`` (giống luồng OCR), nên worker chỉ trả dict + dọn asset tạm.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from app.core.celery_app import celery

logger = logging.getLogger(__name__)


@celery.task(name="app.workers.sign_verify.verify_pades", bind=True, max_retries=3)
def verify_pades(self, tmp_key: str) -> dict:
    """E1.5 — verify chữ ký PAdES của CV đến (asset tạm KHÔNG mã hoá ``sig_tmp``).

    Returns ``{"signature_status": none|valid|invalid, "signature_info": {...}}``.
    Lỗi verify (PDF hỏng…) → coi như chưa ký (``none``) để vẫn chạy dedup an toàn.
    """
    from app.core.storage import delete_asset, read_asset
    from app.services.sign_verify import build_info, load_trust_pems, verify_pdf

    data = read_asset(tmp_key)
    try:
        sigs = verify_pdf(data, load_trust_pems())
    except Exception as exc:
        logger.warning("verify_pades lỗi: %s", exc)
        sigs = []
    info = build_info(sigs, checked_at=datetime.now(UTC))
    # Dọn NGAY bản tạm KHÔNG mã hoá (chống rò rỉ CV mật). Beat purge dọn nốt nếu lạc.
    delete_asset(tmp_key)
    return {"signature_status": info["status"], "signature_info": info}


@celery.task(name="app.workers.sign_verify.refresh_trust_list")
def refresh_trust_list() -> dict:
    """Cron tuần — tải trust list NEAC mới về cache local. Fail → giữ cache cũ + cảnh báo."""
    from app.services.sign_verify import refresh_trust_cache

    return refresh_trust_cache()
