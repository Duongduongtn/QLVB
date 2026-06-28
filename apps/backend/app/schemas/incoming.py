"""Schemas CV đến — Nhóm E (E1 vào sổ + E1.6 dedup)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Urgency = Literal["normal", "urgent", "very_urgent", "express", "express_timed"]
Confidentiality = Literal["normal", "secret", "top_secret", "highest_secret"]


class IncomingUpdate(BaseModel):
    reference_number: Annotated[str | None, Field(max_length=100)] = None
    document_date: date | None = None
    sender_org_id: int | None = None
    sender_org_name: Annotated[str | None, Field(max_length=200)] = None
    subject: Annotated[str | None, Field(min_length=1)] = None
    urgency: Urgency | None = None
    confidentiality: Confidentiality | None = None
    deadline: date | None = None
    manager_only: bool | None = None


class RegisterRequest(BaseModel):
    doc_type_id: int
    override_reason: Annotated[str | None, Field(max_length=500)] = None


class ManagerOnlyRequest(BaseModel):
    manager_only: bool


class DuplicateOut(BaseModel):
    layer: int
    level: str
    doc_id: int
    number: str | None
    reference_number: str | None


class IncomingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: str | None
    number_int: int | None
    period_key: str | None
    doc_type_id: int | None
    reference_number: str | None
    document_date: date | None
    sender_org_id: int | None
    sender_org_name: str | None
    subject: str | None
    urgency: str
    confidentiality: str
    deadline: date | None
    manager_only: bool
    file_id: int | None
    signature_status: str
    signature_info: dict[str, Any] | None
    status: str
    duplicate_note: str | None
    created_by: int | None
    created_at: datetime
    updated_at: datetime


class IncomingListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    number: str | None
    reference_number: str | None
    document_date: date | None
    sender_org_id: int | None
    sender_org_name: str | None
    subject: str | None
    urgency: str
    confidentiality: str
    manager_only: bool
    signature_status: str
    status: str
    created_at: datetime
    # E2 — tóm tắt phân công xử lý (badge "Đã giao"): số task + trạng thái gộp
    # (None chưa giao / assigned / processing / done). Router gắn sau khi list.
    task_total: int = 0
    task_status: str | None = None


class IncomingListResponse(BaseModel):
    items: list[IncomingListItem]
    total: int


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    incoming_id: int
    original_name: str | None
    mime_type: str | None
    size_bytes: int
    created_at: datetime
