"""Schemas nhật ký hệ thống — H3 (SEC.AUD). Chỉ Quản lý xem."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    created_at: datetime
    user_id: int | None
    username: str | None
    action: str
    object_type: str | None
    object_id: int | None
    ip: str | None
    user_agent: str | None
    detail: dict[str, Any] | None


class AuditLogListResponse(BaseModel):
    items: list[AuditLogOut]
    total: int


class AuditActionsResponse(BaseModel):
    actions: list[str]
