"""M2 — GIN trigram index trên f_unaccent(full_name) để fuzzy-match cơ quan

Revision ID: 0020_org_fullname_trgm
Revises: 0019_incoming_sender_org_name
Create Date: 2026-06-28

pg_trgm + wrapper IMMUTABLE f_unaccent đã tạo ở migration 0015. Index trigram (partial:
chỉ cơ quan còn hoạt động) để query `f_unaccent(full_name) % f_unaccent(:name)` dùng được
index — bắt biến thể tên gần giống (M2 edge: "Bộ Tài chính" ~ "Bộ Tài Chính"). pg_trgm tự
fold lowercase nên không cần lower() thủ công.
"""

from __future__ import annotations

from alembic import op

revision = "0020_org_fullname_trgm"
down_revision = "0019_incoming_sender_org_name"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX idx_org_fullname_trgm ON organizations "
        "USING GIN (f_unaccent(full_name) gin_trgm_ops) WHERE deleted_at IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_org_fullname_trgm")
