"""Router quản lý mộc — C1 (SIG.SEL).

GET (list + ảnh) cho mọi user đã đăng nhập (Nhân viên cần xem để chọn mộc khi soạn CV).
POST/PATCH chỉ Quản lý (chỉ Quản lý upload mộc — PRD C1). Router mỏng: validate +
gọi service + map schema.
"""

from __future__ import annotations

from typing import get_args

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
from app.schemas.seal import SealListResponse, SealOut, SealType, SealUpdate
from app.services import seal as seal_service

router = APIRouter()

_MAX_SEAL_BYTES = 5 * 1024 * 1024  # 5MB (PRD C1 edge)
_SEAL_TYPES: frozenset[str] = frozenset(get_args(SealType))


@router.get("", response_model=SealListResponse)
def list_seals(
    unit_id: int | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: User = Depends(current_user),
) -> SealListResponse:
    items = seal_service.list_seals(db, unit_id=unit_id, include_inactive=include_inactive)
    return SealListResponse(items=[SealOut.model_validate(s) for s in items])


@router.post("", response_model=SealOut, status_code=201)
async def create_seal(
    request: Request,
    unit_id: int = Form(...),
    name: str = Form(..., min_length=1, max_length=150),
    seal_type: str = Form("round"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> SealOut:
    if seal_type not in _SEAL_TYPES:
        raise ValidationFailed("Loại mộc không hợp lệ")
    clean_name = name.strip()
    if not clean_name:  # Form(min_length=1) lọt chuỗi toàn khoảng trắng
        raise ValidationFailed("Tên mộc không được để trống")
    # Đọc CÓ CHẶN (MAX+1 byte) — không nạp cả body khổng lồ vào RAM trước khi kiểm size.
    data, ext, mime = await read_image_upload(file, max_bytes=_MAX_SEAL_BYTES)

    seal = seal_service.create_seal(
        db,
        unit_id=unit_id,
        name=clean_name,
        seal_type=seal_type,
        data=data,
        ext=ext,
        mime=mime,
        original_name=file.filename,
        actor_id=actor.id,
        ip=client_ip(request),
        ua=request.headers.get("user-agent"),
    )
    return SealOut.model_validate(seal)


@router.patch("/{seal_id}", response_model=SealOut)
def update_seal(
    seal_id: int,
    payload: SealUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> SealOut:
    seal = seal_service.update_seal(
        db,
        seal_id,
        payload,
        actor_id=actor.id,
        ip=client_ip(request),
        ua=request.headers.get("user-agent"),
    )
    return SealOut.model_validate(seal)


@router.get("/{seal_id}/image")
def get_seal_image(
    seal_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)
) -> Response:
    seal = seal_service.get_seal(db, seal_id)
    image = db.get(FileModel, seal.file_id)
    if image is None:
        raise NotFound("Không tìm thấy ảnh mộc")
    return Response(
        content=read_asset(image.storage_key),
        media_type=image.mime_type or "application/octet-stream",
        headers={"Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff"},
    )
