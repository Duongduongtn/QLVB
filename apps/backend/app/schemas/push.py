"""Schemas Web Push (L1 PWA) — đăng ký kênh đẩy thông báo theo thiết bị."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


def _require_https(v: str) -> str:
    if not v.startswith("https://"):
        raise ValueError("endpoint phải là URL https")
    return v


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=1, max_length=200)
    auth: str = Field(min_length=1, max_length=100)


class PushSubscribeIn(BaseModel):
    """Khớp đối tượng PushSubscription do trình duyệt sinh (toJSON)."""

    endpoint: str = Field(min_length=1, max_length=2000)
    keys: PushKeys

    _v_ep = field_validator("endpoint")(_require_https)


class PushUnsubscribeIn(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2000)


class VapidPublicKeyOut(BaseModel):
    # None khi server chưa cấu hình VAPID → FE ẩn nút bật thông báo đẩy.
    public_key: str | None
