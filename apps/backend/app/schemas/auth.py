"""Schemas auth — A1 Đăng nhập / A2 Đăng xuất (TDD §5).

Đầu vào/đầu ra HTTP tách khỏi ORM: router nhận `LoginRequest`, trả `UserOut`.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=1, max_length=200)
    remember: bool = False


class UserOut(BaseModel):
    """Snapshot user trả cho FE (KHÔNG kèm password_hash, locked_until...)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str
    role: str
