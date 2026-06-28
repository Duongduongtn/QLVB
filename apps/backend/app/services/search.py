"""F1 — Tìm kiếm toàn cục full-text tiếng Việt (CV đi + đến).

`tsvector` (cột do trigger DB cập nhật) khớp `websearch_to_tsquery('simple', unaccent(q))`
→ tìm có dấu/không dấu đều ra; kết hợp `pg_trgm` (`subject % q`) bắt lỗi chính tả nhẹ.
Hợp nhất 2 sổ qua UNION ALL, xếp theo ts_rank rồi ngày tạo, phân trang.

**Bất biến bảo mật (2 lớp)**: Nhân viên (include_manager_only=False) KHÔNG thấy CV đến
`manager_only` — (1) query thêm điều kiện `manager_only = FALSE`, (2) trigger đã loại
`ocr_text` khỏi search_vector của CV manager_only. CV đi KHÔNG có cờ manager_only (2 đơn vị
dùng chung) → mọi user thấy.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import ColumnElement, Select, func, literal, or_, select, text
from sqlalchemy.orm import Session

from app.models.incoming_document import IncomingDocument
from app.models.organization import Organization
from app.models.outgoing_document import OutgoingDocument, OutgoingRecipient
from app.models.signature import Signature
from app.models.signing_profile import SigningProfile

_VN_TZ = timezone(timedelta(hours=7))  # biên ngày lọc theo giờ VN


def _tsquery(q: str) -> Any:
    return func.websearch_to_tsquery("simple", func.unaccent(q))


def _fuzzy(col: Any, term: str) -> ColumnElement[bool]:
    """Trigram fuzzy KHÔNG DẤU bằng word_similarity (`<%`): tìm cụm từ khoá NHƯ MỘT TỪ con
    trong trích yếu dài (khác `%` so cả chuỗi → trích yếu dài luôn trượt). Gõ 'vit nam' / lỗi
    chính tả nhẹ vẫn khớp 'Việt Nam'. Dùng được GIN(f_unaccent(subject) gin_trgm_ops)."""
    return func.f_unaccent(term).op("<%")(func.f_unaccent(col))


def _date_bounds(date_from: date | None, date_to: date | None, col: Any) -> list[ColumnElement[bool]]:
    out: list[ColumnElement[bool]] = []
    if date_from is not None:
        out.append(col >= datetime.combine(date_from, datetime.min.time(), _VN_TZ))
    if date_to is not None:
        out.append(col < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), _VN_TZ))
    return out


def _incoming_select(
    q: str,
    tsq: Any,
    *,
    include_manager_only: bool,
    status: str | None,
    urgency: str | None,
    date_from: date | None,
    date_to: date | None,
) -> Select[Any]:
    inc = IncomingDocument
    # F1 mở rộng — khớp thêm TÊN cơ quan gửi (EXISTS, trgm không dấu). manager_only vẫn là
    # điều kiện AND riêng bên dưới → không nới lỏng bảo mật.
    sender_match = (
        select(1)
        .select_from(Organization)
        .where(
            Organization.id == inc.sender_org_id,
            or_(_fuzzy(Organization.full_name, q), _fuzzy(Organization.short_name, q)),
        )
        .exists()
    )
    conds: list[ColumnElement[bool]] = [
        inc.deleted_at.is_(None),
        or_(inc.search_vector.op("@@")(tsq), _fuzzy(inc.subject, q), sender_match),
    ]
    if not include_manager_only:  # lớp 1: Nhân viên không thấy CV "Chỉ Quản lý xem"
        conds.append(inc.manager_only.is_(False))
    if status:
        conds.append(inc.status == status)
    if urgency:
        conds.append(inc.urgency == urgency)
    conds += _date_bounds(date_from, date_to, inc.created_at)
    return select(
        inc.id.label("id"),
        literal("in").label("source"),
        inc.number.label("number"),
        inc.subject.label("subject"),
        inc.status.label("status"),
        inc.document_date.label("doc_date"),
        inc.created_at.label("created_at"),
        func.ts_rank(inc.search_vector, tsq).label("rank"),
    ).where(*conds)


def _outgoing_select(
    q: str,
    tsq: Any,
    *,
    status: str | None,
    unit_id: int | None,
    date_from: date | None,
    date_to: date | None,
) -> Select[Any]:
    out = OutgoingDocument
    # F1 mở rộng — khớp thêm TÊN người ký (qua hồ sơ ký → chữ ký) + TÊN nơi nhận (M2M).
    signer_match = (
        select(1)
        .select_from(SigningProfile)
        .join(Signature, SigningProfile.signature_id == Signature.id)
        .where(SigningProfile.id == out.signing_profile_id, _fuzzy(Signature.full_name, q))
        .exists()
    )
    recipient_match = (
        select(1)
        .select_from(OutgoingRecipient)
        .join(Organization, OutgoingRecipient.organization_id == Organization.id)
        .where(
            OutgoingRecipient.outgoing_id == out.id,
            or_(_fuzzy(Organization.full_name, q), _fuzzy(Organization.short_name, q)),
        )
        .exists()
    )
    conds: list[ColumnElement[bool]] = [
        out.deleted_at.is_(None),
        or_(out.search_vector.op("@@")(tsq), _fuzzy(out.subject, q), signer_match, recipient_match),
    ]
    if status:
        conds.append(out.status == status)
    if unit_id is not None:
        conds.append(out.unit_id == unit_id)
    conds += _date_bounds(date_from, date_to, out.created_at)
    return select(
        out.id.label("id"),
        literal("out").label("source"),
        out.number.label("number"),
        out.subject.label("subject"),
        out.status.label("status"),
        out.issue_date.label("doc_date"),
        out.created_at.label("created_at"),
        func.ts_rank(out.search_vector, tsq).label("rank"),
    ).where(*conds)


def global_search(
    db: Session,
    q: str | None,
    *,
    doc_type: str = "all",
    include_manager_only: bool,
    status: str | None = None,
    unit_id: int | None = None,
    urgency: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    size: int = 20,
) -> tuple[list[dict[str, Any]], int]:
    """Tìm full-text hợp nhất CV đi/đến. q rỗng → trả rỗng (không quét toàn bảng)."""
    term = (q or "").strip()
    if not term:
        return [], 0
    tsq = _tsquery(term)

    parts: list[Select[Any]] = []
    if doc_type in ("all", "in"):
        parts.append(
            _incoming_select(
                term, tsq, include_manager_only=include_manager_only,
                status=status, urgency=urgency, date_from=date_from, date_to=date_to,
            )
        )
    if doc_type in ("all", "out"):
        parts.append(
            _outgoing_select(
                term, tsq, status=status, unit_id=unit_id, date_from=date_from, date_to=date_to
            )
        )
    if not parts:
        return [], 0

    # Ngưỡng word_similarity 0,3 (PRD F1) — nới để bắt lỗi chính tả nhẹ. LOCAL = chỉ transaction này.
    db.execute(text("SET LOCAL pg_trgm.word_similarity_threshold = 0.3"))
    base = parts[0].subquery() if len(parts) == 1 else parts[0].union_all(*parts[1:]).subquery()
    total = db.scalar(select(func.count()).select_from(base)) or 0
    rows = db.execute(
        select(base)
        .order_by(base.c.rank.desc(), base.c.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    ).all()
    return [dict(r._mapping) for r in rows], total
