"""Organization model — danh bạ cơ quan (M1 nơi nhận + M2 cơ quan gửi, 1 bảng 2 vai).

`is_recipient` (M1, CV đi) và `is_sender` (M2, CV đến) là 2 cờ độc lập — 1 cơ quan có
thể vừa nhận vừa gửi. `category` (common/gdnn/dvdl) là phân loại nơi nhận theo đơn vị
(M1). Soft delete (deleted_at) → CV cũ vẫn trỏ tới được. TDD §dòng 458-473.
"""

from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, CheckConstraint, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

_active = text("deleted_at IS NULL")


class Organization(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "organizations"
    __table_args__ = (
        CheckConstraint("category IN ('common','gdnn','dvdl')", name="ck_org_category"),
        Index("idx_org_recipient", "is_recipient", postgresql_where=_active),
        Index("idx_org_sender", "is_sender", postgresql_where=_active),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(300), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(150))
    address: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(30))
    contact_person: Mapped[str | None] = mapped_column(String(150))
    note: Mapped[str | None] = mapped_column(Text)
    is_recipient: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_sender: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    category: Mapped[str] = mapped_column(String(10), nullable=False, default="common")
