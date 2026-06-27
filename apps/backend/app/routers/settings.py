"""Router branding — B3b (CFG.BRD).

GET công khai (KHÔNG auth) → trang đăng nhập cũng hiển thị đúng thương hiệu.
PUT/POST chỉ Quản lý. Logo phục vụ công khai (branding không nhạy cảm).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_manager
from app.core.errors import NotFound
from app.core.http import client_ip
from app.core.images import read_image_upload
from app.core.storage import read_asset
from app.models.file import File as FileModel
from app.models.user import User
from app.schemas.settings import SettingsOut, SettingsUpdate
from app.services import settings as settings_service

router = APIRouter()

_MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2MB


@router.get("", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)) -> SettingsOut:
    return SettingsOut.model_validate(settings_service.get_settings_row(db))


@router.put("", response_model=SettingsOut)
def update_settings(
    payload: SettingsUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> SettingsOut:
    row = settings_service.update_settings(
        db, payload, actor_id=actor.id, ip=client_ip(request), ua=request.headers.get("user-agent")
    )
    return SettingsOut.model_validate(row)


@router.post("/logo", response_model=SettingsOut)
async def upload_logo(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    actor: User = Depends(require_manager),
) -> SettingsOut:
    data, ext, mime = await read_image_upload(file, max_bytes=_MAX_LOGO_BYTES)
    row = settings_service.set_logo(
        db,
        data=data,
        ext=ext,
        mime=mime,
        original_name=file.filename,
        actor_id=actor.id,
        ip=client_ip(request),
        ua=request.headers.get("user-agent"),
    )
    return SettingsOut.model_validate(row)


@router.get("/logo")
def get_logo(db: Session = Depends(get_db)) -> Response:
    row = settings_service.get_settings_row(db)
    if row.logo_file_id is None:
        raise NotFound("Chưa có logo")
    logo = db.get(FileModel, row.logo_file_id)
    if logo is None:
        raise NotFound("Không tìm thấy file logo")
    return Response(
        content=read_asset(logo.storage_key),
        media_type=logo.mime_type or "application/octet-stream",
        headers={"Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff"},
    )
