"""Sync file local → Cloudflare R2 + dọn dẹp.

Cron task (xem celery_app.beat_schedule):
- purge_trash_older_than_30d: xoá vĩnh viễn record trong thùng rác sau 30 ngày.
- reap_stuck_jobs: phát hiện job 'running' mất heartbeat → đánh failed + retry.
"""

from __future__ import annotations

from datetime import UTC

from app.core.celery_app import celery


@celery.task(name="app.workers.r2_sync.upload_to_r2", bind=True, max_retries=5)
def upload_to_r2(self, job_id: str, file_id: int) -> dict:
    """TODO — push file local → R2 (cùng storage_key)."""
    raise NotImplementedError("Implement ở giai đoạn 1")


@celery.task(name="app.workers.r2_sync.purge_trash_older_than_30d")
def purge_trash_older_than_30d() -> dict:
    """Cron ngày — CV trong thùng rác >30 ngày → xoá vĩnh viễn (giữ audit log)."""
    from datetime import datetime

    from app.core.database import SessionLocal
    from app.services.outgoing import purge_expired_trash

    with SessionLocal() as db:
        removed = purge_expired_trash(db, now=datetime.now(UTC), days=30)
    return {"removed": removed}


@celery.task(name="app.workers.r2_sync.notify_due_tasks")
def notify_due_tasks() -> dict:
    """Cron ngày (E3) — nhắc việc xử lý sắp tới hạn / quá hạn cho người được giao."""
    from datetime import datetime, timedelta, timezone

    from app.core.database import SessionLocal
    from app.services.tasks import notify_deadlines

    vn_today = datetime.now(timezone(timedelta(hours=7))).date()
    with SessionLocal() as db:
        sent = notify_deadlines(db, today=vn_today)
    return {"sent": sent}


@celery.task(name="app.workers.r2_sync.reap_stuck_jobs")
def reap_stuck_jobs() -> dict:
    """Cron mỗi phút — TDD §3.2: job 'running' mất heartbeat >5' → failed + retry."""
    raise NotImplementedError("Implement ở giai đoạn 1")
