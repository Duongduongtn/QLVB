"""Signature model — C2 (SIG.SGN, chữ ký người ký).

Khác mộc: `default_unit_id` chỉ là đơn vị MẶC ĐỊNH (nullable, đổi được) — 1 người có
thể ký cho cả 2 đơn vị. 1 người có thể có nhiều chữ ký (cũ/mới). Ảnh chữ ký lưu asset
KHÔNG mã hoá (file.wrapped_key NULL). Inactive thay vì xoá (TDD §dòng 310-319).
"""

from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Signature(Base, TimestampMixin):
    __tablename__ = "signatures"
    __table_args__ = (Index("idx_signatures_unit", "default_unit_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    title: Mapped[str | None] = mapped_column(String(150))  # chức danh
    # Đơn vị mặc định — KHÔNG gắn cứng như mộc (1 người có thể ký cho cả 2 đơn vị).
    default_unit_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("units.id")
    )
    file_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("files.id"), nullable=False
    )
    uploaded_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
