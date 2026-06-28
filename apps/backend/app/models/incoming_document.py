"""IncomingDocument — CV ĐẾN (Nhóm E, sổ chung 2 đơn vị).

`status`: draft (mới upload, đang OCR/sửa) → registered (đã cấp số đến) | cancelled.
Sổ ĐẾN dùng chung 2 đơn vị → `doc_type_id` trỏ loại VB hướng 'incoming' (unit_id NULL).
Dedup 3 lớp (E1.6): `sha256` (lớp 1), (reference_number+sender_org_id+document_date) (lớp 2),
`ocr_text` similarity (lớp 3). `signature_status`/`signature_info`: verify PAdES (E1.5).
`manager_only`: cờ riêng "Chỉ Quản lý xem" — KHÔNG suy từ mức độ mật.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
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
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

URGENCY = ("normal", "urgent", "very_urgent", "express", "express_timed")
CONFIDENTIALITY = ("normal", "secret", "top_secret", "highest_secret")
SIG_STATUS = ("unchecked", "none", "valid", "invalid")


class IncomingDocument(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "incoming_documents"
    __table_args__ = (
        CheckConstraint("status IN ('draft','registered','cancelled')", name="ck_inc_status"),
        CheckConstraint(
            "urgency IN ('normal','urgent','very_urgent','express','express_timed')",
            name="ck_inc_urgency",
        ),
        CheckConstraint(
            "confidentiality IN ('normal','secret','top_secret','highest_secret')",
            name="ck_inc_confidentiality",
        ),
        CheckConstraint(
            "signature_status IN ('unchecked','none','valid','invalid')", name="ck_inc_sig"
        ),
        # Dedup lớp 1 (hash) + lớp 2 (metadata) — index hỗ trợ truy vấn trùng.
        Index("idx_inc_sha256", "sha256", postgresql_where=text("deleted_at IS NULL")),
        Index(
            "idx_inc_dup_meta",
            "reference_number",
            "sender_org_id",
            "document_date",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("idx_inc_status_created", "status", "created_at"),
        # Chống trùng số đến trong sổ chung (loại VB + kỳ).
        Index(
            "uq_inc_number",
            "doc_type_id",
            "period_key",
            "number_int",
            unique=True,
            postgresql_where=text("deleted_at IS NULL AND number_int IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    number: Mapped[str | None] = mapped_column(String(100))  # số đến; NULL khi draft
    number_int: Mapped[int | None] = mapped_column(BigInteger)
    period_key: Mapped[str | None] = mapped_column(String(7))
    doc_type_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("document_types.id"))

    reference_number: Mapped[str | None] = mapped_column(String(100))  # số ký hiệu CQ gửi
    document_date: Mapped[date | None] = mapped_column(Date)  # ngày văn bản
    sender_org_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("organizations.id"))
    # Tên cơ quan gửi free-text — dùng khi cơ quan CHƯA có trong danh bạ (auto-fill từ chữ
    # ký số / OCR). Khi khớp được danh bạ thì gắn sender_org_id, vẫn giữ tên để hiển thị.
    sender_org_name: Mapped[str | None] = mapped_column(String(200))
    subject: Mapped[str | None] = mapped_column(Text)  # trích yếu
    urgency: Mapped[str] = mapped_column(String(14), nullable=False, default="normal")
    confidentiality: Mapped[str] = mapped_column(String(16), nullable=False, default="normal")
    deadline: Mapped[date | None] = mapped_column(Date)
    manager_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    file_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("files.id"))
    sha256: Mapped[str | None] = mapped_column(String(64))  # hash file gốc (dedup lớp 1)
    ocr_text: Mapped[str | None] = mapped_column(Text)

    signature_status: Mapped[str] = mapped_column(String(10), nullable=False, default="unchecked")
    signature_info: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    # F1 full-text — do trigger DB cập nhật (BEFORE INS/UPD); manager_only loại ocr_text.
    search_vector: Mapped[Any | None] = mapped_column(TSVECTOR)

    status: Mapped[str] = mapped_column(String(12), nullable=False, default="draft")
    duplicate_note: Mapped[str | None] = mapped_column(Text)  # lý do "vẫn lưu" khi trùng
    cancel_reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
