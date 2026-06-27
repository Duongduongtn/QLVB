"""DocumentType + NumberingRegistry — B2 (CFG.BOK, cấu hình sổ công văn).

`document_types`: 1 dòng = 1 loại VB của 1 sổ (đi-GDNN / đi-DVDL / đến-chung).
`numbering_registry`: CHỈ ánh xạ (loại, kỳ) → tên PG SEQUENCE thực — KHÔNG giữ giá trị
đếm (nguồn chân lý số đếm = SEQUENCE, đọc last_value qua pg_sequences). TDD §3.3.
"""

from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class DocumentType(Base, TimestampMixin):
    __tablename__ = "document_types"
    __table_args__ = (
        CheckConstraint("direction IN ('out','in')", name="ck_doctype_direction"),
        CheckConstraint(
            "reset_policy IN ('year','month','none')", name="ck_doctype_reset"
        ),
        # Mã loại DUY NHẤT trong 1 sổ (direction + đơn vị) → chống 2 loại trùng sinh
        # số trùng. COALESCE(unit_id,0) để sổ đến chung (unit_id NULL) cũng bị ràng buộc.
        Index(
            "uq_doctype_identity",
            "direction",
            text("COALESCE(unit_id, 0)"),
            "code",
            unique=True,
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    direction: Mapped[str] = mapped_column(String(3), nullable=False)  # 'out' | 'in'
    # NULL với sổ đến (chung 2 đơn vị); bắt buộc với sổ đi.
    unit_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("units.id"))
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # "Công văn", "Quyết định"
    code: Mapped[str] = mapped_column(String(20), nullable=False)  # "CV", "QĐ"
    number_format: Mapped[str] = mapped_column(String(100), nullable=False)
    reset_policy: Mapped[str] = mapped_column(String(10), nullable=False, default="year")
    zero_pad: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=3)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class NumberingRegistry(Base):
    __tablename__ = "numbering_registry"
    __table_args__ = (
        UniqueConstraint("doc_type_id", "period_key", name="uq_numbering_type_period"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    doc_type_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("document_types.id"), nullable=False
    )
    period_key: Mapped[str] = mapped_column(String(7), nullable=False)  # '2026' | '2026-06' | 'all'
    sequence_name: Mapped[str] = mapped_column(String(120), nullable=False)
