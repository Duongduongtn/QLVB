"""Celery app — chia sẻ giữa worker process và backend (enqueue từ API route).

Worker chạy bằng:
    celery -A app.core.celery_app:celery worker --loglevel=info --concurrency=2
Beat (cron) chạy bằng:
    celery -A app.core.celery_app:celery beat --loglevel=info
"""

from __future__ import annotations

from celery import Celery

from app.core.config import settings

_broker_url = settings.redis_url.rsplit("/", 1)[0] + f"/{settings.redis_broker_db}"
_result_url = settings.redis_url.rsplit("/", 1)[0] + f"/{settings.redis_result_db}"

celery = Celery(
    "qlcv",
    broker=_broker_url,
    backend=_result_url,
    include=[
        "app.workers.convert",
        "app.workers.ocr",
        "app.workers.rembg_task",
        "app.workers.sign_verify",
        "app.workers.zip_export",
        "app.workers.r2_sync",
    ],
)

celery.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,        # OCR/convert nặng — không prefetch nhiều
    task_track_started=True,
    timezone=settings.timezone,
    enable_utc=False,
    task_default_queue="default",
    task_routes={
        "app.workers.convert.*": {"queue": "convert"},
        "app.workers.ocr.*": {"queue": "ocr"},
        "app.workers.rembg_task.*": {"queue": "rembg"},
        "app.workers.zip_export.*": {"queue": "zip"},
        "app.workers.r2_sync.*": {"queue": "r2"},
    },
)

# Cron — Celery Beat
celery.conf.beat_schedule = {
    "neac-trust-list-weekly": {
        "task": "app.workers.sign_verify.refresh_trust_list",
        "schedule": 7 * 24 * 60 * 60,
    },
    "purge-trash-daily": {
        "task": "app.workers.r2_sync.purge_trash_older_than_30d",
        "schedule": 24 * 60 * 60,
    },
    "reap-stuck-jobs": {
        "task": "app.workers.r2_sync.reap_stuck_jobs",
        "schedule": 60,  # mỗi phút — phát hiện job 'running' mất heartbeat
    },
    "purge-bg-tmp-hourly": {
        "task": "app.workers.rembg_task.purge_bg_tmp",
        "schedule": 60 * 60,  # mỗi giờ — dọn asset tạm tách nền (preview/slider)
    },
    "notify-due-tasks-daily": {
        "task": "app.workers.r2_sync.notify_due_tasks",
        "schedule": 24 * 60 * 60,  # mỗi ngày — nhắc việc sắp/đã quá hạn (E3)
    },
}
