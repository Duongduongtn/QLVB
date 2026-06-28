"""Xuất ZIP toàn bộ CV theo năm — G4 (RPT.ZIP).

Chạy ở image WORKER (có volume `qlcv_storage` + MASTER_KEY_HEX để giải mã CV). Ghi file
ZIP ra `exports/` trên volume dùng chung → backend stream cho user (manager-only). Tiến độ
báo qua Celery `update_state(PROGRESS)` để FE poll. Beat `purge_exports` dọn file cũ.
"""

from __future__ import annotations

import secrets
from pathlib import Path
from typing import Any

from app.core.celery_app import celery

_EXPORT_SUBDIR = "exports"


@celery.task(name="app.workers.zip_export.export_year", bind=True, max_retries=2)
def export_year(self: Any, year: int, unit: str | None = None) -> dict[str, Any]:
    """Gom CV năm `year` (lọc đơn vị CV đi qua `unit`) thành ZIP có cấu trúc thư mục."""
    from app.core.config import settings
    from app.core.database import SessionLocal
    from app.core.storage import read_asset, read_encrypted_file
    from app.services import export as export_svc
    from app.services import report as report_svc

    root = Path(settings.storage_local_path)
    rel_key = f"{_EXPORT_SUBDIR}/{year}-{secrets.token_hex(8)}.zip"
    dest = root / rel_key
    dest.parent.mkdir(parents=True, exist_ok=True)

    # Chỉ giữ DB connection trong lúc TRUY VẤN (gather + build index). Sau đó list
    # ExportItem đã materialize (kèm storage_key/wrapped_key) → KHÔNG cần DB khi
    # dựng ZIP (IO nặng vài phút) → trả connection về pool sớm.
    with SessionLocal() as db:
        items = export_svc.gather_year_items(db, year=year, unit=unit)
        index_bytes = report_svc.build_register_workbook_bytes(db, year=year)

    total = len(items)
    self.update_state(state="PROGRESS", meta={"done": 0, "total": total})

    def _progress(done: int, n: int) -> None:
        # Throttle: cập nhật mỗi 10 file (hoặc file cuối) để giảm tải Redis.
        if done % 10 == 0 or done == n:
            self.update_state(state="PROGRESS", meta={"done": done, "total": n})

    def _read(it: export_svc.ExportItem) -> bytes:
        if it.storage_key is None:
            raise FileNotFoundError("missing storage_key")
        if it.wrapped_key is not None:
            return read_encrypted_file(it.storage_key, it.wrapped_key)
        return read_asset(it.storage_key)

    stats = export_svc.build_year_zip(
        items, dest_path=dest, index_bytes=index_bytes, read_file=_read, progress=_progress
    )
    return {"key": rel_key, "year": year, **stats}


@celery.task(name="app.workers.zip_export.purge_exports")
def purge_exports() -> dict[str, int]:
    """Cron — dọn file ZIP export cũ > 24h (chứa CV đã giải mã, không giữ lâu)."""
    import time

    from app.core.storage import purge_old_files

    removed = purge_old_files(_EXPORT_SUBDIR, max_age_seconds=24 * 60 * 60, now=time.time())
    return {"removed": removed}
