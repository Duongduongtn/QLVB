"""Router CV đến — Nhóm E (E1 vào sổ + E1.6 dedup). Nhân viên + Quản lý.

Upload PDF → OCR ở worker (poll) → sửa metadata → cấp số đến. CV "Chỉ Quản lý xem"
ẩn khỏi Nhân viên (404). Router mỏng: validate + gọi service + map schema.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime
from typing import Any
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
    AttachmentOut,
    DuplicateOut,
    IncomingHistoryItem,
    IncomingListItem,
    IncomingListResponse,
    IncomingOut,
    IncomingUpdate,
    ManagerOnlyRequest,
    RegisterRequest,
)
from app.schemas.outgoing import CancelRequest, OutgoingListItem
from app.schemas.tasks import AssignRequest, TaskOut
from app.services import audit as audit_service
from app.services import incoming as inc_service
from app.services import incoming_attachments as att_service
from app.services import outgoing as out_service
from app.services import report as report_service
from app.services import tasks as task_service
from app.services import watermark as wm_service
from app.workers.ocr import extract_text, ocr_attachment
from app.workers.push import send_web_push
from app.workers.sign_verify import verify_pades

router = APIRouter()

_MAX_BYTES = 50 * 1024 * 1024
# ZIP gộp giải mã toàn bộ phụ lục (tổng tới 500MB) vào RAM → serialize để vài request
# đồng thời không nhân RAM gây OOM trên VPS dùng chung (review E4).
_zip_limiter = asyncio.Semaphore(1)


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
    """Tạo nháp CV đến + enqueue OCR (E1) + verify PAdES (E1.5). Trả {doc, ocr_task_id, sig_task_id}."""
    data = await file.read(_MAX_BYTES + 1)
    if not data:
        raise ValidationFailed("File rỗng")
    if len(data) > _MAX_BYTES:
        raise ValidationFailed("File vượt quá 50MB")
    ip, ua = _ctx(request)
    doc, ocr_key, sig_key = await run_in_threadpool(
        inc_service.create_from_upload, db, data, file.filename, actor_id=actor.id, ip=ip, ua=ua
    )
    ocr_task = extract_text.delay(ocr_key)
    sig_task = verify_pades.delay(sig_key)
    return {
        "doc": IncomingOut.model_validate(doc).model_dump(mode="json"),
        "ocr_task_id": ocr_task.id,
        "sig_task_id": sig_task.id,
    }


@router.post("/{doc_id}/sig-status")
def sig_status(
    doc_id: int,
    task_id: str = Query(...),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> dict[str, object]:
    """E1.5 — poll kết quả verify PAdES. Khi xong → lưu signature_status + info → trả badge."""
    doc = _visible(inc_service.get_incoming(db, doc_id), actor)
    res: AsyncResult = AsyncResult(task_id, app=celery)
    if res.failed():
        return {"status": "error", "message": "Không kiểm được chữ ký số"}
    if not res.successful():
        return {"status": "pending"}
    payload = res.result if isinstance(res.result, dict) else {}
    sig_status_val = payload.get("signature_status", "unchecked")
    info = payload.get("signature_info") if isinstance(payload.get("signature_info"), dict) else None
    doc = inc_service.set_signature_result(db, doc_id, status=sig_status_val, info=info)
    return {
        "status": "done",
        "signature_status": doc.signature_status,
        "signature_info": doc.signature_info,
        # Trả doc đã cập nhật để FE nhận auto-fill cơ quan/ngày từ chứng thư ký số.
        "doc": IncomingOut.model_validate(doc).model_dump(mode="json"),
    }


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


@router.post("/{doc_id}/assign", response_model=list[TaskOut])
def assign_incoming(
    doc_id: int,
    payload: AssignRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> list[TaskOut]:
    """E2 — phân công xử lý cho 1 hoặc cả 2 đơn vị (mỗi đơn vị 1 task độc lập)."""
    doc = _visible(inc_service.get_incoming(db, doc_id), actor)
    ip, ua = _ctx(request)
    tasks = task_service.assign(
        db, doc_id, [a.model_dump() for a in payload.assignments], actor_id=actor.id, ip=ip, ua=ua
    )
    # Web Push (L1) — đẩy nền sau khi giao xong, không chặn response. 1 push/người được giao.
    number = doc.number or "(nháp)"
    for assignee_id in {t.assignee_id for t in tasks if t.assignee_id is not None}:
        send_web_push.delay(
            assignee_id, "Việc mới được giao", f"Bạn được giao xử lý CV đến {number}", "/viec-cua-toi"
        )
    return [TaskOut.model_validate(t) for t in tasks]


@router.get("/{doc_id}/tasks", response_model=list[TaskOut])
def incoming_tasks(
    doc_id: int, db: Session = Depends(get_db), actor: User = Depends(current_user)
) -> list[TaskOut]:
    _visible(inc_service.get_incoming(db, doc_id), actor)
    return [TaskOut.model_validate(t) for t in task_service.list_for_incoming(db, doc_id)]


@router.get("/{doc_id}/replies", response_model=list[OutgoingListItem])
def list_replies(
    doc_id: int, db: Session = Depends(get_db), actor: User = Depends(current_user)
) -> list[OutgoingListItem]:
    """D5 — CV đi phản hồi CV đến này (2 chiều)."""
    _visible(inc_service.get_incoming(db, doc_id), actor)
    return [OutgoingListItem.model_validate(d) for d in out_service.list_replies(db, doc_id)]


@router.get("/{doc_id}/duplicates", response_model=list[DuplicateOut])
def duplicates(
    doc_id: int, db: Session = Depends(get_db), actor: User = Depends(current_user)
) -> list[DuplicateOut]:
    doc = _visible(inc_service.get_incoming(db, doc_id), actor)
    return [DuplicateOut(**d) for d in inc_service.check_duplicates(db, doc)]


@router.get("/{doc_id}/history", response_model=list[IncomingHistoryItem])
def incoming_history(
    doc_id: int, db: Session = Depends(get_db), actor: User = Depends(current_user)
) -> list[IncomingHistoryItem]:
    """Lịch sử tác động của công văn (ai sửa/tải/vào sổ, khi nào, trường nào đổi).

    Người xem được CV đều gọi được (khác /api/audit chỉ Quản lý). Ẩn ip/user_agent.
    """
    _visible(inc_service.get_incoming(db, doc_id), actor)
    rows = audit_service.list_object_history(
        db, object_type="incoming_document", object_id=doc_id
    )
    return [
        IncomingHistoryItem(
            id=log.id,
            created_at=log.created_at,
            user_id=log.user_id,
            username=username,
            action=log.action,
            detail=_public_history_detail(log.detail),
        )
        for log, username in rows
    ]


def _public_history_detail(detail: dict[str, Any] | None) -> dict[str, Any] | None:
    """Lịch sử công khai chỉ phơi DANH SÁCH trường đã sửa — giấu giá trị cũ/mới và lý do
    tải bản gốc (chỉ /api/audit của Quản lý mới xem đầy đủ). Tránh rò thông tin nhạy cảm."""
    if not detail:
        return None
    fields = detail.get("fields")
    return {"fields": fields} if fields else None


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
    # Cờ "Chỉ Quản lý xem" là đặc quyền Quản lý (mirror POST /{id}/manager-only require_manager) —
    # Nhân viên KHÔNG được bật/tắt qua PATCH (chống bypass phân quyền object-level).
    if actor.role != "manager":
        fields.pop("manager_only", None)
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
    confidentiality: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
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
        confidentiality=confidentiality,
        date_from=date_from,
        date_to=date_to,
        q=q,
        page=page,
        size=size,
    )
    summary = task_service.summary_for_incomings(db, [d.id for d in items])
    out_items: list[IncomingListItem] = []
    for d in items:
        item = IncomingListItem.model_validate(d)
        if (s := summary.get(d.id)) is not None:
            item.task_total = s["task_total"]
            item.task_status = s["task_status"]
        out_items.append(item)
    return IncomingListResponse(items=out_items, total=total)


@router.get("/export.xlsx")
async def export_incoming_list(
    status: str | None = Query(default=None),
    sender_org_id: int | None = Query(default=None),
    urgency: str | None = Query(default=None),
    confidentiality: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> Response:
    """E5 — xuất danh sách CV đến đang lọc ra Excel. NV không thấy CV 'Chỉ Quản lý xem'."""
    data = await run_in_threadpool(
        report_service.build_incoming_list_xlsx,
        db,
        include_manager_only=actor.role == "manager",
        status=status,
        sender_org_id=sender_org_id,
        urgency=urgency,
        confidentiality=confidentiality,
        date_from=date_from,
        date_to=date_to,
        q=q,
    )
    fname = "Danh-sach-cong-van-den.xlsx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(fname)}"},
    )


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
    raw: bool = Query(default=False),
    reason: str | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> Response:
    """Tải/xem CV đến. H2: tự chèn watermark cá nhân (trừ CV đã ký số). Quản lý có thể tải
    bản gốc không watermark (`raw=1` + lý do — ghi audit)."""
    doc = _visible(inc_service.get_incoming(db, doc_id), actor)
    data, name = inc_service.read_file(db, doc)
    ip, ua = _ctx(request)
    inc_service.log_download(db, doc, actor_id=actor.id, ip=ip, ua=ua)
    if wm_service.should_serve_raw(raw, actor.role):
        if not (reason and reason.strip()):
            raise ValidationFailed("Cần nêu lý do khi tải bản gốc không watermark")
        audit_service.log_action(
            db, action="incoming_download_raw", user_id=actor.id,
            object_type="incoming_document", object_id=doc.id, ip=ip, user_agent=ua,
            detail={"reason": reason.strip()[:500]},
        )
        db.commit()
    else:
        data, _marked = wm_service.apply_download_watermark(
            data, username=actor.username, ip=ip
        )
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Cache-Control": "no-store",  # tài liệu mật + watermark cá nhân → không cache
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(name)}",
        },
    )


# ── E4 — Phụ lục đính kèm ─────────────────────────────────────────────────────
@router.post("/{doc_id}/attachments", response_model=AttachmentOut, status_code=201)
async def upload_attachment(
    doc_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> AttachmentOut:
    """Đính kèm 1 phụ lục (≤50MB/file, tổng ≤500MB/CV). PDF → enqueue OCR full-text."""
    _visible(inc_service.get_incoming(db, doc_id), actor)
    data = await file.read(att_service.MAX_FILE_BYTES + 1)
    if len(data) > att_service.MAX_FILE_BYTES:
        raise ValidationFailed("Phụ lục vượt quá 50MB")
    ip, ua = _ctx(request)
    att, tmp_key = await run_in_threadpool(
        att_service.add_attachment, db, doc_id, data, file.filename, actor_id=actor.id, ip=ip, ua=ua
    )
    if tmp_key:  # phụ lục PDF → OCR ghi thẳng DB (fire-and-forget)
        ocr_attachment.delay(att.id, tmp_key)
    return AttachmentOut.model_validate(att)


@router.get("/{doc_id}/attachments", response_model=list[AttachmentOut])
def list_attachments(
    doc_id: int, db: Session = Depends(get_db), actor: User = Depends(current_user)
) -> list[AttachmentOut]:
    _visible(inc_service.get_incoming(db, doc_id), actor)
    return [AttachmentOut.model_validate(a) for a in att_service.list_attachments(db, doc_id)]


@router.get("/{doc_id}/attachments/zip")
async def download_attachments_zip(
    doc_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> Response:
    """Tải gộp ZIP: CV chính + tất cả phụ lục."""
    doc = _visible(inc_service.get_incoming(db, doc_id), actor)
    async with _zip_limiter:
        data = await run_in_threadpool(att_service.build_zip, db, doc)
    ip, ua = _ctx(request)
    inc_service.log_download(db, doc, actor_id=actor.id, ip=ip, ua=ua)
    fname = f"CV-den-{doc.number or doc.id}.zip"
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(fname)}"},
    )


@router.get("/{doc_id}/attachments/{att_id}/file")
async def download_attachment(
    doc_id: int,
    att_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> Response:
    doc = _visible(inc_service.get_incoming(db, doc_id), actor)
    att = att_service.get_attachment(db, doc_id, att_id)
    data, name, mime = await run_in_threadpool(att_service.read_attachment, db, att)
    ip, ua = _ctx(request)
    inc_service.log_download(db, doc, actor_id=actor.id, ip=ip, ua=ua)
    # H2 — phụ lục PDF cũng watermark cá nhân (Word/Excel/ảnh giữ nguyên; CV đã ký số bỏ qua).
    if mime == "application/pdf":
        data, _marked = await run_in_threadpool(
            wm_service.apply_download_watermark, data, username=actor.username, ip=ip
        )
    return Response(
        content=data,
        media_type=mime,
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}",
        },
    )


@router.delete("/{doc_id}/attachments/{att_id}", status_code=204)
def delete_attachment(
    doc_id: int,
    att_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> Response:
    _visible(inc_service.get_incoming(db, doc_id), actor)
    ip, ua = _ctx(request)
    att_service.delete_attachment(
        db, doc_id, att_id, actor_id=actor.id, actor_role=actor.role, ip=ip, ua=ua
    )
    return Response(status_code=204)
