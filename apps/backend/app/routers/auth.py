"""Auth router — A1 Đăng nhập (TDD §5). Router mỏng: chỉ điều phối + set cookie.

Endpoints (mở dần theo story):
    POST   /login      → A1: set cookie session (Redis)
    GET    /me         → user hiện tại
    POST   /logout     → A2 (chưa làm)
    PUT    /password   → A3 (chưa làm)
    GET    /sessions   → 4.6.1 (chưa làm)
"""

from __future__ import annotations

import ipaddress

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import current_user
from app.models.user import User
from app.schemas.auth import LoginRequest, UserOut
from app.services.audit import log_action
from app.services.auth import authenticate
from app.services.session import destroy_session

router = APIRouter()


def _client_ip(request: Request) -> str | None:
    """IP thật khi sau Nginx reverse proxy (X-Forwarded-For: client, proxy1, ...).

    Validate trước khi trả: cột audit_logs.ip kiểu INET — chuỗi rác do client tự bịa
    trong header X-Forwarded-For sẽ làm psycopg lỗi DataError → rollback → login 500.
    """
    forwarded = request.headers.get("x-forwarded-for")
    candidate = (
        forwarded.split(",")[0].strip()
        if forwarded
        else (request.client.host if request.client else None)
    )
    if not candidate:
        return None
    try:
        ipaddress.ip_address(candidate)
    except ValueError:
        return None
    return candidate


@router.post("/login", response_model=UserOut)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> User:
    user, session_id, ttl = authenticate(
        db,
        username=payload.username,
        password=payload.password,
        remember=payload.remember,
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_id,
        max_age=ttl,
        httponly=True,
        # Secure bắt buộc qua HTTPS thật (prod/staging); dev chạy http://localhost nên tắt.
        secure=settings.session_secure_cookie and settings.environment != "dev",
        samesite="strict",
        path="/",
    )
    return user


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
) -> Response:
    session_id = request.cookies.get(settings.session_cookie_name)
    if session_id:
        destroy_session(session_id, user.id)
    log_action(
        db,
        action="logout",
        user_id=user.id,
        object_type="user",
        object_id=user.id,
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.commit()
    response = Response(status_code=204)
    # Khớp thuộc tính với cookie lúc set (login) để mọi trình duyệt xoá chắc chắn.
    response.delete_cookie(
        settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=settings.session_secure_cookie and settings.environment != "dev",
        samesite="strict",
    )
    return response


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> User:
    return user
