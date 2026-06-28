"""tags + document_tags — F2 tag tự do (polymorphic CV đi/đến)

Revision ID: 0016_tags
Revises: 0015_search_vector
Create Date: 2026-06-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0016_tags"
down_revision = "0015_search_vector"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tags",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.UniqueConstraint("name", name="uq_tags_name"),
    )
    op.create_table(
        "document_tags",
        sa.Column(
            "tag_id",
            sa.BigInteger(),
            sa.ForeignKey("tags.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("object_type", sa.String(20), primary_key=True),
        sa.Column("object_id", sa.BigInteger(), primary_key=True),
        sa.CheckConstraint("object_type IN ('incoming','outgoing')", name="ck_doctag_type"),
    )
    op.create_index("idx_doctag_object", "document_tags", ["object_type", "object_id"])


def downgrade() -> None:
    op.drop_index("idx_doctag_object", table_name="document_tags")
    op.drop_table("document_tags")
    op.drop_table("tags")
