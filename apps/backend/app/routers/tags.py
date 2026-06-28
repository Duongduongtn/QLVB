"""Router F2 — tag tự do. Router mỏng: validate + visibility + gọi service.

Tag gắn cho CV đi (outgoing) + CV đến (incoming). CV đến `manager_only` → Nhân viên không
xem/gắn được (404). Đếm + lọc theo tag đều tôn trọng quyền (include_manager_only theo role).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Query, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.core.errors import NotFound
from app.core.http import client_ip
from app.models.incoming_document import IncomingDocument
from app.models.outgoing_document import OutgoingDocument
from app.models.user import User
from app.schemas.search import SearchResultItem
from app.schemas.tag import SetTagsRequest, TagCount, TagNames
from app.services import tags as tag_service

router = APIRouter()

_OBJECT_TYPE = Path(pattern="^(incoming|outgoing)$")


def _ensure_visible(db: Session, object_type: str, object_id: int, actor: User) -> None:
    """CV phải tồn tại + người dùng được xem (CV đến manager_only ẩn với Nhân viên = 404)."""
    if object_type == "incoming":
        inc = db.get(IncomingDocument, object_id)
        if inc is None or inc.deleted_at is not None:
            raise NotFound("Không tìm thấy công văn đến")
        if inc.manager_only and actor.role != "manager":
            raise NotFound("Không tìm thấy công văn đến")
    else:
        out = db.get(OutgoingDocument, object_id)
        if out is None or out.deleted_at is not None:
            raise NotFound("Không tìm thấy công văn đi")


@router.get("", response_model=list[TagCount])
def list_tags(db: Session = Depends(get_db), actor: User = Depends(current_user)) -> list[TagCount]:
    rows = tag_service.list_all_with_counts(db, include_manager_only=actor.role == "manager")
    return [TagCount(**r) for r in rows]


@router.get("/suggest", response_model=list[str])
def suggest_tags(
    q: str = Query(default=""),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> list[str]:
    return tag_service.suggest(db, q, include_manager_only=actor.role == "manager")


@router.get("/documents", response_model=list[SearchResultItem])
def docs_by_tag(
    name: str = Query(...),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> list[SearchResultItem]:
    rows = tag_service.docs_by_tag(db, name, include_manager_only=actor.role == "manager")
    return [SearchResultItem(**r) for r in rows]


@router.get("/{object_type}/{object_id}", response_model=TagNames)
def get_doc_tags(
    object_id: int,
    object_type: str = _OBJECT_TYPE,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> TagNames:
    _ensure_visible(db, object_type, object_id, actor)
    return TagNames(names=tag_service.list_for(db, object_type, object_id))


@router.put("/{object_type}/{object_id}", response_model=TagNames)
def set_doc_tags(
    object_id: int,
    payload: SetTagsRequest,
    request: Request,
    object_type: str = _OBJECT_TYPE,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> TagNames:
    _ensure_visible(db, object_type, object_id, actor)
    names = tag_service.set_tags(
        db,
        object_type,
        object_id,
        payload.names,
        actor_id=actor.id,
        ip=client_ip(request),
        ua=request.headers.get("user-agent"),
    )
    return TagNames(names=names)
