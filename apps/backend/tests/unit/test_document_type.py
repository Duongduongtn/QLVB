"""Unit test cấu hình sổ B2 — schema validate + service control-flow (FakeDB).

numbering.* chạm DB được monkeypatch để test logic service mà không cần Postgres.
"""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from app.core.errors import NotFound, ValidationFailed
from app.models.document_type import DocumentType
from app.models.unit import Unit
from app.schemas.document_type import (
    DocumentTypeCreate,
    DocumentTypeUpdate,
    NumberPreviewRequest,
)
from app.services import document_type as svc


# ── schema validate ─────────────────────────────────────────────────
def test_create_schema_zero_pad_bounds() -> None:
    with pytest.raises(ValidationError):
        DocumentTypeCreate(direction="out", unit_id=1, name="CV", code="CV", number_format="{STT}", zero_pad=11)


def test_create_schema_defaults() -> None:
    d = DocumentTypeCreate(direction="out", unit_id=1, name="Công văn", code="CV", number_format="{STT}/{NĂM}")
    assert d.reset_policy == "year" and d.zero_pad == 3 and d.start_stt == 1 and d.current_stt == 0


# ── FakeDB ──────────────────────────────────────────────────────────
class FakeDB:
    def __init__(self, by_model: dict[Any, Any] | None = None) -> None:
        self.by_model = by_model or {}
        self.added: list[Any] = []
        self.committed = False

    def get(self, model: Any, _id: Any) -> Any:
        return self.by_model.get(model)

    def scalar(self, _stmt: Any) -> Any:
        return None  # không trùng mã loại

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    def flush(self) -> None:
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = 555

    def commit(self) -> None:
        self.committed = True

    def refresh(self, _obj: Any) -> None:
        pass


@pytest.fixture
def stub_numbering(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Chặn mọi lời gọi numbering chạm DB; ghi lại set_current để assert."""
    calls: dict[str, Any] = {"set_current": [], "peek_next": 0}
    monkeypatch.setattr(svc.numbering, "get_or_create_sequence", lambda *_a, **_k: "seq_555_2026")
    monkeypatch.setattr(svc.numbering, "peek_next", lambda *_a, **_k: calls["peek_next"])
    monkeypatch.setattr(
        svc.numbering, "set_current", lambda _db, name, v: calls["set_current"].append((name, v))
    )
    monkeypatch.setattr(svc.numbering, "next_number", lambda *_a, **_k: 1)
    return calls


def _unit() -> Unit:
    return Unit(id=1, code="GDNN", full_name="TT", color="#16a34a")


# ── create ──────────────────────────────────────────────────────────
def test_create_out_requires_unit(stub_numbering: dict[str, Any]) -> None:
    db = FakeDB()
    with pytest.raises(ValidationFailed):
        svc.create_document_type(
            db,  # type: ignore[arg-type]
            DocumentTypeCreate(direction="out", unit_id=None, name="CV", code="CV", number_format="{STT}"),
            actor_id=1, ip=None, ua=None,
        )


def test_create_invalid_format_rejected(stub_numbering: dict[str, Any]) -> None:
    db = FakeDB(by_model={Unit: _unit()})
    with pytest.raises(ValidationFailed):
        svc.create_document_type(
            db,  # type: ignore[arg-type]
            DocumentTypeCreate(direction="out", unit_id=1, name="CV", code="CV", number_format="{NĂM}"),
            actor_id=1, ip=None, ua=None,
        )


def test_create_in_forces_unit_none_and_sets_stt(stub_numbering: dict[str, Any]) -> None:
    db = FakeDB()
    dt = svc.create_document_type(
        db,  # type: ignore[arg-type]
        DocumentTypeCreate(
            direction="in", unit_id=99, name="Công văn đến", code="CV", number_format="{STT}/{NĂM}",
            current_stt=246,
        ),
        actor_id=1, ip=None, ua=None,
    )
    assert dt.unit_id is None  # sổ đến chung → bỏ unit_id client gửi
    assert db.committed is True
    assert stub_numbering["set_current"] == [("seq_555_2026", 246)]  # last issued = 246
    assert "doctype_create" in [getattr(a, "action", None) for a in db.added]


def test_create_start_stt_sets_last_minus_one(stub_numbering: dict[str, Any]) -> None:
    db = FakeDB(by_model={Unit: _unit()})
    svc.create_document_type(
        db,  # type: ignore[arg-type]
        DocumentTypeCreate(
            direction="out", unit_id=1, name="QĐ", code="QĐ", number_format="{STT}", start_stt=100,
        ),
        actor_id=1, ip=None, ua=None,
    )
    # start_stt=100 → số kế tiếp phải là 100 → last issued = 99.
    assert stub_numbering["set_current"] == [("seq_555_2026", 99)]


# ── update ──────────────────────────────────────────────────────────
def test_update_not_found(stub_numbering: dict[str, Any]) -> None:
    with pytest.raises(NotFound):
        svc.update_document_type(
            FakeDB(),  # type: ignore[arg-type]
            999, DocumentTypeUpdate(name="x"), actor_id=1, ip=None, ua=None,
        )


def test_update_invalid_format_rejected(stub_numbering: dict[str, Any]) -> None:
    dt = DocumentType(id=5, direction="out", unit_id=1, name="CV", code="CV", number_format="{STT}", reset_policy="year", zero_pad=3, is_active=True)
    db = FakeDB(by_model={DocumentType: dt})
    with pytest.raises(ValidationFailed):
        svc.update_document_type(
            db,  # type: ignore[arg-type]
            5, DocumentTypeUpdate(number_format="{XYZ}"), actor_id=1, ip=None, ua=None,
        )


def test_update_current_stt_only_raises(stub_numbering: dict[str, Any]) -> None:
    dt = DocumentType(id=5, direction="out", unit_id=1, name="CV", code="CV", number_format="{STT}", reset_policy="year", zero_pad=3, is_active=True)
    db = FakeDB(by_model={DocumentType: dt})
    stub_numbering["peek_next"] = 300  # đã cấp tới 299 → số kế tiếp 300

    # Yêu cầu hạ về 100 (< 299 đã cấp) → KHÔNG setval (giữ counter).
    svc.update_document_type(
        db,  # type: ignore[arg-type]
        5, DocumentTypeUpdate(current_stt=100), actor_id=1, ip=None, ua=None,
    )
    assert stub_numbering["set_current"] == []

    # Yêu cầu nâng lên 500 (> 299) → setval.
    svc.update_document_type(
        db,  # type: ignore[arg-type]
        5, DocumentTypeUpdate(current_stt=500), actor_id=1, ip=None, ua=None,
    )
    assert stub_numbering["set_current"] == [("seq_555_2026", 500)]


# ── preview ─────────────────────────────────────────────────────────
def test_preview_number_renders_sample() -> None:
    db = FakeDB(by_model={Unit: _unit()})
    sample = svc.preview_number(
        db,  # type: ignore[arg-type]
        NumberPreviewRequest(number_format="{STT}/{LOẠI}-{ĐƠN VỊ}", code="CV", zero_pad=3, unit_id=1, sample_stt=1),
    )
    assert sample == "001/CV-GDNN"


def test_preview_invalid_format_rejected() -> None:
    with pytest.raises(ValidationFailed):
        svc.preview_number(
            FakeDB(),  # type: ignore[arg-type]
            NumberPreviewRequest(number_format="{NĂM}", code="CV", zero_pad=3, unit_id=None),
        )
