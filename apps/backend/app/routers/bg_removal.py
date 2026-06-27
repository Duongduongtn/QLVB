"""Router tách nền — C3 (SIG.BG). Chỉ Quản lý.

Luồng: POST ảnh (hoặc dùng lại ảnh gốc đã tải qua source_key khi kéo slider) → enqueue
task worker → trả task_id. FE poll GET status → khi xong lấy result_key → GET asset xem
preview. "Lưu" = FE tải PNG đã tách rồi POST sang /api/seals hoặc /api/signatures.
"""

from __future__ import annotations

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile

from app.core.celery_app import celery
from app.core.deps import require_manager
from app.core.errors import NotFound, ValidationFailed
from app.core.images import read_image_upload
from app.core.storage import read_asset, save_asset
from app.models.user import User
from app.workers.rembg_task import remove_background

router = APIRouter()

_TMP_SUBDIR = "bg_tmp"
_KINDS = frozenset({"seal", "signature"})
# Ảnh chụp giấy bằng điện thoại thường lớn → nhận biên rộng rồi RESIZE (PRD C3 edge
# ">5MB tự resize"). Giới hạn mộc/chữ ký thật (5MB/2MB) áp ở bước lưu cuối (/api/seals).
_INPUT_MAX_BYTES = 20 * 1024 * 1024


def _check_tmp_key(key: str) -> str:
    # Chỉ cho phép key trong thư mục tạm tách nền (chống đọc asset khác qua endpoint này).
    if not key.startswith(f"{_TMP_SUBDIR}/"):
        raise ValidationFailed("Khoá ảnh tạm không hợp lệ")
    return key


@router.post("", status_code=202)
async def submit_bg_removal(
    request: Request,
    kind: str = Form(...),
    threshold: int = Form(default=60),
    source_key: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    actor: User = Depends(require_manager),
) -> dict[str, object]:
    if kind not in _KINDS:
        raise ValidationFailed("Loại tách nền phải là 'seal' hoặc 'signature'")
    if not 0 <= threshold <= 100:
        raise ValidationFailed("Ngưỡng phải trong khoảng 0-100")

    if source_key:  # kéo slider — dùng lại ảnh gốc đã tải, không upload lại
        input_key = _check_tmp_key(source_key)
    elif file is not None:
        data, ext, _ = await read_image_upload(file, max_bytes=_INPUT_MAX_BYTES)
        input_key = save_asset(data, ext=ext, subdir=_TMP_SUBDIR).storage_key
    else:
        raise ValidationFailed("Thiếu ảnh tải lên")

    task = remove_background.delay(input_key, kind, threshold)
    return {"task_id": task.id, "source_key": input_key}


@router.get("/result/{task_id}")
def bg_removal_status(task_id: str, _: User = Depends(require_manager)) -> dict[str, object]:
    res: AsyncResult = AsyncResult(task_id, app=celery)
    if res.successful():
        return {"status": "done", **res.result}
    if res.failed():
        return {"status": "error", "message": "Tách nền thất bại, thử tải lại ảnh khác"}
    return {"status": "pending"}


@router.get("/asset")
def bg_removal_asset(
    key: str = Query(...), _: User = Depends(require_manager)
) -> Response:
    _check_tmp_key(key)
    try:
        data = read_asset(key)
    except (FileNotFoundError, ValueError) as exc:
        raise NotFound("Không tìm thấy ảnh tạm") from exc
    return Response(
        content=data,
        media_type="image/png",
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )
