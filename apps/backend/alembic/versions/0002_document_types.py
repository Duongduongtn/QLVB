"""document_types + numbering_registry — B2 (CFG.BOK cấu hình sổ công văn)

Bảng cấu hình loại VB + registry ánh xạ (loại, kỳ) → tên PG SEQUENCE. SEQUENCE thực
tạo LAZY khi cấp số / set STT (TDD §3.3) — KHÔNG tạo ở migration này.

Revision ID: 0002_document_types
Revises: 0001_initial
Create Date: 2026-06-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_document_types"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_types",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("direction", sa.String(3), nullable=False),
        sa.Column("unit_id", sa.BigInteger(), sa.ForeignKey("units.id"), nullable=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(20), nullable=False),
        sa.Column("number_format", sa.String(100), nullable=False),
        sa.Column("reset_policy", sa.String(10), nullable=False, server_default="year"),
        sa.Column("zero_pad", sa.SmallInteger(), nullable=False, server_default="3"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint("direction IN ('out','in')", name="ck_doctype_direction"),
        sa.CheckConstraint(
            "reset_policy IN ('year','month','none')", name="ck_doctype_reset"
        ),
    )
    op.create_index(
        "idx_doctype_dir_unit", "document_types", ["direction", "unit_id"]
    )
    # Mã loại duy nhất trong 1 sổ (direction + đơn vị); COALESCE để sổ đến chung (NULL) cũng chặn.
    op.create_index(
        "uq_doctype_identity",
        "document_types",
        [sa.text("direction"), sa.text("COALESCE(unit_id, 0)"), sa.text("code")],
        unique=True,
    )

    op.create_table(
        "numbering_registry",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column(
            "doc_type_id", sa.BigInteger(), sa.ForeignKey("document_types.id"), nullable=False
        ),
        sa.Column("period_key", sa.String(7), nullable=False),
        sa.Column("sequence_name", sa.String(120), nullable=False),
        sa.UniqueConstraint("doc_type_id", "period_key", name="uq_numbering_type_period"),
    )


def downgrade() -> None:
    op.drop_table("numbering_registry")
    op.drop_index("uq_doctype_identity", table_name="document_types")
    op.drop_index("idx_doctype_dir_unit", table_name="document_types")
    op.drop_table("document_types")
