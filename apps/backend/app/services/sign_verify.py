"""E1.5 — Verify chữ ký số PAdES (pyHanko) + trust list NEAC.

Tách 2 lớp để test được standalone:
- LÕI THUẦN (test không cần pyHanko/PDF thật): `classify` trạng thái, `parse_trust_list`
  (JSON → list PEM cert), `build_info` (shape badge cho FE).
- Phần ĐỤNG pyHanko (`verify_pdf`) import TRỄ — chỉ có ở image worker (Dockerfile.worker).

Quy ước trạng thái (khớp cột incoming_documents.signature_status):
- ``none``    : PDF không có chữ ký số → badge xám "Chưa ký số" → vẫn chạy dedup 3 lớp.
- ``valid``   : MỌI chữ ký intact + hợp lệ mật mã + còn hạn + **tin cậy** (chain tới CA
                trong trust list VN) → badge xanh → BỎ QUA dedup (chữ ký số đảm bảo duy nhất).
- ``invalid`` : có chữ ký nhưng hỏng / hết hạn / **chứng thư lạ** (chưa trong trust list)
                → badge vàng. KHÔNG bỏ dedup (an toàn: chỉ chữ ký tin cậy mới được bỏ).

Trust list VN: file ``vn-trust-list.json`` (mảng ``cas: [{name, pem}]``). Cron tuần
``refresh_trust_list`` tải bản mới từ NEAC về cache local; fail → giữ cache cũ + cảnh báo.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_TRUST_SUBDIR = "trust"
_TRUST_FILENAME = "vn-trust-list.json"


# ── Trust list (cache local + seed đóng gói) ──────────────────────────────────
def _storage_root() -> Path:
    from app.core.config import settings

    return Path(settings.storage_local_path)


def trust_cache_path() -> Path:
    """Đường dẫn cache trust list trên đĩa (worker ghi đè khi cron tải bản mới)."""
    return _storage_root() / _TRUST_SUBDIR / _TRUST_FILENAME


def _seed_path() -> Path:
    """Trust list seed đóng gói trong repo (fallback khi chưa có cache)."""
    return Path(__file__).resolve().parent.parent / "data" / _TRUST_FILENAME


def parse_trust_list(raw: bytes) -> list[bytes]:
    """``{cas: [{name, pem}]}`` → list PEM cert bytes. Bỏ qua entry thiếu ``pem``."""
    doc = json.loads(raw)
    cas = doc.get("cas") if isinstance(doc, dict) else None
    if not isinstance(cas, list):
        raise ValueError("trust list thiếu mảng 'cas'")
    pems: list[bytes] = []
    for ca in cas:
        if isinstance(ca, dict) and isinstance(ca.get("pem"), str) and ca["pem"].strip():
            pems.append(ca["pem"].encode("ascii", "ignore"))
    return pems


def load_trust_pems() -> list[bytes]:
    """Đọc trust list: ưu tiên cache local, fallback seed đóng gói. Lỗi → [] (không tin ai)."""
    for path in (trust_cache_path(), _seed_path()):
        try:
            raw = path.read_bytes()
        except OSError:
            continue
        try:
            return parse_trust_list(raw)
        except (ValueError, json.JSONDecodeError) as exc:
            logger.warning("trust list parse lỗi tại %s: %s", path, exc)
    return []


def refresh_trust_cache() -> dict[str, Any]:
    """Cron tuần — tải trust list NEAC về cache local. Fail → giữ cache cũ + cảnh báo admin.

    Chỉ ghi đè cache khi tải về PARSE được (validate trước) → không phá cache cũ bằng rác.
    """
    from app.core.config import settings

    url = settings.neac_trust_list_url
    if not url:
        logger.info("NEAC_TRUST_LIST_URL chưa cấu hình — bỏ qua cập nhật trust list")
        return {"updated": False, "reason": "not_configured"}

    import httpx

    try:
        resp = httpx.get(url, timeout=30.0, follow_redirects=True)
        resp.raise_for_status()
        raw = resp.content
        count = len(parse_trust_list(raw))  # validate trước khi ghi đè
    except Exception as exc:
        logger.warning("Tải trust list NEAC thất bại — giữ cache cũ: %s", exc)
        return {"updated": False, "reason": "fetch_failed"}

    if count == 0:  # NEAC trả rỗng/thiếu pem → KHÔNG wipe cache đang chạy tốt
        logger.warning("Trust list NEAC tải về rỗng (0 chứng thư) — giữ cache cũ")
        return {"updated": False, "reason": "empty"}

    # Ghi atomic (tmp + os.replace) để crash giữa chừng không để lại file JSON cụt.
    path = trust_cache_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(raw)
    os.replace(tmp, path)
    logger.info("Cập nhật trust list NEAC: %d chứng thư gốc", count)
    return {"updated": True, "count": count}


# ── Lõi quyết định (thuần, test standalone) ───────────────────────────────────
def classify(signatures: list[dict[str, Any]]) -> str:
    """none / valid / invalid theo danh sách chữ ký đã chuẩn hoá."""
    if not signatures:
        return "none"
    ok = all(
        s.get("intact")
        and s.get("valid")
        and s.get("trusted")
        and not s.get("expired")
        for s in signatures
    )
    return "valid" if ok else "invalid"


def build_info(signatures: list[dict[str, Any]], *, checked_at: datetime) -> dict[str, Any]:
    """Gói kết quả verify để lưu ``signature_info`` (JSONB) + FE dựng badge."""
    status = classify(signatures)
    warning: str | None = None
    if status == "invalid" and signatures:
        if any(s.get("intact") and s.get("valid") and not s.get("trusted") for s in signatures):
            warning = "Chứng thư lạ (chưa có trong trust list VN) — cần kiểm tra thủ công"
        elif any(s.get("expired") for s in signatures):
            warning = "Chữ ký số đã hết hạn chứng thư"
        else:
            warning = "Chữ ký số không hợp lệ (nội dung có thể đã bị chỉnh sửa sau khi ký)"
    return {
        "status": status,
        "checked_at": checked_at.isoformat(),
        "signatures": signatures,
        "warning": warning,
    }


# ── Phần đụng pyHanko (worker-only, import TRỄ) ───────────────────────────────
def _name_of(name: Any) -> str | None:
    try:
        return str(name.human_friendly)
    except Exception:
        return str(name) if name else None


def _org_of(name: Any) -> str | None:
    """Tên cơ quan phát hành từ subject chứng thư.

    Ưu tiên Organizational Unit (OU=) vì cert CQNN VN thường ghi đơn vị phát hành thật ở OU
    (vd 'SỞ XÂY DỰNG', 'CỤC ĐƯỜNG BỘ VIỆT NAM'), còn O= là cơ quan chủ quản cấp cert (vd
    'ỦY BAN NHÂN DÂN THÀNH PHỐ ĐỒNG NAI', 'BỘ XÂY DỰNG'). Fallback O= khi không có OU.
    """
    try:
        native = name.native  # dict: {'organizational_unit_name', 'organization_name', ...}
        org = native.get("organizational_unit_name") or native.get("organization_name")
        if isinstance(org, (list, tuple)):  # nhiều OU → lấy cái cụ thể nhất (cuối)
            org = org[-1] if org else None
        return (str(org).strip() or None) if org else None
    except Exception:
        return None


def _summarize_one(emb: Any, vc: Any) -> dict[str, Any]:
    """1 chữ ký nhúng → dict chuẩn hoá. Lỗi 1 chữ ký KHÔNG kéo sập cả file."""
    from datetime import datetime

    from pyhanko.sign.validation import validate_pdf_signature

    try:
        st = validate_pdf_signature(emb, signer_validation_context=vc)
        cert = getattr(st, "signing_cert", None)
        not_after = getattr(cert, "not_valid_after", None)
        signed_at = getattr(st, "signer_reported_dt", None) or getattr(
            emb, "self_reported_timestamp", None
        )
        expired = bool(not_after and not_after < datetime.now(UTC))
        return {
            "signer": _name_of(cert.subject) if cert is not None else None,
            "signer_org": _org_of(cert.subject) if cert is not None else None,
            "ca": _name_of(cert.issuer) if cert is not None else None,
            "signed_at": signed_at.isoformat() if signed_at else None,
            "valid_until": not_after.isoformat() if not_after else None,
            "intact": bool(getattr(st, "intact", False)),
            "valid": bool(getattr(st, "intact", False) and getattr(st, "valid", False)),
            "trusted": bool(getattr(st, "trusted", False)),
            "expired": expired,
        }
    except Exception as exc:
        logger.warning("verify 1 chữ ký lỗi: %s", exc)
        return {
            "signer": None,
            "signer_org": None,
            "ca": None,
            "signed_at": None,
            "valid_until": None,
            "intact": False,
            "valid": False,
            "trusted": False,
            "expired": False,
        }


def verify_pdf(data: bytes, trust_pems: list[bytes]) -> list[dict[str, Any]]:
    """Verify mọi chữ ký PAdES trong PDF. PDF không ký → []. (Đụng pyHanko — worker-only.)"""
    from io import BytesIO

    from asn1crypto import pem as asn1_pem
    from asn1crypto import x509 as asn1_x509
    from pyhanko.pdf_utils.reader import PdfFileReader
    from pyhanko_certvalidator import ValidationContext

    roots = []
    for raw in trust_pems:
        try:
            der = asn1_pem.unarmor(raw)[2] if asn1_pem.detect(raw) else raw
            roots.append(asn1_x509.Certificate.load(der))
        except Exception as exc:
            logger.warning("Bỏ qua cert trust list (load lỗi): %s", exc)

    vc = ValidationContext(trust_roots=roots, allow_fetching=False)
    reader = PdfFileReader(BytesIO(data))
    return [_summarize_one(emb, vc) for emb in reader.embedded_signatures]
