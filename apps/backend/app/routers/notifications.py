"""Router thông báo (chuông header) — E2/E3. Polling từ FE."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.models.user import User
from app.schemas.notification import NotificationListResponse, NotificationOut
from app.services import notification as notif_service

router = APIRouter()


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> NotificationListResponse:
    items, total = notif_service.list_mine(db, actor.id, page=page, size=size)
    return NotificationListResponse(
        items=[NotificationOut.model_validate(n) for n in items],
        total=total,
        unread=notif_service.unread_count(db, actor.id),
    )


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db), actor: User = Depends(current_user)
) -> dict[str, int]:
    return {"count": notif_service.unread_count(db, actor.id)}


@router.post("/{notif_id}/read", status_code=204)
def mark_read(
    notif_id: int, db: Session = Depends(get_db), actor: User = Depends(current_user)
) -> Response:
    notif_service.mark_read(db, notif_id, actor.id)
    return Response(status_code=204)


@router.post("/read-all", status_code=204)
def mark_all_read(db: Session = Depends(get_db), actor: User = Depends(current_user)) -> Response:
    notif_service.mark_all_read(db, actor.id)
    return Response(status_code=204)
