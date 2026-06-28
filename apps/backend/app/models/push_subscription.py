"""PushSubscription — đăng ký Web Push của 1 trình duyệt/thiết bị (L1 PWA).

Mỗi lần user bấm "Bật thông báo" trên 1 thiết bị → lưu 1 subscription (endpoint +
khoá mã hoá p256dh/auth do trình duyệt sinh). 1 user có nhiều thiết bị. Khi endpoint
hết hạn (push service trả 404/410) thì xoá. KHÔNG lưu nội dung CV — chỉ kênh đẩy.
"""

from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PushSubscription(Base, TimestampMixin):
    __tablename__ = "push_subscriptions"
    __table_args__ = (Index("idx_push_sub_user", "user_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # endpoint là URL duy nhất của push service cho subscription này → khoá chống trùng.
    endpoint: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(300))
