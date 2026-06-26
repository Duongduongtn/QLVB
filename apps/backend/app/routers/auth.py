"""Auth router — skeleton. TDD §5.

Endpoints sẽ implement đầy đủ ở giai đoạn 1 nhóm tính năng A:
    POST   /login      → set cookie session (Redis)
    POST   /logout     → xoá session
    GET    /me         → user hiện tại
    PUT    /password   → đổi mật khẩu (A3)
    GET    /sessions   → liệt kê phiên (4.6.1)
    DELETE /sessions/:sid → kick 1 phiên

Hiện tại chỉ stub `/me` để test middleware current_user.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.deps import current_user

router = APIRouter()


@router.get("/me")
def me(user=Depends(current_user)) -> dict[str, str | int]:
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
    }
