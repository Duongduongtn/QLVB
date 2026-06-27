"""signatures — C2 (SIG.SGN quản lý chữ ký)

Bảng chữ ký người ký: họ tên + chức danh + đơn vị mặc định (nullable, đổi được, KHÔNG
gắn cứng như mộc). Ảnh lưu ở files (wrapped_key NULL). Inactive thay vì xoá.

Revision ID: 0005_signatures
Revises: 0004_seals
Create Date: 2026-06-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_signatures"
down_revision = "0004_seals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "signatures",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("full_name", sa.String(150), nullable=False),
        sa.Column("title", sa.String(150), nullable=True),
        sa.Column("default_unit_id", sa.BigInteger(), sa.ForeignKey("units.id"), nullable=True),
        sa.Column("file_id", sa.BigInteger(), sa.ForeignKey("files.id"), nullable=False),
        sa.Column("uploaded_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
    )
    op.create_index("idx_signatures_unit", "signatures", ["default_unit_id"])


def downgrade() -> None:
    op.drop_index("idx_signatures_unit", table_name="signatures")
    op.drop_table("signatures")
