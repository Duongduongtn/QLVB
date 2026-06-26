"""Schemas quản lý người dùng — A4 (USR.MNG, chỉ Quản lý).

Input/Output HTTP tách khỏi ORM. Mật khẩu tạm validate theo PRD A3 (≥8, chữ+số).
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal["manager", "staff"]

_USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]+$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _check_password(v: str) -> str:
    if len(v) < 8 or not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
        raise ValueError("Mật khẩu phải từ 8 ký tự trở lên và gồm cả chữ lẫn số")
    return v


def _check_email(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    if not _EMAIL_RE.match(v):
        raise ValueError("Email không hợp lệ")
    return v


class UserCreate(BaseModel):
    username: Annotated[str, Field(min_length=3, max_length=50)]
    full_name: Annotated[str, Field(min_length=1, max_length=150)]
    email: Annotated[str | None, Field(max_length=255)] = None
    role: Role = "staff"
    password: Annotated[str, Field(min_length=8, max_length=200)]

    @field_validator("username")
    @classmethod
    def _username_format(cls, v: str) -> str:
        if not _USERNAME_RE.match(v):
            raise ValueError("Tên đăng nhập chỉ gồm chữ, số và . _ -")
        return v.lower()

    @field_validator("password")
    @classmethod
    def _password_strength(cls, v: str) -> str:
        return _check_password(v)

    @field_validator("email")
    @classmethod
    def _email_format(cls, v: str | None) -> str | None:
        return _check_email(v)


class UserUpdate(BaseModel):
    """Sửa user — field nào KHÔNG gửi thì không đổi (router dùng exclude_unset).

    full_name/role gửi null tường minh → từ chối (tránh ghi NULL vào cột NOT NULL → 500).
    """

    full_name: Annotated[str | None, Field(min_length=1, max_length=150)] = None
    email: Annotated[str | None, Field(max_length=255)] = None
    role: Role | None = None
    is_active: bool | None = None

    @field_validator("full_name", "role")
    @classmethod
    def _reject_null(cls, v: object) -> object:
        if v is None:
            raise ValueError("Trường này không được để trống")
        return v

    @field_validator("email")
    @classmethod
    def _email_format(cls, v: str | None) -> str | None:
        return _check_email(v)


class UserListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    email: str | None
    role: str
    is_active: bool
    last_login_at: datetime | None


class UserDetail(UserListItem):
    created_at: datetime
    active_sessions: int = 0


class UserStats(BaseModel):
    total: int
    managers: int
    staff: int
    locked: int


class UserListResponse(BaseModel):
    items: list[UserListItem]
    total: int
    page: int
    size: int
    stats: UserStats


class ResetPasswordOut(BaseModel):
    password: str
