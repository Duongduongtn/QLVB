"""Integration test F2 — tag trên Postgres thật (set/list/counts/docs + manager_only)."""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.models.incoming_document import IncomingDocument
from app.services import tags as tag_svc

pytestmark = pytest.mark.integration


def _inc(db: Session, **kw: object) -> IncomingDocument:
    doc = IncomingDocument(status="registered", **kw)
    db.add(doc)
    db.flush()
    return doc


def test_set_list_dedup_and_normalize(db_session: Session) -> None:
    doc = _inc(db_session, subject="CV test tag")
    # 'Thi Tay Nghề' và 'thi-tay-nghe' phải gộp về 1 tag; trùng bị khử.
    out = tag_svc.set_tags(
        db_session, "incoming", doc.id, ["Thi Tay Nghề", "thi-tay-nghe", "Tuyển Sinh"],
        actor_id=1, ip=None, ua=None,
    )
    assert out == ["thi-tay-nghe", "tuyen-sinh"]
    assert tag_svc.list_for(db_session, "incoming", doc.id) == ["thi-tay-nghe", "tuyen-sinh"]


def test_set_tags_replaces(db_session: Session) -> None:
    doc = _inc(db_session, subject="CV replace")
    tag_svc.set_tags(db_session, "incoming", doc.id, ["a", "b"], actor_id=1, ip=None, ua=None)
    tag_svc.set_tags(db_session, "incoming", doc.id, ["b", "c"], actor_id=1, ip=None, ua=None)
    assert tag_svc.list_for(db_session, "incoming", doc.id) == ["b", "c"]


def test_suggest_prefix(db_session: Session) -> None:
    doc = _inc(db_session, subject="CV suggest")
    tag_svc.set_tags(db_session, "incoming", doc.id, ["tuyen-sinh", "tuyen-dung", "hop-dong"], actor_id=1, ip=None, ua=None)
    s = tag_svc.suggest(db_session, "Tuyển", include_manager_only=True)
    assert "tuyen-sinh" in s and "tuyen-dung" in s and "hop-dong" not in s


def test_suggest_hides_manager_only_tag_from_staff(db_session: Session) -> None:
    sec = _inc(db_session, subject="CV mật", manager_only=True)
    tag_svc.set_tags(db_session, "incoming", sec.id, ["thanh-tra-noi-bo"], actor_id=1, ip=None, ua=None)
    assert "thanh-tra-noi-bo" not in tag_svc.suggest(db_session, "than", include_manager_only=False)
    assert "thanh-tra-noi-bo" in tag_svc.suggest(db_session, "than", include_manager_only=True)


def test_set_tags_mix_new_and_existing_no_dataloss(db_session: Session) -> None:
    # Tạo trước 1 tag, rồi set kèm tag mới — get_or_create (SAVEPOINT) không được mất tag nào.
    d0 = _inc(db_session, subject="CV seed tag")
    tag_svc.set_tags(db_session, "incoming", d0.id, ["co-san"], actor_id=1, ip=None, ua=None)
    d1 = _inc(db_session, subject="CV mix")
    out = tag_svc.set_tags(db_session, "incoming", d1.id, ["co-san", "moi-1", "moi-2"], actor_id=1, ip=None, ua=None)
    assert out == ["co-san", "moi-1", "moi-2"]
    assert tag_svc.list_for(db_session, "incoming", d1.id) == ["co-san", "moi-1", "moi-2"]


def test_counts_and_docs_hide_manager_only_from_staff(db_session: Session) -> None:
    pub = _inc(db_session, subject="CV thường")
    sec = _inc(db_session, subject="CV mật", manager_only=True)
    tag_svc.set_tags(db_session, "incoming", pub.id, ["chung"], actor_id=1, ip=None, ua=None)
    tag_svc.set_tags(db_session, "incoming", sec.id, ["chung"], actor_id=1, ip=None, ua=None)

    staff = {t["name"]: t["count"] for t in tag_svc.list_all_with_counts(db_session, include_manager_only=False)}
    mgr = {t["name"]: t["count"] for t in tag_svc.list_all_with_counts(db_session, include_manager_only=True)}
    assert staff.get("chung") == 1  # NV chỉ đếm CV thường
    assert mgr.get("chung") == 2  # Quản lý đếm cả 2

    staff_docs = tag_svc.docs_by_tag(db_session, "chung", include_manager_only=False)
    assert sec.id not in [d["id"] for d in staff_docs]
    mgr_docs = tag_svc.docs_by_tag(db_session, "chung", include_manager_only=True)
    assert {pub.id, sec.id} <= {d["id"] for d in mgr_docs}
