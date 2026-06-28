"""Schema G — báo cáo / dashboard."""

from __future__ import annotations

from pydantic import BaseModel


class Kpi(BaseModel):
    di_year: int
    den_year: int
    di_month: int
    den_month: int
    chua_xu_ly: int
    qua_han: int


class MonthStat(BaseModel):
    month: int
    di: int
    den: int


class NameCount(BaseModel):
    name: str
    count: int


class DashboardStats(BaseModel):
    year: int
    kpi: Kpi
    months: list[MonthStat]
    top_senders: list[NameCount]
    by_type: list[NameCount]
