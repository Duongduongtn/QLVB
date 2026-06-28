"""Integration test F1 — full-text search thật trên Postgres (trigger + unaccent + trgm).

Bất biến (PRD F1): tìm có/không dấu đều ra (unaccent); fuzzy lỗi chính tả nhẹ (pg_trgm);
Nhân viên KHÔNG thấy CV đến manager_only (2 lớp: query + trigger loại ocr_text). Chạy trên
CI (Postgres service, đã `alembic upgrade head` tạo extension/trigger/index). Skip ở local.
"""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.models.incoming_document import IncomingDocument
from app.services import search as sv

pytestmark = pytest.mark.integration


def _add(db: Session, **kw: object) -> IncomingDocument:
    doc = IncomingDocument(status="registered", **kw)
    db.add(doc)
    db.flush()  # trigger DB điền search_vector ngay khi INSERT
    return doc


def test_unaccent_finds_with_and_without_diacritics(db_session: Session) -> None:
    doc = _add(db_session, subject="Báo cáo Việt Nam về đào tạo nghề năm 2026")
    for q in ("việt nam", "viet nam", "VIET NAM", "đào tạo", "dao tao"):
        items, total = sv.global_search(db_session, q, doc_type="in", include_manager_only=True)
        ids = [it["id"] for it in items]
        assert doc.id in ids, f"không tìm thấy với q={q!r}"
        assert total >= 1


def test_fuzzy_typo_matches(db_session: Session) -> None:
    doc = _add(db_session, subject="Quyết định khen thưởng tập thể")
    # "dinhh" (thừa h) → websearch_to_tsquery KHÔNG khớp token → CHỈ nhánh trgm <% bắt được.
    items, _ = sv.global_search(
        db_session, "quyet dinhh khen thuong tap the", doc_type="in", include_manager_only=True
    )
    assert doc.id in [it["id"] for it in items], "pg_trgm word_similarity không bắt được typo"


def test_manager_only_hidden_from_staff(db_session: Session) -> None:
    doc = _add(db_session, subject="Tài liệu nội bộ tuyệt mật ABC", manager_only=True)
    staff, _ = sv.global_search(db_session, "noi bo", doc_type="in", include_manager_only=False)
    mgr, _ = sv.global_search(db_session, "noi bo", doc_type="in", include_manager_only=True)
    assert doc.id not in [it["id"] for it in staff]  # NV không thấy
    assert doc.id in [it["id"] for it in mgr]  # Quản lý thấy


def test_ocr_text_dropped_for_manager_only(db_session: Session) -> None:
    # manager_only → trigger KHÔNG index ocr_text → kể cả Quản lý cũng không tìm trúng OCR body.
    doc = _add(db_session, subject="Văn bản mật", manager_only=True, ocr_text="ngân sách quyết toán xyzkw")
    mgr, _ = sv.global_search(db_session, "xyzkw", doc_type="in", include_manager_only=True)
    assert doc.id not in [it["id"] for it in mgr]
    # Nhưng CV thường thì OCR body PHẢI tìm được.
    doc2 = _add(db_session, subject="Văn bản thường", ocr_text="ngân sách quyết toán xyzkw")
    mgr2, _ = sv.global_search(db_session, "xyzkw", doc_type="in", include_manager_only=False)
    assert doc2.id in [it["id"] for it in mgr2]


def test_blank_query_returns_empty(db_session: Session) -> None:
    _add(db_session, subject="Có nội dung")
    items, total = sv.global_search(db_session, "   ", doc_type="all", include_manager_only=True)
    assert items == [] and total == 0
