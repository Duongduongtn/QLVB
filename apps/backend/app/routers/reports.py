"""Router G — báo cáo (G2 xuất sổ NĐ 30 + thống kê dashboard). Chỉ Quản lý.

Router mỏng: validate + gọi service. Xuất Excel chạy đồng bộ (≤ vài nghìn dòng, nhanh).
"""

from __future__ import annotations

from datetime import UTC, datetime
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
