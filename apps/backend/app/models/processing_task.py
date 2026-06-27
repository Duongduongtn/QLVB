"""ProcessingTask — phân công xử lý CV đến (Nhóm E, E2 + E3).

1 CV đến phân công cho GDNN / DVDL / Cả 2 → mỗi đơn vị 1 task ĐỘC LẬP (1 xong, 1 chưa
xong vẫn được). `status`: new (mới giao) → in_progress → done. Đổi người xử lý = sửa
`assignee_id` + log + noti cho cả người cũ và mới (E3).
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin

TASK_STATUS = ("new", "in_progress", "done")


class ProcessingTask(Base, TimestampMixin):
    __tablename__ = "processing_tasks"
    __table_args__ = (
        CheckConstraint("status IN ('new','in_progress','done')", name="ck_task_status"),
        # Mỗi đơn vị chỉ 1 task / 1 CV đến (bất biến E2) — chống đua tạo trùng ở DB.
        UniqueConstraint("incoming_id", "unit_id", name="uq_task_incoming_unit"),
        Index("idx_task_assignee_status", "assignee_id", "status"),
        Index("idx_task_incoming", "incoming_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    incoming_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("incoming_documents.id", ondelete="CASCADE"), nullable=False
    )
    unit_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("units.id"), nullable=False)
    assignee_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="new")
    deadline: Mapped[date | None] = mapped_column(Date)
    reminded_on: Mapped[date | None] = mapped_column(Date)  # ngày đã nhắc gần nhất (chống spam)
    note: Mapped[str | None] = mapped_column(Text)  # ghi chú phân công
    result_note: Mapped[str | None] = mapped_column(Text)  # ghi chú xử lý (E3)
    assigned_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
