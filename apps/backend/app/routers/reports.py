"""Router G — báo cáo (G2 xuất sổ NĐ 30 + thống kê dashboard). Chỉ Quản lý.

Router mỏng: validate + gọi service. Xuất Excel chạy đồng bộ (≤ vài nghìn dòng, nhanh).
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_manager
from app.models.user import User
from app.schemas.report import DashboardStats
from app.services import report as report_service

router = APIRouter()

_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_BOOK_FILE = {"di_gdnn": "So-di-GDNN", "di_dvdl": "So-di-DVDL", "den": "So-den"}


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
