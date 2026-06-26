"""Ghi audit_logs — polymorphic mềm (TDD §3.2, QĐ #9; PRD H3).

Mọi thao tác cần truy vết (login, tạo/sửa/xoá, phát hành số, tải file...) gọi qua
đây. Chỉ `flush()` — caller chịu trách nhiệm `commit()` cùng transaction nghiệp vụ
để log và thay đổi dữ liệu cùng sống/cùng chết.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


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
