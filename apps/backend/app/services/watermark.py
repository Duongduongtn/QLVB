"""Watermark cá nhân khi tải PDF — H2 (SEC.WMK).

Sinh watermark ON-THE-FLY lúc tải xuống ("Tải bởi: <user> - <dd/mm/yyyy HH:mm> - IP <ip>")
— KHÔNG sửa file gốc trên storage (hash giữ nguyên cho dedup E1.6). CV đã ký số → KHÔNG
watermark (tránh phá chữ ký), tầng router vẫn ghi audit tải. Lõi fitz nằm ở `pdf_stamp`.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

from app.services import pdf_stamp

_VN_TZ = timezone(timedelta(hours=7))  # Asia/Saigon
# Font bundle (DejaVu Sans — hỗ trợ đầy đủ tiếng Việt có dấu), cạnh module data.
_BUNDLED_FONT = Path(__file__).resolve().parent.parent / "data" / "fonts" / "DejaVuSans.ttf"


def _font_path() -> str:
    from app.core.config import settings

    if settings.watermark_font_path:
        return settings.watermark_font_path
    return str(_BUNDLED_FONT)


def should_serve_raw(raw: bool, role: str) -> bool:
    """CHỈ Quản lý mới được tải bản gốc không watermark. Nhân viên truyền raw=1 vẫn bị
    watermark (bất biến phân quyền H2 — enforce server-side)."""
    return raw and role == "manager"


def build_watermark_text(username: str, ip: str | None, *, when: datetime | None = None) -> str:
    """Dòng watermark: 'Tải bởi: <username> - <dd/mm/yyyy HH:mm> - IP <ip>' (giờ VN)."""
    now = when or datetime.now(UTC)
    if now.tzinfo is None:
        now = now.replace(tzinfo=UTC)
    stamp = now.astimezone(_VN_TZ).strftime("%d/%m/%Y %H:%M")
    return f"Tải bởi: {username} - {stamp} - IP {ip or 'không rõ'}"


def apply_download_watermark(
    pdf_bytes: bytes, *, username: str, ip: str | None, when: datetime | None = None
) -> tuple[bytes, bool]:
    """Trả (pdf_đã_xử_lý, đã_watermark?). CV đã ký số → trả nguyên bản, đã_watermark=False."""
    if pdf_stamp.pdf_has_signature(pdf_bytes):
        return pdf_bytes, False
    text = build_watermark_text(username, ip, when=when)
    return pdf_stamp.watermark_pdf(pdf_bytes, text, font_path=_font_path()), True
