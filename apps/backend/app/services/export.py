"""Export ZIP toàn bộ CV theo năm — G4 (RPT.ZIP).

Gom CV đi (GDNN/DVDL) + CV đến đã cấp số trong 1 năm thành cây thư mục:
    2026-CV-Den/         <stt>_<so>.pdf + <stt>_<so>.metadata.json
    2026-CV-Di-GDNN/     ...
    2026-CV-Di-DVDL/     ...
    index.xlsx           (3 sổ NĐ 30 — báo cáo)

Lõi `build_year_zip` nhận sẵn danh sách `ExportItem` + hàm `read_file` (giải mã) tiêm
ngoài → test standalone không cần DB/MASTER_KEY. `gather_year_items` truy vấn DB (chạy ở
worker, có DB + MASTER_KEY + volume storage). Worker ghi ZIP ra `exports/` trên volume
dùng chung → backend stream cho user. Bộ nhớ: mỗi PDF giải mã riêng lẻ (bounded), KHÔNG
buffer cả ZIP trong RAM (ghi thẳng ra đĩa).
"""

from __future__ import annotations

import json
import re
import zipfile
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.logging import logger
from app.models.document_type import DocumentType
from app.models.file import File
from app.models.incoming_document import IncomingDocument
from app.models.organization import Organization
from app.models.outgoing_document import OutgoingDocument, OutgoingRecipient
from app.models.signature import Signature
from app.models.signing_profile import SigningProfile
from app.models.unit import Unit

_VN_OFFSET = timedelta(hours=7)
# Trần mặc định 2GB (PRD edge: vượt → cảnh báo gợi ý chia theo quý).
DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024

_FOLDER = {
    "di_gdnn": "{year}-CV-Di-GDNN",
    "di_dvdl": "{year}-CV-Di-DVDL",
    "den": "{year}-CV-Den",
}


@dataclass(slots=True)
class ExportItem:
    folder: str
    base_name: str
    storage_key: str | None
    wrapped_key: bytes | None
    metadata: dict[str, Any] = field(default_factory=dict)


def _safe_component(name: str | None, fallback: str) -> str:
    """Làm sạch 1 thành phần tên file: bỏ ký tự lạ / traversal, giữ chữ-số-gạch-chấm."""
    cleaned = re.sub(r"[^0-9A-Za-zÀ-ỹ._-]+", "_", (name or "").strip())
    cleaned = cleaned.strip("._")[:80]
    return cleaned or fallback


def _fmt_d(d: date | None) -> str:
    return d.strftime("%d/%m/%Y") if d else ""


def _vn_year_bounds(year: int) -> tuple[datetime, datetime]:
    """Cận UTC cho 'created_at thuộc năm `year` theo giờ VN'."""
    lo = datetime.combine(date(year, 1, 1), time.min, tzinfo=UTC) - _VN_OFFSET
    hi = datetime.combine(date(year + 1, 1, 1), time.min, tzinfo=UTC) - _VN_OFFSET
    return lo, hi


