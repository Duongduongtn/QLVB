"""E1.5 — test lõi verify chữ ký số (phần THUẦN, không cần pyHanko/PDF thật).

Phần đụng pyHanko (`verify_pdf`) chỉ chạy ở image worker (pyHanko + PDF ký thật) → e2e khi
deploy, không unit-test ở venv nhẹ.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest

from app.services import sign_verify as sv

pytestmark = pytest.mark.unit


def _sig(**over: object) -> dict[str, object]:
    base = {"intact": True, "valid": True, "trusted": True, "expired": False}
    base.update(over)
    return base


# ── classify ──────────────────────────────────────────────────────────────────
def test_classify_no_signature_is_none() -> None:
    assert sv.classify([]) == "none"


def test_classify_all_good_is_valid() -> None:
    assert sv.classify([_sig(), _sig()]) == "valid"


@pytest.mark.parametrize("bad", [
    {"intact": False},
    {"valid": False},
    {"trusted": False},   # chứng thư lạ → KHÔNG valid (không được bỏ dedup)
    {"expired": True},
])
def test_classify_any_flaw_is_invalid(bad: dict[str, object]) -> None:
    assert sv.classify([_sig(), _sig(**bad)]) == "invalid"


# ── build_info ────────────────────────────────────────────────────────────────
def test_build_info_valid_no_warning() -> None:
    info = sv.build_info([_sig()], checked_at=datetime(2026, 6, 27, tzinfo=UTC))
    assert info["status"] == "valid"
    assert info["warning"] is None
    assert info["checked_at"].startswith("2026-06-27")


def test_build_info_untrusted_warns_cert_la() -> None:
    info = sv.build_info([_sig(trusted=False)], checked_at=datetime.now(UTC))
    assert info["status"] == "invalid"
    assert "trust list" in info["warning"]


def test_build_info_expired_warns() -> None:
    info = sv.build_info([_sig(expired=True)], checked_at=datetime.now(UTC))
    assert "hết hạn" in info["warning"]


def test_build_info_tampered_warns() -> None:
    info = sv.build_info([_sig(intact=False, valid=False)], checked_at=datetime.now(UTC))
    assert "chỉnh sửa" in info["warning"]


# ── parse_trust_list ──────────────────────────────────────────────────────────
def test_parse_trust_list_extracts_pems() -> None:
    raw = json.dumps({"cas": [
        {"name": "Viettel-CA", "pem": "-----BEGIN CERT-----\nabc\n-----END CERT-----"},
        {"name": "thiếu pem"},
        {"name": "pem rỗng", "pem": "   "},
    ]}).encode()
    pems = sv.parse_trust_list(raw)
    assert len(pems) == 1
    assert pems[0].startswith(b"-----BEGIN CERT-----")


def test_parse_trust_list_missing_cas_raises() -> None:
    with pytest.raises(ValueError):
        sv.parse_trust_list(b'{"foo": 1}')


def test_seed_trust_list_is_empty_and_parseable() -> None:
    # Seed đóng gói rỗng → load_trust_pems trả [] (mặc định an toàn: không tin ai).
    raw = sv._seed_path().read_bytes()
    assert sv.parse_trust_list(raw) == []


# ── refresh_trust_cache ───────────────────────────────────────────────────────
def test_refresh_skips_when_url_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core import config

    monkeypatch.setattr(config.settings, "neac_trust_list_url", None, raising=False)
    out = sv.refresh_trust_cache()
    assert out == {"updated": False, "reason": "not_configured"}
