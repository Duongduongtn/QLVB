"""Tách nền mộc đỏ / chữ ký bằng rembg (U2Net) + OpenCV.

Module đặt tên `rembg_task` để tránh xung đột với package `rembg`.
"""

from __future__ import annotations

from app.core.celery_app import celery


@celery.task(name="app.workers.rembg_task.remove_background", bind=True, max_retries=3)
def remove_background(self, job_id: str, file_id: int, threshold: int | None = None) -> dict:  # noqa: ARG001
    """TODO C1/C2/C3 — tách nền, trả PNG alpha + preview."""
    raise NotImplementedError("Implement ở giai đoạn 1 nhóm C")
