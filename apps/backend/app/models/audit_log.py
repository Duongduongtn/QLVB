"""AuditLog model — polymorphic mềm (TDD §3.2, QĐ #9).

KHÔNG FK cứng cho user_id / object_id: log phải SỐNG SÓT kể cả khi CV/user bị
xoá vĩnh viễn (H3, yêu cầu pháp lý truy vết). `object_type` + `object_id` trỏ tới
bất kỳ loại object nào (outgoing_document, incoming_document, user, seal...).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import BigInteger, Index, String, Text
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("idx_audit_object", "object_type", "object_id"),
        Index("idx_audit_user_time", "user_id", "created_at"),
        Index("idx_audit_created", "created_at"),  # liệt kê/lọc theo thời gian (bảng append-heavy)
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger)  # KHÔNG FK — polymorphic mềm
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    object_type: Mapped[str | None] = mapped_column(String(30))
    object_id: Mapped[int | None] = mapped_column(BigInteger)
    ip: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(Text)
    detail: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
