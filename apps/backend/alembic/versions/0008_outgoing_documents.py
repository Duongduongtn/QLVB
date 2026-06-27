"""outgoing_documents + outgoing_recipients — CV ĐI (Nhóm D D1/D6)

Máy trạng thái draft/numbered/published/cancelled. stamp_positions/sealing_option JSONB.
M2M nơi nhận → organizations (M1). Defer: in_reply_to (D5), search_vector TSVECTOR (F1).

Revision ID: 0008_outgoing_documents
Revises: 0007_organizations
Create Date: 2026-06-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008_outgoing_documents"
down_revision = "0007_organizations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "outgoing_documents",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("unit_id", sa.BigInteger(), sa.ForeignKey("units.id"), nullable=False),
        sa.Column(
            "doc_type_id", sa.BigInteger(), sa.ForeignKey("document_types.id"), nullable=False
        ),
        sa.Column("number", sa.String(100), nullable=True),
        sa.Column("number_int", sa.BigInteger(), nullable=True),
        sa.Column("period_key", sa.String(7), nullable=True),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="draft"),
        sa.Column(
            "signing_profile_id", sa.BigInteger(), sa.ForeignKey("signing_profiles.id"), nullable=True
        ),
        sa.Column("stamp_positions", postgresql.JSONB(), nullable=True),
        sa.Column("sealing_option", postgresql.JSONB(), nullable=True),
        sa.Column("original_file_id", sa.BigInteger(), sa.ForeignKey("files.id"), nullable=True),
        sa.Column("signed_file_id", sa.BigInteger(), sa.ForeignKey("files.id"), nullable=True),
        sa.Column("cancel_reason", sa.Text(), nullable=True),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('draft','numbered','published','cancelled')", name="ck_out_status"
        ),
    )
    op.create_index(
        "idx_out_unit_status",
        "outgoing_documents",
        ["unit_id", "status"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    # Chống TRÙNG SỐ trong 1 sổ (loại VB + kỳ) — lưới an toàn DB cho nhánh "dùng số có
    # sẵn" (nhánh tự cấp đã an toàn nhờ SEQUENCE). Bỏ qua bản nháp (number_int NULL) + đã xoá.
    op.create_index(
        "uq_out_number",
        "outgoing_documents",
        ["doc_type_id", "period_key", "number_int"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL AND number_int IS NOT NULL"),
    )

    op.create_table(
        "outgoing_recipients",
        sa.Column(
            "outgoing_id",
            sa.BigInteger(),
            sa.ForeignKey("outgoing_documents.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "organization_id",
            sa.BigInteger(),
            sa.ForeignKey("organizations.id"),
            primary_key=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("outgoing_recipients")
    op.drop_index("uq_out_number", table_name="outgoing_documents")
    op.drop_index("idx_out_unit_status", table_name="outgoing_documents")
    op.drop_table("outgoing_documents")
