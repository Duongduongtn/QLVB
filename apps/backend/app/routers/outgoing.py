"""Router CV đi — Nhóm D (D1 phát hành, D6 sổ). Quản lý + Nhân viên đều dùng.

Tạo/sửa draft + cấp số qua JSON; upload PDF + preview + tải về qua endpoint riêng (binary).
Router mỏng: validate + gọi service + map schema.
"""

from __future__ import annotations

from urllib.parse import quote

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, File, Query, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.core.celery_app import celery
from app.core.database import get_db
from app.core.deps import current_user
from app.core.errors import Conflict, ValidationFailed
from app.core.http import client_ip
from app.core.storage import read_asset, save_asset
from app.models.user import User
from app.schemas.outgoing import (
    CancelRequest,
    NumberRequest,
    OutgoingCreate,
    OutgoingListItem,
    OutgoingListResponse,
    OutgoingOut,
    OutgoingUpdate,
    RecipientOut,
)
from app.services import audit as audit_service
from app.services import outgoing as out_service
from app.services import report as report_service
from app.services import watermark as wm_service
from app.workers.convert import docx_to_pdf

router = APIRouter()

_MAX_PDF_BYTES = 50 * 1024 * 1024  # PRD NFR: upload ≤ 50MB
_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _ctx(request: Request) -> tuple[str | None, str | None]:
    return client_ip(request), request.headers.get("user-agent")


def _to_out(db: Session, doc: object) -> OutgoingOut:
    out = OutgoingOut.model_validate(doc)
    out.recipients = [
        RecipientOut.model_validate(o) for o in out_service.get_recipients(db, out.id)
    ]
    return out


@router.get("", response_model=OutgoingListResponse)
def list_outgoing(
    unit_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
) -> OutgoingListResponse:
    items, total = out_service.list_outgoing(
        db, unit_id=unit_id, status=status, q=q, page=page, size=size
    )
    return OutgoingListResponse(
        items=[OutgoingListItem.model_validate(d) for d in items], total=total
    )


@router.get("/export.xlsx")
async def export_outgoing_list(
    unit_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
) -> Response:
    """D6 — xuất danh sách CV đi đang lọc ra Excel (cùng bộ lọc với sổ)."""
    data = await run_in_threadpool(
        report_service.build_outgoing_list_xlsx, db, unit_id=unit_id, status=status, q=q
    )
    fname = "Danh-sach-cong-van-di.xlsx"
    return Response(
        content=data,
        media_type=_XLSX_MIME,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(fname)}"},
    )


@router.post("", response_model=OutgoingOut, status_code=201)
def create_outgoing(
    payload: OutgoingCreate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> OutgoingOut:
    ip, ua = _ctx(request)
    doc = out_service.create_draft(db, payload, actor_id=actor.id, ip=ip, ua=ua)
    return _to_out(db, doc)


@router.get("/{doc_id}", response_model=OutgoingOut)
def get_outgoing(
    doc_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)
) -> OutgoingOut:
    return _to_out(db, out_service.get_outgoing(db, doc_id))


