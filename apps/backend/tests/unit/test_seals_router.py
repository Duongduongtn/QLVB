"""Test wiring phân quyền router mộc — bất biến 'chỉ Quản lý mutate' (SIG.SEL-01).

KHÔNG dựng HTTP (venv nhẹ thiếu httpx). Introspect thẳng APIRouter gốc của seals
(public API, ổn định qua phiên bản FastAPI): POST/PATCH phải có require_manager;
GET chỉ current_user (Nhân viên xem được để chọn mộc). Bắt lỗi vô tình gỡ gate.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.routing import APIRoute

from app.core.deps import current_user, require_manager
from app.routers.seals import router


def _dep_calls(path: str, method: str) -> set[Callable[..., Any]]:
    """Tập mọi callable dependency (đệ quy) của route khớp path (tương đối) + method."""
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


def test_create_seal_requires_manager() -> None:
    assert require_manager in _dep_calls("", "POST")


def test_update_seal_requires_manager() -> None:
    assert require_manager in _dep_calls("/{seal_id}", "PATCH")


def test_list_seals_allows_current_user_not_manager_only() -> None:
    # Nhân viên phải xem được danh sách mộc (chọn khi soạn CV) → KHÔNG require_manager.
    calls = _dep_calls("", "GET")
    assert current_user in calls
    assert require_manager not in calls


def test_get_seal_image_allows_current_user_not_manager_only() -> None:
    calls = _dep_calls("/{seal_id}/image", "GET")
    assert current_user in calls
    assert require_manager not in calls
