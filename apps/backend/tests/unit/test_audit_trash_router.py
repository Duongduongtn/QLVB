"""Wiring phân quyền audit + thùng rác (H3): audit + trash CHỈ Quản lý; xoá mềm CV = current_user."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter
from fastapi.routing import APIRoute

from app.core.deps import current_user, require_manager
from app.routers.audit import router as audit_router
from app.routers.outgoing import router as outgoing_router
from app.routers.trash import router as trash_router


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


def test_audit_list_manager_only() -> None:
    assert require_manager in _dep_calls(audit_router, "", "GET")


def test_audit_actions_manager_only() -> None:
    assert require_manager in _dep_calls(audit_router, "/actions", "GET")


def test_trash_endpoints_manager_only() -> None:
    for path, method in [("", "GET"), ("/{doc_id}/restore", "POST"), ("/{doc_id}", "DELETE")]:
        assert require_manager in _dep_calls(trash_router, path, method), f"{method} {path}"


def test_soft_delete_outgoing_current_user() -> None:
    # Xoá mềm cho mọi user (service tự chặn CV đã cấp số = manager); KHÔNG manager-only ở route.
    calls = _dep_calls(outgoing_router, "/{doc_id}", "DELETE")
    assert current_user in calls
    assert require_manager not in calls
