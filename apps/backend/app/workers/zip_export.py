"""Xuất ZIP theo năm — G4."""

from __future__ import annotations

from app.core.celery_app import celery


@celery.task(name="app.workers.zip_export.export_year", bind=True, max_retries=2)
def export_year(self, job_id: str, year: int, unit_id: int | None = None) -> dict:  # noqa: ARG001
    """TODO G4 — gom toàn bộ CV năm vào 1 ZIP có cấu trúc thư mục."""
    raise NotImplementedError("Implement ở giai đoạn 2 nhóm G")
