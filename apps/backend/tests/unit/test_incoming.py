"""Unit test service CV đến — register + dedup + set_ocr (E1/E1.6)."""

from __future__ import annotations

from datetime import date
from typing import Any

import pytest

from app.core.errors import Conflict, ValidationFailed
from app.models.incoming_document import IncomingDocument
from app.services import incoming as inc


class _Res:
    def __init__(self, obj: Any) -> None:
        self._obj = obj

    def scalar_one_or_none(self) -> Any:
        return self._obj


class _Scalars:
    def __init__(self, rows: list[Any]) -> None:
        self._rows = rows

    def all(self) -> list[Any]:
        return self._rows

    def first(self) -> Any:
        return self._rows[0] if self._rows else None


class _DocType:
    id = 1
    direction = "in"
    reset_policy = "year"
    code = "CV"
    number_format = "{STT}/{NAM}/CV-DEN"
    zero_pad = 3


class FakeDB:
    def __init__(self, doc: Any = None, dt: Any = None, rows: list[Any] | None = None) -> None:
        self.doc = doc
        self.dt = dt
        self.rows = rows or []
        self.added: list[Any] = []
        self.committed = False

    def execute(self, _s: Any) -> Any:
        return _Res(self.doc)

    def scalars(self, _s: Any) -> _Scalars:
        return _Scalars(self.rows)

    def get(self, _model: Any, _id: Any) -> Any:
        return self.dt

    def add(self, o: Any) -> None:
        self.added.append(o)

    def flush(self) -> None: ...
    def commit(self) -> None:
        self.committed = True

    def refresh(self, _o: Any) -> None: ...


def _doc(**kw: Any) -> IncomingDocument:
    base: dict[str, Any] = {
        "id": 5,
        "status": "draft",
        "subject": "Trích yếu test",
        "sha256": "abc",
        "signature_status": "unchecked",
        "document_date": date(2026, 6, 12),
    }
    base.update(kw)
    return IncomingDocument(**base)


# ── set_ocr_result: chỉ điền field còn trống, không đè tay ───────────
def test_set_ocr_fills_empty_only() -> None:
    doc = _doc(reference_number=None, document_date=None)
    db = FakeDB(doc=doc)
    inc.set_ocr_result(db, 5, ocr_text="text", auto_fill={"reference_number": "1/AB", "document_date": "2026-06-12"})  # type: ignore[arg-type]
    assert doc.reference_number == "1/AB"
    assert doc.document_date == date(2026, 6, 12)
    assert doc.ocr_text == "text"


def test_set_ocr_does_not_overwrite_user() -> None:
    doc = _doc(reference_number="USER-99", document_date=date(2026, 1, 1))
    inc.set_ocr_result(FakeDB(doc=doc), 5, ocr_text="t", auto_fill={"reference_number": "OCR-1"})  # type: ignore[arg-type]
    assert doc.reference_number == "USER-99"  # giữ giá trị user


# ── register ────────────────────────────────────────────────────────
def test_register_allocates_number(monkeypatch: pytest.MonkeyPatch) -> None:
    doc = _doc()
    db = FakeDB(doc=doc, dt=_DocType())
    monkeypatch.setattr(inc, "check_duplicates", lambda _db, _d: [])
    monkeypatch.setattr(inc.numbering, "allocate_number", lambda _db, _dt, **k: (7, "007/2026/CV-DEN"))
    out = inc.register(db, 5, doc_type_id=1, override_reason=None, actor_id=1, ip=None, ua=None, today=date(2026, 6, 27))  # type: ignore[arg-type]
    assert out.number == "007/2026/CV-DEN" and out.number_int == 7 and out.status == "registered"
    assert "incoming_register" in [getattr(a, "action", None) for a in db.added]


def test_register_exact_dup_needs_reason(monkeypatch: pytest.MonkeyPatch) -> None:
    doc = _doc()
    monkeypatch.setattr(inc, "check_duplicates", lambda _db, _d: [{"layer": 1, "level": "red", "doc_id": 9}])
    with pytest.raises(Conflict):
        inc.register(FakeDB(doc=doc, dt=_DocType()), 5, doc_type_id=1, override_reason=None, actor_id=1, ip=None, ua=None, today=date(2026, 6, 27))  # type: ignore[arg-type]


def test_register_valid_signature_skips_dedup(monkeypatch: pytest.MonkeyPatch) -> None:
    doc = _doc(signature_status="valid")
    db = FakeDB(doc=doc, dt=_DocType())

    def _boom(_db: Any, _d: Any) -> Any:
        raise AssertionError("không được gọi dedup khi chữ ký số hợp lệ")

    monkeypatch.setattr(inc, "check_duplicates", _boom)
    monkeypatch.setattr(inc.numbering, "allocate_number", lambda _db, _dt, **k: (1, "001"))
    out = inc.register(db, 5, doc_type_id=1, override_reason=None, actor_id=1, ip=None, ua=None, today=date(2026, 6, 27))  # type: ignore[arg-type]
    assert out.status == "registered"


