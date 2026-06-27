"""Schemas mộc — C1 (SIG.SEL).

Tạo mộc đi qua multipart (metadata + file ảnh) nên KHÔNG có schema request cho tạo —
router nhận Form field + UploadFile, validate trong service. Sửa mộc (đổi tên/loại/
trạng thái) qua JSON nên có SealUpdate.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SealType = Literal["round", "hanging", "overlap"]


class SealUpdate(BaseModel):
    """Sửa mộc — field nào KHÔNG gửi thì giữ nguyên (router exclude_unset).

    KHÔNG cho đổi `unit_id` (mộc gắn cứng đơn vị, chống nhầm). KHÔNG xoá cứng —
    "ngừng dùng" = is_active=False.
    """

    name: Annotated[str | None, Field(min_length=1, max_length=150)] = None
    seal_type: SealType | None = None
    is_active: bool | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:  # min_length=1 vẫn lọt chuỗi toàn khoảng trắng
            raise ValueError("Tên mộc không được để trống")
        return v


class SealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    unit_id: int
    name: str
    seal_type: str
    file_id: int
    uploaded_by: int | None
    is_active: bool
    created_at: datetime


class SealListResponse(BaseModel):
    items: list[SealOut]
