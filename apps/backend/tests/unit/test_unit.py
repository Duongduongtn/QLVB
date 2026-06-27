"""Unit test cấu hình đơn vị B1 — schema validate, service (FakeDB), save_asset đĩa."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.core import storage
from app.core.errors import NotFound
from app.models.unit import Unit
from app.schemas.unit import UnitUpdate
from app.services import unit as unit_svc


# ── schema validate ─────────────────────────────────────────────────
def test_unitupdate_rejects_blank_full_name() -> None:
    with pytest.raises(ValidationError):
        UnitUpdate(full_name="")
    with pytest.raises(ValidationError):
        UnitUpdate(full_name="   ")


def test_unitupdate_rejects_bad_email() -> None:
    with pytest.raises(ValidationError):
        UnitUpdate(email="khong-phai-email")


def test_unitupdate_blank_email_becomes_none() -> None:
    assert UnitUpdate(email="").email is None


def test_unitupdate_has_no_color_field() -> None:
    # Mã màu KHÔNG được phép sửa qua API (PRD B1) → không có trong schema sửa.
    assert "color" not in UnitUpdate.model_fields
    assert "code" not in UnitUpdate.model_fields


def test_unitupdate_exclude_unset_only_sent_fields() -> None:
    changes = UnitUpdate(phone="0900000000").model_dump(exclude_unset=True)
    assert changes == {"phone": "0900000000"}


# ── FakeDB cho service ──────────────────────────────────────────────
class FakeDB:
    def __init__(self, get_obj: Any = None, by_model: dict[Any, Any] | None = None) -> None:
        self.get_obj = get_obj
        self.by_model = by_model or {}  # map model class -> obj (khi cần phân biệt Unit/File)
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


def test_get_unit_not_found() -> None:
    with pytest.raises(NotFound):
        unit_svc.get_unit(FakeDB(get_obj=None), 1)  # type: ignore[arg-type]


def test_update_unit_applies_changes_and_audits() -> None:
    unit = _unit()
    db = FakeDB(get_obj=unit)
    unit_svc.update_unit(
        db,  # type: ignore[arg-type]
        1,
        UnitUpdate(full_name="Tên Mới", phone="0911"),
        actor_id=100,
        ip=None,
        ua=None,
    )
    assert unit.full_name == "Tên Mới"
    assert unit.phone == "0911"
    assert db.committed is True
    assert "unit_update" in [getattr(a, "action", None) for a in db.added]


def test_set_logo_creates_file_and_points_unit(monkeypatch: pytest.MonkeyPatch) -> None:
    unit = _unit(logo_file_id=None)
    db = FakeDB(get_obj=unit)

    monkeypatch.setattr(
        unit_svc,
        "save_asset",
        lambda *_a, **_k: storage.AssetResult(storage_key="logos/ab/x.png", sha256="h", size_bytes=10),
    )
    unit_svc.set_logo(
        db,  # type: ignore[arg-type]
        1,
        data=b"\x89PNG..",
        ext="png",
        mime="image/png",
        original_name="logo.png",
        actor_id=100,
        ip=None,
        ua=None,
    )
    assert unit.logo_file_id == 999  # File mới được flush gán id
    assert db.committed is True
    assert "unit_set_logo" in [getattr(a, "action", None) for a in db.added]


def test_set_logo_replaces_and_cleans_old(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.models.file import File

    unit = _unit(logo_file_id=7)
    old_logo = File(id=7, storage_key="logos/old/old.png", location="local", sha256="o", size_bytes=5)
    db = FakeDB(by_model={Unit: unit, File: old_logo})

    deleted_keys: list[str] = []
    monkeypatch.setattr(
        unit_svc,
        "save_asset",
        lambda *_a, **_k: storage.AssetResult(storage_key="logos/new/n.png", sha256="n", size_bytes=10),
    )
    monkeypatch.setattr(unit_svc, "delete_asset", lambda key: deleted_keys.append(key))

    unit_svc.set_logo(
        db,  # type: ignore[arg-type]
        1,
        data=b"\x89PNG..",
        ext="png",
        mime="image/png",
        original_name="n.png",
        actor_id=100,
        ip=None,
        ua=None,
    )
    assert unit.logo_file_id == 999  # trỏ sang logo mới
    assert old_logo in db.deleted  # row File cũ bị xoá khỏi DB
    assert deleted_keys == ["logos/old/old.png"]  # file đĩa cũ unlink sau commit


# ── storage save_asset / read_asset round-trip (đĩa thật, thư mục tạm) ──
def test_save_and_read_asset_roundtrip(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    class _S:
        storage_local_path = tmp_path

    monkeypatch.setattr("app.core.config.settings", _S)
    data = b"hello-logo-bytes"
    res = storage.save_asset(data, ext="png", subdir="logos")
    assert res.size_bytes == len(data)
    assert res.storage_key.startswith("logos/")
    assert res.storage_key.endswith(".png")
    assert storage.read_asset(res.storage_key) == data
