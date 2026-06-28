"""Unit test Web Push (L1 PWA) — gửi + dọn endpoint chết, no-op khi chưa cấu hình VAPID."""

from __future__ import annotations

import json
import sys
import types
from typing import Any

import pytest
from pydantic import SecretStr

from app.core.errors import ValidationFailed
from app.services import push as svc


class _Sub:
    def __init__(self, endpoint: str) -> None:
        self.endpoint = endpoint
        self.p256dh = "p"
        self.auth = "a"


class _Scalars:
    def __init__(self, rows: list[Any]) -> None:
        self._rows = rows

    def all(self) -> list[Any]:
        return self._rows


class FakeDB:
    def __init__(self, subs: list[Any]) -> None:
        self._subs = subs
        self.executed: list[Any] = []

    def scalars(self, _stmt: Any) -> _Scalars:
        return _Scalars(self._subs)

    def execute(self, stmt: Any) -> None:
        self.executed.append(stmt)


def _install_fake_pywebpush(
    monkeypatch: pytest.MonkeyPatch, dead_endpoints: set[str], sent_payloads: list[Any] | None = None
) -> list[str]:
    """Cài module pywebpush giả: endpoint trong dead_endpoints → ném 410. Trả list đã gửi.
    Nếu truyền `sent_payloads`, ghi lại payload JSON đã giải mã để kiểm nội dung."""
    called: list[str] = []

    class WebPushException(Exception):
        def __init__(self, msg: str, response: Any = None) -> None:
            super().__init__(msg)
            self.response = response

    class _Resp:
        def __init__(self, code: int) -> None:
            self.status_code = code

    def webpush(*, subscription_info: dict[str, Any], data: str | None = None, **_kw: Any) -> None:
        ep = subscription_info["endpoint"]
        if ep in dead_endpoints:
            raise WebPushException("gone", response=_Resp(410))
        if sent_payloads is not None and data is not None:
            sent_payloads.append(json.loads(data))
        called.append(ep)

    mod = types.ModuleType("pywebpush")
    mod.webpush = webpush  # type: ignore[attr-defined]
    mod.WebPushException = WebPushException  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "pywebpush", mod)
    return called


def _configure_vapid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(svc.settings, "vapid_public_key", "BPUBLIC", raising=False)
    monkeypatch.setattr(svc.settings, "vapid_private_key", SecretStr("PRIV"), raising=False)
    monkeypatch.setattr(svc.settings, "vapid_subject", "mailto:a@b.c", raising=False)


def test_send_noop_khi_chua_cau_hinh_vapid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(svc.settings, "vapid_public_key", None, raising=False)
    monkeypatch.setattr(svc.settings, "vapid_private_key", None, raising=False)
    db = FakeDB([_Sub("https://x/1")])
    # Không cấu hình → trả 0, KHÔNG truy vấn db (không cần pywebpush).
    assert svc.send_to_user(db, 1, title="t", body="b", url="/x") == 0
    assert db.executed == []


def test_send_toi_moi_thiet_bi(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_vapid(monkeypatch)
    called = _install_fake_pywebpush(monkeypatch, dead_endpoints=set())
    db = FakeDB([_Sub("https://x/1"), _Sub("https://x/2")])
    sent = svc.send_to_user(db, 1, title="t", body="b", url="/x")
    assert sent == 2
    assert set(called) == {"https://x/1", "https://x/2"}
    assert db.executed == []  # không có endpoint chết → không xoá


def test_send_don_endpoint_chet(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_vapid(monkeypatch)
    called = _install_fake_pywebpush(monkeypatch, dead_endpoints={"https://x/2"})
    db = FakeDB([_Sub("https://x/1"), _Sub("https://x/2")])
    sent = svc.send_to_user(db, 1, title="t", body="b", url="/x")
    assert sent == 1  # chỉ /1 thành công
    assert called == ["https://x/1"]
    assert len(db.executed) == 1  # đúng 1 lệnh xoá cho endpoint 410


def test_send_khong_co_subscription(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_vapid(monkeypatch)
    _install_fake_pywebpush(monkeypatch, dead_endpoints=set())
    db = FakeDB([])
    assert svc.send_to_user(db, 1, title="t", body="b", url="/x") == 0


def test_vapid_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(svc.settings, "vapid_public_key", None, raising=False)
    monkeypatch.setattr(svc.settings, "vapid_private_key", None, raising=False)
    assert svc.vapid_configured() is False
    _configure_vapid(monkeypatch)
    assert svc.vapid_configured() is True
    assert svc.public_key() == "BPUBLIC"


def test_body_bi_cat_theo_max(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_vapid(monkeypatch)
    payloads: list[Any] = []
    _install_fake_pywebpush(monkeypatch, dead_endpoints=set(), sent_payloads=payloads)
    db = FakeDB([_Sub("https://fcm.googleapis.com/x/1")])
    long_body = "a" * 1000
    svc.send_to_user(db, 1, title="t", body=long_body, url="/x")
    assert len(payloads) == 1
    assert len(payloads[0]["body"]) == svc._MAX_BODY
    assert payloads[0]["url"] == "/x"


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://fcm.googleapis.com/x",  # không https
        "https://localhost/x",
        "https://127.0.0.1/x",
        "https://169.254.169.254/latest",  # metadata cloud
        "https://10.0.0.5/x",  # IP riêng
        "https://router.internal/x",
    ],
)
def test_validate_endpoint_chan_ssrf(endpoint: str) -> None:
    with pytest.raises(ValidationFailed):
        svc._validate_push_endpoint(endpoint)


@pytest.mark.parametrize(
    "endpoint",
    [
        "https://fcm.googleapis.com/fcm/send/abc",
        "https://updates.push.services.mozilla.com/wpush/v2/abc",
        "https://web.push.apple.com/abc",
    ],
)
def test_validate_endpoint_cho_host_cong_khai(endpoint: str) -> None:
    svc._validate_push_endpoint(endpoint)  # không ném


def test_send_don_endpoint_noi_bo_con_sot(monkeypatch: pytest.MonkeyPatch) -> None:
    """Row cũ có endpoint nội bộ (trước khi có validate) → bỏ qua + đánh dấu xoá, không gửi."""
    _configure_vapid(monkeypatch)
    called = _install_fake_pywebpush(monkeypatch, dead_endpoints=set())
    db = FakeDB([_Sub("https://10.0.0.9/x"), _Sub("https://fcm.googleapis.com/ok")])
    sent = svc.send_to_user(db, 1, title="t", body="b", url="/x")
    assert sent == 1
    assert called == ["https://fcm.googleapis.com/ok"]
    assert len(db.executed) == 1  # xoá endpoint nội bộ
