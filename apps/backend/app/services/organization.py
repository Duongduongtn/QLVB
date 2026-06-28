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

from sqlalchemy import case, delete, func, select, text, update
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.errors import Conflict, NotFound, ValidationFailed
from app.models.incoming_document import IncomingDocument
from app.models.organization import Organization
from app.models.outgoing_document import OutgoingDocument, OutgoingRecipient
from app.schemas.organization import OrganizationCreate, OrganizationUpdate
from app.services.audit import log_action

_VN_TZ = timezone(timedelta(hours=7))  # Asia/Saigon — quy "ngày hoạt động" về giờ VN
_SIMILAR_THRESHOLD = 0.3  # pg_trgm similarity tối thiểu để GỢI Ý trùng (nới để bắt biến thể)

# Thứ tự mức khẩn (M2 — "mức khẩn trung bình"): ordinal hoá để tính AVG rồi quy lại nhãn.
_URGENCY_ORDER = {"normal": 0, "urgent": 1, "very_urgent": 2, "express": 3, "express_timed": 4}
_URGENCY_BY_ORD = {v: k for k, v in _URGENCY_ORDER.items()}


def _urgency_label(avg: float) -> str:
    """Quy AVG ordinal mức khẩn về nhãn gần nhất (kẹp 0..4)."""
    return _URGENCY_BY_ORD[max(0, min(4, round(avg)))]


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


def sender_avg_urgency(
    db: Session, *, org_ids: list[int], include_manager_only: bool = True
) -> dict[int, str]:
    """M2 — mức khẩn TRUNG BÌNH của CV đến từ mỗi cơ quan gửi (đã vào sổ, chưa xoá).

    Ordinal hoá urgency → AVG → quy về nhãn gần nhất. Nhân viên (`include_manager_only=
    False`) KHÔNG tính CV "Chỉ Quản lý xem" (đồng bộ với org_doc_stats — không lộ CV mật).
    Trả {org_id: nhãn urgency}."""
    if not org_ids:
        return {}
    ord_col = case(
        (IncomingDocument.urgency == "urgent", 1),
        (IncomingDocument.urgency == "very_urgent", 2),
        (IncomingDocument.urgency == "express", 3),
        (IncomingDocument.urgency == "express_timed", 4),
        else_=0,
    )
    conds: list[ColumnElement[bool]] = [
        IncomingDocument.sender_org_id.in_(org_ids),
        IncomingDocument.deleted_at.is_(None),
        IncomingDocument.status == "registered",
    ]
    if not include_manager_only:
        conds.append(IncomingDocument.manager_only.is_(False))
    rows = db.execute(
        select(IncomingDocument.sender_org_id, func.avg(ord_col))
        .where(*conds)
        .group_by(IncomingDocument.sender_org_id)
    ).all()
    return {int(oid): _urgency_label(float(avg)) for oid, avg in rows if avg is not None}


def find_similar(
    db: Session,
    *,
    role: str,
    name: str,
    exclude_id: int | None = None,
    limit: int = 5,
) -> list[tuple[Organization, float]]:
    """M2 — tìm cơ quan TÊN GẦN GIỐNG (pg_trgm) để gợi ý "có phải cơ quan X?" + gộp trùng.

    Dùng operator `%` (similarity ≥ ngưỡng GUC) trên `f_unaccent(full_name)` → khớp biến thể
    hoa/thường + dấu ("Bộ Tài chính" ~ "Bộ Tài Chính"). pg_trgm tự fold lowercase. Trả
    [(org, similarity)] sắp xếp giảm dần. Yêu cầu Postgres (pg_trgm) — chạy trên CI/prod."""
    name = (name or "").strip()
    if not name:
        return []
    role_col = Organization.is_recipient if role == "recipient" else Organization.is_sender
    sim = func.similarity(func.f_unaccent(Organization.full_name), func.f_unaccent(name)).label("sim")
    # Ngưỡng theo GUC để operator % dùng GIN index (giá trị từ hằng nội bộ, không phải input).
    db.execute(text(f"SET LOCAL pg_trgm.similarity_threshold = {_SIMILAR_THRESHOLD}"))
    conds: list[ColumnElement[bool]] = [
        Organization.deleted_at.is_(None),
        role_col.is_(True),
        func.f_unaccent(Organization.full_name).op("%")(func.f_unaccent(name)),
    ]
    if exclude_id is not None:
        conds.append(Organization.id != exclude_id)
    rows = db.execute(
        select(Organization, sim).where(*conds).order_by(sim.desc()).limit(limit)
    ).all()
    return [(org, float(s)) for org, s in rows]


def merge_organizations(
    db: Session, *, source_id: int, target_id: int, actor_id: int, ip: str | None, ua: str | None
) -> Organization:
    """M2 — GỘP cơ quan: chuyển HẾT CV của `source` sang `target` rồi soft-delete `source`.

    - CV đến: `incoming_documents.sender_org_id` source → target.
    - Nơi nhận CV đi (M2M `outgoing_recipients`, PK kép): xoá row source TRÙNG cặp
      (outgoing_id, target) trước → tránh đụng PK → rồi đổi phần còn lại source → target.
    - Gộp vai: target nhận thêm cờ is_recipient/is_sender của source.
    - source soft-delete (giữ row cho audit/CV cũ tham chiếu lịch sử)."""
    if source_id == target_id:
        raise ValidationFailed("Không thể gộp một cơ quan vào chính nó")
    src = get_organization(db, source_id)  # raise nếu không có / đã xoá
    dst = get_organization(db, target_id)

    opts = {"synchronize_session": False}
    db.execute(
        update(IncomingDocument)
        .where(IncomingDocument.sender_org_id == source_id)
        .values(sender_org_id=target_id)
        .execution_options(**opts)
    )
    # Xoá row nơi nhận của source mà CV đó ĐÃ có target (chống đụng PK khi đổi id).
    already = select(OutgoingRecipient.outgoing_id).where(
        OutgoingRecipient.organization_id == target_id
    )
    db.execute(
        delete(OutgoingRecipient)
        .where(
            OutgoingRecipient.organization_id == source_id,
            OutgoingRecipient.outgoing_id.in_(already),
        )
        .execution_options(**opts)
    )
    db.execute(
        update(OutgoingRecipient)
        .where(OutgoingRecipient.organization_id == source_id)
        .values(organization_id=target_id)
        .execution_options(**opts)
    )

    dst.is_recipient = dst.is_recipient or src.is_recipient
    dst.is_sender = dst.is_sender or src.is_sender
    src.deleted_at = func.now()
    log_action(
        db,
        action="org_merge",
        user_id=actor_id,
        object_type="organization",
        object_id=target_id,
        ip=ip,
        user_agent=ua,
        detail={"source_id": source_id, "target_id": target_id, "source_name": src.full_name},
    )
    db.commit()
    db.refresh(dst)
    return dst


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
