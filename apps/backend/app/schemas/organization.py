"""Schemas danh bạ cơ quan — M1 (nơi nhận) + M2 (cơ quan gửi).

`role` ('recipient'|'sender') quyết định cờ is_recipient/is_sender khi tạo + để lọc
danh sách. `category` chỉ ý nghĩa với nơi nhận (Chung/Riêng GDNN/Riêng DVDL).
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

OrgRole = Literal["recipient", "sender"]
OrgCategory = Literal["common", "gdnn", "dvdl"]


def _check_email(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    if not _EMAIL_RE.match(v):
        raise ValueError("Email không hợp lệ")
    return v


def _strip_or_none(v: str | None) -> str | None:
    if v is None:
        return None
    return v.strip() or None


class OrganizationCreate(BaseModel):
    full_name: Annotated[str, Field(min_length=1, max_length=300)]
    short_name: Annotated[str | None, Field(max_length=150)] = None
    address: Annotated[str | None, Field(max_length=500)] = None
    email: Annotated[str | None, Field(max_length=255)] = None
    phone: Annotated[str | None, Field(max_length=30)] = None
    contact_person: Annotated[str | None, Field(max_length=150)] = None
    note: Annotated[str | None, Field(max_length=2000)] = None
    role: OrgRole = "recipient"
    category: OrgCategory = "common"

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Tên cơ quan không được để trống")
        return v

    @field_validator("short_name", "address", "contact_person")
    @classmethod
    def _strip_optional(cls, v: str | None) -> str | None:
        return _strip_or_none(v)

    @field_validator("email")
    @classmethod
    def _email_format(cls, v: str | None) -> str | None:
        return _check_email(v)


class OrganizationUpdate(BaseModel):
    """Sửa cơ quan — field nào KHÔNG gửi thì giữ nguyên (router exclude_unset).
    KHÔNG đổi vai (is_recipient/is_sender) qua đây."""

    full_name: Annotated[str | None, Field(min_length=1, max_length=300)] = None
    short_name: Annotated[str | None, Field(max_length=150)] = None
    address: Annotated[str | None, Field(max_length=500)] = None
    email: Annotated[str | None, Field(max_length=255)] = None
    phone: Annotated[str | None, Field(max_length=30)] = None
    contact_person: Annotated[str | None, Field(max_length=150)] = None
    note: Annotated[str | None, Field(max_length=2000)] = None
    category: OrgCategory | None = None

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            raise ValueError("Tên cơ quan không được để trống")
        return v

    @field_validator("short_name", "address", "contact_person")
    @classmethod
    def _strip_optional(cls, v: str | None) -> str | None:
        return _strip_or_none(v)

    @field_validator("email")
    @classmethod
    def _email_format(cls, v: str | None) -> str | None:
        return _check_email(v)


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    short_name: str | None
    address: str | None
    email: str | None
    phone: str | None
    contact_person: str | None
    note: str | None
    is_recipient: bool
    is_sender: bool
    category: str
    created_at: datetime
    # M2 thống kê (set ở router theo tab): số CV liên quan + ngày hoạt động gần nhất +
    # mức khẩn trung bình (chỉ tab cơ quan gửi).
    doc_count: int = 0
    last_activity: date | None = None
    avg_urgency: str | None = None


class OrganizationListResponse(BaseModel):
    items: list[OrganizationOut]
    total: int


class OrganizationSimilar(BaseModel):
    """M2 — ứng viên trùng (fuzzy pg_trgm) để gợi ý / gộp."""

    id: int
    full_name: str
    short_name: str | None
    similarity: float
    doc_count: int = 0


class MergeRequest(BaseModel):
    """M2 — gộp cơ quan `source` vào `target` (chuyển hết CV rồi xoá source)."""

    source_id: int
    target_id: int
