"""Test wiring router CV đi — mọi endpoint yêu cầu đăng nhập (current_user).

D1 cho cả Quản lý lẫn Nhân viên dùng → KHÔNG manager-only; chỉ cần current_user trên
mọi route (đọc + ghi).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.routing import APIRoute

from app.core.deps import current_user, require_manager
from app.routers.outgoing import router


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


def test_all_endpoints_require_login_not_manager() -> None:
    cases = [
        ("", "GET"),
        ("", "POST"),
        ("/{doc_id}", "GET"),
        ("/{doc_id}", "PATCH"),
        ("/{doc_id}/file", "POST"),
        ("/{doc_id}/preview", "POST"),
        ("/{doc_id}/number", "POST"),
        ("/{doc_id}/download", "GET"),
    ]
    for path, method in cases:
        calls = _dep_calls(path, method)
        assert current_user in calls, f"{method} {path} thiếu current_user"
        assert require_manager not in calls, f"{method} {path} không nên manager-only"
