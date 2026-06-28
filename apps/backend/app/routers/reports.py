"""Router G — báo cáo (G2 xuất sổ NĐ 30 + thống kê dashboard). Chỉ Quản lý.

Router mỏng: validate + gọi service. Xuất Excel chạy đồng bộ (≤ vài nghìn dòng, nhanh).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from urllib.parse import quote

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.celery_app import celery
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_manager
from app.core.errors import NotFound, ValidationFailed
from app.core.http import client_ip
from app.models.user import User
from app.schemas.report import DashboardStats
from app.services import audit as audit_service
from app.services import report as report_service

router = APIRouter()

_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_ZIP_MIME = "application/zip"
_BOOK_FILE = {"di_gdnn": "So-di-GDNN", "di_dvdl": "So-di-DVDL", "den": "So-den"}
_EXPORT_PREFIX = "exports/"


def _vn_today() -> date:
    """Ngày hiện tại theo giờ VN (UTC+7) — dùng cho 'Ngày xuất' trên báo cáo."""
    return (datetime.now(UTC) + timedelta(hours=7)).date()


@router.get("/stats", response_model=DashboardStats)
def stats(
    year: int = Query(..., ge=2000, le=2100),
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
) -> DashboardStats:
    data = report_service.dashboard_stats(db, year=year, today=datetime.now(UTC).date())
    return DashboardStats(**data)


@router.get("/register.xlsx")
async def register_xlsx(
    year: int = Query(..., ge=2000, le=2100),
    book: str = Query(..., pattern="^(di_gdnn|di_dvdl|den)$"),
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
) -> Response:
    """G2 — tải sổ đăng ký NĐ 30/2020 (.xlsx) theo năm + loại sổ."""
    data = await run_in_threadpool(report_service.build_register_xlsx, db, year=year, book=book)
    fname = f"{_BOOK_FILE[book]}-{year}.xlsx"
    return Response(
        content=data,
        media_type=_XLSX_MIME,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(fname)}"},
    )


@router.get("/custom.xlsx")
async def custom_report_xlsx(
    date_from: date = Query(...),
    date_to: date = Query(...),
    unit: str = Query("all", pattern="^(all|gdnn|dvdl)$"),
    doc_type: str = Query("all", max_length=20),
    group_by: str = Query("month", pattern="^(month|quarter|sender|type)$"),
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
) -> Response:
    """G3 — báo cáo thống kê tuỳ chỉnh (.xlsx, 3 sheet) theo bộ lọc."""
    data = await run_in_threadpool(
        report_service.build_custom_report_xlsx,
        db,
        date_from=date_from,
        date_to=date_to,
        unit=unit,
        doc_type=doc_type,
        group_by=group_by,
        today=_vn_today(),
    )
    fname = f"Bao-cao-thong-ke-{date_from:%Y%m%d}-{date_to:%Y%m%d}.xlsx"
    return Response(
        content=data,
        media_type=_XLSX_MIME,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(fname)}"},
    )


# --------------------------------------------------------------------------- #
# G4 — Export ZIP toàn bộ CV theo năm (RPT.ZIP). Chạy nền ở worker; FE poll tiến độ.
# --------------------------------------------------------------------------- #


def _export_path(key: str) -> Path:
    """Đường dẫn file ZIP export từ storage_key — chỉ cho phép trong exports/ (chống traversal)."""
    if not key.startswith(_EXPORT_PREFIX) or ".." in Path(key).parts:
        raise ValidationFailed("Khoá tệp không hợp lệ")
    return Path(settings.storage_local_path) / key


@router.post("/export-zip", status_code=202)
def submit_export_zip(
    request: Request,
    year: int = Query(..., ge=2000, le=2100),
    unit: str | None = Query(None, pattern="^(gdnn|dvdl)$"),
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> dict[str, str]:
    """Đặt hàng xuất ZIP CV năm `year` (lọc CV đi theo `unit`). Trả task_id để poll."""
    from app.workers.zip_export import export_year

    task = export_year.delay(year, unit)
    audit_service.log_action(
        db,
        action="export_zip_request",
        user_id=actor.id,
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
        detail={"year": year, "unit": unit, "task_id": task.id},
    )
    db.commit()
    return {"task_id": task.id}


@router.get("/export-zip/{task_id}")
def export_zip_status(task_id: str, _: User = Depends(require_manager)) -> dict[str, object]:
    """Poll tiến độ xuất ZIP. Trả pending / progress(done,total) / done(stats) / error.

    KHÔNG trả `key` (đường dẫn storage nội bộ) ra FE — tải qua task_id, server tự suy khoá."""
    res: AsyncResult = AsyncResult(task_id, app=celery)
    if res.successful():
        r = res.result if isinstance(res.result, dict) else {}
        return {
            "status": "done",
            "year": r.get("year"),
            "total": r.get("total"),
            "counts": r.get("counts"),
            "size_bytes": r.get("size_bytes"),
            "errors": r.get("errors"),
            "oversize": r.get("oversize"),
        }
    if res.failed():
        return {"status": "error", "message": "Xuất ZIP thất bại, thử lại sau"}
    if res.state == "PROGRESS" and isinstance(res.info, dict):
        return {"status": "progress", **res.info}
    return {"status": "pending"}


@router.get("/export-zip/{task_id}/download")
def export_zip_download(
    task_id: str,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> FileResponse:
    """Tải file ZIP đã xuất xong (stream từ volume dùng chung). Khoá lấy từ kết quả task.

    GHI AUDIT (bất biến #11): tải bulk toàn bộ CV năm là thao tác nhạy cảm nhất hệ thống."""
    res: AsyncResult = AsyncResult(task_id, app=celery)
    if not res.successful() or not isinstance(res.result, dict):
        raise NotFound("Chưa có file ZIP sẵn sàng cho yêu cầu này")
    path = _export_path(str(res.result.get("key", "")))
    if not path.exists():
        raise NotFound("File ZIP đã hết hạn hoặc bị dọn — vui lòng xuất lại")
    audit_service.log_action(
        db,
        action="export_zip_download",
        user_id=actor.id,
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
        detail={
            "task_id": task_id,
            "year": res.result.get("year"),
            "total": res.result.get("total"),
        },
    )
    db.commit()
    fname = f"CV-{res.result.get('year', '')}.zip"
    return FileResponse(
        path,
        media_type=_ZIP_MIME,
        filename=fname,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(fname)}"},
    )