def test_register_rejects_outgoing_doctype(monkeypatch: pytest.MonkeyPatch) -> None:
    dt = _DocType()
    dt.direction = "out"  # sai hướng
    monkeypatch.setattr(inc, "check_duplicates", lambda _db, _d: [])
    with pytest.raises(ValidationFailed):
        inc.register(FakeDB(doc=_doc(), dt=dt), 5, doc_type_id=1, override_reason=None, actor_id=1, ip=None, ua=None, today=date(2026, 6, 27))  # type: ignore[arg-type]


def test_register_requires_subject(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(inc, "check_duplicates", lambda _db, _d: [])
    with pytest.raises(ValidationFailed):
        inc.register(FakeDB(doc=_doc(subject=None), dt=_DocType()), 5, doc_type_id=1, override_reason=None, actor_id=1, ip=None, ua=None, today=date(2026, 6, 27))  # type: ignore[arg-type]


# ── auto vào sổ khi tải lên (02/07/2026) ────────────────────────────
def test_auto_register_on_upload_allocates(monkeypatch: pytest.MonkeyPatch) -> None:
    doc = _doc(status="draft", number=None, subject=None)  # chưa OCR → chưa có trích yếu
    db = FakeDB(doc=doc, rows=[_DocType()])
    monkeypatch.setattr(inc.numbering, "allocate_number", lambda _db, _dt, **k: (3, "003/2026/CV-DEN"))
    inc._auto_register_on_upload(db, doc, actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]
    assert doc.status == "registered"  # cấp số dù CHƯA có trích yếu (điền sau)
    assert doc.number == "003/2026/CV-DEN" and doc.number_int == 3
    assert "incoming_register" in [getattr(a, "action", None) for a in db.added]


def test_auto_register_no_doctype_rejects() -> None:
    doc = _doc(status="draft", number=None)
    with pytest.raises(ValidationFailed):  # chưa cấu hình sổ 'in' → từ chối (không tạo nháp mồ côi)
        inc._auto_register_on_upload(FakeDB(doc=doc, rows=[]), doc, actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]


# ── xoá mềm ─────────────────────────────────────────────────────────
def test_soft_delete_marks_and_audits() -> None:
    doc = _doc(status="registered", number="001/2026")
    db = FakeDB(doc=doc)
    inc.soft_delete(db, 5, actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]
    assert doc.deleted_at is not None and db.committed
    assert "incoming_delete" in [getattr(a, "action", None) for a in db.added]


# ── dedup ───────────────────────────────────────────────────────────
def test_check_duplicates_layer1_hash() -> None:
    # doc không có ref/date/ocr → chỉ chạy lớp 1 (sha256); FakeDB trả bản trùng.
    doc = _doc(reference_number=None, document_date=None, ocr_text=None)
    other = _doc(id=9, number="001/2026/CV-DEN")
    dups = inc.check_duplicates(FakeDB(rows=[other]), doc)  # type: ignore[arg-type]
    assert len(dups) == 1
    assert dups[0]["layer"] == 1 and dups[0]["level"] == "red" and dups[0]["doc_id"] == 9


def test_check_duplicates_layer2_metadata() -> None:
    # không sha (bỏ lớp 1), đủ 3 field metadata → lớp 2 vàng.
    doc = _doc(sha256=None, reference_number="1/AB", sender_org_id=3, document_date=date(2026, 6, 1), ocr_text=None)
    other = _doc(id=9, number="002/2026")
    dups = inc.check_duplicates(FakeDB(rows=[other]), doc)  # type: ignore[arg-type]
    assert len(dups) == 1 and dups[0]["layer"] == 2 and dups[0]["level"] == "yellow"


def test_check_duplicates_layer3_similarity() -> None:
    text = "Về việc hướng dẫn quyết toán kinh phí đào tạo nghề năm 2025 cho các đơn vị trực thuộc sở." * 2
    doc = _doc(sha256=None, reference_number=None, document_date=None, ocr_text=text)
    other = _doc(id=9, number="003/2026", ocr_text=text)
    dups = inc.check_duplicates(FakeDB(rows=[other]), doc)  # type: ignore[arg-type]
    assert len(dups) == 1 and dups[0]["layer"] == 3 and dups[0]["level"] == "green"


# ── cancel: giữ số ──────────────────────────────────────────────────
def test_cancel_keeps_number() -> None:
    doc = _doc(status="registered", number="0125/2026", number_int=125)
    out = inc.cancel(FakeDB(doc=doc), 5, "nhập nhầm", actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]
    assert out.status == "cancelled" and out.number == "0125/2026" and out.cancel_reason == "nhập nhầm"


def test_cancel_already_cancelled() -> None:
    from app.core.errors import Conflict as _Conflict

    with pytest.raises(_Conflict):
        inc.cancel(FakeDB(doc=_doc(status="cancelled")), 5, "x", actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]
