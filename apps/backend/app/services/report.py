"""Báo cáo — G2 xuất sổ CV đi/đến theo NĐ 30/2020 (Excel) + thống kê dashboard (G1-lite).

`build_register_xlsx` sinh file Excel đúng cột Phụ lục III NĐ 30/2020 (header tiếng Việt có
dấu), openpyxl import TRỄ. `dashboard_stats` trả KPI + 12 tháng CV đi/đến (đếm thật).
"""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ValidationFailed
from app.models.incoming_document import IncomingDocument
from app.models.organization import Organization
from app.models.outgoing_document import OutgoingDocument, OutgoingRecipient
from app.models.signature import Signature
from app.models.signing_profile import SigningProfile
from app.models.unit import Unit

BOOKS = ("di_gdnn", "di_dvdl", "den")

# Cột NĐ 30/2020 — Phụ lục III (sổ đăng ký văn bản đi / đến).
_COLS_DI = [
    ("stt", "Số TT", 8),
    ("number", "Số, ký hiệu văn bản", 22),
    ("issue_date", "Ngày tháng văn bản", 16),
    ("subject", "Tên loại và trích yếu nội dung văn bản", 50),
    ("signer", "Người ký", 22),
    ("recipients", "Nơi nhận văn bản", 32),
    ("copies", "Số lượng bản", 12),
    ("note", "Ghi chú", 20),
]
_COLS_DEN = [
    ("stt", "Số đến", 8),
    ("arrival_date", "Ngày đến", 14),
    ("reference", "Số, ký hiệu", 20),
    ("doc_date", "Ngày tháng văn bản", 16),
    ("sender", "Cơ quan, tổ chức ban hành", 30),
    ("subject", "Tên loại và trích yếu nội dung", 46),
    ("assignee", "Đơn vị/người nhận xử lý", 24),
    ("note", "Ghi chú", 20),
]

_BOOK_TITLE = {
    "di_gdnn": "SỔ ĐĂNG KÝ VĂN BẢN ĐI — GDNN",
    "di_dvdl": "SỔ ĐĂNG KÝ VĂN BẢN ĐI — DVDL",
    "den": "SỔ ĐĂNG KÝ VĂN BẢN ĐẾN (chung 2 đơn vị)",
}
_STATUS_NOTE = {"cancelled": "Đã huỷ"}


def _fmt_d(d: date | None) -> str:
    return d.strftime("%d/%m/%Y") if d else ""


def _excel_safe(v: Any) -> Any:
    """Chống Excel/CSV formula injection (TDD §10.2): field tự do bắt đầu bằng = + - @ TAB CR
    → prepend `'` để Excel coi là TEXT, không diễn giải thành công thức (trích yếu/tên cơ quan
    do bên ngoài soạn / OCR có thể chứa)."""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


def _year_range(year: int) -> tuple[date, date]:
    return date(year, 1, 1), date(year + 1, 1, 1)


def _outgoing_rows(db: Session, unit_code: str, year: int) -> list[dict[str, Any]]:
    unit = db.scalar(select(Unit).where(Unit.code == unit_code))
    if unit is None:
        return []
    lo, hi = _year_range(year)
    docs = db.scalars(
        select(OutgoingDocument)
        .where(
            OutgoingDocument.unit_id == unit.id,
            OutgoingDocument.deleted_at.is_(None),
            OutgoingDocument.number_int.is_not(None),
            OutgoingDocument.issue_date >= lo,
            OutgoingDocument.issue_date < hi,
        )
        .order_by(OutgoingDocument.number_int.asc())
    ).all()
    if not docs:
        return []
    # Batch tránh N+1: nạp người ký + nơi nhận 1 lần.
    profile_ids = {d.signing_profile_id for d in docs if d.signing_profile_id is not None}
    signer_map: dict[int, str] = {}
    if profile_ids:
        signer_map = {
            pid: name
            for pid, name in db.execute(
                select(SigningProfile.id, Signature.full_name)
                .join(Signature, SigningProfile.signature_id == Signature.id)
                .where(SigningProfile.id.in_(profile_ids))
            ).all()
        }
    recip_map: dict[int, list[str]] = {}
    for oid, name in db.execute(
        select(OutgoingRecipient.outgoing_id, Organization.full_name)
        .join(Organization, OutgoingRecipient.organization_id == Organization.id)
        .where(OutgoingRecipient.outgoing_id.in_([d.id for d in docs]))
    ).all():
        recip_map.setdefault(oid, []).append(name)

    rows: list[dict[str, Any]] = []
    for i, d in enumerate(docs, start=1):
        rows.append({
            "stt": i,
            "number": d.number or "",
            "issue_date": _fmt_d(d.issue_date),
            "subject": d.subject or "",
            "signer": signer_map.get(d.signing_profile_id, "") if d.signing_profile_id else "",
            "recipients": "; ".join(recip_map.get(d.id, [])),
            "copies": "",
            "note": _STATUS_NOTE.get(d.status, ""),
        })
    return rows


