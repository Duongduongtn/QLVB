"""Phân công + theo dõi xử lý CV đến — E2 (giao việc) + E3 (cập nhật trạng thái).

1 CV đến → giao GDNN / DVDL / Cả 2: mỗi đơn vị 1 ProcessingTask độc lập. Giao lại =
đổi assignee → noti cả người cũ + mới. Người được giao tự cập nhật trạng thái (E3).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound, PermissionDenied, ValidationFailed
from app.models.incoming_document import IncomingDocument
from app.models.processing_task import ProcessingTask
from app.models.unit import Unit
from app.models.user import User
from app.services import notification
from app.services.audit import log_action


def _active_user(db: Session, user_id: int) -> User:
    u = db.get(User, user_id)
    if u is None or u.deleted_at is not None or not u.is_active:
        raise ValidationFailed("Người xử lý không hợp lệ hoặc đã bị khoá")
    return u


def _coarse_status(total: int, done: int, in_progress: int) -> str | None:
    """Gộp trạng thái nhiều task của 1 CV → 1 nhãn cho badge danh sách (E2).
    None = chưa giao; 'done' = mọi task xong; 'processing' = đang xử lý/xong dở; 'assigned'
    = đã giao nhưng chưa ai bắt đầu."""
    if total == 0:
        return None
    if done == total:
        return "done"
    if in_progress > 0 or done > 0:
        return "processing"
    return "assigned"


def summary_for_incomings(db: Session, incoming_ids: list[int]) -> dict[int, dict[str, Any]]:
    """Tổng hợp phân công theo từng CV đến (1 query, tránh N+1) → {id: {task_total, task_status}}.
    Dùng cho badge 'Đã giao' trên sổ CV đến (E2)."""
    if not incoming_ids:
        return {}
    rows = db.execute(
        select(ProcessingTask.incoming_id, ProcessingTask.status, func.count())
        .where(ProcessingTask.incoming_id.in_(incoming_ids))
        .group_by(ProcessingTask.incoming_id, ProcessingTask.status)
    ).all()
    agg: dict[int, dict[str, int]] = {}
    for inc_id, status, cnt in rows:
        d = agg.setdefault(inc_id, {"total": 0, "done": 0, "in_progress": 0})
        d["total"] += cnt
        if status == "done":
            d["done"] += cnt
        elif status == "in_progress":
            d["in_progress"] += cnt
    return {
        inc_id: {
            "task_total": d["total"],
            "task_status": _coarse_status(d["total"], d["done"], d["in_progress"]),
        }
        for inc_id, d in agg.items()
    }


def assign(
    db: Session,
    incoming_id: int,
    assignments: list[dict[str, Any]],
    *,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> list[ProcessingTask]:
    """Giao việc: mỗi phần tử {unit_id, assignee_id, deadline?, note?}. 1 task/đơn vị —
    đã có thì đổi người (reassign + noti người cũ). Mọi thay đổi đều noti người mới."""
    inc = db.get(IncomingDocument, incoming_id)
    if inc is None or inc.deleted_at is not None:
        raise NotFound("Không tìm thấy công văn đến")
    if not assignments:
        raise ValidationFailed("Chọn ít nhất 1 đơn vị xử lý")

    tasks: list[ProcessingTask] = []
    for a in assignments:
        unit_id = int(a["unit_id"])
        assignee_id = int(a["assignee_id"])
        if db.get(Unit, unit_id) is None:
            raise NotFound("Không tìm thấy đơn vị xử lý")
        _active_user(db, assignee_id)
        deadline = a.get("deadline")
        note = a.get("note")

        existing = db.scalars(
            select(ProcessingTask).where(
                ProcessingTask.incoming_id == incoming_id, ProcessingTask.unit_id == unit_id
            )
        ).first()
        if existing is not None:
            old_assignee = existing.assignee_id
            existing.assignee_id = assignee_id
            existing.deadline = deadline
            existing.note = note
            if existing.status == "done":
                existing.status = "new"  # giao lại → mở lại việc
            if old_assignee is not None and old_assignee != assignee_id:
                notification.create(
                    db, user_id=old_assignee, type="task_reassigned",
                    message=f"Việc xử lý CV đến {inc.number or '(nháp)'} đã chuyển cho người khác",
                    link="/viec-cua-toi",
                )
            tasks.append(existing)
        else:
            t = ProcessingTask(
                incoming_id=incoming_id,
                unit_id=unit_id,
                assignee_id=assignee_id,
                status="new",
                deadline=deadline,
                note=note,
                assigned_by=actor_id,
            )
            db.add(t)
            tasks.append(t)
        notification.create(
            db, user_id=assignee_id, type="task_assigned",
            message=f"Bạn được giao xử lý CV đến {inc.number or '(nháp)'}",
            link="/viec-cua-toi",
        )

    log_action(
        db,
        action="incoming_assign",
        user_id=actor_id,
        object_type="incoming_document",
        object_id=incoming_id,
        ip=ip,
        user_agent=ua,
        detail={"units": [int(a["unit_id"]) for a in assignments]},
    )
    try:
        db.commit()
    except IntegrityError as exc:  # đua tạo task trùng (incoming, unit)
        db.rollback()
        raise Conflict("Công văn vừa được phân công cho đơn vị này, thử lại") from exc
    for t in tasks:
        db.refresh(t)
    return tasks


def list_for_incoming(db: Session, incoming_id: int) -> list[ProcessingTask]:
    return list(
        db.scalars(
            select(ProcessingTask)
            .where(ProcessingTask.incoming_id == incoming_id)
            .order_by(ProcessingTask.unit_id)
        ).all()
    )


def list_my_tasks(
    db: Session, user_id: int, *, status: str | None = None, page: int = 1, size: int = 20
) -> tuple[list[tuple[ProcessingTask, IncomingDocument]], int]:
    conds = [ProcessingTask.assignee_id == user_id]
    if status:
        conds.append(ProcessingTask.status == status)
    total = db.scalar(select(func.count()).select_from(ProcessingTask).where(*conds)) or 0
    rows = db.execute(
        select(ProcessingTask, IncomingDocument)
        .join(IncomingDocument, IncomingDocument.id == ProcessingTask.incoming_id)
        .where(*conds)
        .order_by(ProcessingTask.deadline.is_(None), ProcessingTask.deadline, ProcessingTask.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    ).all()
    return [(r[0], r[1]) for r in rows], total


def _lock_task(db: Session, task_id: int) -> ProcessingTask:
    t = db.execute(
        select(ProcessingTask).where(ProcessingTask.id == task_id).with_for_update()
    ).scalar_one_or_none()
    if t is None:
        raise NotFound("Không tìm thấy việc xử lý")
    return t


def update_status(
    db: Session,
    task_id: int,
    *,
    status: str,
    result_note: str | None,
    actor_id: int,
    actor_role: str,
    ip: str | None,
    ua: str | None,
) -> ProcessingTask:
    """E3 — người được giao (hoặc Quản lý) cập nhật trạng thái xử lý."""
    if status not in ("new", "in_progress", "done"):
        raise ValidationFailed("Trạng thái không hợp lệ")
    t = _lock_task(db, task_id)
    if t.assignee_id != actor_id and actor_role != "manager":
        raise PermissionDenied("Chỉ người được giao hoặc Quản lý mới cập nhật được")
    t.status = status
    if result_note is not None:
        t.result_note = result_note
    log_action(
        db,
        action="task_update_status",
        user_id=actor_id,
        object_type="processing_task",
        object_id=t.id,
        ip=ip,
        user_agent=ua,
        detail={"status": status},
    )
    db.commit()
    db.refresh(t)
    return t


def reassign(
    db: Session,
    task_id: int,
    new_assignee_id: int,
    *,
    actor_id: int,
    actor_role: str,
    ip: str | None,
    ua: str | None,
) -> ProcessingTask:
    """E3 — chuyển việc cho người khác; noti cả người cũ và mới.

    CHỈ người đang giữ việc hoặc Quản lý được chuyển (chống IDOR — TDD §10.3)."""
    t = _lock_task(db, task_id)
    if t.assignee_id != actor_id and actor_role != "manager":
        raise PermissionDenied("Chỉ người được giao hoặc Quản lý mới chuyển việc được")
    _active_user(db, new_assignee_id)
    old = t.assignee_id
    t.assignee_id = new_assignee_id
    if t.status == "done":
        t.status = "new"  # người mới nhận việc chưa xử lý
    if old is not None and old != new_assignee_id:
        notification.create(
            db, user_id=old, type="task_reassigned",
            message="Một việc xử lý đã được chuyển cho người khác", link="/viec-cua-toi",
        )
    notification.create(
        db, user_id=new_assignee_id, type="task_assigned",
        message="Bạn được chuyển giao 1 việc xử lý CV đến", link="/viec-cua-toi",
    )
    log_action(
        db,
        action="task_reassign",
        user_id=actor_id,
        object_type="processing_task",
        object_id=t.id,
        ip=ip,
        user_agent=ua,
        detail={"from": old, "to": new_assignee_id},
    )
    db.commit()
    db.refresh(t)
    return t


def overdue(task: ProcessingTask, *, today: date) -> bool:
    """Quá hạn = có deadline < hôm nay VÀ chưa hoàn thành (E3 highlight đỏ)."""
    return task.deadline is not None and task.deadline < today and task.status != "done"


def notify_deadlines(db: Session, *, today: date) -> int:
    """Cron ngày (E3) — nhắc việc sắp tới hạn (ngày mai/hôm nay) + quá hạn, mỗi việc tối đa
    1 lần/ngày (cờ reminded_on chống spam). Trả số thông báo đã gửi."""
    soon = today + timedelta(days=1)
    rows = db.scalars(
        select(ProcessingTask).where(
            ProcessingTask.status != "done",
            ProcessingTask.assignee_id.is_not(None),
            ProcessingTask.deadline.is_not(None),
            ProcessingTask.deadline <= soon,
            or_(ProcessingTask.reminded_on.is_(None), ProcessingTask.reminded_on != today),
        )
    ).all()
    sent = 0
    for t in rows:
        assert t.deadline is not None and t.assignee_id is not None
        if t.deadline < today:
            msg = "Việc xử lý công văn đến đã QUÁ HẠN"
        elif t.deadline == today:
            msg = "Việc xử lý công văn đến đến hạn HÔM NAY"
        else:
            msg = "Việc xử lý công văn đến sắp tới hạn (ngày mai)"
        notification.create(db, user_id=t.assignee_id, type="task_due", message=msg, link="/viec-cua-toi")
        t.reminded_on = today
        sent += 1
    db.commit()
    return sent
