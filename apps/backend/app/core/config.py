"""Cấu hình ứng dụng — đọc từ .env qua pydantic-settings.

Tất cả secret/URL kết nối đều load qua đây; KHÔNG đọc os.environ trực tiếp
ở chỗ khác để tránh tản mát config.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ────────────────────────────────────────────
    app_name: str = "QLCV Thành Đạt"
    environment: str = Field(default="dev", pattern="^(dev|staging|prod)$")
    debug: bool = False
    timezone: str = "Asia/Ho_Chi_Minh"

    # ── Database ──────────────────────────────────────
    database_url: str = "postgresql+psycopg://qlcv:qlcv@localhost:5437/qlcv"

    # ── Redis ─────────────────────────────────────────
    redis_url: str = "redis://localhost:6380/0"
    redis_broker_db: int = 1
    redis_result_db: int = 2

    # ── Session ───────────────────────────────────────
    session_cookie_name: str = "qlcv_session"
    session_ttl_seconds: int = 8 * 60 * 60          # 8 giờ
    session_ttl_remember: int = 7 * 24 * 60 * 60    # 7 ngày
    session_secure_cookie: bool = True

    # ── Storage ───────────────────────────────────────
    storage_local_path: Path = Path("/var/qlcv/storage")
    master_key_hex: SecretStr = Field(default=SecretStr(""))  # 32-byte hex
    r2_endpoint: str | None = None
    r2_bucket: str | None = None
    r2_access_key_id: SecretStr | None = None
    r2_secret_access_key: SecretStr | None = None

    # ── Web Push (VAPID) ──────────────────────────────
    vapid_public_key: str | None = None
    vapid_private_key: SecretStr | None = None
    vapid_subject: str = "mailto:admin@example.com"

    # ── Observability ─────────────────────────────────
    sentry_dsn: str | None = None
    log_level: str = "INFO"

    # ── CORS (chỉ dùng khi FE dev tách port) ──────────
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    # ── Bcrypt ────────────────────────────────────────
    bcrypt_cost: int = 12


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
