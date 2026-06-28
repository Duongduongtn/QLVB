"""Integration test M2 — thống kê danh bạ (số CV + lần cuối) trên Postgres CI."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.document_type import DocumentType
from app.models.incoming_document import IncomingDocument
from app.models.organization import Organization
from app.models.outgoing_document import OutgoingDocument, OutgoingRecipient
from app.models.unit import Unit
from app.services import organization as svc

pytestmark = pytest.mark.integration


def test_recipient_stats_count_and_last(db_session: Session) -> None:
    unit = db_session.scalar(select(Unit).where(Unit.code == "GDNN"))
    assert unit is not None
    dt = DocumentType(
        direction="out", unit_id=unit.id, name="Công văn", code="CV",
        number_format="{STT}", reset_policy="year", zero_pad=3, is_active=True,
    )
    org = Organization(full_name="UBND tỉnh A", is_recipient=True)
    db_session.add_all([dt, org])
    db_session.flush()
    for n, d in ((1, date(2026, 3, 1)), (2, date(2026, 6, 10))):
        doc = OutgoingDocument(
            unit_id=unit.id, doc_type_id=dt.id, number=f"{n:03d}/CV", number_int=n,
            subject="x", issue_date=d, status="published",
        )
        db_session.add(doc)
        db_session.flush()
        db_session.add(OutgoingRecipient(outgoing_id=doc.id, organization_id=org.id))
    # CV đã HUỶ (giữ số) gửi tới cùng org → KHÔNG được đếm.
    cancelled = OutgoingDocument(
        unit_id=unit.id, doc_type_id=dt.id, number="099/CV", number_int=99,
        subject="huỷ", issue_date=date(2026, 7, 1), status="cancelled",
    )
    db_session.add(cancelled)
    db_session.flush()
    db_session.add(OutgoingRecipient(outgoing_id=cancelled.id, organization_id=org.id))
    db_session.flush()

    stats = svc.org_doc_stats(db_session, role="recipient", org_ids=[org.id])
    assert stats[org.id][0] == 2  # chỉ 2 CV published, KHÔNG tính CV huỷ
    assert stats[org.id][1] == date(2026, 6, 10)  # ngày phát hành gần nhất (không phải 01/07 huỷ)


def test_sender_stats_count(db_session: Session) -> None:
    org = Organization(full_name="Sở B", is_sender=True)
    db_session.add(org)
    db_session.flush()
    db_session.add(IncomingDocument(
        number="0007", number_int=7, subject="đến", status="registered", sender_org_id=org.id,
    ))
    db_session.flush()

    # Thêm 1 CV đến "Chỉ Quản lý xem" từ cùng cơ quan.
    db_session.add(IncomingDocument(
        number="0008", number_int=8, subject="mật", status="registered",
        sender_org_id=org.id, manager_only=True,
    ))
    db_session.flush()

    mgr = svc.org_doc_stats(db_session, role="sender", org_ids=[org.id], include_manager_only=True)
    staff = svc.org_doc_stats(db_session, role="sender", org_ids=[org.id], include_manager_only=False)
    assert mgr[org.id][0] == 2  # Quản lý đếm cả CV mật
    assert staff[org.id][0] == 1  # Nhân viên KHÔNG đếm CV mật (không lộ tồn tại)

    # org không CV nào → không có khoá.
    other = Organization(full_name="Sở C", is_sender=True)
    db_session.add(other)
    db_session.flush()
    assert svc.org_doc_stats(db_session, role="sender", org_ids=[other.id]) == {}


def _a_user_id(db: Session) -> int:
    from app.models.user import User

    uid = db.scalar(select(User.id).limit(1))
    assert uid is not None
    return int(uid)


def test_find_similar_matches_accent_case_variants(db_session: Session) -> None:
    a = Organization(full_name="Bộ Tài chính", is_sender=True)
    b = Organization(full_name="Sở Giáo dục và Đào tạo", is_sender=True)
    rcpt = Organization(full_name="Bộ Tài chính (nơi nhận)", is_recipient=True, is_sender=False)
    db_session.add_all([a, b, rcpt])
    db_session.flush()

    # Biến thể hoa/thường + dấu → vẫn khớp (f_unaccent + pg_trgm fold lowercase).
    hits = svc.find_similar(db_session, role="sender", name="BỘ TÀI CHÍNH")
    ids = [o.id for o, _ in hits]
    assert a.id in ids
    assert rcpt.id not in ids  # role=sender → KHÔNG trả cơ quan chỉ là nơi nhận
    assert hits[0][0].id == a.id and hits[0][1] >= 0.3  # khớp tốt nhất + có điểm similarity

    # exclude_id loại chính nó (dùng khi gợi ý trùng lúc sửa cơ quan).
    assert a.id not in [o.id for o, _ in svc.find_similar(db_session, role="sender", name="Bộ Tài chính", exclude_id=a.id)]


def test_merge_moves_references_and_soft_deletes_source(db_session: Session) -> None:
    unit = db_session.scalar(select(Unit).where(Unit.code == "GDNN"))
    assert unit is not None
    dt = DocumentType(
        direction="out", unit_id=unit.id, name="CV", code="CVM",
        number_format="{STT}", reset_policy="year", zero_pad=3, is_active=True,
    )
    src = Organization(full_name="Sở X (cũ)", is_sender=True, is_recipient=True)
    dst = Organization(full_name="Sở X", is_sender=False, is_recipient=True)
    db_session.add_all([dt, src, dst])
    db_session.flush()

    inc = IncomingDocument(number="0001", number_int=1, subject="đến", status="registered", sender_org_id=src.id)
    db_session.add(inc)
    db_session.flush()

    def _cv(n: int, recips: list[int]) -> None:
        doc = OutgoingDocument(
            unit_id=unit.id, doc_type_id=dt.id, number=f"{n:03d}/CV", number_int=n,
            subject="x", issue_date=date(2026, 5, 1), status="published",
        )
        db_session.add(doc)
        db_session.flush()
        for oid in recips:
            db_session.add(OutgoingRecipient(outgoing_id=doc.id, organization_id=oid))
        db_session.flush()

    _cv(1, [src.id])            # chỉ src → chuyển sang dst
    _cv(2, [src.id, dst.id])    # cả 2 → row src phải bị xoá (chống đụng PK), dst giữ

    svc.merge_organizations(
        db_session, source_id=src.id, target_id=dst.id, actor_id=_a_user_id(db_session), ip=None, ua=None
    )

    assert src.deleted_at is not None              # source soft-delete
    assert dst.is_sender is True                   # gộp vai: dst nhận cờ is_sender của src
    assert db_session.get(IncomingDocument, inc.id).sender_org_id == dst.id  # CV đến chuyển
    src_left = db_session.scalar(
        select(func.count()).select_from(OutgoingRecipient).where(OutgoingRecipient.organization_id == src.id)
    )
    dst_cnt = db_session.scalar(
        select(func.count()).select_from(OutgoingRecipient).where(OutgoingRecipient.organization_id == dst.id)
    )
    assert src_left == 0       # không còn nơi nhận trỏ src
    assert dst_cnt == 2        # CV#1 chuyển sang + CV#2 vốn đã có dst (không nhân đôi)


def test_merge_rejects_self(db_session: Session) -> None:
    from app.core.errors import ValidationFailed

    org = Organization(full_name="Sở Y", is_sender=True)
    db_session.add(org)
    db_session.flush()
    with pytest.raises(ValidationFailed):
        svc.merge_organizations(db_session, source_id=org.id, target_id=org.id, actor_id=_a_user_id(db_session), ip=None, ua=None)


def test_sender_avg_urgency(db_session: Session) -> None:
    org = Organization(full_name="Cơ quan khẩn", is_sender=True)
    db_session.add(org)
    db_session.flush()
    for u in ("urgent", "express", "express_timed"):  # ord 1,3,4 → avg 2.67 → round 3 = express
        db_session.add(IncomingDocument(subject="x", status="registered", sender_org_id=org.id, urgency=u))
    db_session.add(IncomingDocument(subject="m", status="registered", sender_org_id=org.id, urgency="express_timed", manager_only=True))
    db_session.flush()

    mgr = svc.sender_avg_urgency(db_session, org_ids=[org.id], include_manager_only=True)
    staff = svc.sender_avg_urgency(db_session, org_ids=[org.id], include_manager_only=False)
    assert mgr[org.id] == "express"        # (1+3+4+4)/4 = 3.0 → express
    assert staff[org.id] == "express"      # (1+3+4)/3 = 2.67 → round 3 → express (loại CV mật)
