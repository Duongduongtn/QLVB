"""Pytest fixtures dùng chung.

Quy ước (TDD §12):
- tests/unit/      : logic thuần, KHÔNG cần DB/Redis (numbering, crypto envelope, validation).
- tests/integration/ : có DB + Redis thật (qua testcontainer hoặc Postgres sẵn).
- tests/e2e/       : Playwright (đặt ở apps/frontend/tests/e2e/ — file này không quản).
"""

from __future__ import annotations

import os
from collections.abc import Iterator

import pytest

# Đặt MASTER_KEY test (32 byte hex) trước khi import settings
os.environ.setdefault(
    "MASTER_KEY_HEX",
    "0" * 64,
)
os.environ.setdefault("ENVIRONMENT", "dev")


@pytest.fixture(scope="session")
def settings():
    from app.core.config import get_settings

    return get_settings()


@pytest.fixture(scope="session")
def _db_engine():
    """Engine tới DATABASE_URL — dò kết nối 1 LẦN/session. None nếu không có Postgres.

    connect_timeout ngắn → local không chạy Postgres thì trả None nhanh (không treo chờ SYN).
    """
    from sqlalchemy import create_engine
    from sqlalchemy.exc import OperationalError

    from app.core.config import settings

    engine = create_engine(settings.database_url, connect_args={"connect_timeout": 2})
    try:
        engine.connect().close()
    except OperationalError:
        engine.dispose()
        return None
    return engine


@pytest.fixture
def db_session(_db_engine) -> Iterator:  # type: ignore[no-untyped-def]
    """Session DB cho integration test — transaction rollback để cô lập (CI có Postgres)."""
    if _db_engine is None:
        pytest.skip("Cần Postgres (DATABASE_URL) cho integration test")

    from sqlalchemy.orm import Session as SASession

    conn = _db_engine.connect()
    trans = conn.begin()
    session = SASession(bind=conn)
    try:
        yield session
    finally:
        session.close()
        trans.rollback()  # mọi DDL/DML (kể cả CREATE SEQUENCE) bị huỷ → cô lập test
        conn.close()
