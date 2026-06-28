"""F1 full-text search — search_vector tsvector + trigger + GIN index (CV đi/đến)

Revision ID: 0015_search_vector
Revises: 0014_incoming_attachments
Create Date: 2026-06-28

Thiết kế (TDD §9): `simple` + `unaccent` (tìm có/không dấu) + `pg_trgm` (fuzzy lỗi chính tả
nhẹ). search_vector tính bằng TRIGGER BEFORE INSERT/UPDATE (unaccent không IMMUTABLE nên
không dùng generated column / index expression được — trigger plpgsql tránh được giới hạn).
Bất biến bảo mật: CV đến `manager_only=TRUE` → search_vector KHÔNG chứa ocr_text (bật cờ sau
khi vào sổ sẽ xoá OCR khỏi index). Query của nhân viên còn thêm điều kiện manager_only=FALSE.
"""

from __future__ import annotations

from alembic import op

revision = "0015_search_vector"
down_revision = "0014_incoming_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # Wrapper IMMUTABLE cho unaccent (bản gốc chỉ STABLE → không index được). Ghim dictionary
    # 'unaccent' để an toàn đánh dấu IMMUTABLE → dùng cho index trigram f_unaccent(subject).
    op.execute(
        """
        CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text AS $$
          SELECT unaccent('unaccent', $1)
        $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
        """
    )

    op.execute("ALTER TABLE incoming_documents ADD COLUMN search_vector tsvector")
    op.execute("ALTER TABLE outgoing_documents ADD COLUMN search_vector tsvector")

    # ── Trigger CV đến: manager_only loại ocr_text khỏi index ──────────────────
    op.execute(
        """
        CREATE OR REPLACE FUNCTION inc_search_vector_update() RETURNS trigger AS $$
        BEGIN
          IF NEW.manager_only THEN
            NEW.search_vector := to_tsvector('simple', unaccent(
              coalesce(NEW.subject,'') || ' ' ||
              coalesce(NEW.reference_number,'') || ' ' ||
              coalesce(NEW.number,'')));
          ELSE
            NEW.search_vector := to_tsvector('simple', unaccent(
              coalesce(NEW.subject,'') || ' ' ||
              coalesce(NEW.reference_number,'') || ' ' ||
              coalesce(NEW.number,'') || ' ' ||
              coalesce(NEW.ocr_text,'')));
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_inc_search BEFORE INSERT OR UPDATE ON incoming_documents
        FOR EACH ROW EXECUTE FUNCTION inc_search_vector_update();
        """
    )

    # ── Trigger CV đi: subject + số (không có OCR) ─────────────────────────────
    op.execute(
        """
        CREATE OR REPLACE FUNCTION out_search_vector_update() RETURNS trigger AS $$
        BEGIN
          NEW.search_vector := to_tsvector('simple', unaccent(
            coalesce(NEW.subject,'') || ' ' || coalesce(NEW.number,'')));
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_out_search BEFORE INSERT OR UPDATE ON outgoing_documents
        FOR EACH ROW EXECUTE FUNCTION out_search_vector_update();
        """
    )

    # ── Backfill rows hiện có (trigger không tự chạy cho row cũ) ───────────────
    op.execute(
        """
        UPDATE incoming_documents SET search_vector = CASE WHEN manager_only THEN
          to_tsvector('simple', unaccent(coalesce(subject,'')||' '||coalesce(reference_number,'')||' '||coalesce(number,'')))
        ELSE
          to_tsvector('simple', unaccent(coalesce(subject,'')||' '||coalesce(reference_number,'')||' '||coalesce(number,'')||' '||coalesce(ocr_text,'')))
        END
        """
    )
    op.execute(
        """
        UPDATE outgoing_documents SET search_vector =
          to_tsvector('simple', unaccent(coalesce(subject,'')||' '||coalesce(number,'')))
        """
    )

    # ── Index ──────────────────────────────────────────────────────────────────
    op.execute("CREATE INDEX idx_inc_search ON incoming_documents USING GIN(search_vector)")
    op.execute("CREATE INDEX idx_out_search ON outgoing_documents USING GIN(search_vector)")
    # Trigram fuzzy trên trích yếu KHÔNG DẤU (operator % set_limit mặc định 0.3) → gõ "vit nam"
    # khớp "Việt Nam". Index trên f_unaccent(subject) để query dùng được index.
    op.execute(
        "CREATE INDEX idx_inc_subject_trgm ON incoming_documents USING GIN(f_unaccent(subject) gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX idx_out_subject_trgm ON outgoing_documents USING GIN(f_unaccent(subject) gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_out_subject_trgm")
    op.execute("DROP INDEX IF EXISTS idx_inc_subject_trgm")
    op.execute("DROP INDEX IF EXISTS idx_out_search")
    op.execute("DROP INDEX IF EXISTS idx_inc_search")
    op.execute("DROP TRIGGER IF EXISTS trg_out_search ON outgoing_documents")
    op.execute("DROP TRIGGER IF EXISTS trg_inc_search ON incoming_documents")
    op.execute("DROP FUNCTION IF EXISTS out_search_vector_update()")
    op.execute("DROP FUNCTION IF EXISTS inc_search_vector_update()")
    op.execute("DROP FUNCTION IF EXISTS f_unaccent(text)")
    op.execute("ALTER TABLE outgoing_documents DROP COLUMN IF EXISTS search_vector")
    op.execute("ALTER TABLE incoming_documents DROP COLUMN IF EXISTS search_vector")
