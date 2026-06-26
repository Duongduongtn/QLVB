"""Verify chữ ký số PAdES bằng pyHanko + cache trust list NEAC."""

from __future__ import annotations

from app.core.celery_app import celery


@celery.task(name="app.workers.sign_verify.verify_pades", bind=True, max_retries=3)
def verify_pades(self, job_id: str, file_id: int) -> dict:  # noqa: ARG001
    """TODO E1.5 — verify chữ ký PAdES, trả {has, valid, ca, signer, signed_at, valid_until}."""
    raise NotImplementedError("Implement ở giai đoạn 1 nhóm E")


@celery.task(name="app.workers.sign_verify.refresh_trust_list")
def refresh_trust_list() -> None:
    """TODO — cron tuần: tải trust list NEAC mới về local cache."""
    raise NotImplementedError("Implement ở giai đoạn 1")
