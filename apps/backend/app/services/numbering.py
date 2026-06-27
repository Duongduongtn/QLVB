"""Cấp số công văn bằng PostgreSQL SEQUENCE — B2 / D1.10 (TDD §3.3).

Nguồn chân lý số đếm = PG SEQUENCE (atomic, 2 user đồng thời KHÔNG trùng). KHÔNG
dùng MAX(number)+1 (race). SEQUENCE tạo LAZY theo kỳ (reset năm/tháng → mỗi kỳ 1
sequence riêng). `numbering_registry` chỉ ánh xạ (loại, kỳ) → tên sequence thực.

Bất biến:
- CV huỷ → số đã cấp KHÔNG tái dùng (nextval không lùi). Sổ chấp nhận nhảy số.
- Tên sequence sinh từ doc_type_id + kỳ (ASCII thuần) và được WHITELIST chặt trước khi
  EXECUTE động → không có lỗ SQL injection qua identifier.
- "STT hiện tại" lưu vào sequence bằng setval(is_called=true) → KHÔNG có cột current_value
  (tránh 2 nguồn chân lý). Hiển thị "số kế tiếp" = last_value + 1 đọc từ pg_sequences.
"""

from __future__ import annotations

import re
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import ValidationFailed
from app.models.document_type import DocumentType

# Biến hợp lệ trong number_format — hỗ trợ cả bản có dấu (PRD) lẫn không dấu (TDD).
_FORMAT_TOKENS: dict[str, str] = {
    "STT": "stt",
    "NĂM": "year",
    "NAM": "year",
    "THÁNG": "month",
    "THANG": "month",
    "ĐƠN VỊ": "unit",
    "DONVI": "unit",
    "LOẠI": "type",
    "LOAI": "type",
}
_PLACEHOLDER_RE = re.compile(r"\{([^{}]*)\}")
_SEQ_NAME_RE = re.compile(r"^seq_\d+_[0-9a-z_]+$")


def period_key(reset_policy: str, on_date: date) -> str:
    """Kỳ reset: 'year'→'2026', 'month'→'2026-06', 'none'→'all'."""
    if reset_policy == "month":
        return f"{on_date.year}-{on_date.month:02d}"
    if reset_policy == "none":
        return "all"
    return str(on_date.year)


def sequence_name(doc_type_id: int, period: str) -> str:
    """Tên PG SEQUENCE thực — ASCII thuần từ id + kỳ. Whitelist trước khi dùng động."""
    name = f"seq_{doc_type_id}_{period.replace('-', '_')}"
    if not _SEQ_NAME_RE.match(name) or len(name) > 120:
        raise ValueError(f"Tên sequence không hợp lệ: {name!r}")
    return name


def validate_format(number_format: str) -> str:
    """Bắt buộc có {STT}; từ chối biến lạ (chống gõ nhầm token)."""
    placeholders = _PLACEHOLDER_RE.findall(number_format)
    if "STT" not in placeholders:
        raise ValidationFailed("Format số phải chứa biến {STT}")
    unknown = [p for p in placeholders if p not in _FORMAT_TOKENS]
    if unknown:
        raise ValidationFailed(f"Biến không hợp lệ: {', '.join('{' + u + '}' for u in unknown)}")
    return number_format


def format_number(
    number_format: str,
    *,
    stt: int,
    zero_pad: int,
    unit_code: str | None,
    type_code: str,
    on_date: date,
) -> str:
    """Render số CV từ template + biến. Ví dụ '{STT}/{NĂM}/{LOẠI}-{ĐƠN VỊ}' → '001/2026/CV-GDNN'."""
    values = {
        "stt": str(stt).zfill(zero_pad) if zero_pad > 0 else str(stt),
        "year": str(on_date.year),
        "month": f"{on_date.month:02d}",
        "unit": unit_code or "",
        "type": type_code,
    }

    def _replace(m: re.Match[str]) -> str:
        key = _FORMAT_TOKENS.get(m.group(1))
        return values[key] if key is not None else m.group(0)

    return _PLACEHOLDER_RE.sub(_replace, number_format)


# ── Lớp chạm DB (cần Postgres thật) ──────────────────────────────────────────
def get_or_create_sequence(db: Session, doc_type: DocumentType, period: str) -> str:
    """Tạo SEQUENCE cho kỳ nếu chưa có + ghi registry (idempotent). Trả tên sequence."""
    name = sequence_name(doc_type.id, period)
    # name đã whitelist (^seq_\d+_[0-9a-z_]+$) → an toàn nội suy vào DDL (identifier không
    # nhận bind param). Quote để chắc chắn coi là identifier.
    db.execute(text(f'CREATE SEQUENCE IF NOT EXISTS "{name}"'))
    db.execute(
        text(
            "INSERT INTO numbering_registry (doc_type_id, period_key, sequence_name) "
            "VALUES (:t, :p, :n) ON CONFLICT (doc_type_id, period_key) DO NOTHING"
        ),
        {"t": doc_type.id, "p": period, "n": name},
    )
    return name


def peek_next(db: Session, name: str) -> int:
    """Số kế tiếp sẽ cấp (KHÔNG tạo sequence, KHÔNG đốt số). last_value NULL = chưa cấp → 1."""
    row = db.execute(
        text(
            "SELECT last_value FROM pg_sequences "
            "WHERE schemaname = current_schema() AND sequencename = :n"
        ),
        {"n": name},
    ).first()
    if row is None or row[0] is None:
        return 1
    return int(row[0]) + 1


def set_current(db: Session, name: str, last_issued: int) -> None:
    """Đặt 'STT đã cấp gần nhất' = last_issued (migrate từ Excel) → số kế tiếp = +1.

    last_issued ≤ 0 → bỏ qua (để sequence lazy, peek = 1).
    """
    if last_issued < 1:
        return
    db.execute(text("SELECT setval(:n, :v, true)"), {"n": name, "v": last_issued})


def next_number(db: Session, doc_type: DocumentType, on_date: date) -> int:
    """Số kế tiếp hiển thị cho 1 loại VB ở kỳ hiện tại (read-only)."""
    return peek_next(db, sequence_name(doc_type.id, period_key(doc_type.reset_policy, on_date)))


def allocate_number(
    db: Session, doc_type: DocumentType, *, unit_code: str | None, on_date: date
) -> tuple[int, str]:
    """Cấp 1 số mới (nextval ATOMIC) + render. Dùng khi phát hành CV (D1.10).

    Caller chịu trách nhiệm commit cùng transaction nghiệp vụ.
    """
    period = period_key(doc_type.reset_policy, on_date)
    name = get_or_create_sequence(db, doc_type, period)
    n = int(db.execute(text("SELECT nextval(:n)"), {"n": name}).scalar_one())
    formatted = format_number(
        doc_type.number_format,
        stt=n,
        zero_pad=doc_type.zero_pad,
        unit_code=unit_code,
        type_code=doc_type.code,
        on_date=on_date,
    )
    return n, formatted
