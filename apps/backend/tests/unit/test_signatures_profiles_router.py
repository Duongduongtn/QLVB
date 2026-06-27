"""Test wiring phân quyền router chữ ký + hồ sơ ký (SIG.SGN / SIG.PRO).

Introspect APIRouter gốc (public API): POST/PATCH phải có require_manager; GET chỉ
current_user (Nhân viên xem được để chọn khi soạn CV).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter
from fastapi.routing import APIRoute

from app.core.deps import current_user, require_manager
from app.routers.signatures import router as sig_router
from app.routers.signing_profiles import router as profile_router


def _dep_calls(router: APIRouter, path: str, method: str) -> set[Callable[..., Any]]:
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


def test_signature_create_requires_manager() -> None:
    assert require_manager in _dep_calls(sig_router, "", "POST")


def test_signature_update_requires_manager() -> None:
    assert require_manager in _dep_calls(sig_router, "/{signature_id}", "PATCH")


def test_signature_list_is_current_user_only() -> None:
    calls = _dep_calls(sig_router, "", "GET")
    assert current_user in calls
    assert require_manager not in calls


def test_profile_create_requires_manager() -> None:
    assert require_manager in _dep_calls(profile_router, "", "POST")


def test_profile_update_requires_manager() -> None:
    assert require_manager in _dep_calls(profile_router, "/{profile_id}", "PATCH")


def test_profile_list_is_current_user_only() -> None:
    calls = _dep_calls(profile_router, "", "GET")
    assert current_user in calls
    assert require_manager not in calls
