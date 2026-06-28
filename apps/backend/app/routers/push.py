"""Router Web Push (L1 PWA) — lấy khoá công khai VAPID + đăng ký/huỷ kênh đẩy."""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import current_user
from app.core.http import client_ip
from app.models.user import User
from app.schemas.push import PushSubscribeIn, PushUnsubscribeIn, VapidPublicKeyOut
from app.services import audit as audit_service
from app.services import push as push_service

router = APIRouter()


def _endpoint_host(endpoint: str) -> str | None:
    return urlparse(endpoint).hostname


@router.get("/vapid-public-key", response_model=VapidPublicKeyOut)
def vapid_public_key(_: User = Depends(current_user)) -> VapidPublicKeyOut:
    return VapidPublicKeyOut(public_key=push_service.public_key())


@router.post("/subscribe", status_code=204)
def subscribe(
    payload: PushSubscribeIn,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> Response:
    ua = (request.headers.get("user-agent") or "")[:300] or None
    push_service.save_subscription(
        db,
        user_id=actor.id,
        endpoint=payload.endpoint,
        p256dh=payload.keys.p256dh,
        auth=payload.keys.auth,
        user_agent=ua,
    )
    # Bất biến #11 — đăng ký kênh nhận đẩy là sự kiện bảo mật (như tạo session). KHÔNG lưu
    # endpoint đầy đủ vào audit (URL bí mật), chỉ host push provider để truy vết.
    audit_service.log_action(
        db,
        action="push_subscribe",
        user_id=actor.id,
        object_type="push_subscription",
        ip=client_ip(request),
        user_agent=ua,
        detail={"host": _endpoint_host(payload.endpoint)},
    )
    db.commit()
    return Response(status_code=204)


@router.post("/unsubscribe", status_code=204)
def unsubscribe(
    payload: PushUnsubscribeIn,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
) -> Response:
    push_service.delete_subscription(db, user_id=actor.id, endpoint=payload.endpoint)
    audit_service.log_action(
        db,
        action="push_unsubscribe",
        user_id=actor.id,
        object_type="push_subscription",
        ip=client_ip(request),
        user_agent=request.headers.get("user-agent"),
        detail={"host": _endpoint_host(payload.endpoint)},
    )
    db.commit()
    return Response(status_code=204)
