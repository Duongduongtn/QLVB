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


@pytest.fixture
def db_session() -> Iterator:
    """Session DB cho integration test — TODO: dùng transaction rollback hoặc DB schema isolated."""
    pytest.skip("Implement khi có Postgres test container")
