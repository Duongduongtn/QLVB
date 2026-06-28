"""Nghiệp vụ danh bạ cơ quan — M1 (nơi nhận) + M2 (cơ quan gửi).

Bất biến (PRD M1/M2):
- Cả Quản lý lẫn Nhân viên đều CRUD (KHÔNG manager-only).
- Soft delete (deleted_at) → CV cũ vẫn trỏ tới được.
- Chống trùng TUYỆT ĐỐI: cùng tên + cùng địa chỉ (khác địa chỉ thì cho tạo).
Mọi thao tác ghi audit_logs.

Defer (phụ thuộc Nhóm D/E): thống kê số CV/lần cuối, fuzzy-match + merge + auto-tạo
khi vào sổ CV đến (M2) — làm cùng E1.
"""

from __future__ import annotations

from datetime import date, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.errors import Conflict, NotFound
from app.models.incoming_document import IncomingDocument
from app.models.organization import Organization
from app.models.outgoing_document import OutgoingDocument, OutgoingRecipient
from app.schemas.organization import OrganizationCreate, OrganizationUpdate
from app.services.audit import log_action

_VN_TZ = timezone(timedelta(hours=7))  # Asia/Saigon — quy "ngày hoạt động" về giờ VN


def list_organizations(
    db: Session,
    *,
    role: str,
    category: str | None = None,
    q: str | None = None,
    page: int = 1,
    size: int = 20,
) -> tuple[list[Organization], int]:
    """Danh sách cơ quan theo vai (recipient/sender), còn hoạt động. Lọc category +
    tìm theo tên/viết tắt + phân trang. Trả (items, total)."""
    role_col = Organization.is_recipient if role == "recipient" else Organization.is_sender
    conds: list[ColumnElement[bool]] = [
        Organization.deleted_at.is_(None),
        role_col.is_(True),
    ]
    if category:
        conds.append(Organization.category == category)
    if q:
        like = f"%{q.strip()}%"
        conds.append(Organization.full_name.ilike(like) | Organization.short_name.ilike(like))

    total = db.scalar(select(func.count()).select_from(Organization).where(*conds)) or 0
    stmt = (
        select(Organization)
        .where(*conds)
        .order_by(Organization.full_name)
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(db.scalars(stmt).all()), total


def org_doc_stats(
    db: Session, *, role: str, org_ids: list[int], include_manager_only: bool = True
) -> dict[int, tuple[int, date | None]]:
    """Thống kê số CV + ngày hoạt động gần nhất theo từng cơ quan (batch, tránh N+1).

    recipient → số CV ĐI đã gửi tới + ngày phát hành gần nhất (issue_date).
    sender → số CV ĐẾN nhận từ + ngày tiếp nhận gần nhất (created_at, quy giờ VN).
    Chỉ tính CV đã phát hành (đi)/đã vào sổ (đến) — loại nháp + huỷ (giữ số) + chưa xoá.
    Trả {org_id: (count, last_date)}.
    `include_manager_only=False` (Nhân viên) → KHÔNG đếm CV đến "Chỉ Quản lý xem" (không
    để lộ tồn tại CV mật qua con số tổng)."""
    if not org_ids:
        return {}
    if role == "recipient":
        sent_rows = db.execute(
            select(
                OutgoingRecipient.organization_id,
                func.count(func.distinct(OutgoingDocument.id)),
                func.max(OutgoingDocument.issue_date),
            )
            .join(OutgoingDocument, OutgoingDocument.id == OutgoingRecipient.outgoing_id)
            .where(
                OutgoingRecipient.organization_id.in_(org_ids),
                OutgoingDocument.deleted_at.is_(None),
                OutgoingDocument.status == "published",  # đã phát hành (loại nháp/cấp-số-dở/huỷ)
            )
            .group_by(OutgoingRecipient.organization_id)
        ).all()
        return {int(oid): (int(c), d) for oid, c, d in sent_rows}

    recv_conds: list[ColumnElement[bool]] = [
        IncomingDocument.sender_org_id.in_(org_ids),
        IncomingDocument.deleted_at.is_(None),
        IncomingDocument.status == "registered",  # đã vào sổ (loại nháp + huỷ giữ số)
    ]
    if not include_manager_only:
        recv_conds.append(IncomingDocument.manager_only.is_(False))
    recv_rows = db.execute(
        select(
            IncomingDocument.sender_org_id,
            func.count(),
            func.max(IncomingDocument.created_at),
        )
        .where(*recv_conds)
        .group_by(IncomingDocument.sender_org_id)
    ).all()
    return {
        int(oid): (int(c), dt.astimezone(_VN_TZ).date() if dt is not None else None)
        for oid, c, dt in recv_rows
    }


def get_organization(db: Session, org_id: int) -> Organization:
    org = db.get(Organization, org_id)
    if org is None or org.deleted_at is not None:
        raise NotFound("Không tìm thấy cơ quan")
    return org


def _assert_no_duplicate(
    db: Session, *, full_name: str, address: str | None, exclude_id: int | None = None
) -> None:
    """Chặn trùng TUYỆT ĐỐI: cùng tên (không phân biệt hoa thường) + cùng địa chỉ."""
    stmt = select(Organization).where(
        Organization.deleted_at.is_(None),
        func.lower(Organization.full_name) == full_name.lower(),
    )
    if exclude_id is not None:
        stmt = stmt.where(Organization.id != exclude_id)
    for other in db.scalars(stmt).all():
        if (other.address or "").strip() == (address or "").strip():
            raise Conflict("Đã có cơ quan trùng tên và địa chỉ trong danh bạ")


def create_organization(
    db: Session, data: OrganizationCreate, *, actor_id: int, ip: str | None, ua: str | None
) -> Organization:
    _assert_no_duplicate(db, full_name=data.full_name, address=data.address)
    org = Organization(
        full_name=data.full_name,
        short_name=data.short_name,
        address=data.address,
        email=data.email,
        phone=data.phone,
        contact_person=data.contact_person,
        note=data.note,
        is_recipient=data.role == "recipient",
        is_sender=data.role == "sender",
        category=data.category,
    )
    db.add(org)
    db.flush()
    log_action(
        db,
        action="org_create",
        user_id=actor_id,
        object_type="organization",
        object_id=org.id,
        ip=ip,
        user_agent=ua,
        detail={"role": data.role, "category": data.category},
    )
    db.commit()
    db.refresh(org)
    return org


def update_organization(
    db: Session, org_id: int, data: OrganizationUpdate, *, actor_id: int, ip: str | None, ua: str | None
) -> Organization:
    org = get_organization(db, org_id)
    changes = data.model_dump(exclude_unset=True)
    # Kiểm trùng nếu đổi tên hoặc địa chỉ.
    if "full_name" in changes or "address" in changes:
        _assert_no_duplicate(
            db,
            full_name=changes.get("full_name", org.full_name),
            address=changes.get("address", org.address),
            exclude_id=org.id,
        )
    for field, value in changes.items():
        setattr(org, field, value)
    log_action(
        db,
        action="org_update",
        user_id=actor_id,
        object_type="organization",
        object_id=org.id,
        ip=ip,
        user_agent=ua,
        detail={"changed": sorted(changes.keys())},
    )
    db.commit()
    db.refresh(org)
    return org


def delete_organization(
    db: Session, org_id: int, *, actor_id: int, ip: str | None, ua: str | None
) -> None:
    """Soft delete — giữ row để CV cũ vẫn trỏ tới (PRD M1 edge)."""
    org = get_organization(db, org_id)
    org.deleted_at = func.now()
    log_action(
        db,
        action="org_delete",
        user_id=actor_id,
        object_type="organization",
        object_id=org.id,
        ip=ip,
        user_agent=ua,
    )
    db.commit()
