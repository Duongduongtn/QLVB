"""Schema G — báo cáo / dashboard."""

from __future__ import annotations

from pydantic import BaseModel


class Kpi(BaseModel):
    di_year: int
    den_year: int
    di_month: int
    den_month: int


class MonthStat(BaseModel):
    month: int
    di: int
    den: int


class DashboardStats(BaseModel):
    year: int
    kpi: Kpi
    months: list[MonthStat]
