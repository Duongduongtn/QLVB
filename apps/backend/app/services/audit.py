"""Ghi audit_logs — polymorphic mềm (TDD §3.2, QĐ #9; PRD H3).

Mọi thao tác cần truy vết (login, tạo/sửa/xoá, phát hành số, tải file...) gọi qua
đây. Chỉ `flush()` — caller chịu trách nhiệm `commit()` cùng transaction nghiệp vụ
để log và thay đổi dữ liệu cùng sống/cùng chết.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.models.audit_log import AuditLog
from app.models.user import User

_VN_TZ = timezone(timedelta(hours=7))  # Asia/Saigon — biên ngày lọc theo giờ VN


def _escape_like(s: str) -> str:
    """Escape wildcard LIKE để người dùng gõ %/_ không cho kết quả sai."""
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def log_action(
    db: Session,
    *,
    action: str,
    user_id: int | None = None,
    object_type: str | None = None,
    object_id: int | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action=action,
            object_type=object_type,
            object_id=object_id,
            ip=ip,
            user_agent=user_agent,
            detail=detail,
        )
    )
    db.flush()


def list_logs(
    db: Session,
    *,
    user_id: int | None = None,
    action: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    page: int = 1,
    size: int = 30,
) -> tuple[list[tuple[AuditLog, str | None]], int]:
    """Nhật ký + tên đăng nhập người thao tác (join mềm User). Lọc user/action/khoảng
    ngày (biên theo giờ VN) + tìm theo action/object_type/username. Trả (list[(log, username)], total)."""
    conds: list[ColumnElement[bool]] = []
    if user_id is not None:
        conds.append(AuditLog.user_id == user_id)
    if action:
        conds.append(AuditLog.action == action)
    if date_from is not None:
        conds.append(AuditLog.created_at >= datetime.combine(date_from, datetime.min.time(), _VN_TZ))
    if date_to is not None:
        # bao trọn ngày kết thúc (đến 24h hôm sau, giờ VN).
        end = datetime.combine(date_to + timedelta(days=1), datetime.min.time(), _VN_TZ)
        conds.append(AuditLog.created_at < end)
    if q:
        like = f"%{_escape_like(q.strip())}%"
        conds.append(
            AuditLog.action.ilike(like, escape="\\")
            | AuditLog.object_type.ilike(like, escape="\\")
            | User.username.ilike(like, escape="\\")
        )

    # outerjoin cả ở count (vì điều kiện q có thể đụng User.username).
    total = (
        db.scalar(
            select(func.count())
            .select_from(AuditLog)
            .outerjoin(User, User.id == AuditLog.user_id)
            .where(*conds)
        )
        or 0
    )
    stmt = (
        select(AuditLog, User.username)
        .outerjoin(User, User.id == AuditLog.user_id)
        .where(*conds)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return [(row[0], row[1]) for row in db.execute(stmt).all()], total


def list_actions(db: Session) -> list[str]:
    """Danh sách action phân biệt (cho dropdown lọc)."""
    return list(db.scalars(select(AuditLog.action).distinct().order_by(AuditLog.action)).all())
