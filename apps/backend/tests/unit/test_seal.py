"""Unit test mộc C1 (SIG.SEL) — schema validate + service (FakeDB)."""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from app.core import storage
from app.core.errors import NotFound
from app.models.file import File
from app.models.seal import Seal
from app.models.unit import Unit
from app.schemas.seal import SealUpdate
from app.services import seal as seal_svc


# ── schema validate ─────────────────────────────────────────────────
def test_sealupdate_rejects_blank_name() -> None:
    with pytest.raises(ValidationError):
        SealUpdate(name="")
    with pytest.raises(ValidationError):
        SealUpdate(name="   ")  # toàn khoảng trắng cũng bị từ chối


def test_sealupdate_strips_name() -> None:
    assert SealUpdate(name="  Mộc tròn  ").name == "Mộc tròn"


def test_sealupdate_rejects_bad_seal_type() -> None:
    with pytest.raises(ValidationError):
        SealUpdate(seal_type="square")  # type: ignore[arg-type]


def test_sealupdate_has_no_unit_id_field() -> None:
    # Mộc gắn cứng đơn vị → KHÔNG cho đổi unit_id (chống nhầm, PRD C1).
    assert "unit_id" not in SealUpdate.model_fields


def test_sealupdate_exclude_unset_only_sent_fields() -> None:
    changes = SealUpdate(is_active=False).model_dump(exclude_unset=True)
    assert changes == {"is_active": False}


# ── FakeDB cho service ──────────────────────────────────────────────
class FakeDB:
    def __init__(self, get_obj: Any = None, by_model: dict[Any, Any] | None = None) -> None:
        self.get_obj = get_obj
        self.by_model = by_model or {}
        self.added: list[Any] = []
        self.deleted: list[Any] = []
        self.committed = False

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

    def refresh(self, _obj: Any) -> None:
        pass

    def delete(self, obj: Any) -> None:
        self.deleted.append(obj)


def _unit(**kw: Any) -> Unit:
    base: dict[str, Any] = {"id": 1, "code": "GDNN", "full_name": "TT", "color": "#16a34a"}
    base.update(kw)
    return Unit(**base)


def _seal(**kw: Any) -> Seal:
    base: dict[str, Any] = {
        "id": 5,
        "unit_id": 1,
        "name": "Mộc tròn GDNN",
        "seal_type": "round",
        "file_id": 10,
        "is_active": True,
    }
    base.update(kw)
    return Seal(**base)


def test_get_seal_not_found() -> None:
    with pytest.raises(NotFound):
        seal_svc.get_seal(FakeDB(get_obj=None), 5)  # type: ignore[arg-type]


def test_create_seal_rejects_missing_unit(monkeypatch: pytest.MonkeyPatch) -> None:
    db = FakeDB(get_obj=None)  # Unit lookup trả None
    with pytest.raises(NotFound):
        seal_svc.create_seal(
            db,  # type: ignore[arg-type]
            unit_id=99,
            name="x",
            seal_type="round",
            data=b"\x89PNG",
            ext="png",
            mime="image/png",
            original_name="x.png",
            actor_id=1,
            ip=None,
            ua=None,
        )


def test_create_seal_saves_file_and_seal_and_audits(monkeypatch: pytest.MonkeyPatch) -> None:
    db = FakeDB(by_model={Unit: _unit()})
    monkeypatch.setattr(
        seal_svc,
        "save_asset",
        lambda *_a, **_k: storage.AssetResult(storage_key="seals/ab/x.png", sha256="h", size_bytes=12),
    )
    seal = seal_svc.create_seal(
        db,  # type: ignore[arg-type]
        unit_id=1,
        name="Mộc tròn GDNN",
        seal_type="round",
        data=b"\x89PNG",
        ext="png",
        mime="image/png",
        original_name="moc.png",
        actor_id=100,
        ip=None,
        ua=None,
    )
    # File (wrapped_key NULL = không mã hoá) + Seal đều được add và flush gán id.
    assert any(isinstance(o, File) and o.wrapped_key is None for o in db.added)
    assert seal.file_id == 999
    assert seal.uploaded_by == 100
    assert seal.is_active is True
    assert db.committed is True
    assert "seal_create" in [getattr(a, "action", None) for a in db.added]


def test_update_seal_inactivate_instead_of_delete() -> None:
    seal = _seal(is_active=True)
    db = FakeDB(get_obj=seal)
    seal_svc.update_seal(
        db,  # type: ignore[arg-type]
        5,
        SealUpdate(is_active=False),
        actor_id=100,
        ip=None,
        ua=None,
    )
    assert seal.is_active is False  # ngừng dùng — KHÔNG xoá khỏi DB
    assert db.deleted == []  # không xoá cứng
    assert db.committed is True
    assert "seal_update" in [getattr(a, "action", None) for a in db.added]


def test_update_seal_rename_and_retype() -> None:
    seal = _seal(name="cũ", seal_type="round")
    db = FakeDB(get_obj=seal)
    seal_svc.update_seal(
        db,  # type: ignore[arg-type]
        5,
        SealUpdate(name="Mộc giáp lai", seal_type="overlap"),
        actor_id=1,
        ip=None,
        ua=None,
    )
    assert seal.name == "Mộc giáp lai"
    assert seal.seal_type == "overlap"
