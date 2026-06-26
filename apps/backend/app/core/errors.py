"""Error envelope thống nhất cho toàn API.

Tất cả lỗi business raise AppError (subclass) → exception handler chuẩn hoá:
    { "error": { "code": "DUPLICATE_NUMBER", "message": "Số 247 đã tồn tại" } }
"""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Lỗi business — message hiển thị thẳng cho user (tiếng Việt)."""

    code: str = "INTERNAL_ERROR"
    http_status: int = 500

    def __init__(self, message: str, *, code: str | None = None, http_status: int | None = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        if http_status:
            self.http_status = http_status


class NotFound(AppError):
    code = "NOT_FOUND"
    http_status = 404


class PermissionDenied(AppError):
    code = "PERMISSION_DENIED"
    http_status = 403


class Conflict(AppError):
    code = "CONFLICT"
    http_status = 409


class ValidationFailed(AppError):
    code = "VALIDATION_FAILED"
    http_status = 422


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.http_status,
        content={"error": {"code": exc.code, "message": exc.message}},
    )
