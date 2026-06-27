"""Schemas chữ ký — C2 (SIG.SGN).

Tạo qua multipart (metadata + file) → router nhận Form + UploadFile. Sửa qua JSON →
SignatureUpdate. Khác mộc: `default_unit_id` đổi được (không gắn cứng).
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SignatureUpdate(BaseModel):
    """Sửa chữ ký — field nào KHÔNG gửi thì giữ nguyên (router exclude_unset).

    `default_unit_id` đổi được (1 người ký cho cả 2 đơn vị). KHÔNG xoá cứng —
    "ngừng dùng" = is_active=False.
    """

    full_name: Annotated[str | None, Field(min_length=1, max_length=150)] = None
    title: Annotated[str | None, Field(max_length=150)] = None
    default_unit_id: int | None = None
    is_active: bool | None = None

    @field_validator("full_name")
    @classmethod
    def _strip_full_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("Họ tên không được để trống")
        return v

    @field_validator("title")
    @classmethod
    def _strip_title(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v or None


class SignatureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    title: str | None
    default_unit_id: int | None
    file_id: int
    uploaded_by: int | None
    is_active: bool
    created_at: datetime


class SignatureListResponse(BaseModel):
    items: list[SignatureOut]
