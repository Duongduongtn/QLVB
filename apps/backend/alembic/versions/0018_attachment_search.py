"""F1 mở rộng — search_vector cho phụ lục CV đến (OCR text full-text)

Revision ID: 0018_attachment_search
Revises: 0017_push_subscriptions
Create Date: 2026-06-28

`incoming_attachments.ocr_text` (worker OCR ghi) chưa được index. Thêm cột search_vector +
trigger BEFORE INS/UPD + GIN index → tìm full-text nội dung phụ lục.

**Bất biến bảo mật (parity với 0015 parent-ocr, TDD §8):** OCR phụ lục là NỘI DUNG body của
tài liệu — nếu CV cha `manager_only=TRUE` thì KHÔNG index OCR phụ lục (kể cả Quản lý cũng không
tìm trúng OCR body, giống parent). 2 lớp: (1) query thêm `manager_only=FALSE` cho Nhân viên,
(2) trigger loại OCR khỏi index khi cha mật. Đổi cờ `manager_only` của CV cha SAU khi phụ lục đã
OCR → trigger AFTER UPDATE trên `incoming_documents` rebuild lại search_vector các phụ lục con.
Cắt `left(ocr_text, 500000)` chống vượt giới hạn 1MB/tsvector của Postgres khi OCR nhiều trang.
"""

from __future__ import annotations

from alembic import op

revision = "0018_attachment_search"
down_revision = "0017_push_subscriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE incoming_attachments ADD COLUMN search_vector tsvector")

    # ── Trigger phụ lục: index OCR, nhưng CV cha manager_only → KHÔNG index (search_vector NULL).
    op.execute(
        """
        CREATE OR REPLACE FUNCTION inc_att_search_vector_update() RETURNS trigger AS $$
        DECLARE parent_mo boolean;
        BEGIN
          SELECT manager_only INTO parent_mo FROM incoming_documents WHERE id = NEW.incoming_id;
          IF coalesce(parent_mo, false) THEN
            NEW.search_vector := NULL;
          ELSE
            NEW.search_vector := to_tsvector('simple', unaccent(left(coalesce(NEW.ocr_text,''), 500000)));
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_inc_att_search BEFORE INSERT OR UPDATE ON incoming_attachments
        FOR EACH ROW EXECUTE FUNCTION inc_att_search_vector_update();
        """
    )

    # ── Đổi manager_only của CV cha → rebuild search_vector phụ lục con (bật cờ = xoá OCR khỏi
    #    index; tắt cờ = index lại). AFTER UPDATE, chỉ chạy khi cờ thực sự đổi.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION inc_sync_att_on_mo_change() RETURNS trigger AS $$
        BEGIN
          IF NEW.manager_only IS DISTINCT FROM OLD.manager_only THEN
            UPDATE incoming_attachments SET search_vector = CASE WHEN NEW.manager_only THEN NULL
              ELSE to_tsvector('simple', unaccent(left(coalesce(ocr_text,''), 500000))) END
            WHERE incoming_id = NEW.id;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_inc_sync_att AFTER UPDATE ON incoming_documents
        FOR EACH ROW EXECUTE FUNCTION inc_sync_att_on_mo_change();
        """
    )

    # ── Backfill phụ lục đã OCR (tôn trọng manager_only của CV cha) ───────────────
    op.execute(
        """
        UPDATE incoming_attachments a SET search_vector = CASE WHEN d.manager_only THEN NULL
          ELSE to_tsvector('simple', unaccent(left(coalesce(a.ocr_text,''), 500000))) END
        FROM incoming_documents d WHERE d.id = a.incoming_id
        """
    )
    op.execute("CREATE INDEX idx_inc_att_search ON incoming_attachments USING GIN(search_vector)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_inc_att_search")
    op.execute("DROP TRIGGER IF EXISTS trg_inc_sync_att ON incoming_documents")
    op.execute("DROP FUNCTION IF EXISTS inc_sync_att_on_mo_change()")
    op.execute("DROP TRIGGER IF EXISTS trg_inc_att_search ON incoming_attachments")
    op.execute("DROP FUNCTION IF EXISTS inc_att_search_vector_update()")
    op.execute("ALTER TABLE incoming_attachments DROP COLUMN IF EXISTS search_vector")
