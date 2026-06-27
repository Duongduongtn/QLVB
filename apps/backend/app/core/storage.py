"""Lớp lưu trữ file — envelope encryption AES-256-GCM (QĐ #3).

Chiến lược:
- Mỗi file sinh DEK (data encryption key) ngẫu nhiên 256-bit.
- Nội dung file mã hoá AES-GCM(DEK).
- DEK bọc bằng AES-GCM(MASTER_KEY) → lưu vào DB cột wrapped_key.

Đọc:
- unwrap DEK bằng MASTER_KEY → giải mã nội dung → stream cho client.
- Backend luôn STREAM (không buffer cả file) — quan trọng với CV scan >50MB.

TODO (giai đoạn 1):
- Implement upload_local / open_stream / sync_to_r2.
- Hook watermark on-the-fly cho download _CHUA_KY_SO (D1.11).
"""

from __future__ import annotations

import hashlib
import os
import secrets
from dataclasses import dataclass
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


@dataclass(slots=True)
class EnvelopeResult:
    ciphertext: bytes
    wrapped_key: bytes  # nonce(12) + AES-GCM ciphertext của DEK


@dataclass(slots=True)
class AssetResult:
    storage_key: str  # đường dẫn tương đối dưới storage_local_path
    sha256: str
    size_bytes: int


@dataclass(slots=True)
class EncryptedFileResult:
    storage_key: str
    sha256: str  # hash NỘI DUNG GỐC (trước mã hoá) — E1.6 check trùng
    size_bytes: int  # kích thước nội dung gốc
    wrapped_key: bytes


def _master_key() -> bytes:
    from app.core.config import settings

    hex_value = settings.master_key_hex.get_secret_value()
    if not hex_value:
        raise RuntimeError("MASTER_KEY_HEX chưa cấu hình — không thể mã hoá file")
    key = bytes.fromhex(hex_value)
    if len(key) != 32:
        raise RuntimeError("MASTER_KEY_HEX phải là 32 byte (64 ký tự hex)")
    return key


def envelope_encrypt(plaintext: bytes) -> EnvelopeResult:
    dek = AESGCM.generate_key(bit_length=256)
    nonce = os.urandom(12)
    ct = AESGCM(dek).encrypt(nonce, plaintext, associated_data=None)
    ciphertext = nonce + ct

    wrap_nonce = os.urandom(12)
    wrapped = AESGCM(_master_key()).encrypt(wrap_nonce, dek, associated_data=None)
    return EnvelopeResult(ciphertext=ciphertext, wrapped_key=wrap_nonce + wrapped)


def envelope_decrypt(ciphertext: bytes, wrapped_key: bytes) -> bytes:
    wrap_nonce, wrapped = wrapped_key[:12], wrapped_key[12:]
    dek = AESGCM(_master_key()).decrypt(wrap_nonce, wrapped, associated_data=None)
    nonce, ct = ciphertext[:12], ciphertext[12:]
    return AESGCM(dek).decrypt(nonce, ct, associated_data=None)


# ── Asset KHÔNG mã hoá (logo/mộc/chữ ký — file.py: wrapped_key NULL) ──────────
# Mộc/logo là ảnh thương hiệu công khai trong nội bộ, không nhạy cảm như nội dung
# CV → lưu thẳng ra đĩa, không qua envelope. Tách hẳn khỏi luồng CV mã hoá.
def _storage_root() -> Path:
    from app.core.config import settings

    return Path(settings.storage_local_path)


def save_asset(data: bytes, *, ext: str, subdir: str = "assets") -> AssetResult:
    """Ghi 1 file asset ra đĩa dưới storage_local_path/<subdir>/, trả metadata.

    Tên file ngẫu nhiên (token_hex) → không lộ thông tin, không trùng. Sharding theo
    2 ký tự đầu để tránh 1 thư mục phình quá nhiều file.
    """
    sha256 = hashlib.sha256(data).hexdigest()
    name = secrets.token_hex(16)
    safe_ext = ext.lower().lstrip(".")
    rel = f"{subdir}/{name[:2]}/{name}.{safe_ext}" if safe_ext else f"{subdir}/{name[:2]}/{name}"
    dest = _storage_root() / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return AssetResult(storage_key=rel, sha256=sha256, size_bytes=len(data))


def _safe_path(storage_key: str) -> Path:
    """Chống path traversal: từ chối key tuyệt đối / chứa '..'. Defense-in-depth —
    hiện key luôn sinh server-side, nhưng hàm generic dễ bị tái dùng sai sau này.
    """
    if storage_key.startswith(("/", "\\")) or ".." in Path(storage_key).parts:
        raise ValueError("storage_key không hợp lệ")
    return _storage_root() / storage_key


def read_asset(storage_key: str) -> bytes:
    return _safe_path(storage_key).read_bytes()


def delete_asset(storage_key: str) -> None:
    """Xoá file asset khỏi đĩa (bỏ qua nếu đã không còn) — dọn logo cũ khi đổi."""
    _safe_path(storage_key).unlink(missing_ok=True)


# ── File CV mã hoá phong bì (PDF công văn — khác asset mộc/logo không mã hoá) ──────
def save_encrypted_file(data: bytes, *, ext: str = "pdf", subdir: str = "cv") -> EncryptedFileResult:
    """Mã hoá phong bì AES-256-GCM rồi ghi ciphertext ra đĩa. Trả metadata + wrapped_key
    (để lưu cột files.wrapped_key). sha256 = hash NỘI DUNG GỐC (cho E1.6 check trùng)."""
    sha256 = hashlib.sha256(data).hexdigest()
    env = envelope_encrypt(data)
    name = secrets.token_hex(16)
    safe_ext = ext.lower().lstrip(".")
    rel = f"{subdir}/{name[:2]}/{name}.{safe_ext}.enc" if safe_ext else f"{subdir}/{name[:2]}/{name}.enc"
    dest = _storage_root() / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(env.ciphertext)
    return EncryptedFileResult(
        storage_key=rel, sha256=sha256, size_bytes=len(data), wrapped_key=env.wrapped_key
    )


def read_encrypted_file(storage_key: str, wrapped_key: bytes) -> bytes:
    """Đọc ciphertext + giải mã phong bì → trả nội dung gốc."""
    ciphertext = _safe_path(storage_key).read_bytes()
    return envelope_decrypt(ciphertext, wrapped_key)


def purge_old_files(subdir: str, *, max_age_seconds: int, now: float) -> int:
    """Xoá file trong storage_local_path/<subdir>/ cũ hơn max_age_seconds. Trả số file xoá.

    Dùng dọn asset tạm phù du (vd tách nền `bg_tmp/` — preview/slider sinh nhiều file).
    `now` truyền vào (không gọi time.time() ngầm) để test tất định. Bỏ qua nếu chưa có
    thư mục. Defense: `subdir` không được chứa traversal.
    """
    if subdir.startswith(("/", "\\")) or ".." in Path(subdir).parts:
        raise ValueError("subdir không hợp lệ")
    root = _storage_root() / subdir
    if not root.exists():
        return 0
    removed = 0
    for path in root.rglob("*"):
        if path.is_file() and now - path.stat().st_mtime > max_age_seconds:
            path.unlink(missing_ok=True)
            removed += 1
    return removed
