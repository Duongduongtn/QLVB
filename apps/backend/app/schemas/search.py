"""Schema F1 — tìm kiếm toàn cục (full-text CV đi + đến)."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class SearchResultItem(BaseModel):
    id: int
    source: str  # 'in' (CV đến) | 'out' (CV đi)
    number: str | None
    subject: str | None
    status: str
    doc_date: date | None  # ngày văn bản (đến) / ngày ban hành (đi)
    created_at: datetime


class SearchResponse(BaseModel):
    items: list[SearchResultItem]
    total: int
