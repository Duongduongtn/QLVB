"""organizations — M1 danh bạ nơi nhận + M2 cơ quan gửi (1 bảng, 2 vai)

Soft delete (deleted_at). Index theo vai (is_recipient/is_sender) cho lọc nhanh. GIN
pg_trgm cho fuzzy-match M2 để DÀNH lại story E1 (chưa cần ở MVP danh bạ).

Revision ID: 0007_organizations
Revises: 0006_signing_profiles
Create Date: 2026-06-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0007_organizations"
down_revision = "0006_signing_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("full_name", sa.String(300), nullable=False),
        sa.Column("short_name", sa.String(150), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(30), nullable=True),
        sa.Column("contact_person", sa.String(150), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("is_recipient", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_sender", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("category", sa.String(10), nullable=False, server_default="common"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint("category IN ('common','gdnn','dvdl')", name="ck_org_category"),
    )
    # Lọc theo vai chỉ trên cơ quan còn hoạt động (chưa soft-delete).
    op.create_index(
        "idx_org_recipient",
        "organizations",
        ["is_recipient"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "idx_org_sender",
        "organizations",
        ["is_sender"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_org_sender", table_name="organizations")
    op.drop_index("idx_org_recipient", table_name="organizations")
    op.drop_table("organizations")
