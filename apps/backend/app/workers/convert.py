"""Convert Word → PDF bằng LibreOffice headless.

LibreOffice cần cài sẵn trong image worker (Dockerfile.worker).
TDD §4: tách worker riêng để LibreOffice crash không sập web.
"""

from __future__ import annotations

from app.core.celery_app import celery


@celery.task(name="app.workers.convert.docx_to_pdf", bind=True, max_retries=3)
def docx_to_pdf(self, job_id: str, file_id: int) -> dict:
    """TODO §4 GĐ1 — convert .docx/.doc → PDF.

    Args:
        job_id: UUID job trong bảng `jobs` để cập nhật progress.
        file_id: file gốc (đã mã hoá phong bì) cần convert.

    Returns:
        {"output_file_id": <id PDF mới>}
    """
    raise NotImplementedError("Implement ở giai đoạn 1 nhóm D")
