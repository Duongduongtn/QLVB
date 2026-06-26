"""User model — TDD §3.2.

Soft delete: username UNIQUE chỉ TRONG SỐ user chưa xoá (partial index).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, Index, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('manager','staff')", name="ck_users_role"),
        Index(
            "uq_users_username_active",
            "username",
            unique=True,
            postgresql_where="deleted_at IS NULL",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Literal["manager", "staff"]] = mapped_column(
        String(20), nullable=False, default="staff"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    failed_logins: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
