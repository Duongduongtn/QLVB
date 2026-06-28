"""Convert Word (.docx/.doc) → PDF bằng LibreOffice headless — D1 bước 2 (TDD §2/§4).

LÕI thuần: nhận bytes Word → trả bytes PDF, test standalone. Chạy ở image WORKER (có
LibreOffice; image backend KHÔNG có — TDD §2.4). Mỗi lần convert dùng thư mục tạm +
UserInstallation RIÊNG để soffice headless chạy song song không đụng profile chung.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.core.errors import AppError
from app.core.logging import logger

# Đuôi file Word hỗ trợ. .doc cũ (OLE) + .docx (OOXML) đều convert được.
WORD_EXTS = frozenset({"docx", "doc"})

# Biến môi trường nhạy cảm KHÔNG truyền cho LibreOffice (xử lý file lạ — defense in depth
# chống lộ secret nếu LibreOffice có RCE qua docx độc).
_SECRET_ENV_PREFIXES = ("MASTER_KEY", "DATABASE", "REDIS", "SEED_ADMIN", "R2_", "SENTRY", "SECRET")


def _safe_env(user_install_uri: str) -> dict[str, str]:
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith(_SECRET_ENV_PREFIXES)}
    env["UserInstallation"] = user_install_uri  # cũng truyền qua -env cho chắc
    return env


def _soffice_bin() -> str:
    """Tìm binary LibreOffice: cấu hình → PATH → đường dẫn cài mặc định Windows/Linux."""
    from app.core.config import settings

    candidates = [
        settings.libreoffice_bin,
        "soffice",
        "libreoffice",
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
        "/usr/bin/soffice",
        "/usr/bin/libreoffice",
    ]
    for c in candidates:
        if c and (shutil.which(c) or Path(c).exists()):
            return c
    raise AppError(
        "Chưa cài LibreOffice để chuyển Word sang PDF — hãy tải lên file PDF",
        code="LIBREOFFICE_MISSING",
        http_status=503,
    )


def convert_word_to_pdf(data: bytes, *, ext: str, timeout: int = 90) -> bytes:
    """Convert 1 file Word (bytes) sang PDF (bytes). Raise AppError nếu thất bại."""
    safe_ext = ext.lower().lstrip(".")
    if safe_ext not in WORD_EXTS:
        raise AppError(f"Không hỗ trợ chuyển đổi định dạng .{safe_ext}", code="CONVERT_UNSUPPORTED")
    return _soffice_to_pdf(data, ext=safe_ext, timeout=timeout)


def convert_xlsx_to_pdf(data: bytes, *, timeout: int = 90) -> bytes:
    """Convert Excel (.xlsx) sang PDF (bytes) — G4 index.pdf mẫu NĐ 30. Chạy ở worker."""
    return _soffice_to_pdf(data, ext="xlsx", timeout=timeout)


def _soffice_to_pdf(data: bytes, *, ext: str, timeout: int) -> bytes:
    """Lõi chung: ghi bytes ra file tạm → soffice --convert-to pdf → đọc PDF. Raise AppError."""
    safe_ext = ext.lower().lstrip(".")
    soffice = _soffice_bin()
    with tempfile.TemporaryDirectory(prefix="qlcv_conv_") as tmp:
        tmp_path = Path(tmp)
        src = tmp_path / f"input.{safe_ext}"
        src.write_bytes(data)
        profile = tmp_path / "profile"  # UserInstallation riêng → tránh xung đột headless

        profile_uri = profile.as_uri()
        cmd = [
            soffice,
            "--headless",
            "--norestore",
            "--nolockcheck",
            "--nodefault",
            f"-env:UserInstallation={profile_uri}",
            "--convert-to",
            "pdf",
            "--outdir",
            str(tmp_path),
            str(src),
        ]
        try:
            # env tối thiểu (bỏ secret); soffice xử lý file KHÔNG tin cậy.
            subprocess.run(
                cmd, check=True, capture_output=True, timeout=timeout, env=_safe_env(profile_uri)
            )
        except subprocess.TimeoutExpired as exc:
            raise AppError("Chuyển Word sang PDF quá thời gian", code="CONVERT_TIMEOUT") from exc
        except subprocess.CalledProcessError as exc:
            logger.warning("convert.failed", returncode=exc.returncode, stderr=exc.stderr[:500] if exc.stderr else b"")
            raise AppError("Chuyển Word sang PDF thất bại — kiểm tra file gốc", code="CONVERT_FAILED") from exc

        out = tmp_path / "input.pdf"
        if not out.exists():
            raise AppError("Không tạo được PDF từ file Word", code="CONVERT_FAILED")
        return out.read_bytes()
