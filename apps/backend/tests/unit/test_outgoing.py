"""Unit test CV đi — D1 render stamped + range validate + router wiring.

render_stamped chạy thật engine PyMuPDF (monkeypatch storage đọc file/asset). Phần cấp số
(allocate_number nextval) cần Postgres → đã cover ở test_numbering_db.py (integration CI).
"""

from __future__ import annotations

import io
from typing import Any

import pytest

fitz = pytest.importorskip("fitz")
PILImage = pytest.importorskip("PIL.Image")
from PIL import ImageDraw  # noqa: E402

from app.core import storage  # noqa: E402
from app.core.errors import Conflict, NotFound, ValidationFailed  # noqa: E402
from app.models.file import File  # noqa: E402
from app.models.outgoing_document import OutgoingDocument  # noqa: E402
from app.models.seal import Seal  # noqa: E402
from app.models.signature import Signature  # noqa: E402
from app.models.signing_profile import SigningProfile  # noqa: E402
from app.services import outgoing as out_svc  # noqa: E402


# ── _resolve_range (D3/D4 validate) ─────────────────────────────────
def test_resolve_range_all() -> None:
    assert out_svc._resolve_range({"kind": "all"}, 5) == (1, 5)


def test_resolve_range_explicit() -> None:
    assert out_svc._resolve_range({"kind": "range", "page_from": 2, "page_to": 4}, 6) == (2, 4)


def test_resolve_range_rejects_from_gt_to() -> None:
    with pytest.raises(ValidationFailed):
        out_svc._resolve_range({"kind": "range", "page_from": 5, "page_to": 2}, 10)


def test_resolve_range_rejects_beyond_page_count() -> None:
    with pytest.raises(ValidationFailed):
        out_svc._resolve_range({"kind": "range", "page_from": 1, "page_to": 99}, 4)


# ── _validate_profile (CHỐNG NHẦM MỘC — bất biến D1.9/C4) ───────────
class _GetDB:
    def __init__(self, obj: Any) -> None:
        self._obj = obj

    def get(self, _model: Any, _id: Any) -> Any:
        return self._obj


def test_validate_profile_rejects_wrong_unit() -> None:
    profile = SigningProfile(id=10, unit_id=2, signature_id=3, seal_id=5, display_title="GĐ", name="HS")
    with pytest.raises(ValidationFailed):  # hồ sơ đơn vị 2, phát hành đơn vị 1
        out_svc._validate_profile(_GetDB(profile), 10, 1)  # type: ignore[arg-type]


def test_validate_profile_rejects_inactive() -> None:
    profile = SigningProfile(
        id=10, unit_id=1, signature_id=3, seal_id=5, display_title="GĐ", name="HS", is_active=False
    )
    with pytest.raises(ValidationFailed):
        out_svc._validate_profile(_GetDB(profile), 10, 1)  # type: ignore[arg-type]


def test_validate_profile_not_found() -> None:
    with pytest.raises(NotFound):
        out_svc._validate_profile(_GetDB(None), 10, 1)  # type: ignore[arg-type]


def test_validate_profile_ok_same_unit_active() -> None:
    profile = SigningProfile(
        id=10, unit_id=1, signature_id=3, seal_id=5, display_title="GĐ", name="HS", is_active=True
    )
    assert out_svc._validate_profile(_GetDB(profile), 10, 1).id == 10  # type: ignore[arg-type]


# ── render_stamped orchestration ────────────────────────────────────
def _pdf(pages: int = 3) -> bytes:
    doc = fitz.open()
    for i in range(pages):
        doc.new_page(width=595, height=842).insert_text((72, 72), f"Trang {i + 1}")
    out = bytes(doc.tobytes())
    doc.close()
    return out


def _png() -> bytes:
    img = PILImage.new("RGBA", (160, 160), (255, 255, 255, 0))
    ImageDraw.Draw(img).ellipse([10, 10, 150, 150], outline=(220, 30, 30, 255), width=8)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _img_counts(pdf_bytes: bytes) -> list[int]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    counts = [len(doc[i].get_images()) for i in range(doc.page_count)]
    doc.close()
    return counts


class FakeDB:
    """db.get phân giải theo (Model, id)."""

    def __init__(self, objs: dict[tuple[Any, int], Any]) -> None:
        self.objs = objs

    def get(self, model: Any, obj_id: Any) -> Any:
        return self.objs.get((model, obj_id))


