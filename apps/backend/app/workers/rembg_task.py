"""Tách nền mộc đỏ / chữ ký — C3 (SIG.BG). Chạy ở image WORKER (rembg nặng, TDD §2).

Task mỏng: đọc ảnh gốc (asset tạm) → gọi service `bg_removal` → ghi kết quả (asset tạm
PNG RGBA) → trả storage_key cho backend phục vụ preview. KHÔNG đụng DB (chưa cần bảng
jobs ở GĐ này — trạng thái lấy từ Celery result backend).
"""

from __future__ import annotations

from app.core.celery_app import celery


@celery.task(name="app.workers.rembg_task.remove_background", bind=True, max_retries=2)
def remove_background(self, input_key: str, kind: str, threshold: int = 60) -> dict:
    """Tách nền 1 ảnh tạm.

    Args:
        input_key: storage_key ảnh gốc (đã lưu asset tạm subdir 'bg_tmp').
        kind: 'seal' (rembg/U2Net giữ đỏ) | 'signature' (OpenCV threshold).
        threshold: 0..100 — chỉ dùng cho chữ ký.

    Returns:
        {"result_key": <storage_key PNG RGBA đã tách nền>, "kind", "threshold"}
    """
    from app.core.storage import read_asset, save_asset
    from app.services.bg_removal import remove_background as strip_bg

    data = read_asset(input_key)
    out = strip_bg(data, kind=kind, threshold=threshold)
    asset = save_asset(out, ext="png", subdir="bg_tmp")
    return {"result_key": asset.storage_key, "kind": kind, "threshold": threshold}


@celery.task(name="app.workers.rembg_task.purge_bg_tmp")
def purge_bg_tmp(max_age_hours: int = 2) -> dict:
    """Dọn asset tạm tách nền cũ (preview/slider sinh nhiều file) → chống đầy đĩa.

    Chạy theo Celery beat (hàng giờ). Ảnh đã 'Lưu' được copy sang asset chính rồi nên
    bản tạm an toàn để xoá sau vài giờ.
    """
    import time

    from app.core.storage import purge_old_files

    now = time.time()
    age = max_age_hours * 3600
    # bg_tmp (tách nền) + cv_tmp (convert Word) + in_tmp (PDF CV đến cho OCR) + sig_tmp
    # (PDF CV đến cho verify PAdES) đều là asset tạm KHÔNG mã hoá; backstop dọn nếu worker
    # chưa xoá kịp.
    removed = (
        purge_old_files("bg_tmp", max_age_seconds=age, now=now)
        + purge_old_files("cv_tmp", max_age_seconds=age, now=now)
        + purge_old_files("in_tmp", max_age_seconds=age, now=now)
        + purge_old_files("sig_tmp", max_age_seconds=age, now=now)
    )
    return {"removed": removed}
