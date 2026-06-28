"""Router danh bạ cơ quan — M1 (nơi nhận) + M2 (cơ quan gửi).

Cả Quản lý lẫn Nhân viên đều CRUD (PRD M1/M2) → chỉ cần `current_user`, KHÔNG
require_manager. Router mỏng: validate + gọi service + map schema.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.core.errors import ValidationFailed
from app.core.http import client_ip
from app.models.user import User
from app.schemas.organization import (
    OrganizationCreate,
    OrganizationListResponse,
    OrganizationOut,
    OrganizationUpdate,
)
from app.services import organization as org_service

router = APIRouter()

_ROLES = frozenset({"recipient", "sender"})


@router.get("", response_model=OrganizationListResponse)
def list_organizations(
    role: str = Query("recipient"),
    category: str | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> OrganizationListResponse:
    if role not in _ROLES:
        raise ValidationFailed("Vai phải là 'recipient' hoặc 'sender'")
    items, total = org_service.list_organizations(
        db, role=role, category=category, q=q, page=page, size=size
    )
    stats = org_service.org_doc_stats(
        db,
        role=role,
        org_ids=[o.id for o in items],
        include_manager_only=actor.role == "manager",
    )
    out: list[OrganizationOut] = []
    for o in items:
        item = OrganizationOut.model_validate(o)
        if (s := stats.get(o.id)) is not None:
            item.doc_count, item.last_activity = s
        out.append(item)
    return OrganizationListResponse(items=out, total=total)


@router.post("", response_model=OrganizationOut, status_code=201)
def create_organization(
    payload: OrganizationCreate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> OrganizationOut:
    org = org_service.create_organization(
        db, payload, actor_id=actor.id, ip=client_ip(request), ua=request.headers.get("user-agent")
    )
    return OrganizationOut.model_validate(org)


@router.put("/{org_id}", response_model=OrganizationOut)
def update_organization(
    org_id: int,
    payload: OrganizationUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> OrganizationOut:
    org = org_service.update_organization(
        db, org_id, payload, actor_id=actor.id, ip=client_ip(request), ua=request.headers.get("user-agent")
    )
    return OrganizationOut.model_validate(org)


@router.delete("/{org_id}", status_code=204)
def delete_organization(
    org_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> Response:
    org_service.delete_organization(
        db, org_id, actor_id=actor.id, ip=client_ip(request), ua=request.headers.get("user-agent")
    )
    return Response(status_code=204)
