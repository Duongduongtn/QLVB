"""Unit test F2 — chuẩn hoá tag (PRD edge: gộp #Thi Tay Nghề ≡ #thi-tay-nghe)."""

from __future__ import annotations

import pytest

from app.services import tags as tag_svc

pytestmark = pytest.mark.unit


@pytest.mark.parametrize("raw,norm", [
    ("#Thi Tay Nghề", "thi-tay-nghe"),
    ("thi-tay-nghe", "thi-tay-nghe"),
    ("Kiểm Toán 2026", "kiem-toan-2026"),
    ("  Đào Tạo  Nghề  ", "dao-tao-nghe"),
    ("ĐẢNG", "dang"),
    ("a__b", "a-b"),
    ("Tag!!!Lạ@@@Ký#Tự", "tag-la-ky-tu"),
    ("---x---", "x"),
    ("###", ""),
    ("   ", ""),
])
def test_normalize_tag(raw: str, norm: str) -> None:
    assert tag_svc.normalize_tag(raw) == norm
