"""Unit test tách nền C3 (SIG.BG) — service xử lý ảnh thật trên ảnh tổng hợp.

Đường chữ ký (OpenCV) nhanh, tất định → chạy mọi lúc (skip nếu thiếu cv2/numpy/PIL).
Đường mộc (rembg/U2Net) đánh dấu `slow` (tải model ~170MB) → CI `not slow` bỏ qua.
"""

from __future__ import annotations

import io
from typing import Any

import pytest

cv2 = pytest.importorskip("cv2")
np = pytest.importorskip("numpy")
PILImage = pytest.importorskip("PIL.Image")
from PIL import ImageDraw  # noqa: E402

from app.services import bg_removal  # noqa: E402


def _signature_png(w: int = 320, h: int = 120) -> bytes:
    img = PILImage.new("RGB", (w, h), "white")
    ImageDraw.Draw(img).line([(20, 90), (90, 30), (160, 95), (300, 40)], fill="black", width=6)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _alpha(png: bytes) -> Any:
    im = PILImage.open(io.BytesIO(png)).convert("RGBA")
    return np.asarray(im)[:, :, 3]


def test_remove_background_invalid_kind() -> None:
    with pytest.raises(ValueError):
        bg_removal.remove_background(_signature_png(), kind="bad")


def test_signature_makes_background_transparent() -> None:
    out = bg_removal.remove_signature_background(_signature_png(), threshold=60)
    a = _alpha(out)
    assert int(a[0, 0]) == 0  # góc (nền) trong suốt
    assert (a > 0).any()  # còn nét bút
    assert (a == 0).sum() > (a > 0).sum()  # phần lớn là nền trong suốt


def test_signature_output_is_rgba_same_size() -> None:
    out = bg_removal.remove_signature_background(_signature_png(200, 80), threshold=60)
    im = PILImage.open(io.BytesIO(out))
    assert im.mode == "RGBA"
    assert im.size == (200, 80)


def test_signature_threshold_monotonic() -> None:
    # Ngưỡng cao hơn → giữ >= số pixel (gồm cả vết mờ).
    png = _signature_png()
    low = int((_alpha(bg_removal.remove_signature_background(png, 20)) > 0).sum())
    high = int((_alpha(bg_removal.remove_signature_background(png, 90)) > 0).sum())
    assert high >= low


def test_large_image_is_resized() -> None:
    big = PILImage.new("RGB", (2600, 100), "white")
    buf = io.BytesIO()
    big.save(buf, format="PNG")
    out = bg_removal.remove_signature_background(buf.getvalue(), threshold=60)
    im = PILImage.open(io.BytesIO(out))
    assert max(im.size) <= 2000  # _MAX_DIM


@pytest.mark.slow
def test_seal_rembg_keeps_foreground_removes_background() -> None:
    pytest.importorskip("rembg")
    img = PILImage.new("RGB", (240, 240), "white")
    d = ImageDraw.Draw(img)
    d.ellipse([30, 30, 210, 210], outline="red", width=12)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    out = bg_removal.remove_seal_background(buf.getvalue())
    a = _alpha(out)
    assert PILImage.open(io.BytesIO(out)).mode == "RGBA"
    assert int(a[0, 0]) == 0  # nền bị xoá
    assert (a > 0).any()  # còn tiền cảnh
