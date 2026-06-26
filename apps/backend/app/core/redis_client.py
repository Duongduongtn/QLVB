"""Redis client dùng chung cho session store + rate limit + cache nhẹ.

KHÔNG dùng cho Celery broker — Celery có connection pool riêng (xem celery_app.py).
"""

from __future__ import annotations

from redis import Redis

from app.core.config import settings

redis_client: Redis[str] = Redis.from_url(  # decode_responses=True → trả str
    settings.redis_url,
    decode_responses=True,
    socket_keepalive=True,
    health_check_interval=30,
)