@router.patch("/{doc_id}", response_model=OutgoingOut)
def update_outgoing(
    doc_id: int,
    payload: OutgoingUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> OutgoingOut:
    ip, ua = _ctx(request)
    doc = out_service.update_draft(db, doc_id, payload, actor_id=actor.id, ip=ip, ua=ua)
    return _to_out(db, doc)


_WORD_EXTS = frozenset({"docx", "doc"})


def _ext_of(name: str | None) -> str:
    return name.rsplit(".", 1)[-1].lower() if name and "." in name else ""


@router.post("/{doc_id}/file")
async def upload_outgoing_file(
    doc_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> dict[str, object]:
    """PDF → lưu ngay (set_file). Word → CONVERT Ở WORKER (LibreOffice cô lập, TDD §2.4):
    lưu Word tạm → enqueue → FE poll /finalize-convert."""
    data = await file.read(_MAX_PDF_BYTES + 1)
    if not data:
        raise ValidationFailed("File rỗng")
    if len(data) > _MAX_PDF_BYTES:
        raise ValidationFailed("File vượt quá 50MB")
    ip, ua = _ctx(request)

    if data.startswith(b"%PDF"):
        await run_in_threadpool(
            out_service.set_file, db, doc_id, data, file.filename, actor_id=actor.id, ip=ip, ua=ua
        )
        return {"status": "ready"}

    ext = _ext_of(file.filename)
    if ext not in _WORD_EXTS and data[:2] != b"PK":
        raise ValidationFailed("File phải là PDF hoặc Word (.docx/.doc)")
    doc = out_service.get_outgoing(db, doc_id)  # đảm bảo còn nháp trước khi tốn công convert
    if doc.status != "draft":
        raise Conflict("Chỉ thay file khi công văn còn nháp")
    tmp_key = save_asset(data, ext=ext or "docx", subdir="cv_tmp").storage_key
    task = docx_to_pdf.delay(tmp_key, ext or "docx")
    return {"status": "converting", "task_id": task.id}


@router.post("/{doc_id}/finalize-convert")
def finalize_convert(
    doc_id: int,
    request: Request,
    task_id: str = Query(...),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> dict[str, object]:
    """FE poll sau khi upload Word: task convert xong → đọc PDF kết quả → lưu làm file gốc."""
    res: AsyncResult = AsyncResult(task_id, app=celery)
    if res.failed():
        return {"status": "error", "message": "Chuyển Word sang PDF thất bại — thử tải PDF"}
    if not res.successful():
        return {"status": "pending"}
    result_key = str(res.result["result_key"])
    pdf = read_asset(result_key)
    ip, ua = _ctx(request)
    out_service.set_file(db, doc_id, pdf, "cong-van.pdf", actor_id=actor.id, ip=ip, ua=ua)
    return {"status": "done"}


@router.post("/{doc_id}/auto-detect")
def auto_detect_positions(
    doc_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> dict[str, object]:
    """D2 — tự dò vị trí mộc/chữ ký, lưu vào nháp. Trả method + positions để FE seed editor."""
    ip, ua = _ctx(request)
    doc, method = out_service.auto_detect_positions(db, doc_id, actor_id=actor.id, ip=ip, ua=ua)
    return {"method": method, "positions": doc.stamp_positions or []}


@router.post("/{doc_id}/save-template", status_code=204)
def save_stamp_template(
    doc_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> Response:
    """D2 — lưu vị trí hiện tại làm template cho loại VB."""
    ip, ua = _ctx(request)
    out_service.save_stamp_template(db, doc_id, actor_id=actor.id, ip=ip, ua=ua)
    return Response(status_code=204)


@router.get("/{doc_id}/original.pdf")
def original_pdf_outgoing(
    doc_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)
) -> Response:
    """D2 — PDF gốc (chưa chèn mộc/chữ ký, KHÔNG watermark) làm nền canvas kéo-thả vị trí.
    Khác /download (bản tải có watermark + audit): đây chỉ là nền dựng editor lúc soạn.
    CHỈ cho nháp: sau khi cấp số original_file_id là bản _CHUA_KY_SO → không để lách H2."""
    doc = out_service.get_outgoing(db, doc_id)
    if doc.status != "draft":
        raise Conflict("Chỉ xem nền gốc khi công văn còn nháp")
    data, _name = out_service.read_original(db, doc)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Cache-Control": "no-store", "Content-Disposition": "inline; filename=goc.pdf"},
    )


@router.post("/{doc_id}/preview")
def preview_outgoing(
    doc_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)
) -> Response:
    doc = out_service.get_outgoing(db, doc_id)
    pdf = out_service.render_stamped(db, doc)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Cache-Control": "no-store", "Content-Disposition": "inline; filename=preview.pdf"},
    )


@router.post("/{doc_id}/number", response_model=OutgoingOut)
def number_outgoing(
    doc_id: int,
    payload: NumberRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> OutgoingOut:
    ip, ua = _ctx(request)
    doc = out_service.issue(
        db, doc_id, manual_number=payload.manual_number, actor_id=actor.id, ip=ip, ua=ua
    )
    return _to_out(db, doc)


@router.post("/{doc_id}/signed-file", response_model=OutgoingOut)
async def upload_signed_file(
    doc_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> OutgoingOut:
    data = await file.read(_MAX_PDF_BYTES + 1)
    if not data:
        raise ValidationFailed("File rỗng")
    if len(data) > _MAX_PDF_BYTES:
        raise ValidationFailed("File vượt quá 50MB")
    ip, ua = _ctx(request)
    doc = await run_in_threadpool(
        out_service.set_signed_file, db, doc_id, data, file.filename, actor_id=actor.id, ip=ip, ua=ua
    )
    return _to_out(db, doc)


@router.post("/{doc_id}/cancel", response_model=OutgoingOut)
def cancel_outgoing(
    doc_id: int,
    payload: CancelRequest,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> OutgoingOut:
    ip, ua = _ctx(request)
    doc = out_service.cancel(
        db, doc_id, payload.reason, actor_id=actor.id, actor_role=actor.role, ip=ip, ua=ua
    )
    return _to_out(db, doc)


@router.delete("/{doc_id}", status_code=204)
def delete_outgoing(
    doc_id: int,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> Response:
    """Xoá mềm → thùng rác (CV đã cấp số: chỉ Quản lý)."""
    ip, ua = _ctx(request)
    out_service.soft_delete(db, doc_id, actor_id=actor.id, actor_role=actor.role, ip=ip, ua=ua)
    return Response(status_code=204)


@router.get("/{doc_id}/download")
def download_outgoing(
    doc_id: int,
    request: Request,
    signed: bool = Query(default=False),
    raw: bool = Query(default=False),
    reason: str | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> Response:
    """Tải CV đi. H2: tự chèn watermark cá nhân (trừ CV đã ký số). Quản lý có thể tải bản
    gốc không watermark (`raw=1` + lý do — ghi audit)."""
    doc = out_service.get_outgoing(db, doc_id)
    ip, ua = _ctx(request)
    data, filename = out_service.read_file_for_download(
        db, doc, signed=signed, actor_id=actor.id, ip=ip, ua=ua
    )
    if wm_service.should_serve_raw(raw, actor.role):
        if not (reason and reason.strip()):
            raise ValidationFailed("Cần nêu lý do khi tải bản gốc không watermark")
        audit_service.log_action(
            db, action="outgoing_download_raw", user_id=actor.id,
            object_type="outgoing_document", object_id=doc.id, ip=ip, user_agent=ua,
            detail={"reason": reason.strip()[:500], "signed": signed},
        )
        db.commit()
    else:
        data, _marked = wm_service.apply_download_watermark(
            data, username=actor.username, ip=ip
        )
    # Sanitize chống header injection: ascii fallback + filename* RFC5987 đã encode.
    ascii_name = "".join(c for c in filename if c.isascii() and c not in '"\\\r\n') or "cong-van.pdf"
    disposition = f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Cache-Control": "no-store", "Content-Disposition": disposition},
    )
