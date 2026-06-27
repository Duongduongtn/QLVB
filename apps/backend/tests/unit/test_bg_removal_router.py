"""Test wiring phân quyền router tách nền (SIG.BG) — chỉ Quản lý.

Introspect APIRouter gốc: POST + GET (status/asset) đều phải có require_manager
(tách nền là thao tác quản trị asset — Nhân viên không dùng).
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.routing import APIRoute

from app.core import storage
from app.core.deps import require_manager
from app.core.errors import ValidationFailed
from app.routers.bg_removal import _check_tmp_key, router


def _dep_calls(path: str, method: str) -> set[Callable[..., Any]]:
    route = next(
        r
        for r in router.routes
        if isinstance(r, APIRoute) and r.path == path and method in r.methods
    )
    calls: set[Callable[..., Any]] = set()
    stack = list(route.dependant.dependencies)
    while stack:
        dep = stack.pop()
        if dep.call is not None:
            calls.add(dep.call)
        stack.extend(dep.dependencies)
    return calls


def test_submit_requires_manager() -> None:
    assert require_manager in _dep_calls("", "POST")


def test_status_requires_manager() -> None:
    assert require_manager in _dep_calls("/result/{task_id}", "GET")


def test_asset_requires_manager() -> None:
    assert require_manager in _dep_calls("/asset", "GET")


# ── Guard _check_tmp_key: chỉ cho phép key trong bg_tmp/ (chống IDOR/traversal) ──
def test_check_tmp_key_accepts_bg_tmp() -> None:
    assert _check_tmp_key("bg_tmp/ab/x.png") == "bg_tmp/ab/x.png"


@pytest.mark.parametrize("bad", ["assets/x.png", "logos/a/b.png", "../etc/passwd", "bg_tmpx/y.png"])
def test_check_tmp_key_rejects_outside(bad: str) -> None:
    with pytest.raises(ValidationFailed):
        _check_tmp_key(bad)


# ── purge_old_files: dọn asset tạm cũ, giữ file mới ──
def test_purge_old_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    class _S:
        storage_local_path = tmp_path

    monkeypatch.setattr("app.core.config.settings", _S)
    storage.save_asset(b"old", ext="png", subdir="bg_tmp")
    storage.save_asset(b"new", ext="png", subdir="bg_tmp")
    files = list((tmp_path / "bg_tmp").rglob("*.png"))
    assert len(files) == 2
    # 1 file "cũ" (mtime lùi 3 giờ), 1 file "mới"
    import os

    old_file = files[0]
    os.utime(old_file, (1000.0, 1000.0))  # mtime rất xa quá khứ
    # now lớn → file cũ (mtime=1000) vượt ngưỡng 2h; file mới (mtime ~ now thực, rất lớn) giữ lại.
    removed = storage.purge_old_files("bg_tmp", max_age_seconds=2 * 3600, now=100000.0)
    assert removed == 1
    assert not old_file.exists()
    assert files[1].exists()


def test_purge_old_files_rejects_traversal() -> None:
    with pytest.raises(ValueError):
        storage.purge_old_files("../etc", max_age_seconds=1, now=2.0)
