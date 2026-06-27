"""Unit test phụ lục CV đến (E4) — validation + helper thuần (không chạm storage thật)."""

from __future__ import annotations

from typing import Any

import pytest

from app.core.errors import Conflict, NotFound, PermissionDenied, ValidationFailed
from app.services import incoming_attachments as att

pytestmark = pytest.mark.unit


class FakeDB:
    def __init__(self, obj: Any = None) -> None:
        self.obj = obj
        self.committed = False

    def get(self, _model: Any, _id: Any) -> Any:
        return self.obj

    def commit(self) -> None:
        self.committed = True


# ── _ext_of ───────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("name,ext", [
    ("a.PDF", "pdf"),
    ("báo cáo.xlsx", "xlsx"),
    ("ảnh.JPG", "jpg"),
    ("khong-co-duoi", ""),
    (None, ""),
])
def test_ext_of(name: str | None, ext: str) -> None:
    assert att._ext_of(name) == ext


# ── _safe_zip_name: chống traversal + dedup ───────────────────────────────────
def test_safe_zip_name_strips_path() -> None:
    seen: set[str] = set()
    assert att._safe_zip_name("../../etc/passwd", seen) == "passwd"
    assert att._safe_zip_name("a/b/c.pdf", seen) == "c.pdf"


def test_safe_zip_name_dedup() -> None:
    seen: set[str] = set()
    assert att._safe_zip_name("cv.pdf", seen) == "cv.pdf"
    assert att._safe_zip_name("cv.pdf", seen) == "cv_1.pdf"
    assert att._safe_zip_name("cv.pdf", seen) == "cv_2.pdf"


# ── add_attachment: validation TRƯỚC khi chạm storage ─────────────────────────
def test_add_rejects_empty() -> None:
    with pytest.raises(ValidationFailed):
        att.add_attachment(FakeDB(), 1, b"", "a.pdf", actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]


def test_add_rejects_oversize() -> None:
    big = b"x" * (att.MAX_FILE_BYTES + 1)
    with pytest.raises(ValidationFailed):
        att.add_attachment(FakeDB(), 1, big, "a.pdf", actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]


def test_add_rejects_bad_ext() -> None:
    with pytest.raises(ValidationFailed):
        att.add_attachment(FakeDB(), 1, b"data", "virus.exe", actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]


def test_add_rejects_total_over_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(att, "total_size", lambda _db, _id: att.MAX_TOTAL_BYTES)
    with pytest.raises(Conflict):
        att.add_attachment(FakeDB(), 1, b"data", "a.pdf", actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]


# ── set_ocr_text ──────────────────────────────────────────────────────────────
def test_set_ocr_text_missing_attachment_noop() -> None:
    db = FakeDB(obj=None)
    att.set_ocr_text(db, 99, "text")  # type: ignore[arg-type]
    assert db.committed is False


# ── get_attachment scope + delete permission (IDOR/quyền) ─────────────────────
def test_get_attachment_wrong_incoming_404() -> None:
    class _Att:
        incoming_id = 2  # thuộc CV khác

    with pytest.raises(NotFound):
        att.get_attachment(FakeDB(obj=_Att()), 1, 5)  # type: ignore[arg-type]


def test_delete_requires_uploader_or_manager() -> None:
    class _Att:
        incoming_id = 1
        file_id = 2
        uploaded_by = 7  # người khác

    with pytest.raises(PermissionDenied):
        att.delete_attachment(FakeDB(obj=_Att()), 1, 5, actor_id=9, actor_role="staff", ip=None, ua=None)  # type: ignore[arg-type]


def test_set_ocr_text_writes() -> None:
    class _Att:
        ocr_text = None

    obj = _Att()
    db = FakeDB(obj=obj)
    att.set_ocr_text(db, 1, "nội dung phụ lục")  # type: ignore[arg-type]
    assert obj.ocr_text == "nội dung phụ lục"
    assert db.committed is True
