"""Router quản lý chữ ký — C2 (SIG.SGN).

GET (list + ảnh) cho mọi user đã đăng nhập (Nhân viên cần xem để chọn chữ ký khi soạn
CV). POST/PATCH chỉ Quản lý. Router mỏng: validate + gọi service + map schema.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user, require_manager
from app.core.errors import NotFound, ValidationFailed
from app.core.http import client_ip
from app.core.images import read_image_upload
from app.core.storage import read_asset
from app.models.file import File as FileModel
from app.models.user import User
from app.schemas.signature import SignatureListResponse, SignatureOut, SignatureUpdate
from app.services import signature as signature_service

router = APIRouter()

_MAX_SIGNATURE_BYTES = 2 * 1024 * 1024  # 2MB (PRD C2 edge)


@router.get("", response_model=SignatureListResponse)
def list_signatures(
    unit_id: int | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> SignatureListResponse:
    # Chỉ Quản lý xem được chữ ký đã ngừng (NV chỉ chọn chữ ký đang dùng khi soạn CV).
    show_inactive = include_inactive and user.role == "manager"
    items = signature_service.list_signatures(
        db, unit_id=unit_id, include_inactive=show_inactive
    )
    return SignatureListResponse(items=[SignatureOut.model_validate(s) for s in items])


@router.post("", response_model=SignatureOut, status_code=201)
async def create_signature(
    request: Request,
    full_name: str = Form(..., min_length=1, max_length=150),
    title: str | None = Form(default=None, max_length=150),
    default_unit_id: int | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> SignatureOut:
    clean_name = full_name.strip()
    if not clean_name:  # Form(min_length=1) lọt chuỗi toàn khoảng trắng
        raise ValidationFailed("Họ tên không được để trống")
    clean_title = (title or "").strip() or None
    # Đọc CÓ CHẶN (MAX+1 byte) — không nạp cả body khổng lồ vào RAM trước khi kiểm size.
    data, ext, mime = await read_image_upload(file, max_bytes=_MAX_SIGNATURE_BYTES)

    sig = signature_service.create_signature(
        db,
        full_name=clean_name,
        title=clean_title,
        default_unit_id=default_unit_id,
        data=data,
        ext=ext,
        mime=mime,
        original_name=file.filename,
        actor_id=actor.id,
        ip=client_ip(request),
        ua=request.headers.get("user-agent"),
    )
    return SignatureOut.model_validate(sig)


@router.patch("/{signature_id}", response_model=SignatureOut)
def update_signature(
    signature_id: int,
    payload: SignatureUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> SignatureOut:
    sig = signature_service.update_signature(
        db,
        signature_id,
        payload,
        actor_id=actor.id,
        ip=client_ip(request),
        ua=request.headers.get("user-agent"),
    )
    return SignatureOut.model_validate(sig)


@router.get("/{signature_id}/image")
def get_signature_image(
    signature_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)
) -> Response:
    sig = signature_service.get_signature(db, signature_id)
    image = db.get(FileModel, sig.file_id)
    if image is None:
        raise NotFound("Không tìm thấy ảnh chữ ký")
    return Response(
        content=read_asset(image.storage_key),
        media_type=image.mime_type or "application/octet-stream",
        headers={"Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff"},
    )
