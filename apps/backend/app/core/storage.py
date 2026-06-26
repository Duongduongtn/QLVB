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

import os
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


@dataclass(slots=True)
class EnvelopeResult:
    ciphertext: bytes
    wrapped_key: bytes  # nonce(12) + AES-GCM ciphertext của DEK


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
