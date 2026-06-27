"""Unit test hồ sơ ký C4 (SIG.PRO) — schema + service, trọng tâm CHỐNG NHẦM MỘC."""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from app.core.errors import NotFound, ValidationFailed
from app.models.seal import Seal
from app.models.signature import Signature
from app.models.signing_profile import SigningProfile
from app.models.unit import Unit
from app.schemas.signing_profile import ProfileCreate, ProfileUpdate
from app.services import signing_profile as profile_svc


# ── schema validate ─────────────────────────────────────────────────
def test_profilecreate_strips_and_rejects_blank() -> None:
    with pytest.raises(ValidationError):
        ProfileCreate(unit_id=1, signature_id=1, seal_id=1, display_title="  ", name="x")
    p = ProfileCreate(unit_id=1, signature_id=1, seal_id=1, display_title="  GĐ  ", name=" HS ")
    assert p.display_title == "GĐ"
    assert p.name == "HS"


def test_profileupdate_exclude_unset() -> None:
    assert ProfileUpdate(is_active=False).model_dump(exclude_unset=True) == {"is_active": False}


# ── FakeDB ──────────────────────────────────────────────────────────
class FakeDB:
    def __init__(self, by_model: dict[Any, Any] | None = None, get_obj: Any = None) -> None:
        self.by_model = by_model or {}
        self.get_obj = get_obj
        self.added: list[Any] = []
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


def _unit(uid: int = 1) -> Unit:
    return Unit(id=uid, code="GDNN", full_name="TT", color="#16a34a")


def _sig(active: bool = True) -> Signature:
    return Signature(id=3, full_name="A", title="GĐ", default_unit_id=1, file_id=10, is_active=active)


def _seal(unit_id: int = 1, active: bool = True) -> Seal:
    return Seal(id=5, unit_id=unit_id, name="Mộc", seal_type="round", file_id=11, is_active=active)


def _create(unit_id: int = 1) -> ProfileCreate:
    return ProfileCreate(
        unit_id=unit_id, signature_id=3, seal_id=5, display_title="Giám đốc", name="GĐ TT"
    )


def test_create_profile_happy_path() -> None:
    db = FakeDB(by_model={Unit: _unit(), Signature: _sig(), Seal: _seal(unit_id=1)})
    profile = profile_svc.create_profile(db, _create(1), actor_id=100, ip=None, ua=None)  # type: ignore[arg-type]
    assert profile.id == 999
    assert db.committed is True
    assert "profile_create" in [getattr(a, "action", None) for a in db.added]


def test_create_profile_rejects_seal_of_other_unit() -> None:
    # CHỐNG NHẦM MỘC: mộc thuộc đơn vị 2 nhưng hồ sơ đơn vị 1 → từ chối.
    db = FakeDB(by_model={Unit: _unit(1), Signature: _sig(), Seal: _seal(unit_id=2)})
    with pytest.raises(ValidationFailed):
        profile_svc.create_profile(db, _create(1), actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]
    assert db.committed is False


def test_create_profile_rejects_inactive_signature() -> None:
    db = FakeDB(by_model={Unit: _unit(), Signature: _sig(active=False), Seal: _seal()})
    with pytest.raises(ValidationFailed):
        profile_svc.create_profile(db, _create(1), actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]


def test_create_profile_rejects_inactive_seal() -> None:
    db = FakeDB(by_model={Unit: _unit(), Signature: _sig(), Seal: _seal(active=False)})
    with pytest.raises(ValidationFailed):
        profile_svc.create_profile(db, _create(1), actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]


def test_create_profile_missing_unit() -> None:
    db = FakeDB(get_obj=None)  # mọi get trả None
    with pytest.raises(NotFound):
        profile_svc.create_profile(db, _create(1), actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]


def test_update_profile_inactivate() -> None:
    profile = SigningProfile(
        id=7, unit_id=1, signature_id=3, seal_id=5, display_title="GĐ", name="HS", is_active=True
    )
    db = FakeDB(by_model={SigningProfile: profile})
    profile_svc.update_profile(
        db, 7, ProfileUpdate(is_active=False, display_title="Phó GĐ"), actor_id=1, ip=None, ua=None  # type: ignore[arg-type]
    )
    assert profile.is_active is False
    assert profile.display_title == "Phó GĐ"
    assert "profile_update" in [getattr(a, "action", None) for a in db.added]
