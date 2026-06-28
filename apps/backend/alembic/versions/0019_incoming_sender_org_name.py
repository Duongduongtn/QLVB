"""incoming.sender_org_name — tên cơ quan gửi free-text (cơ quan chưa có trong danh bạ)

Revision ID: 0019_incoming_sender_org_name
Revises: 0018_attachment_search
Create Date: 2026-06-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0019_incoming_sender_org_name"
down_revision = "0018_attachment_search"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tên cơ quan gửi dạng text — auto-fill từ chứng thư ký số / OCR khi chưa khớp danh bạ.
    op.add_column(
        "incoming_documents",
        sa.Column("sender_org_name", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("incoming_documents", "sender_org_name")
