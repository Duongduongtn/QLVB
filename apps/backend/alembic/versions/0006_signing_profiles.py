"""signing_profiles — C4 (SIG.PRO hồ sơ ký chống nhầm mộc)

1 hồ sơ = người ký + mộc + chức danh + đơn vị. Ràng buộc seal.unit_id = unit_id kiểm
ở service (chống nhầm). Inactive thay vì xoá.

Revision ID: 0006_signing_profiles
Revises: 0005_signatures
Create Date: 2026-06-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0006_signing_profiles"
down_revision = "0005_signatures"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "signing_profiles",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("unit_id", sa.BigInteger(), sa.ForeignKey("units.id"), nullable=False),
        sa.Column("signature_id", sa.BigInteger(), sa.ForeignKey("signatures.id"), nullable=False),
        sa.Column("seal_id", sa.BigInteger(), sa.ForeignKey("seals.id"), nullable=False),
        sa.Column("display_title", sa.String(150), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
    )
    op.create_index("idx_profiles_unit", "signing_profiles", ["unit_id"])


def downgrade() -> None:
    op.drop_index("idx_profiles_unit", table_name="signing_profiles")
    op.drop_table("signing_profiles")
