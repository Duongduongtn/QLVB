"""Nghiệp vụ quản lý người dùng — A4 (USR.MNG, chỉ Quản lý).

Bất biến (PRD A4 edge):
- Tên đăng nhập trùng (trong số chưa xoá) → từ chối (kiểm app-level + bắt UNIQUE DB).
- Quản lý KHÔNG tự khoá / tự xoá chính mình.
- Luôn còn ít nhất 1 Quản lý ĐANG HOẠT ĐỘNG → không cho hạ role/khoá/xoá người cuối.
  Thao tác đụng quyền Quản lý được serialize bằng advisory lock (chống race 2 admin).
- Khoá / reset pass / xoá → kick mọi phiên SAU khi commit DB (side-effect ngoài giao dịch).
- Xoá = soft delete (set deleted_at), giữ record cho truy vết + reference created_by.
Mọi thao tác ghi audit_logs.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import Select, func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.security import generate_temp_password, hash_password
from app.models.user import User
from app.schemas.user import UserCreate, UserStats, UserUpdate
from app.services.audit import log_action
from app.services.session import kick_sessions

# Khoá advisory cố định: serialize mọi thao tác đụng quyền Quản lý trong 1 transaction
# → tránh race "2 admin cùng hạ/khoá 2 manager khác nhau" làm còn 0 Quản lý.
_MANAGER_GUARD_LOCK = 480423


def _not_deleted() -> Select[tuple[User]]:
    return select(User).where(User.deleted_at.is_(None))


def _lock_manager_guard(db: Session) -> None:
    db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _MANAGER_GUARD_LOCK})


def _active_manager_count(db: Session, *, exclude_id: int | None = None) -> int:
    stmt = (
        select(func.count())
        .select_from(User)
        .where(User.deleted_at.is_(None), User.role == "manager", User.is_active.is_(True))
    )
    if exclude_id is not None:
        stmt = stmt.where(User.id != exclude_id)
    return db.scalar(stmt) or 0


def list_users(
    db: Session, *, q: str | None, page: int, size: int
) -> tuple[list[User], int, UserStats]:
    base = _not_deleted()
    if q:
        like = f"%{q.strip()}%"
        base = base.where(
            or_(User.username.ilike(like), User.full_name.ilike(like), User.email.ilike(like))
        )

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = list(
        db.scalars(
            base.order_by(User.created_at.desc()).offset((page - 1) * size).limit(size)
        ).all()
    )

    def _count(*conds: object) -> int:
        return db.scalar(select(func.count()).select_from(User).where(*conds)) or 0  # type: ignore[arg-type]

    stats = UserStats(
        total=_count(User.deleted_at.is_(None)),
        managers=_count(User.deleted_at.is_(None), User.role == "manager"),
        staff=_count(User.deleted_at.is_(None), User.role == "staff"),
        locked=_count(User.deleted_at.is_(None), User.is_active.is_(False)),
    )
    return items, total, stats


def create_user(
    db: Session, data: UserCreate, *, actor: User, ip: str | None, ua: str | None
) -> User:
    if db.scalar(_not_deleted().where(User.username == data.username)) is not None:
        raise Conflict("Tên đăng nhập đã tồn tại")

    user = User(
        username=data.username,
        full_name=data.full_name,
        email=data.email,
        role=data.role,
        password_hash=hash_password(data.password),
        is_active=True,
    )
    db.add(user)
    db.flush()
    log_action(
        db,
        action="user_create",
        user_id=actor.id,
        object_type="user",
        object_id=user.id,
        ip=ip,
        user_agent=ua,
        detail={"username": user.username, "role": user.role},
    )
    try:
        db.commit()
    except IntegrityError as exc:  # race trùng username giữa check và INSERT (UNIQUE DB chặn)
        db.rollback()
        raise Conflict("Tên đăng nhập đã tồn tại") from exc
    db.refresh(user)
    return user


def update_user(
    db: Session, user_id: int, data: UserUpdate, *, actor: User, ip: str | None, ua: str | None
) -> User:
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise NotFound("Không tìm thấy người dùng")

    changes = data.model_dump(exclude_unset=True)
    locking = changes.get("is_active") is False and user.is_active
    demoting = "role" in changes and changes["role"] != "manager" and user.role == "manager"

    if locking and user.id == actor.id:
        raise ValidationFailed("Không thể tự khoá tài khoản của chính mình")

    if (locking or demoting) and user.role == "manager" and user.is_active:
        _lock_manager_guard(db)
        if _active_manager_count(db, exclude_id=user.id) == 0:
            raise ValidationFailed("Phải còn ít nhất một Quản lý đang hoạt động")

    for field, value in changes.items():
        setattr(user, field, value)

    log_action(
        db,
        action="user_update",
        user_id=actor.id,
        object_type="user",
        object_id=user.id,
        ip=ip,
        user_agent=ua,
        detail={"changed": sorted(changes.keys()), "locked": locking},
    )
    db.commit()
    db.refresh(user)
    if locking:
        kick_sessions(user.id)  # side-effect sau khi DB đã chốt
    return user


def reset_password(
    db: Session, user_id: int, *, actor: User, ip: str | None, ua: str | None
) -> str:
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise NotFound("Không tìm thấy người dùng")

    new_password = generate_temp_password()
    user.password_hash = hash_password(new_password)
    log_action(
        db,
        action="user_reset_password",
        user_id=actor.id,
        object_type="user",
        object_id=user.id,
        ip=ip,
        user_agent=ua,
        detail={"reset": True},
    )
    db.commit()
    kick_sessions(user.id)  # pass cũ vô hiệu + đẩy mọi phiên đang mở, sau commit
    return new_password


def delete_user(db: Session, user_id: int, *, actor: User, ip: str | None, ua: str | None) -> None:
    """Xoá mềm (PRD A4 edge): set deleted_at, giữ record cho truy vết."""
    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise NotFound("Không tìm thấy người dùng")
    if user.id == actor.id:
        raise ValidationFailed("Không thể tự xoá tài khoản của chính mình")
    if user.role == "manager" and user.is_active:
        _lock_manager_guard(db)
        if _active_manager_count(db, exclude_id=user.id) == 0:
            raise ValidationFailed("Phải còn ít nhất một Quản lý đang hoạt động")

    user.deleted_at = datetime.now(UTC)
    log_action(
        db,
        action="user_delete",
        user_id=actor.id,
        object_type="user",
        object_id=user.id,
        ip=ip,
        user_agent=ua,
        detail={"username": user.username},
    )
    db.commit()
    kick_sessions(user.id)
