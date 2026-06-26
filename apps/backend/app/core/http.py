"""Tiện ích đọc metadata request dùng chung cho các router."""

from __future__ import annotations

import ipaddress

from fastapi import Request


def client_ip(request: Request) -> str | None:
    """IP thật sau Nginx reverse proxy, ưu tiên header TIN CẬY.

    Nginx (docker/nginx.conf) set `X-Real-IP = $remote_addr` (IP thật của bên kết nối)
    nên dùng nó trước; `X-Forwarded-For` dùng `$proxy_add_x_forwarded_for` (APPEND) → hop
    đầu là chuỗi client tự bịa, KHÔNG tin để ghi audit. Validate INET trước khi trả
    (chuỗi rác làm psycopg DataError → rollback). Không hợp lệ → None.
    """
    candidate = request.headers.get("x-real-ip")
    if not candidate:
        forwarded = request.headers.get("x-forwarded-for")
        candidate = (
            forwarded.split(",")[0].strip()
            if forwarded
            else (request.client.host if request.client else None)
        )
    if not candidate:
        return None
    try:
        ipaddress.ip_address(candidate)
    except ValueError:
        return None
    return candidate
