"""Tag tự do (F2) — gắn nhãn CV, gợi ý, lọc, thống kê.

Chuẩn hoá tên tag (chữ thường + bỏ dấu + gạch ngang) để `#Thi Tay Nghề` và `#thi-tay-nghe`
về CÙNG 1 tag. Polymorphic: 1 bảng `document_tags` gắn cho cả CV đi (outgoing) + CV đến
(incoming). Đếm/lọc TÔN TRỌNG `manager_only` (NV không thấy CV đến chỉ-Quản-lý-xem).
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from sqlalchemy import and_, func, literal, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ValidationFailed
from app.models.incoming_document import IncomingDocument
from app.models.outgoing_document import OutgoingDocument
from app.models.tag import DocumentTag, Tag
from app.services.audit import log_action

_OBJECT_TYPES = ("incoming", "outgoing")
_MAX_TAGS_PER_DOC = 30


def normalize_tag(name: str) -> str:
    """'#Thi Tay Nghề' → 'thi-tay-nghe'. Bỏ dấu + chữ thường + gạch ngang, gộp/trim gạch."""
    s = name.strip().lower().replace("đ", "d")
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")  # bỏ dấu kết hợp
    s = re.sub(r"[^a-z0-9]+", "-", s)  # mọi ký tự khác → gạch ngang
    return re.sub(r"-+", "-", s).strip("-")


def get_or_create_tag(db: Session, name: str) -> Tag:
    norm = normalize_tag(name)
    if not norm:
        raise ValidationFailed("Tên tag không hợp lệ")
    if len(norm) > 100:
        raise ValidationFailed("Tag quá dài (tối đa 100 ký tự)")
    tag = db.scalar(select(Tag).where(Tag.name == norm))
    if tag is not None:
        return tag
    try:
        # SAVEPOINT: đua tạo trùng chỉ hoàn tác INSERT này, KHÔNG rollback cả transaction
        # (tránh xoá mất các tag đã tạo + reads cùng lượt set_tags → FK lỗi + mất write).
        with db.begin_nested():
            tag = Tag(name=norm)
            db.add(tag)
            db.flush()
    except IntegrityError:
        tag = db.scalar(select(Tag).where(Tag.name == norm))
        if tag is None:
            raise
    return tag


def list_for(db: Session, object_type: str, object_id: int) -> list[str]:
    """Tên các tag của 1 CV (đã sắp xếp)."""
    rows = db.execute(
        select(Tag.name)
        .join(DocumentTag, DocumentTag.tag_id == Tag.id)
        .where(DocumentTag.object_type == object_type, DocumentTag.object_id == object_id)
        .order_by(Tag.name)
    ).all()
    return [r.name for r in rows]


def set_tags(
    db: Session,
    object_type: str,
    object_id: int,
    names: list[str],
    *,
    actor_id: int,
    ip: str | None,
    ua: str | None,
) -> list[str]:
    """Đặt LẠI toàn bộ tag cho 1 CV (thay thế tập cũ). Trả danh sách tag chuẩn hoá."""
    if object_type not in _OBJECT_TYPES:
        raise ValidationFailed("Loại đối tượng tag không hợp lệ")
    # Chuẩn hoá + khử trùng, giữ thứ tự xuất hiện.
    seen: set[str] = set()
    norm_names: list[str] = []
    for n in names:
        nm = normalize_tag(n)
        if nm and nm not in seen:
            seen.add(nm)
            norm_names.append(nm)
    if len(norm_names) > _MAX_TAGS_PER_DOC:
        raise ValidationFailed(f"Tối đa {_MAX_TAGS_PER_DOC} tag cho 1 công văn")

    tag_ids = [get_or_create_tag(db, nm).id for nm in norm_names]
    # Xoá tag cũ rồi gắn tag mới. ON CONFLICT DO NOTHING: 2 PUT song song cùng CV không 500
    # vì trùng PK composite (last-writer-wins, chấp nhận với tag).
    db.query(DocumentTag).filter(
        DocumentTag.object_type == object_type, DocumentTag.object_id == object_id
    ).delete(synchronize_session=False)
    if tag_ids:
        db.execute(
            pg_insert(DocumentTag)
            .values([
                {"tag_id": tid, "object_type": object_type, "object_id": object_id}
                for tid in tag_ids
            ])
            .on_conflict_do_nothing()
        )
    log_action(
        db,
        action="document_set_tags",
        user_id=actor_id,
        object_type=object_type,
        object_id=object_id,
        ip=ip,
        user_agent=ua,
        detail={"tags": norm_names},
    )
    db.commit()
    return norm_names


def _visible_tag_ids(include_manager_only: bool) -> Any:
    """Subquery tag_id có ≥1 CV người dùng được xem (ẩn tag chỉ gắn CV đến manager_only)."""
    out_vis = select(DocumentTag.tag_id).join(
        OutgoingDocument,
        and_(DocumentTag.object_type == "outgoing", DocumentTag.object_id == OutgoingDocument.id),
    ).where(OutgoingDocument.deleted_at.is_(None))
    inc_conds = [IncomingDocument.deleted_at.is_(None)]
    if not include_manager_only:
        inc_conds.append(IncomingDocument.manager_only.is_(False))
    inc_vis = select(DocumentTag.tag_id).join(
        IncomingDocument,
        and_(DocumentTag.object_type == "incoming", DocumentTag.object_id == IncomingDocument.id),
    ).where(*inc_conds)
    return out_vis.union(inc_vis).subquery()


def suggest(db: Session, prefix: str, *, include_manager_only: bool, limit: int = 10) -> list[str]:
    """Gợi ý tag theo tiền tố (autocomplete). CHỈ tag có CV người dùng xem được (tôn trọng
    manager_only — không lộ tên tag của CV đến chỉ-Quản-lý-xem cho Nhân viên)."""
    vis = _visible_tag_ids(include_manager_only)
    stmt = select(Tag.name).where(Tag.id.in_(select(vis.c.tag_id)))
    norm = normalize_tag(prefix)
    if norm:
        like = norm.replace("%", r"\%").replace("_", r"\_") + "%"
        stmt = stmt.where(Tag.name.ilike(like, escape="\\"))
    rows = db.execute(stmt.order_by(Tag.name).limit(limit)).all()
    return [r.name for r in rows]


def list_all_with_counts(db: Session, *, include_manager_only: bool) -> list[dict[str, Any]]:
    """Tất cả tag + SỐ CV hiển thị/tag (ẩn tag chỉ gắn CV người dùng không được xem)."""
    out_cnt = (
        select(DocumentTag.tag_id.label("tag_id"), func.count().label("c"))
        .join(
            OutgoingDocument,
            and_(DocumentTag.object_type == "outgoing", DocumentTag.object_id == OutgoingDocument.id),
        )
        .where(OutgoingDocument.deleted_at.is_(None))
        .group_by(DocumentTag.tag_id)
        .subquery()
    )
    inc_where = [IncomingDocument.deleted_at.is_(None)]
    if not include_manager_only:
        inc_where.append(IncomingDocument.manager_only.is_(False))
    inc_cnt = (
        select(DocumentTag.tag_id.label("tag_id"), func.count().label("c"))
        .join(
            IncomingDocument,
            and_(DocumentTag.object_type == "incoming", DocumentTag.object_id == IncomingDocument.id),
        )
        .where(*inc_where)
        .group_by(DocumentTag.tag_id)
        .subquery()
    )
    total = func.coalesce(out_cnt.c.c, 0) + func.coalesce(inc_cnt.c.c, 0)
    # label 'cnt' (KHÔNG 'count' — trùng method Row.count → trả Callable, mypy + runtime sai).
    rows = db.execute(
        select(Tag.id, Tag.name, total.label("cnt"))
        .outerjoin(out_cnt, out_cnt.c.tag_id == Tag.id)
        .outerjoin(inc_cnt, inc_cnt.c.tag_id == Tag.id)
        .order_by(Tag.name)
    ).all()
    return [{"id": r.id, "name": r.name, "count": int(r.cnt)} for r in rows if r.cnt > 0]


def docs_by_tag(
    db: Session, name: str, *, include_manager_only: bool
) -> list[dict[str, Any]]:
    """Các CV (đi + đến hiển thị được) gắn tag `name`, mới nhất trước."""
    norm = normalize_tag(name)
    tag = db.scalar(select(Tag).where(Tag.name == norm)) if norm else None
    if tag is None:
        return []

    out_sel = (
        select(
            OutgoingDocument.id.label("id"),
            literal("out").label("source"),
            OutgoingDocument.number.label("number"),
            OutgoingDocument.subject.label("subject"),
            OutgoingDocument.status.label("status"),
            OutgoingDocument.issue_date.label("doc_date"),
            OutgoingDocument.created_at.label("created_at"),
        )
        .join(
            DocumentTag,
            and_(DocumentTag.object_type == "outgoing", DocumentTag.object_id == OutgoingDocument.id),
        )
        .where(DocumentTag.tag_id == tag.id, OutgoingDocument.deleted_at.is_(None))
    )
    inc_where = [DocumentTag.tag_id == tag.id, IncomingDocument.deleted_at.is_(None)]
    if not include_manager_only:
        inc_where.append(IncomingDocument.manager_only.is_(False))
    inc_sel = (
        select(
            IncomingDocument.id.label("id"),
            literal("in").label("source"),
            IncomingDocument.number.label("number"),
            IncomingDocument.subject.label("subject"),
            IncomingDocument.status.label("status"),
            IncomingDocument.document_date.label("doc_date"),
            IncomingDocument.created_at.label("created_at"),
        )
        .join(
            DocumentTag,
            and_(DocumentTag.object_type == "incoming", DocumentTag.object_id == IncomingDocument.id),
        )
        .where(*inc_where)
    )
    base = out_sel.union_all(inc_sel).subquery()
    rows = db.execute(select(base).order_by(base.c.created_at.desc())).all()
    return [dict(r._mapping) for r in rows]
