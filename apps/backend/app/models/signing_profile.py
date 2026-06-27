"""SigningProfile model — C4 (SIG.PRO, hồ sơ ký chống nhầm mộc).

1 hồ sơ = người ký (signature) + mộc (seal) + chức danh hiển thị + đơn vị. Khi soạn CV
chỉ chọn 1 hồ sơ là áp đủ → không lo nhầm mộc. Bất biến CỐT LÕI: `seal.unit_id` PHẢI
bằng `unit_id` của hồ sơ (kiểm ở service — chống nhầm mộc đơn vị khác). Inactive thay
vì xoá (người ký nghỉ → inactive hồ sơ). TDD §dòng 321-330.
"""

from __future__ import annotations

from sqlalchemy import BigInteger, Boolean, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class SigningProfile(Base, TimestampMixin):
    __tablename__ = "signing_profiles"
    __table_args__ = (Index("idx_profiles_unit", "unit_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    unit_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("units.id"), nullable=False
    )
    signature_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("signatures.id"), nullable=False
    )
    # Ràng buộc seal.unit_id = unit_id kiểm ở service (chống nhầm mộc).
    seal_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("seals.id"), nullable=False
    )
    display_title: Mapped[str] = mapped_column(String(150), nullable=False)  # chức danh trên CV
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # tên hồ sơ ngắn
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
