"""Schemas cấu hình sổ công văn — B2 (CFG.BOK, chỉ Quản lý sửa).

start_stt / current_stt KHÔNG lưu thành cột — chúng được áp vào PG SEQUENCE bằng setval
ở service (TDD §3.3: nguồn chân lý số đếm là sequence). next_number đọc lại từ sequence.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Direction = Literal["out", "in"]
ResetPolicy = Literal["year", "month", "none"]


class DocumentTypeCreate(BaseModel):
    direction: Direction
    unit_id: int | None = None  # bắt buộc với 'out', phải NULL với 'in' (check ở service)
    name: Annotated[str, Field(min_length=1, max_length=100)]
    code: Annotated[str, Field(min_length=1, max_length=20)]
    number_format: Annotated[str, Field(min_length=1, max_length=100)]
    reset_policy: ResetPolicy = "year"
    zero_pad: Annotated[int, Field(ge=0, le=10)] = 3
    start_stt: Annotated[int, Field(ge=1, le=1_000_000)] = 1
    current_stt: Annotated[int, Field(ge=0, le=1_000_000)] = 0


class DocumentTypeUpdate(BaseModel):
    """Sửa loại VB — field nào không gửi thì giữ nguyên (router exclude_unset).

    current_stt gửi → setval lại sequence kỳ hiện tại (KHÔNG lùi nếu < số đã cấp; xem service).
    """

    name: Annotated[str | None, Field(min_length=1, max_length=100)] = None
    code: Annotated[str | None, Field(min_length=1, max_length=20)] = None
    number_format: Annotated[str | None, Field(min_length=1, max_length=100)] = None
    reset_policy: ResetPolicy | None = None
    zero_pad: Annotated[int | None, Field(ge=0, le=10)] = None
    is_active: bool | None = None
    current_stt: Annotated[int | None, Field(ge=0, le=1_000_000)] = None


class DocumentTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    direction: str
    unit_id: int | None
    name: str
    code: str
    number_format: str
    reset_policy: str
    zero_pad: int
    is_active: bool
    next_number: int = 0  # số kế tiếp ở kỳ hiện tại (peek sequence), router điền


class DocumentTypeListResponse(BaseModel):
    items: list[DocumentTypeOut]


class NumberPreviewRequest(BaseModel):
    number_format: Annotated[str, Field(min_length=1, max_length=100)]
    code: Annotated[str, Field(min_length=1, max_length=20)]
    zero_pad: Annotated[int, Field(ge=0, le=10)] = 3
    unit_id: int | None = None
    sample_stt: Annotated[int, Field(ge=1, le=1_000_000)] = 1


class NumberPreviewResponse(BaseModel):
    sample: str