def gather_year_items(db: Session, *, year: int, unit: str | None = None) -> list[ExportItem]:
    """Truy vấn CV đi + đến đã cấp số trong năm → danh sách ExportItem (kèm file mã hoá).

    `unit` ('gdnn'|'dvdl'|None) lọc CV đi; CV đến dùng chung 2 đơn vị → luôn gồm.
    Bỏ qua CV không có file. Chọn bản đã ký số (signed) nếu có, không thì bản gốc.
    """
    items: list[ExportItem] = []

    # ---- CV đi (GDNN + DVDL) ----
    unit_codes = ["GDNN", "DVDL"]
    if unit == "gdnn":
        unit_codes = ["GDNN"]
    elif unit == "dvdl":
        unit_codes = ["DVDL"]
    units = {
        u.id: u.code
        for u in db.scalars(select(Unit).where(Unit.code.in_(unit_codes))).all()
    }
    if units:
        lo, hi = date(year, 1, 1), date(year + 1, 1, 1)
        out_pairs = db.execute(
            select(OutgoingDocument, DocumentType.code)
            .join(DocumentType, OutgoingDocument.doc_type_id == DocumentType.id)
            .where(
                OutgoingDocument.unit_id.in_(units.keys()),
                OutgoingDocument.deleted_at.is_(None),
                OutgoingDocument.number_int.is_not(None),
                OutgoingDocument.issue_date >= lo,
                OutgoingDocument.issue_date < hi,
            )
            .order_by(OutgoingDocument.unit_id, OutgoingDocument.number_int.asc())
        ).all()
        out_docs = [d for d, _c in out_pairs]
        signer_map = _signer_map(db, out_docs)
        recip_map = _recipient_map(db, out_docs)
        file_map = _file_map(
            db, {fid for d in out_docs for fid in (d.signed_file_id, d.original_file_id)}
        )
        seen: dict[str, int] = {}
        for d, code in out_pairs:
            unit_code = units.get(d.unit_id, "")
            folder = _FOLDER["di_gdnn" if unit_code == "GDNN" else "di_dvdl"].format(year=year)
            f = file_map.get(d.signed_file_id) or file_map.get(d.original_file_id)
            if f is None:
                continue
            base = _unique(seen, folder, d.number_int, d.number)
            items.append(ExportItem(
                folder=folder,
                base_name=base,
                storage_key=f.storage_key,
                wrapped_key=f.wrapped_key,
                metadata={
                    "loại": "Công văn đi",
                    "đơn vị": unit_code,
                    "số": d.number or "",
                    "loại văn bản": code or "",
                    "ngày văn bản": _fmt_d(d.issue_date),
                    "trích yếu": d.subject or "",
                    "người ký": signer_map.get(d.signing_profile_id, "")
                    if d.signing_profile_id else "",
                    "nơi nhận": recip_map.get(d.id, []),
                    "trạng thái": d.status,
                    "bản": "đã ký số" if (d.signed_file_id and f.id == d.signed_file_id)
                    else "chưa ký số",
                },
            ))

    # ---- CV đến (chung 2 đơn vị) ----
    lo_utc, hi_utc = _vn_year_bounds(year)
    inc_pairs = db.execute(
        select(IncomingDocument, DocumentType.code)
        .outerjoin(DocumentType, IncomingDocument.doc_type_id == DocumentType.id)
        .where(
            IncomingDocument.deleted_at.is_(None),
            IncomingDocument.number_int.is_not(None),
            IncomingDocument.created_at >= lo_utc,
            IncomingDocument.created_at < hi_utc,
        )
        .order_by(IncomingDocument.number_int.asc())
    ).all()
    inc_docs = [d for d, _c in inc_pairs]
    sender_map = _sender_map(db, inc_docs)
    inc_file_map = _file_map(db, {d.file_id for d in inc_docs})
    folder_den = _FOLDER["den"].format(year=year)
    seen_den: dict[str, int] = {}
    for d, code in inc_pairs:
        f = inc_file_map.get(d.file_id)
        if f is None:
            continue
        base = _unique(seen_den, folder_den, d.number_int, d.number)
        items.append(ExportItem(
            folder=folder_den,
            base_name=base,
            storage_key=f.storage_key,
            wrapped_key=f.wrapped_key,
            metadata={
                "loại": "Công văn đến",
                "số đến": d.number or "",
                "loại văn bản": code or "",
                "số ký hiệu": d.reference_number or "",
                "ngày văn bản": _fmt_d(d.document_date),
                "cơ quan gửi": sender_map.get(d.sender_org_id, "") if d.sender_org_id else "",
                "trích yếu": d.subject or "",
                "trạng thái": d.status,
                "chữ ký số": d.signature_status,
            },
        ))
    return items


