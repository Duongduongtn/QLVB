"""outgoing.in_reply_to_incoming_id — D5 liên kết CV đi ↔ CV đến

Revision ID: 0011_outgoing_in_reply_to
Revises: 0010_incoming_documents
Create Date: 2026-06-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011_outgoing_in_reply_to"
down_revision = "0010_incoming_documents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "outgoing_documents",
        sa.Column("in_reply_to_incoming_id", sa.BigInteger(), nullable=True),
    )
    op.create_foreign_key(
        "fk_out_in_reply_to",
        "outgoing_documents",
        "incoming_documents",
        ["in_reply_to_incoming_id"],
        ["id"],
    )
    op.create_index(
        "idx_out_in_reply_to",
        "outgoing_documents",
        ["in_reply_to_incoming_id"],
        postgresql_where=sa.text("in_reply_to_incoming_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_out_in_reply_to", table_name="outgoing_documents")
    op.drop_constraint("fk_out_in_reply_to", "outgoing_documents", type_="foreignkey")
    op.drop_column("outgoing_documents", "in_reply_to_incoming_id")
