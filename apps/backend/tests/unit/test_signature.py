"""Unit test chữ ký C2 (SIG.SGN) — schema validate + service (FakeDB)."""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from app.core import storage
from app.core.errors import NotFound
from app.models.file import File
from app.models.signature import Signature
from app.models.unit import Unit
from app.schemas.signature import SignatureUpdate
from app.services import signature as sig_svc


# ── schema validate ─────────────────────────────────────────────────
def test_signatureupdate_rejects_blank_full_name() -> None:
    with pytest.raises(ValidationError):
        SignatureUpdate(full_name="")
    with pytest.raises(ValidationError):
        SignatureUpdate(full_name="   ")


def test_signatureupdate_strips_full_name() -> None:
    assert SignatureUpdate(full_name="  Nguyễn Văn A  ").full_name == "Nguyễn Văn A"


def test_signatureupdate_blank_title_becomes_none() -> None:
    assert SignatureUpdate(title="   ").title is None


def test_signatureupdate_exclude_unset_only_sent_fields() -> None:
    changes = SignatureUpdate(default_unit_id=2).model_dump(exclude_unset=True)
    assert changes == {"default_unit_id": 2}


# ── FakeDB ──────────────────────────────────────────────────────────
class FakeDB:
    def __init__(self, get_obj: Any = None, by_model: dict[Any, Any] | None = None) -> None:
        self.get_obj = get_obj
        self.by_model = by_model or {}
        self.added: list[Any] = []
        self.deleted: list[Any] = []
        self.committed = False
        self.rolled_back = False

    def get(self, model: Any, _id: Any) -> Any:
        if model in self.by_model:
            return self.by_model[model]
        return self.get_obj

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    def flush(self) -> None:
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = 999

    def commit(self) -> None:
        self.committed = True

    def rollback(self) -> None:
        self.rolled_back = True

    def refresh(self, _obj: Any) -> None:
        pass

    def delete(self, obj: Any) -> None:
        self.deleted.append(obj)


def _unit(**kw: Any) -> Unit:
    base: dict[str, Any] = {"id": 1, "code": "GDNN", "full_name": "TT", "color": "#16a34a"}
    base.update(kw)
    return Unit(**base)


def _sig(**kw: Any) -> Signature:
    base: dict[str, Any] = {
        "id": 3,
        "full_name": "Nguyễn Văn A",
        "title": "Giám đốc",
        "default_unit_id": 1,
        "file_id": 10,
        "is_active": True,
    }
    base.update(kw)
    return Signature(**base)


def test_get_signature_not_found() -> None:
    with pytest.raises(NotFound):
        sig_svc.get_signature(FakeDB(get_obj=None), 3)  # type: ignore[arg-type]


def test_create_signature_rejects_missing_default_unit() -> None:
    db = FakeDB(get_obj=None)  # Unit lookup trả None
    with pytest.raises(NotFound):
        sig_svc.create_signature(
            db,  # type: ignore[arg-type]
            full_name="A",
            title=None,
            default_unit_id=99,
            data=b"\x89PNG",
            ext="png",
            mime="image/png",
            original_name="a.png",
            actor_id=1,
            ip=None,
            ua=None,
        )


def test_create_signature_saves_file_and_audits(monkeypatch: pytest.MonkeyPatch) -> None:
    db = FakeDB(by_model={Unit: _unit()})
    monkeypatch.setattr(
        sig_svc,
        "save_asset",
        lambda *_a, **_k: storage.AssetResult(storage_key="signatures/ab/x.png", sha256="h", size_bytes=8),
    )
    sig = sig_svc.create_signature(
        db,  # type: ignore[arg-type]
        full_name="Nguyễn Văn A",
        title="Giám đốc",
        default_unit_id=1,
        data=b"\x89PNG",
        ext="png",
        mime="image/png",
        original_name="ky.png",
        actor_id=100,
        ip=None,
        ua=None,
    )
    assert any(isinstance(o, File) and o.wrapped_key is None for o in db.added)
    assert sig.file_id == 999
    assert sig.uploaded_by == 100
    assert db.committed is True
    assert "signature_create" in [getattr(a, "action", None) for a in db.added]


def test_create_signature_allows_null_default_unit(monkeypatch: pytest.MonkeyPatch) -> None:
    # default_unit_id None → KHÔNG kiểm đơn vị (1 người ký cho cả 2 đơn vị).
    db = FakeDB()
    monkeypatch.setattr(
        sig_svc,
        "save_asset",
        lambda *_a, **_k: storage.AssetResult(storage_key="signatures/ab/x.png", sha256="h", size_bytes=8),
    )
    sig = sig_svc.create_signature(
        db,  # type: ignore[arg-type]
        full_name="A",
        title=None,
        default_unit_id=None,
        data=b"\x89PNG",
        ext="png",
        mime="image/png",
        original_name=None,
        actor_id=1,
        ip=None,
        ua=None,
    )
    assert sig.default_unit_id is None
    assert db.committed is True


def test_create_signature_cleans_orphan_file_on_db_error(monkeypatch: pytest.MonkeyPatch) -> None:
    # DB lỗi SAU khi đã ghi ảnh ra đĩa → phải rollback + xoá ảnh mồ côi (không tích rác).
    db = FakeDB(by_model={Unit: _unit()})
    monkeypatch.setattr(
        sig_svc,
        "save_asset",
        lambda *_a, **_k: storage.AssetResult(storage_key="signatures/ab/x.png", sha256="h", size_bytes=8),
    )

    def _boom() -> None:
        raise RuntimeError("DB chết giữa chừng")

    db.flush = _boom  # type: ignore[method-assign]
    deleted: list[str] = []
    monkeypatch.setattr(sig_svc, "delete_asset", lambda key: deleted.append(key))

    with pytest.raises(RuntimeError):
        sig_svc.create_signature(
            db,  # type: ignore[arg-type]
            full_name="A",
            title=None,
            default_unit_id=1,
            data=b"\x89PNG",
            ext="png",
            mime="image/png",
            original_name=None,
            actor_id=1,
            ip=None,
            ua=None,
        )
    assert db.rolled_back is True
    assert deleted == ["signatures/ab/x.png"]  # ảnh mồ côi đã được dọn
    assert db.committed is False


def test_update_signature_inactivate_and_change_unit() -> None:
    sig = _sig(default_unit_id=1, is_active=True)
    db = FakeDB(by_model={Unit: _unit(id=2), Signature: sig})
    sig_svc.update_signature(
        db,  # type: ignore[arg-type]
        3,
        SignatureUpdate(default_unit_id=2, is_active=False),
        actor_id=1,
        ip=None,
        ua=None,
    )
    assert sig.default_unit_id == 2  # đơn vị mặc định đổi được (khác mộc)
    assert sig.is_active is False
    assert db.deleted == []  # không xoá cứng
    assert "signature_update" in [getattr(a, "action", None) for a in db.added]
