"""index audit_logs.created_at — tăng tốc liệt kê/lọc nhật ký theo thời gian (H3)

Revision ID: 0009_audit_created_index
Revises: 0008_outgoing_documents
Create Date: 2026-06-27
"""

from __future__ import annotations

from alembic import op

revision = "0009_audit_created_index"
down_revision = "0008_outgoing_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("idx_audit_created", "audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("idx_audit_created", table_name="audit_logs")
