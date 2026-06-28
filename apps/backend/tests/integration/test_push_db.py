"""Integration test Web Push (L1) — upsert theo endpoint + xoá theo user (chống IDOR).

Cần Postgres (pg_insert ON CONFLICT + delete scoped). Chạy trên CI; skip ở local nếu
không có DATABASE_URL kết nối được.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.services import push as svc

pytestmark = pytest.mark.integration

_EP = "https://fcm.googleapis.com/fcm/send/abc"


def _user(db: Session, username: str) -> User:
    u = User(username=username, full_name="Người " + username, password_hash="x", role="staff")
    db.add(u)
    db.flush()
    return u


def test_upsert_theo_endpoint_ghi_de_user(db_session: Session) -> None:
    a = _user(db_session, "pa")
    b = _user(db_session, "pb")
    svc.save_subscription(db_session, user_id=a.id, endpoint=_EP, p256dh="k1", auth="s1", user_agent="UA1")
    db_session.flush()
    # Cùng endpoint đăng ký lại bởi user khác (thiết bị chung) → 1 row, user_id chuyển sang B.
    svc.save_subscription(db_session, user_id=b.id, endpoint=_EP, p256dh="k2", auth="s2", user_agent="UA2")
    db_session.flush()
    rows = list(db_session.scalars(select(PushSubscription).where(PushSubscription.endpoint == _EP)).all())
    assert len(rows) == 1
    assert rows[0].user_id == b.id
    assert rows[0].p256dh == "k2"


def test_delete_chi_endpoint_cua_minh(db_session: Session) -> None:
    a = _user(db_session, "pc")
    b = _user(db_session, "pd")
    svc.save_subscription(db_session, user_id=a.id, endpoint=_EP, p256dh="k", auth="s", user_agent=None)
    db_session.flush()
    # B cố huỷ endpoint của A (IDOR) → không xoá (scope theo user_id).
    svc.delete_subscription(db_session, user_id=b.id, endpoint=_EP)
    db_session.flush()
    assert db_session.scalar(select(PushSubscription).where(PushSubscription.endpoint == _EP)) is not None
    # Chính chủ A huỷ → xoá.
    svc.delete_subscription(db_session, user_id=a.id, endpoint=_EP)
    db_session.flush()
    assert db_session.scalar(select(PushSubscription).where(PushSubscription.endpoint == _EP)) is None
