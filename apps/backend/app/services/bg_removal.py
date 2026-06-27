"""Tách nền mộc / chữ ký — C3 (SIG.BG).

2 đường xử lý (PRD C3 + TDD):
- Mộc đỏ  → rembg (U2Net AI) tách nền, GIỮ NGUYÊN màu đỏ gốc → PNG RGBA trong suốt.
- Chữ ký  → OpenCV threshold + alpha nghịch đảo, giữ nét bút mảnh (màu gốc), nền trong suốt.

Đây là LÕI xử lý ảnh, KHÔNG biết Celery/FastAPI → test standalone trên ảnh mẫu. Worker
(`app/workers/rembg_task.py`) chỉ bọc mỏng để chạy async (rembg nặng — chỉ ở image worker,
KHÔNG ở image backend; TDD §2). `rembg`/`cv2` import TRỄ để backend không cần nạp model.
"""

from __future__ import annotations

import io
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from PIL.Image import Image as PILImage

# Cạnh dài tối đa — ảnh chụp giấy lớn (>5MB) tự thu nhỏ trước khi xử lý (PRD C3 edge).
_MAX_DIM = 2000


def _load_rgb_resized(data: bytes) -> PILImage:
    """Đọc ảnh → RGB, thu nhỏ giữ tỉ lệ nếu cạnh dài > _MAX_DIM. Trả PIL.Image."""
    from PIL import Image

    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    longest = max(w, h)
    if longest > _MAX_DIM:
        scale = _MAX_DIM / longest
        img = img.resize(
            (max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS
        )
    return img


def remove_seal_background(data: bytes) -> bytes:
    """Mộc đỏ → rembg (U2Net) tách nền, giữ nguyên màu đỏ. Trả PNG RGBA (bytes).

    rembg.remove giữ màu pixel tiền cảnh + đặt nền alpha=0. Lần đầu chạy sẽ tải model
    U2Net (~170MB) về cache (~/.u2net) — cần Internet 1 lần.
    """
    from rembg import remove

    img = _load_rgb_resized(data)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    out = remove(buf.getvalue())  # thường là bytes PNG RGBA
    if isinstance(out, bytes):
        return out
    # Một số version rembg trả PIL.Image — chuẩn hoá về bytes PNG.
    from PIL import Image

    if isinstance(out, Image.Image):
        b = io.BytesIO()
        out.save(b, format="PNG")
        return b.getvalue()
    raise RuntimeError("rembg trả kiểu không hỗ trợ")


def remove_signature_background(data: bytes, threshold: int) -> bytes:
    """Chữ ký → OpenCV threshold: nét bút (pixel tối) giữ màu gốc + alpha 255, nền (sáng)
    alpha 0. Trả PNG RGBA (bytes).

    threshold 0..100 (%): ngưỡng xám = threshold/100*255. Pixel xám <= ngưỡng coi là nét
    bút (giữ lại) → threshold càng cao càng giữ nhiều nét (lẫn cả vết mờ). Mặc định FE 60.
    """
    import cv2
    import numpy as np
    from PIL import Image

    img = _load_rgb_resized(data)
    rgb = np.asarray(img, dtype=np.uint8)  # H x W x 3 (RGB)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    level = int(max(0, min(100, threshold)) / 100 * 255)
    # THRESH_BINARY_INV: pixel <= level → 255 (nét bút), còn lại → 0 (nền trong suốt).
    _, alpha = cv2.threshold(gray, level, 255, cv2.THRESH_BINARY_INV)
    rgba = np.dstack([rgb, alpha]).astype(np.uint8)
    out = Image.fromarray(rgba, mode="RGBA")
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return buf.getvalue()


def remove_background(data: bytes, *, kind: str, threshold: int = 60) -> bytes:
    """Điều phối theo loại asset. kind='seal' → rembg; kind='signature' → opencv threshold."""
    if kind == "seal":
        return remove_seal_background(data)
    if kind == "signature":
        return remove_signature_background(data, threshold)
    raise ValueError(f"kind không hợp lệ: {kind!r}")
