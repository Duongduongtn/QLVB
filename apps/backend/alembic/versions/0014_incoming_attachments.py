"""incoming_attachments — phụ lục đính kèm CV đến (E4)

Revision ID: 0014_incoming_attachments
Revises: 0013_doctype_stamp_template
Create Date: 2026-06-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0014_incoming_attachments"
down_revision = "0013_doctype_stamp_template"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "incoming_attachments",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "incoming_id",
            sa.BigInteger(),
            sa.ForeignKey("incoming_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("file_id", sa.BigInteger(), sa.ForeignKey("files.id"), nullable=False),
        sa.Column("original_name", sa.String(300), nullable=True),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("ocr_text", sa.Text(), nullable=True),
        sa.Column("uploaded_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
    )
    op.create_index("idx_inc_att_incoming", "incoming_attachments", ["incoming_id"])


def downgrade() -> None:
    op.drop_index("idx_inc_att_incoming", table_name="incoming_attachments")
    op.drop_table("incoming_attachments")
