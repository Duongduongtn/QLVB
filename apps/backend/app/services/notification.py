"""Thông báo trong app (chuông header) — E2/E3. Polling (TDD §12, không WebSocket).

`create` chỉ flush — caller commit cùng transaction nghiệp vụ (giao việc + noti cùng sống).
"""

from __future__ import annotations

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.notification import Notification


def create(db: Session, *, user_id: int, type: str, message: str, link: str | None = None) -> None:
    db.add(Notification(user_id=user_id, type=type, message=message, link=link))
    db.flush()


def list_mine(
    db: Session, user_id: int, *, page: int = 1, size: int = 20
) -> tuple[list[Notification], int]:
    base = Notification.user_id == user_id
    total = db.scalar(select(func.count()).select_from(Notification).where(base)) or 0
    rows = db.scalars(
        select(Notification)
        .where(base)
        .order_by(Notification.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    ).all()
    return list(rows), total


def unread_count(db: Session, user_id: int) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        )
        or 0
    )


def mark_read(db: Session, notif_id: int, user_id: int) -> None:
    # CHỈ đánh dấu thông báo của chính mình (chống IDOR).
    db.execute(
        update(Notification)
        .where(Notification.id == notif_id, Notification.user_id == user_id)
        .values(is_read=True)
    )
    db.commit()


def mark_all_read(db: Session, user_id: int) -> None:
    db.execute(
        update(Notification)
        .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
