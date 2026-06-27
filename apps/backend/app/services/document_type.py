"""Nghiệp vụ cấu hình sổ công văn — B2 (CFG.BOK, chỉ Quản lý).

Bất biến (PRD B2 + TDD §3.3):
- Sổ đi ('out') bắt buộc gắn 1 đơn vị; sổ đến ('in') CHUNG → unit_id NULL.
- number_format bắt buộc có {STT}; biến lạ bị từ chối.
- start_stt/current_stt KHÔNG lưu cột — áp vào SEQUENCE kỳ hiện tại bằng setval.
- KHÔNG xoá loại đã dùng → chỉ is_active=false ("Ngừng dùng").
- current_stt khi sửa CHỈ nâng counter, KHÔNG lùi (chống cấp trùng số đã phát hành).
Mọi thao tác ghi audit_logs.
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.models.document_type import DocumentType
from app.models.unit import Unit
from app.schemas.document_type import (
    DocumentTypeCreate,
    DocumentTypeUpdate,
    NumberPreviewRequest,
)
from app.services import numbering
from app.services.audit import log_action


def _vn_today() -> date:
    return datetime.now(ZoneInfo(settings.timezone)).date()


def _commit_unique(db: Session) -> None:
    """Commit + dịch vi phạm UNIQUE (mã loại trùng, race) thành Conflict tiếng Việt."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Conflict("Mã loại đã tồn tại trong sổ này") from exc


def next_number_for(db: Session, dt: DocumentType) -> int:
    """Số kế tiếp ở kỳ hiện tại của 1 loại VB (để điền vào response)."""
    return numbering.next_number(db, dt, _vn_today())


def _unit_code(db: Session, unit_id: int | None) -> str | None:
    if unit_id is None:
        return None
    unit = db.get(Unit, unit_id)
    if unit is None:
        raise NotFound("Không tìm thấy đơn vị")
    return unit.code


def list_document_types(
    db: Session, *, direction: str | None, unit_id: int | None
) -> list[tuple[DocumentType, int]]:
    stmt = select(DocumentType)
    if direction is not None:
        stmt = stmt.where(DocumentType.direction == direction)
    if unit_id is not None:
        stmt = stmt.where(DocumentType.unit_id == unit_id)
    elif direction == "in":
        stmt = stmt.where(DocumentType.unit_id.is_(None))
    stmt = stmt.order_by(DocumentType.id)

    today = _vn_today()
    items = list(db.scalars(stmt).all())
    return [(dt, numbering.next_number(db, dt, today)) for dt in items]


def _apply_stt(db: Session, dt: DocumentType, last_issued: int, *, only_raise: bool) -> None:
    """Áp 'số đã cấp gần nhất' vào sequence kỳ hiện tại. only_raise=True → không lùi."""
    if last_issued < 1:
        return
    period = numbering.period_key(dt.reset_policy, _vn_today())
    name = numbering.get_or_create_sequence(db, dt, period)
    if only_raise and last_issued <= numbering.peek_next(db, name) - 1:
        return  # không hạ counter xuống dưới số đã phát hành
    numbering.set_current(db, name, last_issued)


def create_document_type(
    db: Session, data: DocumentTypeCreate, *, actor_id: int, ip: str | None, ua: str | None
) -> DocumentType:
    unit_id = data.unit_id
    if data.direction == "in":
        unit_id = None  # sổ đến CHUNG 2 đơn vị
    elif unit_id is None:
        raise ValidationFailed("Sổ đi phải chọn đơn vị")
    _unit_code(db, unit_id)  # verify tồn tại (raise NotFound nếu không)

    numbering.validate_format(data.number_format)

    dup = select(DocumentType.id).where(
        DocumentType.direction == data.direction,
        DocumentType.code == data.code,
        DocumentType.unit_id == unit_id if unit_id is not None else DocumentType.unit_id.is_(None),
    )
    if db.scalar(dup) is not None:
        raise Conflict("Mã loại đã tồn tại trong sổ này")

    dt = DocumentType(
        direction=data.direction,
        unit_id=unit_id,
        name=data.name,
        code=data.code,
        number_format=data.number_format,
        reset_policy=data.reset_policy,
        zero_pad=data.zero_pad,
        is_active=True,
    )
    db.add(dt)
    db.flush()  # lấy dt.id để dựng tên sequence

    # STT khởi tạo: số đã cấp gần nhất = max(current_stt, start_stt-1).
    _apply_stt(db, dt, max(data.current_stt, data.start_stt - 1), only_raise=False)

    log_action(
        db,
        action="doctype_create",
        user_id=actor_id,
        object_type="document_type",
        object_id=dt.id,
        ip=ip,
        user_agent=ua,
        detail={"code": dt.code, "direction": dt.direction, "unit_id": unit_id},
    )
    _commit_unique(db)
    db.refresh(dt)
    return dt


def update_document_type(
    db: Session, dt_id: int, data: DocumentTypeUpdate, *, actor_id: int, ip: str | None, ua: str | None
) -> DocumentType:
    dt = db.get(DocumentType, dt_id)
    if dt is None:
        raise NotFound("Không tìm thấy loại văn bản")

    changes = data.model_dump(exclude_unset=True)
    current_stt = changes.pop("current_stt", None)  # không phải cột — áp vào sequence

    if "number_format" in changes:
        numbering.validate_format(changes["number_format"])
    for field, value in changes.items():
        setattr(dt, field, value)

    if current_stt is not None:
        _apply_stt(db, dt, current_stt, only_raise=True)  # chỉ nâng, không lùi

    log_action(
        db,
        action="doctype_update",
        user_id=actor_id,
        object_type="document_type",
        object_id=dt.id,
        ip=ip,
        user_agent=ua,
        detail={"changed": sorted(changes.keys()), "set_current": current_stt},
    )
    _commit_unique(db)
    db.refresh(dt)
    return dt


def preview_number(db: Session, data: NumberPreviewRequest) -> str:
    """Render thử 1 số theo format (không chạm sequence) — cho UI xem trước khi lưu."""
    numbering.validate_format(data.number_format)
    return numbering.format_number(
        data.number_format,
        stt=data.sample_stt,
        zero_pad=data.zero_pad,
        unit_code=_unit_code(db, data.unit_id),
        type_code=data.code,
        on_date=_vn_today(),
    )