def _setup() -> tuple[FakeDB, OutgoingDocument]:
    objs: dict[tuple[Any, int], Any] = {
        (File, 1): File(id=1, storage_key="cv/x.enc", wrapped_key=b"k", sha256="h", size_bytes=1),
        (SigningProfile, 10): SigningProfile(
            id=10, unit_id=1, signature_id=3, seal_id=5, display_title="GĐ", name="HS"
        ),
        (Seal, 5): Seal(id=5, unit_id=1, name="M", seal_type="round", file_id=21, is_active=True),
        (Signature, 3): Signature(id=3, full_name="A", file_id=22, is_active=True),
        (File, 21): File(id=21, storage_key="seals/s.png", sha256="h", size_bytes=1),
        (File, 22): File(id=22, storage_key="signatures/g.png", sha256="h", size_bytes=1),
    }
    doc = OutgoingDocument(
        id=99,
        unit_id=1,
        doc_type_id=2,
        subject="Test",
        issue_date=__import__("datetime").date(2026, 6, 27),
        status="draft",
        original_file_id=1,
        signing_profile_id=10,
        stamp_positions=[
            {"kind": "signature", "page": 3, "x_pct": 0.55, "y_pct": 0.72, "w_pct": 0.2, "h_pct": 0.1},
            {"kind": "seal", "page": 3, "x_pct": 0.6, "y_pct": 0.7, "w_pct": 0.14, "h_pct": 0.14},
        ],
        sealing_option={"giap_lai": {"kind": "all"}, "ky_nhay": {"kind": "all"}},
    )
    return FakeDB(objs), doc


def test_render_stamped_applies_stamp_giaplai_kynhay(monkeypatch: pytest.MonkeyPatch) -> None:
    db, doc = _setup()
    raw_pdf = _pdf(3)
    png = _png()
    monkeypatch.setattr(out_svc, "read_encrypted_file", lambda key, wk: raw_pdf)
    monkeypatch.setattr(out_svc, "read_asset", lambda key: png)

    out = out_svc.render_stamped(db, doc)  # type: ignore[arg-type]
    counts = _img_counts(out)
    # trang 3: mộc + chữ ký (stamp) + dải giáp lai (ký nháy bỏ trang cuối) = 3
    assert counts[2] >= 3
    # trang 1,2: giáp lai + ký nháy = 2 mỗi trang
    assert counts[0] >= 2 and counts[1] >= 2
    assert out_svc.pdf_stamp.pdf_page_count(out) == 3


def test_render_stamped_requires_file(monkeypatch: pytest.MonkeyPatch) -> None:
    db, doc = _setup()
    doc.original_file_id = None
    with pytest.raises(ValidationFailed):
        out_svc.render_stamped(db, doc)  # type: ignore[arg-type]


def test_render_stamped_giaplai_without_profile_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    db, doc = _setup()
    doc.signing_profile_id = None  # không có mộc
    monkeypatch.setattr(out_svc, "read_encrypted_file", lambda key, wk: _pdf(2))
    with pytest.raises(ValidationFailed):
        out_svc.render_stamped(db, doc)  # type: ignore[arg-type]


# ── D1.12 set_signed_file + cancel (vòng đời) ───────────────────────
class _Result:
    def __init__(self, obj: Any) -> None:
        self._obj = obj

    def scalar_one_or_none(self) -> Any:
        return self._obj


class _DocDB:
    def __init__(self, doc: Any) -> None:
        self.doc = doc
        self.added: list[Any] = []
        self.committed = False
        self.rolled_back = False

    def get(self, model: Any, _id: Any) -> Any:
        return self.doc if model is OutgoingDocument else None

    def execute(self, _stmt: Any) -> _Result:
        return _Result(self.doc)  # _lock_doc(with_for_update)

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    def flush(self) -> None:
        for o in self.added:
            if getattr(o, "id", None) is None:
                o.id = 999

    def commit(self) -> None:
        self.committed = True

    def rollback(self) -> None:
        self.rolled_back = True

    def refresh(self, _o: Any) -> None:
        pass

    def delete(self, _o: Any) -> None:
        pass


def _numbered_doc() -> OutgoingDocument:
    return OutgoingDocument(
        id=99, unit_id=1, doc_type_id=2, subject="x",
        issue_date=__import__("datetime").date(2026, 6, 27),
        status="numbered", number="247/CV-GDNN", number_int=247,
    )


