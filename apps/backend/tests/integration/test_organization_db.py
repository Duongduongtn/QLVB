"""Integration test M2 — thống kê danh bạ (số CV + lần cuối) trên Postgres CI."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
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
