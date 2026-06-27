"""Unit test branding B3b — service get/update/set_logo (FakeDB)."""

from __future__ import annotations

from typing import Any

import pytest

from app.core import storage
from app.core.errors import NotFound
from app.models.app_settings import AppSettings
from app.models.file import File
from app.schemas.settings import SettingsUpdate
from app.services import settings as svc


class FakeDB:
    def __init__(self, by_model: dict[Any, Any] | None = None) -> None:
        self.by_model = by_model or {}
        self.added: list[Any] = []
        self.deleted: list[Any] = []
        self.committed = False

    def get(self, model: Any, _id: Any) -> Any:
        return self.by_model.get(model)

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    def flush(self) -> None:
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = 777

    def delete(self, obj: Any) -> None:
        self.deleted.append(obj)

    def commit(self) -> None:
        self.committed = True

    def refresh(self, _obj: Any) -> None:
        pass


def _row(**kw: Any) -> AppSettings:
    base: dict[str, Any] = {"id": 1, "app_name": "QLCV Thành Đạt", "logo_file_id": None}
    base.update(kw)
    return AppSettings(**base)


def test_get_settings_missing_raises() -> None:
    with pytest.raises(NotFound):
        svc.get_settings_row(FakeDB())  # type: ignore[arg-type]


def test_update_app_name_audits_and_commits() -> None:
    row = _row()
    db = FakeDB(by_model={AppSettings: row})
    svc.update_settings(
        db, SettingsUpdate(app_name="Sở Tư Pháp"), actor_id=1, ip=None, ua=None  # type: ignore[arg-type]
    )
    assert row.app_name == "Sở Tư Pháp"
    assert db.committed is True
    assert "settings_update" in [getattr(a, "action", None) for a in db.added]


def test_update_empty_unset_keeps_value() -> None:
    row = _row()
    db = FakeDB(by_model={AppSettings: row})
    svc.update_settings(db, SettingsUpdate(), actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]
    assert row.app_name == "QLCV Thành Đạt"  # không gửi app_name → giữ nguyên


def test_set_logo_replaces_and_cleans_old(monkeypatch: pytest.MonkeyPatch) -> None:
    row = _row(logo_file_id=7)
    old_logo = File(id=7, storage_key="logos/old/o.png", location="local", sha256="o", size_bytes=5)
    db = FakeDB(by_model={AppSettings: row, File: old_logo})

    deleted_keys: list[str] = []
    monkeypatch.setattr(
        svc, "save_asset", lambda *_a, **_k: storage.AssetResult("logos/new/n.png", "n", 10)
    )
    monkeypatch.setattr(svc, "delete_asset", lambda key: deleted_keys.append(key))

    svc.set_logo(
        db,  # type: ignore[arg-type]
        data=b"\x89PNG", ext="png", mime="image/png", original_name="n.png",
        actor_id=1, ip=None, ua=None,
    )
    assert row.logo_file_id == 777
    assert old_logo in db.deleted
    assert deleted_keys == ["logos/old/o.png"]
    assert "settings_set_logo" in [getattr(a, "action", None) for a in db.added]
