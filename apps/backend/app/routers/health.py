"""Health check — UptimeRobot ping endpoint.

KHÔNG yêu cầu auth. Trả 200 nếu DB + Redis còn ping được.
"""

from __future__ import annotations

import contextlib

from fastapi import APIRouter
from sqlalchemy import text

from app.core.database import engine
from app.core.redis_client import redis_client

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    db_ok = False
    redis_ok = False

    with contextlib.suppress(Exception):
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True

    with contextlib.suppress(Exception):
        redis_ok = bool(redis_client.ping())

    status = "ok" if db_ok and redis_ok else "degraded"
    return {"status": status, "db": "ok" if db_ok else "down", "redis": "ok" if redis_ok else "down"}
