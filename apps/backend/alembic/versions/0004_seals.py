"""seals — C1 (SIG.SEL quản lý mộc, gắn cứng đơn vị)

Bảng mộc: mỗi mộc thuộc đúng 1 đơn vị (chống nhầm), ảnh lưu ở files (wrapped_key NULL,
không mã hoá). Inactive thay vì xoá → CV cũ vẫn hiển thị mộc đã dùng.

Revision ID: 0004_seals
Revises: 0003_app_settings
Create Date: 2026-06-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004_seals"
down_revision = "0003_app_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "seals",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("unit_id", sa.BigInteger(), sa.ForeignKey("units.id"), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("seal_type", sa.String(20), nullable=False, server_default="round"),
        sa.Column("file_id", sa.BigInteger(), sa.ForeignKey("files.id"), nullable=False),
        sa.Column("uploaded_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint(
            "seal_type IN ('round','hanging','overlap')", name="ck_seal_type"
        ),
    )
    op.create_index("idx_seals_unit", "seals", ["unit_id"])


def downgrade() -> None:
    op.drop_index("idx_seals_unit", table_name="seals")
    op.drop_table("seals")
