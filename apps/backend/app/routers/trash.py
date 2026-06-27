"""Router thùng rác CV đi — H3 (SEC.AUD). CHỈ Quản lý (xem + khôi phục + xoá vĩnh viễn).

Định tuyến riêng `/api/trash` để tránh đụng `/api/outgoing/{id}` (path int). Router mỏng.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_manager
from app.core.http import client_ip
from app.models.user import User
from app.schemas.outgoing import OutgoingOut, RecipientOut, TrashItemOut, TrashListResponse
from app.services import outgoing as out_service
from app.services.outgoing import TRASH_KEEP_DAYS

router = APIRouter()


def _ctx(request: Request) -> tuple[str | None, str | None]:
    return client_ip(request), request.headers.get("user-agent")


@router.get("", response_model=TrashListResponse)
def list_trash(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
) -> TrashListResponse:
    items, total = out_service.list_trash(db, page=page, size=size)
    now = datetime.now(UTC)
    out = [
        TrashItemOut(
            id=doc.id,
            unit_id=doc.unit_id,
            number=doc.number,
            subject=doc.subject,
            status=doc.status,
            deleted_at=doc.deleted_at,
            days_remaining=max(0, TRASH_KEEP_DAYS - ((now - doc.deleted_at).days if doc.deleted_at else 0)),
        )
        for doc in items
    ]
    return TrashListResponse(items=out, total=total)


@router.post("/{doc_id}/restore", response_model=OutgoingOut)
def restore_outgoing(
    doc_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> OutgoingOut:
    ip, ua = _ctx(request)
    doc = out_service.restore(db, doc_id, actor_id=actor.id, ip=ip, ua=ua)
    out = OutgoingOut.model_validate(doc)
    out.recipients = [RecipientOut.model_validate(r) for r in out_service.get_recipients(db, doc.id)]
    return out


@router.delete("/{doc_id}", status_code=204)
def purge_outgoing(
    doc_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> Response:
    """Xoá VĨNH VIỄN (audit log giữ lại)."""
    ip, ua = _ctx(request)
    out_service.purge(db, doc_id, actor_id=actor.id, ip=ip, ua=ua)
    return Response(status_code=204)
