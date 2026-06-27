"""incoming_documents — CV ĐẾN (Nhóm E E1), sổ chung 2 đơn vị

Dedup 3 lớp (sha256 + metadata + ocr_text). Verify PAdES (signature_status/info).
manager_only = cờ "Chỉ Quản lý xem". Defer: processing_tasks (E2), attachments (E4).

Revision ID: 0010_incoming_documents
Revises: 0009_audit_created_index
Create Date: 2026-06-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010_incoming_documents"
down_revision = "0009_audit_created_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "incoming_documents",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("number", sa.String(100), nullable=True),
        sa.Column("number_int", sa.BigInteger(), nullable=True),
        sa.Column("period_key", sa.String(7), nullable=True),
        sa.Column("doc_type_id", sa.BigInteger(), sa.ForeignKey("document_types.id"), nullable=True),
        sa.Column("reference_number", sa.String(100), nullable=True),
        sa.Column("document_date", sa.Date(), nullable=True),
        sa.Column("sender_org_id", sa.BigInteger(), sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("subject", sa.Text(), nullable=True),
        sa.Column("urgency", sa.String(14), nullable=False, server_default="normal"),
        sa.Column("confidentiality", sa.String(16), nullable=False, server_default="normal"),
        sa.Column("deadline", sa.Date(), nullable=True),
        sa.Column("manager_only", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("file_id", sa.BigInteger(), sa.ForeignKey("files.id"), nullable=True),
        sa.Column("sha256", sa.String(64), nullable=True),
        sa.Column("ocr_text", sa.Text(), nullable=True),
        sa.Column("signature_status", sa.String(10), nullable=False, server_default="unchecked"),
        sa.Column("signature_info", postgresql.JSONB(), nullable=True),
        sa.Column("status", sa.String(12), nullable=False, server_default="draft"),
        sa.Column("duplicate_note", sa.Text(), nullable=True),
        sa.Column("cancel_reason", sa.Text(), nullable=True),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint("status IN ('draft','registered','cancelled')", name="ck_inc_status"),
        sa.CheckConstraint(
            "urgency IN ('normal','urgent','very_urgent','express','express_timed')",
            name="ck_inc_urgency",
        ),
        sa.CheckConstraint(
            "confidentiality IN ('normal','secret','top_secret','highest_secret')",
            name="ck_inc_confidentiality",
        ),
        sa.CheckConstraint(
            "signature_status IN ('unchecked','none','valid','invalid')", name="ck_inc_sig"
        ),
    )
    op.create_index(
        "idx_inc_sha256", "incoming_documents", ["sha256"], postgresql_where=sa.text("deleted_at IS NULL")
    )
    op.create_index(
        "idx_inc_dup_meta",
        "incoming_documents",
        ["reference_number", "sender_org_id", "document_date"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index("idx_inc_status_created", "incoming_documents", ["status", "created_at"])
    op.create_index(
        "uq_inc_number",
        "incoming_documents",
        ["doc_type_id", "period_key", "number_int"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL AND number_int IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_inc_number", table_name="incoming_documents")
    op.drop_index("idx_inc_status_created", table_name="incoming_documents")
    op.drop_index("idx_inc_dup_meta", table_name="incoming_documents")
    op.drop_index("idx_inc_sha256", table_name="incoming_documents")
    op.drop_table("incoming_documents")
