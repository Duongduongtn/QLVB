"""Router F1 — tìm kiếm toàn cục full-text. Router mỏng: validate + gọi service."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.models.user import User
from app.schemas.search import SearchResponse, SearchResultItem
from app.services import search as search_service

router = APIRouter()


@router.get("", response_model=SearchResponse)
def search(
    q: str = Query(default="", description="Từ khoá (có/không dấu)"),
    type: str = Query(default="all", pattern="^(all|in|out)$"),
    status: str | None = Query(default=None),
    unit_id: int | None = Query(default=None),
    urgency: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> SearchResponse:
    items, total = search_service.global_search(
        db,
        q,
        doc_type=type,
        include_manager_only=actor.role == "manager",
        status=status,
        unit_id=unit_id,
        urgency=urgency,
        date_from=date_from,
        date_to=date_to,
        page=page,
        size=size,
    )
    return SearchResponse(items=[SearchResultItem(**it) for it in items], total=total)
