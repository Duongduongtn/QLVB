"""Schemas cấu hình đơn vị — B1 (CFG.UNT, chỉ Quản lý sửa).

2 đơn vị cố định (GDNN/DVDL) — KHÔNG tạo/xoá. Chỉ sửa thông tin hiển thị.
`color` và `code` KHÔNG nằm trong field cho sửa (PRD B1: mã màu giữ nhất quán).
"""

from __future__ import annotations

import re
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _check_email(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    if not _EMAIL_RE.match(v):
        raise ValueError("Email không hợp lệ")
    return v


class UnitUpdate(BaseModel):
    """Sửa đơn vị — field nào KHÔNG gửi thì giữ nguyên (router exclude_unset).

    full_name là cột NOT NULL → gửi null/rỗng tường minh bị từ chối.
    Các field còn lại cho phép null (xoá giá trị).
    """

    full_name: Annotated[str | None, Field(min_length=1, max_length=255)] = None
    short_name: Annotated[str | None, Field(max_length=100)] = None
    address: str | None = None
    tax_code: Annotated[str | None, Field(max_length=20)] = None
    phone: Annotated[str | None, Field(max_length=30)] = None
    email: Annotated[str | None, Field(max_length=255)] = None

    @field_validator("full_name")
    @classmethod
    def _reject_null_name(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            raise ValueError("Tên đầy đủ không được để trống")
        return v

    @field_validator("email")
    @classmethod
    def _email_format(cls, v: str | None) -> str | None:
        return _check_email(v)


class UnitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    full_name: str
    short_name: str | None
    address: str | None
    tax_code: str | None
    phone: str | None
    email: str | None
    color: str
    logo_file_id: int | None


class UnitListResponse(BaseModel):
    items: list[UnitOut]
