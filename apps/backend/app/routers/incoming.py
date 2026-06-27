"""Router CV đến — Nhóm E (E1 vào sổ + E1.6 dedup). Nhân viên + Quản lý.

Upload PDF → OCR ở worker (poll) → sửa metadata → cấp số đến. CV "Chỉ Quản lý xem"
ẩn khỏi Nhân viên (404). Router mỏng: validate + gọi service + map schema.
"""

from __future__ import annotations

from datetime import UTC, datetime
from urllib.parse import quote

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.core.celery_app import celery
from app.core.database import get_db
from app.core.deps import current_user, require_manager
from app.core.errors import NotFound, ValidationFailed
from app.core.http import client_ip
from app.models.incoming_document import IncomingDocument
from app.models.user import User
from app.schemas.incoming import (
    DuplicateOut,
    IncomingListItem,
    IncomingListResponse,
    IncomingOut,
    IncomingUpdate,
    ManagerOnlyRequest,
    RegisterRequest,
)
from app.schemas.outgoing import CancelRequest
from app.services import incoming as inc_service
from app.workers.ocr import extract_text

router = APIRouter()

_MAX_BYTES = 50 * 1024 * 1024


def _ctx(request: Request) -> tuple[str | None, str | None]:
    return client_ip(request), request.headers.get("user-agent")


def _visible(doc: IncomingDocument, actor: User) -> IncomingDocument:
    """CV 'Chỉ Quản lý xem' → Nhân viên không thấy (ẩn tồn tại = 404)."""
    if doc.manager_only and actor.role != "manager":
        raise NotFound("Không tìm thấy công văn đến")
    return doc


@router.post("/upload")
async def upload_incoming(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> dict[str, object]:
    """Tạo nháp CV đến + enqueue OCR. Trả {doc, ocr_task_id}."""
    data = await file.read(_MAX_BYTES + 1)
    if not data:
        raise ValidationFailed("File rỗng")
    if len(data) > _MAX_BYTES:
        raise ValidationFailed("File vượt quá 50MB")
    ip, ua = _ctx(request)
    doc, tmp_key = await run_in_threadpool(
        inc_service.create_from_upload, db, data, file.filename, actor_id=actor.id, ip=ip, ua=ua
    )
    task = extract_text.delay(tmp_key)
    return {"doc": IncomingOut.model_validate(doc).model_dump(mode="json"), "ocr_task_id": task.id}


@router.post("/{doc_id}/ocr-status")
def ocr_status(
    doc_id: int,
    task_id: str = Query(...),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> dict[str, object]:
    """Poll kết quả OCR. Khi xong → lưu text + auto-fill + trả gợi ý cơ quan + cảnh báo trùng."""
    doc = _visible(inc_service.get_incoming(db, doc_id), actor)
    res: AsyncResult = AsyncResult(task_id, app=celery)
    if res.failed():
        return {"status": "error", "message": "OCR thất bại — nhập tay metadata"}
    if not res.successful():
        return {"status": "pending"}
    payload = res.result if isinstance(res.result, dict) else {}
    auto_fill = payload.get("auto_fill", {}) if isinstance(payload.get("auto_fill"), dict) else {}
    doc = inc_service.set_ocr_result(db, doc_id, ocr_text=payload.get("ocr_text", ""), auto_fill=auto_fill)
    dups = inc_service.check_duplicates(db, doc)
    return {
        "status": "done",
        "doc": IncomingOut.model_validate(doc).model_dump(mode="json"),
        "sender_hint": auto_fill.get("sender_hint"),
        "duplicates": [DuplicateOut(**d).model_dump() for d in dups],
    }


@router.get("/{doc_id}/duplicates", response_model=list[DuplicateOut])
def duplicates(
    doc_id: int, db: Session = Depends(get_db), actor: User = Depends(current_user)
) -> list[DuplicateOut]:
    doc = _visible(inc_service.get_incoming(db, doc_id), actor)
    return [DuplicateOut(**d) for d in inc_service.check_duplicates(db, doc)]


@router.patch("/{doc_id}", response_model=IncomingOut)
def update_incoming(
    doc_id: int,
    payload: IncomingUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> IncomingOut:
    _visible(inc_service.get_incoming(db, doc_id), actor)
    ip, ua = _ctx(request)
    fields = payload.model_dump(exclude_unset=True)
    doc = inc_service.update(db, doc_id, fields, actor_id=actor.id, ip=ip, ua=ua)
    return IncomingOut.model_validate(doc)


@router.post("/{doc_id}/register", response_model=IncomingOut)
def register_incoming(
    doc_id: int,
    payload: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> IncomingOut:
    _visible(inc_service.get_incoming(db, doc_id), actor)
    ip, ua = _ctx(request)
    doc = inc_service.register(
        db,
        doc_id,
        doc_type_id=payload.doc_type_id,
        override_reason=payload.override_reason,
        actor_id=actor.id,
        ip=ip,
        ua=ua,
        today=datetime.now(UTC).date(),
    )
    return IncomingOut.model_validate(doc)


@router.post("/{doc_id}/manager-only", response_model=IncomingOut)
def set_manager_only(
    doc_id: int,
    payload: ManagerOnlyRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> IncomingOut:
    ip, ua = _ctx(request)
    doc = inc_service.set_manager_only(
        db, doc_id, payload.manager_only, actor_id=actor.id, ip=ip, ua=ua
    )
    return IncomingOut.model_validate(doc)


@router.get("", response_model=IncomingListResponse)
def list_incoming(
    status: str | None = Query(default=None),
    sender_org_id: int | None = Query(default=None),
    urgency: str | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> IncomingListResponse:
    items, total = inc_service.list_incoming(
        db,
        include_manager_only=actor.role == "manager",
        status=status,
        sender_org_id=sender_org_id,
        urgency=urgency,
        q=q,
        page=page,
        size=size,
    )
    return IncomingListResponse(items=[IncomingListItem.model_validate(d) for d in items], total=total)


@router.get("/{doc_id}", response_model=IncomingOut)
def get_incoming(
    doc_id: int, db: Session = Depends(get_db), actor: User = Depends(current_user)
) -> IncomingOut:
    return IncomingOut.model_validate(_visible(inc_service.get_incoming(db, doc_id), actor))


@router.post("/{doc_id}/cancel", response_model=IncomingOut)
def cancel_incoming(
    doc_id: int,
    payload: CancelRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> IncomingOut:
    _visible(inc_service.get_incoming(db, doc_id), actor)
    ip, ua = _ctx(request)
    doc = inc_service.cancel(db, doc_id, payload.reason, actor_id=actor.id, ip=ip, ua=ua)
    return IncomingOut.model_validate(doc)


@router.get("/{doc_id}/file")
def download_incoming(
    doc_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> Response:
    doc = _visible(inc_service.get_incoming(db, doc_id), actor)
    data, name = inc_service.read_file(db, doc)
    ip, ua = _ctx(request)
    inc_service.log_download(db, doc, actor_id=actor.id, ip=ip, ua=ua)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename*=UTF-8''{quote(name)}"},
    )
