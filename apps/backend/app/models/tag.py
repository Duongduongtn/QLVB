"""Tag tự do (F2) — gắn nhãn CV để nhóm chủ đề.

`tags.name` đã CHUẨN HOÁ (chữ thường + bỏ dấu + gạch ngang) → UNIQUE chống trùng
`#Thi Tay Nghề` vs `#thi-tay-nghe`. `document_tags` polymorphic (incoming|outgoing) —
không FK cứng tới CV (1 bảng gắn cho cả 2 sổ), PK (tag_id, object_type, object_id).
"""

from __future__ import annotations

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Identity, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)


class DocumentTag(Base):
    __tablename__ = "document_tags"
    __table_args__ = (
        CheckConstraint("object_type IN ('incoming','outgoing')", name="ck_doctag_type"),
        Index("idx_doctag_object", "object_type", "object_id"),
    )

    tag_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )
    object_type: Mapped[str] = mapped_column(String(20), primary_key=True)
    object_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
