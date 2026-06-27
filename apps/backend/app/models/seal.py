"""Seal model — C1 (SIG.SEL, mộc gắn cứng đơn vị → chống nhầm).

Mỗi mộc thuộc đúng 1 đơn vị (unit_id NOT NULL) → khi phát hành CV chỉ chọn được mộc
đúng đơn vị. Ảnh mộc lưu dạng asset KHÔNG mã hoá (file.wrapped_key NULL). Mộc KHÔNG
xoá cứng — chỉ `is_active=False` để CV cũ vẫn hiển thị mộc đã dùng (TDD §dòng 298-308).
"""

from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, CheckConstraint, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Seal(Base, TimestampMixin):
    __tablename__ = "seals"
    __table_args__ = (
        CheckConstraint(
            "seal_type IN ('round','hanging','overlap')", name="ck_seal_type"
        ),
        Index("idx_seals_unit", "unit_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # Mộc gắn cứng đơn vị → chống nhầm (PRD C1). NOT NULL.
    unit_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("units.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    seal_type: Mapped[str] = mapped_column(String(20), nullable=False, default="round")
    # Ảnh PNG/JPG (đã/chưa tách nền) — file.wrapped_key NULL (không mã hoá).
    file_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("files.id"), nullable=False
    )
    # KHÔNG FK cứng người upload chặn xoá user → nullable, polymorphic mềm như audit.
    uploaded_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