def _unique(seen: dict[str, int], folder: str, stt: int | None, number: str | None) -> str:
    base = f"{stt:04d}_{_safe_component(number, 'cv')}" if stt else _safe_component(number, "cv")
    key = f"{folder}/{base}"
    n = seen.get(key, 0)
    seen[key] = n + 1
    return base if n == 0 else f"{base}_{n + 1}"


def _signer_map(db: Session, docs: list[OutgoingDocument]) -> dict[int, str]:
    pids = {d.signing_profile_id for d in docs if d.signing_profile_id is not None}
    if not pids:
        return {}
    return {
        pid: name
        for pid, name in db.execute(
            select(SigningProfile.id, Signature.full_name)
            .join(Signature, SigningProfile.signature_id == Signature.id)
            .where(SigningProfile.id.in_(pids))
        ).all()
    }


def _recipient_map(db: Session, docs: list[OutgoingDocument]) -> dict[int, list[str]]:
    if not docs:
        return {}
    out: dict[int, list[str]] = {}
    for oid, name in db.execute(
        select(OutgoingRecipient.outgoing_id, Organization.full_name)
        .join(Organization, OutgoingRecipient.organization_id == Organization.id)
        .where(OutgoingRecipient.outgoing_id.in_([d.id for d in docs]))
    ).all():
        out.setdefault(oid, []).append(name)
    return out


def _sender_map(db: Session, docs: list[IncomingDocument]) -> dict[int, str]:
    ids = {d.sender_org_id for d in docs if d.sender_org_id is not None}
    if not ids:
        return {}
    return {
        oid: nm
        for oid, nm in db.execute(
            select(Organization.id, Organization.full_name).where(Organization.id.in_(ids))
        ).all()
    }


def _file_map(db: Session, file_ids: set[int | None]) -> dict[int, File]:
    ids = {fid for fid in file_ids if fid is not None}
    if not ids:
        return {}
    return {f.id: f for f in db.scalars(select(File).where(File.id.in_(ids))).all()}


def build_year_zip(
    items: list[ExportItem],
    *,
    dest_path: Path,
    index_bytes: bytes,
    read_file: Callable[[ExportItem], bytes],
    index_pdf: bytes | None = None,
    progress: Callable[[int, int], None] | None = None,
    max_bytes: int = DEFAULT_MAX_BYTES,
) -> dict[str, Any]:
    """Ghi ZIP ra `dest_path`. Trả thống kê (counts theo thư mục, tổng, size, oversize).

    Mỗi item → `<folder>/<base>.pdf` + `<folder>/<base>.metadata.json`. Cuối cùng thêm
    `index.xlsx`. File hỏng/đọc lỗi 1 cái KHÔNG làm hỏng cả ZIP (đếm vào `errors`)."""
    counts: dict[str, int] = {}
    errors = 0
    total = len(items)
    with zipfile.ZipFile(dest_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, it in enumerate(items, start=1):
            try:
                data = read_file(it)
            except Exception:  # 1 file lỗi (mất file / sai key / hỏng) không được phá cả gói
                logger.warning(
                    "export.read_failed", storage_key=it.storage_key, folder=it.folder,
                    base_name=it.base_name, exc_info=True,
                )
                errors += 1
            else:
                zf.writestr(f"{it.folder}/{it.base_name}.pdf", data)
                zf.writestr(
                    f"{it.folder}/{it.base_name}.metadata.json",
                    json.dumps(it.metadata, ensure_ascii=False, indent=2),
                )
                counts[it.folder] = counts.get(it.folder, 0) + 1
            if progress is not None:
                progress(i, total)
        zf.writestr("index.xlsx", index_bytes)
        if index_pdf is not None:
            zf.writestr("index.pdf", index_pdf)

    size = dest_path.stat().st_size
    return {
        "counts": counts,
        "total": sum(counts.values()),
        "errors": errors,
        "size_bytes": size,
        "oversize": size > max_bytes,
    }
