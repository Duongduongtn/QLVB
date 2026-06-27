"""Router cấu hình đơn vị — B1 (CFG.UNT).

GET cho mọi user đã đăng nhập (cần để hiển thị header/branding, lọc theo đơn vị).
PUT/POST chỉ Quản lý. Router mỏng: validate + gọi service + map schema.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user, require_manager
from app.core.errors import NotFound, ValidationFailed
from app.core.http import client_ip
from app.core.storage import read_asset
from app.models.file import File as FileModel
from app.models.user import User
from app.schemas.unit import UnitListResponse, UnitOut, UnitUpdate
from app.services import unit as unit_service

router = APIRouter()

_MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2MB (PRD B1 edge)
# magic bytes → (content-type chuẩn, đuôi file)
_IMAGE_SIGNATURES: list[tuple[bytes, str, str]] = [
    (b"\x89PNG\r\n\x1a\n", "image/png", "png"),
    (b"\xff\xd8\xff", "image/jpeg", "jpg"),
]


@router.get("", response_model=UnitListResponse)
def list_units(
    db: Session = Depends(get_db), _: User = Depends(current_user)
) -> UnitListResponse:
    items = unit_service.list_units(db)
    return UnitListResponse(items=[UnitOut.model_validate(u) for u in items])


@router.get("/{unit_id}", response_model=UnitOut)
def get_unit(
    unit_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)
) -> UnitOut:
    return UnitOut.model_validate(unit_service.get_unit(db, unit_id))


@router.put("/{unit_id}", response_model=UnitOut)
def update_unit(
    unit_id: int,
    payload: UnitUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> UnitOut:
    unit = unit_service.update_unit(
        db, unit_id, payload, actor_id=actor.id, ip=client_ip(request), ua=request.headers.get("user-agent")
    )
    return UnitOut.model_validate(unit)


@router.post("/{unit_id}/logo", response_model=UnitOut)
async def upload_logo(
    unit_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> UnitOut:
    # Đọc CÓ CHẶN (MAX+1 byte) → không nạp cả body khổng lồ vào RAM trước khi kiểm.
    data = await file.read(_MAX_LOGO_BYTES + 1)
    if not data:
        raise ValidationFailed("File logo rỗng")
    if len(data) > _MAX_LOGO_BYTES:
        raise ValidationFailed("Logo vượt quá 2MB")

    match = next((sig for sig in _IMAGE_SIGNATURES if data.startswith(sig[0])), None)
    if match is None:
        raise ValidationFailed("Logo phải là ảnh PNG hoặc JPG")
    _, mime, ext = match

    unit = unit_service.set_logo(
        db,
        unit_id,
        data=data,
        ext=ext,
        mime=mime,
        original_name=file.filename,
        actor_id=actor.id,
        ip=client_ip(request),
        ua=request.headers.get("user-agent"),
    )
    return UnitOut.model_validate(unit)


@router.get("/{unit_id}/logo")
def get_logo(
    unit_id: int, db: Session = Depends(get_db), _: User = Depends(current_user)
) -> Response:
    unit = unit_service.get_unit(db, unit_id)
    if unit.logo_file_id is None:
        raise NotFound("Đơn vị chưa có logo")
    logo = db.get(FileModel, unit.logo_file_id)
    if logo is None:
        raise NotFound("Không tìm thấy file logo")
    return Response(
        content=read_asset(logo.storage_key),
        media_type=logo.mime_type or "application/octet-stream",
        headers={"Cache-Control": "private, max-age=60"},
    )
