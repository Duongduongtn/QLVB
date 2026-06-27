"""OutgoingDocument + OutgoingRecipient — CV ĐI (Nhóm D, TDD §dòng 352-385).

`status` máy trạng thái: draft → numbered (đã đốt 1 số, chưa upload file ký số) →
published (đã upload file đã ký số) | cancelled. `stamp_positions` JSONB lưu toạ độ %
mộc/chữ ký đã chèn (QĐ #2 — % để page resize không lệch). `sealing_option` JSONB lưu
giáp lai (D3) + ký nháy (D4).

Defer (story sau): `in_reply_to` (D5 — cần incoming_documents); `search_vector` TSVECTOR
(F1 full-text).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin


class OutgoingDocument(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "outgoing_documents"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','numbered','published','cancelled')", name="ck_out_status"
        ),
        Index(
            "idx_out_unit_status",
            "unit_id",
            "status",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # Chống trùng số trong sổ (loại VB + kỳ) — lưới an toàn DB cho nhánh dùng số có sẵn.
        Index(
            "uq_out_number",
            "doc_type_id",
            "period_key",
            "number_int",
            unique=True,
            postgresql_where=text("deleted_at IS NULL AND number_int IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    unit_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("units.id"), nullable=False)
    doc_type_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("document_types.id"), nullable=False
    )
    number: Mapped[str | None] = mapped_column(String(100))  # "247/CV-GDNN"; NULL khi draft
    number_int: Mapped[int | None] = mapped_column(BigInteger)  # STT để sort/check trùng
    period_key: Mapped[str | None] = mapped_column(String(7))  # '2026'
    subject: Mapped[str] = mapped_column(Text, nullable=False)  # trích yếu
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="draft")
    signing_profile_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("signing_profiles.id")
    )
    stamp_positions: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    sealing_option: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    original_file_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("files.id"))
    signed_file_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("files.id"))
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class OutgoingRecipient(Base):
    """M2M CV đi ↔ nơi nhận (organizations). Nhiều nơi nhận / 1 CV."""

    __tablename__ = "outgoing_recipients"

    outgoing_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("outgoing_documents.id", ondelete="CASCADE"),
        primary_key=True,
    )
    organization_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("organizations.id"), primary_key=True
    )
