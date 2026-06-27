"""Schemas hồ sơ ký — C4 (SIG.PRO).

Tạo/sửa qua JSON (không có file) → dùng Pydantic body model. Tên người ký / tên mộc và
trạng thái active của chúng KHÔNG nhúng ở đây — FE đã tải sẵn danh sách chữ ký + mộc
(kèm inactive) và join client-side để hiển thị + cảnh báo (giống cách join units).
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _strip_required(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("Không được để trống")
    return v


class ProfileCreate(BaseModel):
    unit_id: int
    signature_id: int
    seal_id: int
    display_title: Annotated[str, Field(min_length=1, max_length=150)]
    name: Annotated[str, Field(min_length=1, max_length=100)]

    @field_validator("display_title", "name")
    @classmethod
    def _strip(cls, v: str) -> str:
        return _strip_required(v)


class ProfileUpdate(BaseModel):
    """Sửa hồ sơ — chỉ chức danh hiển thị / tên / trạng thái. Đổi người ký hoặc mộc thì
    tạo hồ sơ mới (chống nhầm — giữ vết hồ sơ cũ). KHÔNG xoá cứng."""

    display_title: Annotated[str | None, Field(min_length=1, max_length=150)] = None
    name: Annotated[str | None, Field(min_length=1, max_length=100)] = None
    is_active: bool | None = None

    @field_validator("display_title", "name")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _strip_required(v)


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    unit_id: int
    signature_id: int
    seal_id: int
    display_title: str
    name: str
    is_active: bool
    created_at: datetime


class ProfileListResponse(BaseModel):
    items: list[ProfileOut]
