"""Integration test F1 — full-text search thật trên Postgres (trigger + unaccent + trgm).

Bất biến (PRD F1): tìm có/không dấu đều ra (unaccent); fuzzy lỗi chính tả nhẹ (pg_trgm);
Nhân viên KHÔNG thấy CV đến manager_only (2 lớp: query + trigger loại ocr_text). Chạy trên
CI (Postgres service, đã `alembic upgrade head` tạo extension/trigger/index). Skip ở local.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.document_type import DocumentType
from app.models.file import File
from app.models.incoming_attachment import IncomingAttachment
from app.models.incoming_document import IncomingDocument
from app.models.organization import Organization
from app.models.outgoing_document import OutgoingDocument, OutgoingRecipient
from app.models.unit import Unit
from app.services import search as sv

pytestmark = pytest.mark.integration


def _add(db: Session, **kw: object) -> IncomingDocument:
    doc = IncomingDocument(status="registered", **kw)
    db.add(doc)
    db.flush()  # trigger DB điền search_vector ngay khi INSERT
    return doc


def _attach(db: Session, incoming_id: int, ocr_text: str) -> IncomingAttachment:
    f = File(storage_key="k", location="local", sha256="0" * 64, size_bytes=1)
    db.add(f)
    db.flush()
    att = IncomingAttachment(
        incoming_id=incoming_id, file_id=f.id, size_bytes=1, ocr_text=ocr_text
    )
    db.add(att)
    db.flush()  # trigger điền search_vector phụ lục
    return att


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


def test_find_incoming_by_attachment_ocr(db_session: Session) -> None:
    # Từ khoá CHỈ nằm trong OCR phụ lục (không có ở trích yếu CV cha) → vẫn tìm ra CV cha.
    doc = _add(db_session, subject="Công văn kèm phụ lục")
    _attach(db_session, doc.id, "Phụ lục báo cáo tài chính có từ khoá zxqphuluc nội dung")
    items, _ = sv.global_search(db_session, "zxqphuluc", doc_type="in", include_manager_only=True)
    assert doc.id in [it["id"] for it in items]
    # Không dấu cũng ra.
    items2, _ = sv.global_search(db_session, "tai chinh", doc_type="in", include_manager_only=True)
    assert doc.id in [it["id"] for it in items2]


def test_attachment_ocr_dropped_for_manager_only(db_session: Session) -> None:
    # Bất biến (parity parent 0015): CV cha manager_only → OCR phụ lục KHÔNG vào index → kể cả
    # Quản lý cũng không tìm trúng OCR body phụ lục (lớp 2 defense-in-depth).
    doc = _add(db_session, subject="CV mật có phụ lục", manager_only=True)
    _attach(db_session, doc.id, "Số liệu ngân sách bí mật wqxattach")
    staff, _ = sv.global_search(db_session, "wqxattach", doc_type="in", include_manager_only=False)
    mgr, _ = sv.global_search(db_session, "wqxattach", doc_type="in", include_manager_only=True)
    assert doc.id not in [it["id"] for it in staff]  # NV không thấy (lớp 1)
    assert doc.id not in [it["id"] for it in mgr]  # cả Quản lý cũng không (lớp 2 — OCR không index)


def test_attachment_ocr_indexed_on_update_path(db_session: Session) -> None:
    # Luồng worker thật: phụ lục tạo với ocr_text=NULL, OCR xong mới UPDATE → trigger BEFORE
    # UPDATE phải index lại.
    doc = _add(db_session, subject="CV có phụ lục chờ OCR")
    att = _attach(db_session, doc.id, ocr_text="")  # chưa OCR
    before, _ = sv.global_search(db_session, "krtupdate", doc_type="in", include_manager_only=True)
    assert doc.id not in [it["id"] for it in before]
    att.ocr_text = "Nội dung sau khi OCR có từ khoá krtupdate"
    db_session.flush()  # UPDATE → trigger recompute search_vector
    after, _ = sv.global_search(db_session, "krtupdate", doc_type="in", include_manager_only=True)
    assert doc.id in [it["id"] for it in after]


def test_attachment_reindexed_when_manager_only_toggled(db_session: Session) -> None:
    # Đổi cờ manager_only CV cha SAU khi phụ lục đã OCR → trigger AFTER UPDATE rebuild phụ lục.
    doc = _add(db_session, subject="CV thường có phụ lục")
    _attach(db_session, doc.id, "Báo cáo có từ khoá ftoggle ngân sách")
    found, _ = sv.global_search(db_session, "ftoggle", doc_type="in", include_manager_only=True)
    assert doc.id in [it["id"] for it in found]
    # Bật manager_only → OCR phụ lục phải bị gỡ khỏi index.
    doc.manager_only = True
    db_session.flush()
    gone, _ = sv.global_search(db_session, "ftoggle", doc_type="in", include_manager_only=True)
    assert doc.id not in [it["id"] for it in gone]


def test_multiple_matching_attachments_no_duplicate(db_session: Session) -> None:
    # 1 CV có nhiều phụ lục cùng khớp → EXISTS trả 1 dòng CV cha, không nhân bản.
    doc = _add(db_session, subject="CV nhiều phụ lục")
    _attach(db_session, doc.id, "Phụ lục một có từ khoá dupkey alpha")
    _attach(db_session, doc.id, "Phụ lục hai cũng có từ khoá dupkey beta")
    items, total = sv.global_search(db_session, "dupkey", doc_type="in", include_manager_only=True)
    ids = [it["id"] for it in items]
    assert ids.count(doc.id) == 1
    assert total == 1


def test_blank_query_returns_empty(db_session: Session) -> None:
    _add(db_session, subject="Có nội dung")
    items, total = sv.global_search(db_session, "   ", doc_type="all", include_manager_only=True)
    assert items == [] and total == 0


# ── F1 mở rộng — khớp theo TÊN cơ quan/người (không nằm trong trích yếu) ──────
def test_find_incoming_by_sender_name(db_session: Session) -> None:
    org = Organization(full_name="Ủy ban nhân dân tỉnh Quảng Ninh", is_sender=True)
    db_session.add(org)
    db_session.flush()
    doc = _add(db_session, subject="Về kế hoạch công tác quý 3", sender_org_id=org.id)
    # Từ khoá KHÔNG có trong trích yếu → chỉ khớp được qua tên cơ quan gửi.
    items, _ = sv.global_search(db_session, "Quang Ninh", doc_type="in", include_manager_only=True)
    assert doc.id in [it["id"] for it in items]


def test_find_outgoing_by_recipient_name(db_session: Session) -> None:
    unit = db_session.scalar(select(Unit).where(Unit.code == "GDNN"))
    assert unit is not None
    dt = DocumentType(
        direction="out", unit_id=unit.id, name="Công văn", code="CV",
        number_format="{STT}", reset_policy="year", zero_pad=3, is_active=True,
    )
    db_session.add(dt)
    db_session.flush()
    org = Organization(full_name="Sở Giáo dục và Đào tạo Hà Nội", is_recipient=True)
    db_session.add(org)
    db_session.flush()
    doc = OutgoingDocument(
        unit_id=unit.id, doc_type_id=dt.id, number="01/CV", number_int=1,
        subject="Về việc tập huấn chuyên môn", issue_date=date(2026, 6, 1), status="published",
    )
    db_session.add(doc)
    db_session.flush()
    db_session.add(OutgoingRecipient(outgoing_id=doc.id, organization_id=org.id))
    db_session.flush()
    # "Giao duc Ha Noi" KHÔNG nằm trong trích yếu → chỉ khớp qua tên nơi nhận.
    items, _ = sv.global_search(db_session, "Giao duc Ha Noi", doc_type="out", include_manager_only=True)
    assert doc.id in [it["id"] for it in items]


def test_sender_name_match_still_respects_manager_only(db_session: Session) -> None:
    # Bất biến: nhánh khớp-tên-cơ-quan KHÔNG được phá lọc manager_only của Nhân viên.
    org = Organization(full_name="Bộ Công an", is_sender=True)
    db_session.add(org)
    db_session.flush()
    doc = _add(db_session, subject="Tài liệu mật nội bộ", manager_only=True, sender_org_id=org.id)
    staff, _ = sv.global_search(db_session, "Cong an", doc_type="in", include_manager_only=False)
    mgr, _ = sv.global_search(db_session, "Cong an", doc_type="in", include_manager_only=True)
    assert doc.id not in [it["id"] for it in staff]  # NV không thấy dù khớp tên cơ quan
    assert doc.id in [it["id"] for it in mgr]
