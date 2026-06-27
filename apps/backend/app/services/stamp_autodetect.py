"""Tự dò vị trí chèn mộc/chữ ký/ngày trên PDF — D2 (OUT.MAP).

Thứ tự ưu tiên A → C (D kéo-thả thủ công là fallback ở FE):
- A. Placeholder trong text: tìm `{{KY_TEN}}` / `{{DONG_DAU}}` / `{{NGAY}}` (cả Word đã
  convert sang PDF lẫn PDF gốc có text-layer) → đặt ảnh đúng chỗ. Chính xác cao, đo được.
- B. Regex cụm chuẩn: "GIÁM ĐỐC" / "Người ký" / "Ký tên, đóng dấu" → đặt chữ ký phía trên
  chức danh + mộc đè 1/3. Work-able, FE cho duyệt.
- C. Template lưu sẵn theo loại văn bản: toạ độ % đã lưu.

Toạ độ trả về theo % kích thước trang (StampPosition) để resize không lệch (QĐ #2).
PyMuPDF chỉ đọc text-layer; PDF scan ảnh (không text) → A/B trả rỗng, caller dùng C/D.
"""

from __future__ import annotations

from typing import Any

# Placeholder chấp nhận nhiều biến thể (có/không dấu gạch).
_PLACEHOLDERS: dict[str, list[str]] = {
    "signature": ["{{KY_TEN}}", "{{CHU_KY}}", "{{CHUKY}}", "{{KYTEN}}"],
    "seal": ["{{DONG_DAU}}", "{{MOC}}", "{{DAU}}", "{{DONGDAU}}"],
    "date": ["{{NGAY}}", "{{NGAY_THANG}}", "{{NGAYTHANG}}"],
}
# Kích thước mặc định (% trang) cho từng loại khi đặt theo placeholder/regex.
_SIZES: dict[str, tuple[float, float]] = {
    "signature": (0.24, 0.11),
    "seal": (0.13, 0.13),
    "date": (0.22, 0.045),
}
# Cụm chuẩn (chữ ký đặt PHÍA TRÊN) — regex method B. Lower-case để so khớp. Có cả biến thể
# KHÔNG DẤU để bắt được PDF/scan mất dấu.
_TITLE_PHRASES = (
    "giám đốc",
    "giam doc",
    "thủ trưởng đơn vị",
    "thu truong don vi",
    "người ký",
    "nguoi ky",
    "ký tên, đóng dấu",
    "ky ten, dong dau",
    "tm. ",
)


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _pos(kind: str, page: int, cx: float, cy: float) -> dict[str, Any]:
    """Tạo StampPosition: căn TÂM ảnh vào điểm (cx, cy) tính theo % trang."""
    w, h = _SIZES[kind]
    return {
        "kind": kind,
        "page": page,
        "x_pct": _clamp(cx - w / 2, 0.0, 1.0 - w),
        "y_pct": _clamp(cy - h / 2, 0.0, 1.0 - h),
        "w_pct": w,
        "h_pct": h,
    }


def detect_placeholders(data: bytes, *, want_seal: bool, want_sig: bool) -> list[dict[str, Any]]:
    """Cách A — dò placeholder text. Trả [] nếu không có (PDF scan / không có token)."""
    import fitz

    out: list[dict[str, Any]] = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for pno, page in enumerate(doc):
            pw, ph = page.rect.width, page.rect.height
            if pw <= 0 or ph <= 0:
                continue
            for kind in ("signature", "seal", "date"):
                if kind == "seal" and not want_seal:
                    continue
                if kind == "signature" and not want_sig:
                    continue
                for token in _PLACEHOLDERS[kind]:
                    rects = page.search_for(token)
                    if rects:
                        r = rects[-1]  # nhiều cụm → chọn cụm CUỐI (PRD edge)
                        cx = (r.x0 + r.x1) / 2 / pw
                        cy = (r.y0 + r.y1) / 2 / ph
                        out.append(_pos(kind, pno + 1, cx, cy))
                        break
    return out


def detect_by_regex(data: bytes, *, want_seal: bool, want_sig: bool) -> list[dict[str, Any]]:
    """Cách B — nhận diện cụm chức danh, đặt chữ ký phía trên + mộc đè 1/3."""
    import fitz

    out: list[dict[str, Any]] = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        last = len(doc) - 1
        if last < 0:
            return out
        page = doc[last]
        pw, ph = page.rect.width, page.rect.height
        if pw <= 0 or ph <= 0:
            return out
        text_low = page.get_text().lower()
        if not any(p in text_low for p in _TITLE_PHRASES):
            return out
        # Tìm rect của cụm khớp đầu tiên để định vị; mặc định góc dưới phải nếu không có rect.
        hit = None
        for phrase in _TITLE_PHRASES:
            rects = page.search_for(phrase)
            if rects:
                hit = rects[-1]
                break
        cx = 0.72 if hit is None else (hit.x0 + hit.x1) / 2 / pw
        cy = 0.80 if hit is None else hit.y0 / ph  # phía TRÊN dòng chức danh
        if want_sig:
            out.append(_pos("signature", last + 1, cx, _clamp(cy - 0.06, 0.0, 1.0)))
        if want_seal:
            # mộc đè ~1/3 lên chữ ký (lệch xuống + trái một chút).
            out.append(_pos("seal", last + 1, _clamp(cx - 0.04, 0.0, 1.0), _clamp(cy - 0.02, 0.0, 1.0)))
    return out


def detect_positions(
    data: bytes,
    *,
    want_seal: bool,
    want_sig: bool,
    template: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], str]:
    """Áp thứ tự A → C. Trả (positions, method). method ∈ placeholder|template|regex|none."""
    a = detect_placeholders(data, want_seal=want_seal, want_sig=want_sig)
    if a:
        return a, "placeholder"
    if template:
        return template, "template"
    b = detect_by_regex(data, want_seal=want_seal, want_sig=want_sig)
    if b:
        return b, "regex"
    return [], "none"
