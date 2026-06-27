"""Tiện ích đọc + validate ảnh upload (logo/mộc/chữ ký) dùng chung cho router.

Validate bằng MAGIC BYTES, KHÔNG tin content-type/filename client gửi. Đọc CÓ CHẶN
(max+1 byte) để không nạp cả body khổng lồ vào RAM trước khi kiểm size.
"""

from __future__ import annotations

from fastapi import UploadFile

from app.core.errors import ValidationFailed

# magic bytes → (content-type chuẩn, đuôi file)
_IMAGE_SIGNATURES: list[tuple[bytes, str, str]] = [
    (b"\x89PNG\r\n\x1a\n", "image/png", "png"),
    (b"\xff\xd8\xff", "image/jpeg", "jpg"),
]


async def read_image_upload(file: UploadFile, *, max_bytes: int) -> tuple[bytes, str, str]:
    """Trả (data, ext, mime) nếu là PNG/JPG hợp lệ ≤ max_bytes; ngược lại raise ValidationFailed."""
    data = await file.read(max_bytes + 1)
    if not data:
        raise ValidationFailed("File ảnh rỗng")
    if len(data) > max_bytes:
        raise ValidationFailed(f"Ảnh vượt quá {max_bytes // (1024 * 1024)}MB")
    match = next((sig for sig in _IMAGE_SIGNATURES if data.startswith(sig[0])), None)
    if match is None:
        raise ValidationFailed("Ảnh phải là PNG hoặc JPG")
    _, mime, ext = match
    return data, ext, mime
