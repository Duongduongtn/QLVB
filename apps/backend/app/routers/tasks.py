"""Router phân công + theo dõi xử lý — E2/E3. 'Việc của tôi' + cập nhật trạng thái."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.core.http import client_ip
from app.models.user import User
from app.schemas.tasks import (
    MyTaskItem,
    MyTaskListResponse,
    ReassignRequest,
    TaskOut,
    TaskStatusUpdate,
)
from app.services import tasks as task_service

router = APIRouter()

_VN_TZ = timezone(timedelta(hours=7))  # Asia/Saigon — "hôm nay" tính quá hạn theo giờ VN


def _ctx(request: Request) -> tuple[str | None, str | None]:
    return client_ip(request), request.headers.get("user-agent")


@router.get("/mine", response_model=MyTaskListResponse)
def my_tasks(
    status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> MyTaskListResponse:
    rows, total = task_service.list_my_tasks(db, actor.id, status=status, page=page, size=size)
    today = datetime.now(_VN_TZ).date()
    items = [
        MyTaskItem(
            id=t.id,
            incoming_id=t.incoming_id,
            unit_id=t.unit_id,
            status=t.status,
            deadline=t.deadline,
            overdue=task_service.overdue(t, today=today),
            number=inc.number,
            subject=inc.subject,
            sender_org_id=inc.sender_org_id,
            urgency=inc.urgency,
        )
        for t, inc in rows
    ]
    return MyTaskListResponse(items=items, total=total)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    payload: TaskStatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> TaskOut:
    ip, ua = _ctx(request)
    t = task_service.update_status(
        db,
        task_id,
        status=payload.status,
        result_note=payload.result_note,
        actor_id=actor.id,
        actor_role=actor.role,
        ip=ip,
        ua=ua,
    )
    return TaskOut.model_validate(t)


@router.post("/{task_id}/reassign", response_model=TaskOut)
def reassign_task(
    task_id: int,
    payload: ReassignRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> TaskOut:
    ip, ua = _ctx(request)
    t = task_service.reassign(
        db, task_id, payload.assignee_id, actor_id=actor.id, actor_role=actor.role, ip=ip, ua=ua
    )
    return TaskOut.model_validate(t)
