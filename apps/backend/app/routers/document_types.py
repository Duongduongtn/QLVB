"""Router cấu hình sổ công văn — B2 (CFG.BOK).

GET cho mọi user đã đăng nhập (cần để chọn loại khi soạn CV). POST/PUT/preview chỉ Quản lý.
Router mỏng: validate + gọi service + map schema (kèm next_number đọc từ sequence).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user, require_manager
from app.core.http import client_ip
from app.models.document_type import DocumentType
from app.models.user import User
from app.schemas.document_type import (
    DocumentTypeCreate,
    DocumentTypeListResponse,
    DocumentTypeOut,
    DocumentTypeUpdate,
    NumberPreviewRequest,
    NumberPreviewResponse,
)
from app.services import document_type as svc

router = APIRouter()


def _to_out(dt: DocumentType, next_number: int) -> DocumentTypeOut:
    out = DocumentTypeOut.model_validate(dt)
    out.next_number = next_number
    return out


@router.get("", response_model=DocumentTypeListResponse)
def list_document_types(
    direction: str | None = Query(default=None, pattern="^(out|in)$"),
    unit_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
) -> DocumentTypeListResponse:
    rows = svc.list_document_types(db, direction=direction, unit_id=unit_id)
    return DocumentTypeListResponse(items=[_to_out(dt, n) for dt, n in rows])


@router.post("", response_model=DocumentTypeOut, status_code=201)
def create_document_type(
    payload: DocumentTypeCreate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> DocumentTypeOut:
    dt = svc.create_document_type(
        db, payload, actor_id=actor.id, ip=client_ip(request), ua=request.headers.get("user-agent")
    )
    return _to_out(dt, svc.next_number_for(db, dt))


@router.put("/{dt_id}", response_model=DocumentTypeOut)
def update_document_type(
    dt_id: int,
    payload: DocumentTypeUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> DocumentTypeOut:
    dt = svc.update_document_type(
        db, dt_id, payload, actor_id=actor.id, ip=client_ip(request), ua=request.headers.get("user-agent")
    )
    return _to_out(dt, svc.next_number_for(db, dt))


@router.post("/preview", response_model=NumberPreviewResponse)
def preview_number(
    payload: NumberPreviewRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
) -> NumberPreviewResponse:
    return NumberPreviewResponse(sample=svc.preview_number(db, payload))
