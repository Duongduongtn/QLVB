"""app_settings — B3b branding (single row tên app + logo)

Revision ID: 0003_app_settings
Revises: 0002_document_types
Create Date: 2026-06-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_app_settings"
down_revision = "0002_document_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("id", sa.SmallInteger(), primary_key=True),
        sa.Column(
            "app_name", sa.String(150), nullable=False, server_default="QLCV Thành Đạt"
        ),
        sa.Column("logo_file_id", sa.BigInteger(), sa.ForeignKey("files.id"), nullable=True),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint("id = 1", name="ck_app_settings_singleton"),
    )
    # Seed dòng cấu hình mặc định (id=1) — app_name lấy server_default.
    op.execute("INSERT INTO app_settings (id) VALUES (1)")


def downgrade() -> None:
    op.drop_table("app_settings")
