"""push_subscriptions — đăng ký Web Push theo thiết bị (L1 PWA)

Revision ID: 0017_push_subscriptions
Revises: 0016_tags
Create Date: 2026-06-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0017_push_subscriptions"
down_revision = "0016_tags"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.UniqueConstraint("endpoint", name="uq_push_sub_endpoint"),
    )
    op.create_index("idx_push_sub_user", "push_subscriptions", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_push_sub_user", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
