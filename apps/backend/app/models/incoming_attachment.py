"""IncomingAttachment — phụ lục đính kèm CV đến (E4).

Mỗi phụ lục (PDF/Excel/ảnh) = 1 dòng trỏ tới `files` (lưu mã hoá phong bì như file CV
chính). Phụ lục PDF được OCR (worker ghi `ocr_text`) để tìm kiếm full-text (F1).
Ràng buộc dung lượng (≤50MB/file, ≤500MB tổng/CV) enforce ở service.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class IncomingAttachment(Base, TimestampMixin):
    __tablename__ = "incoming_attachments"
    __table_args__ = (Index("idx_inc_att_incoming", "incoming_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    incoming_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("incoming_documents.id", ondelete="CASCADE"), nullable=False
    )
    file_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("files.id"), nullable=False)
    original_name: Mapped[str | None] = mapped_column(String(300))
    mime_type: Mapped[str | None] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    ocr_text: Mapped[str | None] = mapped_column(Text)  # NULL nếu chưa OCR / phụ lục không OCR
    uploaded_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    # F1 — do trigger DB cập nhật từ ocr_text (BEFORE INS/UPD). Bất biến: CV cha manager_only →
    # search_vector = NULL (không index OCR mật, parity parent 0015). CHỈ truy cập qua join CV cha
    # đã lọc manager_only (services/search.global_search) — KHÔNG query thẳng cột này.
    search_vector: Mapped[Any | None] = mapped_column(TSVECTOR)