def _incoming_rows(db: Session, year: int) -> list[dict[str, Any]]:
    lo, hi = _year_range(year)
    docs = db.scalars(
        select(IncomingDocument)
        .where(
            IncomingDocument.deleted_at.is_(None),
            IncomingDocument.number_int.is_not(None),
            IncomingDocument.created_at >= lo,
            IncomingDocument.created_at < hi,
        )
        .order_by(IncomingDocument.number_int.asc())
    ).all()
    if not docs:
        return []
    sender_ids = {d.sender_org_id for d in docs if d.sender_org_id is not None}
    sender_map: dict[int, str] = {}
    if sender_ids:
        sender_map = {
            oid: name
            for oid, name in db.execute(
                select(Organization.id, Organization.full_name).where(Organization.id.in_(sender_ids))
            ).all()
        }
    rows: list[dict[str, Any]] = []
    for d in docs:
        rows.append({
            # "Số đến" = số đã cấp THẬT (number), KHÔNG phải thứ tự dòng (số có thể nhảy).
            "stt": d.number or "",
            "arrival_date": _fmt_d(d.created_at.date() if d.created_at else None),
            "reference": d.reference_number or "",
            "doc_date": _fmt_d(d.document_date),
            "sender": sender_map.get(d.sender_org_id, "") if d.sender_org_id else "",
            "subject": d.subject or "",
            "assignee": "",
            "note": _STATUS_NOTE.get(d.status, ""),
        })
    return rows


def build_register_xlsx(db: Session, *, year: int, book: str) -> bytes:
    """Sinh Excel sổ đăng ký NĐ 30/2020. Trả bytes .xlsx."""
    if book not in BOOKS:
        raise ValidationFailed("Loại sổ không hợp lệ")

    from io import BytesIO

    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    cols = _COLS_DEN if book == "den" else _COLS_DI
    if book == "den":
        rows = _incoming_rows(db, year)
    else:
        rows = _outgoing_rows(db, "GDNN" if book == "di_gdnn" else "DVDL", year)

    wb = Workbook()
    ws = wb.active
    assert ws is not None  # Workbook() mới luôn có sheet active
    ws.title = "So dang ky"

    # Tiêu đề sổ + năm (merge toàn bộ cột).
    ncol = len(cols)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=ncol)
    title_cell = ws.cell(row=1, column=1, value=f"{_BOOK_TITLE[book]} — NĂM {year}")
    title_cell.font = Font(bold=True, size=13)
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 24

    thin = Side(style="thin", color="999999")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    header_fill = PatternFill("solid", fgColor="FCE8B2")
    header_row = 3
    for c, (_key, label, width) in enumerate(cols, start=1):
        cell = ws.cell(row=header_row, column=c, value=label)
        cell.font = Font(bold=True)
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = border
        ws.column_dimensions[get_column_letter(c)].width = width
    ws.row_dimensions[header_row].height = 32

    for r, row in enumerate(rows, start=header_row + 1):
        for c, (key, _label, _w) in enumerate(cols, start=1):
            cell = ws.cell(row=r, column=c, value=_excel_safe(row.get(key, "")))
            cell.border = border
            cell.alignment = Alignment(
                vertical="top",
                wrap_text=key in ("subject", "recipients", "sender"),
                horizontal="center" if key in ("stt",) else "left",
            )

    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def dashboard_stats(db: Session, *, year: int, today: date) -> dict[str, Any]:
    """KPI + 12 tháng CV đi/đến (đếm thật) cho trang Báo cáo. Trang manager-only → đếm cả mọi CV."""
    lo, hi = _year_range(year)

    def _monthly(date_col: Any, conds: list[Any]) -> dict[int, int]:
        month = func.extract("month", date_col)
        rows = db.execute(
            select(month.label("m"), func.count().label("c"))
            .where(*conds, date_col >= lo, date_col < hi)
            .group_by(month)
        ).all()
        return {int(r.m): int(r.c) for r in rows}

    di_conds = [OutgoingDocument.deleted_at.is_(None), OutgoingDocument.number_int.is_not(None)]
    den_conds = [IncomingDocument.deleted_at.is_(None), IncomingDocument.number_int.is_not(None)]
    di_by_month = _monthly(OutgoingDocument.issue_date, di_conds)
    den_by_month = _monthly(IncomingDocument.created_at, den_conds)

    months = [
        {"month": m, "di": di_by_month.get(m, 0), "den": den_by_month.get(m, 0)}
        for m in range(1, 13)
    ]
    cur_m = today.month if today.year == year else 0
    return {
        "year": year,
        "kpi": {
            "di_year": sum(di_by_month.values()),
            "den_year": sum(den_by_month.values()),
            "di_month": di_by_month.get(cur_m, 0),
            "den_month": den_by_month.get(cur_m, 0),
        },
        "months": months,
    }
