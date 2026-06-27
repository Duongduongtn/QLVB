"""processing_tasks + notifications — phân công xử lý + thông báo (E2/E3)

Revision ID: 0012_tasks_notifications
Revises: 0011_outgoing_in_reply_to
Create Date: 2026-06-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0012_tasks_notifications"
down_revision = "0011_outgoing_in_reply_to"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "processing_tasks",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "incoming_id",
            sa.BigInteger(),
            sa.ForeignKey("incoming_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("unit_id", sa.BigInteger(), sa.ForeignKey("units.id"), nullable=False),
        sa.Column("assignee_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status", sa.String(12), nullable=False, server_default="new"),
        sa.Column("deadline", sa.Date(), nullable=True),
        sa.Column("reminded_on", sa.Date(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("result_note", sa.Text(), nullable=True),
        sa.Column("assigned_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint("status IN ('new','in_progress','done')", name="ck_task_status"),
        sa.UniqueConstraint("incoming_id", "unit_id", name="uq_task_incoming_unit"),
    )
    op.create_index("idx_task_assignee_status", "processing_tasks", ["assignee_id", "status"])
    op.create_index("idx_task_incoming", "processing_tasks", ["incoming_id"])

    op.create_table(
        "notifications",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("link", sa.String(200), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
    )
    op.create_index("idx_notif_user_read", "notifications", ["user_id", "is_read"])


def downgrade() -> None:
    op.drop_index("idx_notif_user_read", table_name="notifications")
    op.drop_table("notifications")
    op.drop_index("idx_task_incoming", table_name="processing_tasks")
    op.drop_index("idx_task_assignee_status", table_name="processing_tasks")
    op.drop_table("processing_tasks")
