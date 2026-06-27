"""Router nhật ký hệ thống — H3 (SEC.AUD). CHỈ Quản lý xem (truy vết).

Router mỏng: validate + gọi service + map schema.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_manager
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit import AuditActionsResponse, AuditLogListResponse, AuditLogOut
from app.services import audit as audit_service

router = APIRouter()


def _to_out(log: AuditLog, username: str | None) -> AuditLogOut:
    return AuditLogOut(
        id=log.id,
        created_at=log.created_at,
        user_id=log.user_id,
        username=username,
        action=log.action,
        object_type=log.object_type,
        object_id=log.object_id,
        ip=str(log.ip) if log.ip is not None else None,
        user_agent=log.user_agent,
        detail=log.detail,
    )


@router.get("", response_model=AuditLogListResponse)
def list_audit_logs(
    user_id: int | None = Query(default=None),
    action: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
) -> AuditLogListResponse:
    rows, total = audit_service.list_logs(
        db, user_id=user_id, action=action, date_from=date_from, date_to=date_to, q=q, page=page, size=size
    )
    return AuditLogListResponse(items=[_to_out(log, username) for log, username in rows], total=total)


@router.get("/actions", response_model=AuditActionsResponse)
def list_audit_actions(
    db: Session = Depends(get_db), _: User = Depends(require_manager)
) -> AuditActionsResponse:
    return AuditActionsResponse(actions=audit_service.list_actions(db))
