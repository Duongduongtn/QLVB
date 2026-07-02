"""processing_tasks — phân công 1 người/CV, bỏ ràng buộc theo đơn vị

Revision ID: 0021_task_drop_unit
Revises: 0020_org_fullname_trgm
Create Date: 2026-07-02

Quyết định chủ dự án (02/07/2026): công văn đến giao cho 1 người xử lý, bỏ hẳn nhãn
đơn vị GDNN/DVDL trên task. An toàn: prod chưa có CV nào giao cho 2 đơn vị (2 task/CV).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0021_task_drop_unit"
down_revision = "0020_org_fullname_trgm"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Bỏ ràng buộc "1 task / đơn vị / CV" (E2 cũ) → cho mỗi CV tối đa 1 task.
    op.drop_constraint("uq_task_incoming_unit", "processing_tasks", type_="unique")
    op.alter_column(
        "processing_tasks", "unit_id", existing_type=sa.BigInteger(), nullable=True
    )
    op.create_unique_constraint("uq_task_incoming", "processing_tasks", ["incoming_id"])


def downgrade() -> None:
    op.drop_constraint("uq_task_incoming", "processing_tasks", type_="unique")
    op.alter_column(
        "processing_tasks", "unit_id", existing_type=sa.BigInteger(), nullable=False
    )
    op.create_unique_constraint(
        "uq_task_incoming_unit", "processing_tasks", ["incoming_id", "unit_id"]
    )
