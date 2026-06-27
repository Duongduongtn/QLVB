"""document_types.stamp_template — D2 template vị trí mộc/chữ ký theo loại VB

Revision ID: 0013_doctype_stamp_template
Revises: 0012_tasks_notifications
Create Date: 2026-06-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0013_doctype_stamp_template"
down_revision = "0012_tasks_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("document_types", sa.Column("stamp_template", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("document_types", "stamp_template")
