"""Schemas auth — A1 Đăng nhập / A2 Đăng xuất (TDD §5).

Đầu vào/đầu ra HTTP tách khỏi ORM: router nhận `LoginRequest`, trả `UserOut`.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.user import _check_password


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=200)
    remember: bool = False


class ChangePasswordRequest(BaseModel):
    """A3 — đổi mật khẩu: mật khẩu hiện tại + mật khẩu mới (≥8, có cả chữ lẫn số)."""

    current_password: str = Field(min_length=1, max_length=200)
    new_password: Annotated[str, Field(min_length=8, max_length=200)]

    @field_validator("new_password")
    @classmethod
    def _strength(cls, v: str) -> str:
        return _check_password(v)


class UserOut(BaseModel):
    """Snapshot user trả cho FE (KHÔNG kèm password_hash, locked_until...)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    role: str
