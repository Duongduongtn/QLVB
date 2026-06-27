"""Schemas CV đi — Nhóm D (D1 phát hành, D6 sổ).

Tạo/sửa draft qua JSON; upload file PDF + tải về qua endpoint riêng. `stamp_positions`
toạ độ % (D2), `sealing_option` giáp lai (D3) + ký nháy (D4).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

StampKind = Literal["seal", "signature", "date"]
RangeKind = Literal["none", "all", "range"]


class StampPosition(BaseModel):
    kind: StampKind
    page: Annotated[int, Field(ge=1)]
    x_pct: Annotated[float, Field(ge=0, le=1)]
    y_pct: Annotated[float, Field(ge=0, le=1)]
    w_pct: Annotated[float, Field(gt=0, le=1)]
    h_pct: Annotated[float, Field(gt=0, le=1)]


class SealingRange(BaseModel):
    kind: RangeKind = "none"
    page_from: Annotated[int | None, Field(ge=1)] = None
    page_to: Annotated[int | None, Field(ge=1)] = None


class SealingOption(BaseModel):
    giap_lai: SealingRange = SealingRange()
    ky_nhay: SealingRange = SealingRange()


class OutgoingCreate(BaseModel):
    unit_id: int
    doc_type_id: int
    subject: Annotated[str, Field(min_length=1)]
    issue_date: date
    recipient_ids: list[int] = []
    signing_profile_id: int | None = None
    stamp_positions: list[StampPosition] | None = None
    sealing_option: SealingOption | None = None


class OutgoingUpdate(BaseModel):
    subject: Annotated[str | None, Field(min_length=1)] = None
    issue_date: date | None = None
    recipient_ids: list[int] | None = None
    signing_profile_id: int | None = None
    stamp_positions: list[StampPosition] | None = None
    sealing_option: SealingOption | None = None


class NumberRequest(BaseModel):
    """Cấp số: manual_number=None → tự cấp (nextval atomic); có giá trị → dùng số có sẵn."""

    manual_number: Annotated[int | None, Field(ge=1)] = None


class CancelRequest(BaseModel):
    reason: Annotated[str, Field(min_length=1, max_length=500)]


class RecipientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    short_name: str | None


class OutgoingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    unit_id: int
    doc_type_id: int
    number: str | None
    number_int: int | None
    period_key: str | None
    subject: str
    issue_date: date
    status: str
    signing_profile_id: int | None
    stamp_positions: list[dict[str, Any]] | None
    sealing_option: dict[str, Any] | None
    original_file_id: int | None
    signed_file_id: int | None
    cancel_reason: str | None
    created_by: int | None
    created_at: datetime
    updated_at: datetime
    recipients: list[RecipientOut] = []


class OutgoingListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    unit_id: int
    doc_type_id: int
    number: str | None
    subject: str
    issue_date: date
    status: str
    created_at: datetime


class OutgoingListResponse(BaseModel):
    items: list[OutgoingListItem]
    total: int


class TrashItemOut(BaseModel):
    """CV trong thùng rác — H3. `days_remaining` = số ngày còn lại trước khi tự xoá."""

    id: int
    unit_id: int
    number: str | None
    subject: str
    status: str
    deleted_at: datetime | None
    days_remaining: int


class TrashListResponse(BaseModel):
    items: list[TrashItemOut]
    total: int
