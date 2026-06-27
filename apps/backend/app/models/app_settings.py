"""AppSettings — B3b branding (single row, id=1). Tên app + logo trên header.

Single-row pattern: ràng buộc CHECK (id = 1) → luôn chỉ 1 dòng cấu hình toàn hệ thống.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AppSettings(Base):
    __tablename__ = "app_settings"
    __table_args__ = (CheckConstraint("id = 1", name="ck_app_settings_singleton"),)

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    app_name: Mapped[str] = mapped_column(String(150), nullable=False, default="QLCV Thành Đạt")
    logo_file_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("files.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
