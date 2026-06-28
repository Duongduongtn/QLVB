"""Web Push (L1 PWA) — gửi thông báo đẩy ra trình duyệt qua giao thức Web Push + VAPID.

Luồng: trình duyệt đăng ký (pushManager.subscribe) → FE POST endpoint + khoá p256dh/auth →
lưu `push_subscriptions`. Khi có việc mới giao / nhắc hạn → `send_to_user` mã hoá payload và
đẩy tới push service (FCM/Mozilla/Apple). Endpoint hết hạn (404/410) → xoá.

KHÔNG biết FastAPI (test standalone). KHÔNG tự commit — caller commit cùng transaction nghiệp
vụ (giống `notification.create`). `pywebpush` import TRỄ (chỉ nạp khi thực sự gửi).
"""

from __future__ import annotations

import ipaddress
import json
import logging
from urllib.parse import urlparse

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ValidationFailed
from app.models.push_subscription import PushSubscription

logger = logging.getLogger(__name__)

# Giới hạn payload Web Push (~4KB sau mã hoá). Cắt body cho an toàn.
_MAX_BODY = 240


def _validate_push_endpoint(endpoint: str) -> None:
    """Chống SSRF: chỉ cho endpoint https tới host CÔNG KHAI (TDD §10.4 — worker không
    được gọi nội bộ/metadata). Chặn http, localhost, IP riêng/loopback/link-local/metadata."""
    parsed = urlparse(endpoint)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValidationFailed("Endpoint thông báo đẩy không hợp lệ")
    host = parsed.hostname.lower()
    if host == "localhost" or host.endswith((".local", ".internal", ".localhost")):
        raise ValidationFailed("Endpoint thông báo đẩy không hợp lệ")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None  # tên DNS thường — chấp nhận
    if ip is not None and not ip.is_global:
        raise ValidationFailed("Endpoint thông báo đẩy không hợp lệ")


def vapid_configured() -> bool:
    """Có đủ cặp khoá VAPID để gửi push không. Chưa cấu hình → mọi hàm gửi no-op an toàn
    (local/CI không có khoá vẫn chạy test bình thường)."""
    priv = settings.vapid_private_key
    return bool(settings.vapid_public_key and priv and priv.get_secret_value())


def public_key() -> str | None:
    """Khoá công khai VAPID cho FE (applicationServerKey). None nếu chưa cấu hình."""
    return settings.vapid_public_key


def save_subscription(
    db: Session,
    *,
    user_id: int,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str | None,
) -> None:
    """Lưu/cập nhật subscription theo `endpoint` (khoá duy nhất). Cùng endpoint đăng ký lại
    (đổi user trên thiết bị chung, hoặc khoá xoay) → ghi đè user_id + khoá. Caller commit."""
    _validate_push_endpoint(endpoint)
    stmt = (
        pg_insert(PushSubscription)
        .values(
            user_id=user_id,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            user_agent=user_agent,
        )
        .on_conflict_do_update(
            index_elements=[PushSubscription.endpoint],
            set_={
                "user_id": user_id,
                "p256dh": p256dh,
                "auth": auth,
                "user_agent": user_agent,
            },
        )
    )
    db.execute(stmt)


def delete_subscription(db: Session, *, user_id: int, endpoint: str) -> None:
    """Huỷ đăng ký 1 thiết bị (chỉ của chính mình — chống xoá nhầm endpoint người khác).
    Caller commit."""
    db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == endpoint, PushSubscription.user_id == user_id
        )
    )


def send_to_user(db: Session, user_id: int, *, title: str, body: str, url: str) -> int:
    """Đẩy 1 thông báo tới mọi thiết bị của user. Trả số lần gửi thành công.

    No-op (trả 0) khi chưa cấu hình VAPID. Endpoint chết (404/410) → đánh dấu xoá. KHÔNG
    commit (caller commit — riêng worker `send_web_push` tự commit phần dọn endpoint chết).
    """
    if not vapid_configured():
        return 0
    subs = list(
        db.scalars(select(PushSubscription).where(PushSubscription.user_id == user_id)).all()
    )
    if not subs:
        return 0

    try:
        from pywebpush import WebPushException, webpush  # import trễ
    except ImportError:  # worker image luôn có; phòng cấu hình lệch → degrade, không vỡ caller
        logger.warning("push.pywebpush_missing")
        return 0

    private_key = settings.vapid_private_key.get_secret_value()  # type: ignore[union-attr]
    claims = {"sub": settings.vapid_subject}
    payload = json.dumps({"title": title, "body": body[:_MAX_BODY], "url": url})

    sent = 0
    dead: list[str] = []
    for sub in subs:
        try:
            _validate_push_endpoint(sub.endpoint)  # phòng row cũ trước khi có validate
        except ValidationFailed:
            dead.append(sub.endpoint)
            continue
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=private_key,
                vapid_claims=dict(claims),  # webpush mutate dict (thêm 'exp') → copy mỗi lần
            )
            sent += 1
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (404, 410):  # subscription hết hạn / bị huỷ → dọn
                dead.append(sub.endpoint)
            else:
                logger.warning("push.send_failed", extra={"status": status, "user_id": user_id})
        except Exception:  # không để 1 thiết bị lỗi chặn các thiết bị khác
            logger.exception("push.send_error", extra={"user_id": user_id})

    if dead:
        db.execute(delete(PushSubscription).where(PushSubscription.endpoint.in_(dead)))
    return sent