def test_set_signed_file_rejects_non_numbered() -> None:
    doc = _numbered_doc()
    doc.status = "draft"
    with pytest.raises(Conflict):
        out_svc.set_signed_file(_DocDB(doc), 99, b"%PDF-1.7", "247.pdf", actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]


def test_set_signed_file_rejects_wrong_filename() -> None:
    doc = _numbered_doc()  # số 247
    with pytest.raises(ValidationFailed):  # tên file không chứa 247 → chống nhầm
        out_svc.set_signed_file(_DocDB(doc), 99, b"%PDF-1.7", "cong-van-khac.pdf", actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]


def test_set_signed_file_publishes(monkeypatch: pytest.MonkeyPatch) -> None:
    doc = _numbered_doc()
    db = _DocDB(doc)
    monkeypatch.setattr(
        out_svc,
        "save_encrypted_file",
        lambda *_a, **_k: storage.EncryptedFileResult(storage_key="cv/x.enc", sha256="h", size_bytes=10, wrapped_key=b"k"),
    )
    out_svc.set_signed_file(db, 99, b"%PDF-1.7 signed", "247_da_ky.pdf", actor_id=5, ip=None, ua=None)  # type: ignore[arg-type]
    assert doc.status == "published"
    assert doc.signed_file_id == 999
    assert db.committed is True
    assert "outgoing_publish" in [getattr(a, "action", None) for a in db.added]


def test_set_signed_file_rejects_substring_filename() -> None:
    doc = _numbered_doc()  # số 247
    with pytest.raises(ValidationFailed):  # '1247' chứa '247' nhưng KHÁC số → vẫn chặn
        out_svc.set_signed_file(_DocDB(doc), 99, b"%PDF-1.7", "cv-1247.pdf", actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]


def test_cancel_requires_reason() -> None:
    with pytest.raises(ValidationFailed):
        out_svc.cancel(_DocDB(_numbered_doc()), 99, "  ", actor_id=1, actor_role="staff", ip=None, ua=None)  # type: ignore[arg-type]


def test_cancel_sets_status_and_keeps_number() -> None:
    doc = _numbered_doc()
    db = _DocDB(doc)
    out_svc.cancel(db, 99, "Sai nội dung", actor_id=1, actor_role="staff", ip=None, ua=None)  # type: ignore[arg-type]
    assert doc.status == "cancelled"
    assert doc.cancel_reason == "Sai nội dung"
    assert doc.number == "247/CV-GDNN"  # số KHÔNG bị xoá (không tái dùng)
    assert "outgoing_cancel" in [getattr(a, "action", None) for a in db.added]


def test_cancel_published_requires_manager() -> None:
    doc = _numbered_doc()
    doc.status = "published"
    from app.core.errors import PermissionDenied

    with pytest.raises(PermissionDenied):  # Nhân viên KHÔNG được thu hồi CV đã phát hành
        out_svc.cancel(_DocDB(doc), 99, "Thu hồi", actor_id=1, actor_role="staff", ip=None, ua=None)  # type: ignore[arg-type]


def test_cancel_published_allowed_for_manager() -> None:
    doc = _numbered_doc()
    doc.status = "published"
    out_svc.cancel(_DocDB(doc), 99, "Thu hồi", actor_id=1, actor_role="manager", ip=None, ua=None)  # type: ignore[arg-type]
    assert doc.status == "cancelled"


# ── D2 router wiring: endpoint PDF gốc + auto-detect (kéo-thả) ───────
def test_router_has_original_pdf_route() -> None:
    """D2 editor cần nền PDF gốc (chưa chèn) qua GET /{doc_id}/original.pdf."""
    from app.routers.outgoing import router

    paths = {getattr(r, "path", None): getattr(r, "methods", set()) for r in router.routes}
    assert "/{doc_id}/original.pdf" in paths
    assert "GET" in paths["/{doc_id}/original.pdf"]


def test_router_auto_detect_returns_positions() -> None:
    """auto-detect phải trả kèm positions để FE seed editor kéo-thả (không chỉ method)."""
    import inspect

    from app.routers import outgoing as out_router

    src = inspect.getsource(out_router.auto_detect_positions)
    assert "positions" in src and "stamp_positions" in src
