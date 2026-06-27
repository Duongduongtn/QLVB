"""Wiring router CV đến: đổi cờ 'Chỉ Quản lý xem' require_manager; còn lại current_user."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter
from fastapi.routing import APIRoute

from app.core.deps import current_user, require_manager
from app.routers.incoming import router as inc_router


def _dep_calls(router: APIRouter, path: str, method: str) -> set[Callable[..., Any]]:
    route = next(
        r for r in router.routes if isinstance(r, APIRoute) and r.path == path and method in r.methods
    )
    calls: set[Callable[..., Any]] = set()
    stack = list(route.dependant.dependencies)
    while stack:
        dep = stack.pop()
        if dep.call is not None:
            calls.add(dep.call)
        stack.extend(dep.dependencies)
    return calls


def test_manager_only_toggle_requires_manager() -> None:
    calls = _dep_calls(inc_router, "/{doc_id}/manager-only", "POST")
    assert require_manager in calls


def test_upload_and_list_current_user() -> None:
    for path, method in [("/upload", "POST"), ("", "GET"), ("/{doc_id}/register", "POST")]:
        calls = _dep_calls(inc_router, path, method)
        assert current_user in calls, f"{method} {path}"
        assert require_manager not in calls, f"{method} {path}"
