"""Unit test danh bạ cơ quan M1/M2 — schema validate + service (FakeDB)."""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from app.core.errors import Conflict, NotFound
from app.models.organization import Organization
from app.schemas.organization import OrganizationCreate, OrganizationUpdate
from app.services import organization as org_svc


# ── schema validate ─────────────────────────────────────────────────
def test_create_rejects_blank_name() -> None:
    with pytest.raises(ValidationError):
        OrganizationCreate(full_name="   ")


def test_create_strips_name() -> None:
    assert OrganizationCreate(full_name="  Sở Du lịch  ").full_name == "Sở Du lịch"


def test_create_rejects_bad_email() -> None:
    with pytest.raises(ValidationError):
        OrganizationCreate(full_name="X", email="khong-phai-email")


def test_create_blank_optionals_become_none() -> None:
    o = OrganizationCreate(full_name="X", short_name="  ", email="")
    assert o.short_name is None
    assert o.email is None


def test_create_default_role_and_category() -> None:
    o = OrganizationCreate(full_name="X")
    assert o.role == "recipient"
    assert o.category == "common"


def test_update_exclude_unset() -> None:
    assert OrganizationUpdate(category="gdnn").model_dump(exclude_unset=True) == {"category": "gdnn"}


# ── FakeDB ──────────────────────────────────────────────────────────
class FakeScalars:
    def __init__(self, rows: list[Any]) -> None:
        self._rows = rows

    def all(self) -> list[Any]:
        return self._rows


class FakeDB:
    def __init__(self, dup_rows: list[Any] | None = None, get_obj: Any = None) -> None:
        self.dup_rows = dup_rows or []
        self.get_obj = get_obj
        self.added: list[Any] = []
        self.committed = False

    def get(self, _model: Any, _id: Any) -> Any:
        return self.get_obj

    def scalars(self, _stmt: Any) -> FakeScalars:
        # service chỉ gọi scalars cho truy vấn kiểm trùng
        return FakeScalars(self.dup_rows)

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


def _org(**kw: Any) -> Organization:
    base: dict[str, Any] = {
        "id": 1,
        "full_name": "Sở Du lịch",
        "address": "TP",
        "is_recipient": True,
        "is_sender": False,
        "category": "common",
        "deleted_at": None,
    }
    base.update(kw)
    return Organization(**base)


def test_get_not_found_when_missing_or_deleted() -> None:
    with pytest.raises(NotFound):
        org_svc.get_organization(FakeDB(get_obj=None), 1)  # type: ignore[arg-type]
    with pytest.raises(NotFound):
        from datetime import datetime

        org_svc.get_organization(FakeDB(get_obj=_org(deleted_at=datetime.now())), 1)  # type: ignore[arg-type]


def test_create_sets_role_recipient_and_audits() -> None:
    db = FakeDB(dup_rows=[])
    org = org_svc.create_organization(
        db,  # type: ignore[arg-type]
        OrganizationCreate(full_name="UBND Tỉnh", address="A", role="recipient", category="gdnn"),
        actor_id=10,
        ip=None,
        ua=None,
    )
    assert org.is_recipient is True and org.is_sender is False
    assert org.category == "gdnn"
    assert db.committed is True
    assert "org_create" in [getattr(a, "action", None) for a in db.added]


def test_create_sets_role_sender() -> None:
    db = FakeDB(dup_rows=[])
    org = org_svc.create_organization(
        db,  # type: ignore[arg-type]
        OrganizationCreate(full_name="Sở Tài chính", role="sender"),
        actor_id=1,
        ip=None,
        ua=None,
    )
    assert org.is_sender is True and org.is_recipient is False


def test_create_rejects_duplicate_same_name_and_address() -> None:
    existing = _org(full_name="Sở Du lịch", address="TP")
    db = FakeDB(dup_rows=[existing])
    with pytest.raises(Conflict):
        org_svc.create_organization(
            db,  # type: ignore[arg-type]
            OrganizationCreate(full_name="sở du lịch", address="TP"),  # khác hoa thường
            actor_id=1,
            ip=None,
            ua=None,
        )


def test_create_allows_same_name_different_address() -> None:
    existing = _org(full_name="Sở Du lịch", address="Hà Nội")
    db = FakeDB(dup_rows=[existing])
    org = org_svc.create_organization(
        db,  # type: ignore[arg-type]
        OrganizationCreate(full_name="Sở Du lịch", address="TP"),  # khác địa chỉ → cho
        actor_id=1,
        ip=None,
        ua=None,
    )
    assert org.address == "TP"
    assert db.committed is True


def test_update_applies_changes_and_audits() -> None:
    org = _org(full_name="Cũ", category="common")
    db = FakeDB(get_obj=org, dup_rows=[])
    org_svc.update_organization(
        db,  # type: ignore[arg-type]
        1,
        OrganizationUpdate(full_name="Sở Mới", category="dvdl"),
        actor_id=5,
        ip=None,
        ua=None,
    )
    assert org.full_name == "Sở Mới"
    assert org.category == "dvdl"
    assert db.committed is True
    assert "org_update" in [getattr(a, "action", None) for a in db.added]


def test_update_rejects_rename_to_existing_duplicate() -> None:
    target = _org(id=1, full_name="Cũ", address="TP")
    other = _org(id=2, full_name="Sở Trùng", address="TP")
    db = FakeDB(get_obj=target, dup_rows=[other])  # đổi tên trùng cơ quan khác → Conflict
    with pytest.raises(Conflict):
        org_svc.update_organization(
            db,  # type: ignore[arg-type]
            1,
            OrganizationUpdate(full_name="Sở Trùng"),
            actor_id=1,
            ip=None,
            ua=None,
        )


def test_update_allows_self_no_false_duplicate() -> None:
    # exclude_id loại chính nó khỏi truy vấn trùng → kết quả rỗng → không Conflict.
    target = _org(id=1, full_name="Sở A", address="TP")
    db = FakeDB(get_obj=target, dup_rows=[])
    org_svc.update_organization(
        db,  # type: ignore[arg-type]
        1,
        OrganizationUpdate(full_name="Sở A", phone="0900"),
        actor_id=1,
        ip=None,
        ua=None,
    )
    assert target.phone == "0900"
    assert db.committed is True


def test_delete_is_soft() -> None:
    org = _org()
    db = FakeDB(get_obj=org)
    org_svc.delete_organization(db, 1, actor_id=1, ip=None, ua=None)  # type: ignore[arg-type]
    assert org.deleted_at is not None  # soft delete, KHÔNG xoá khỏi DB
    assert db.committed is True
    assert "org_delete" in [getattr(a, "action", None) for a in db.added]
