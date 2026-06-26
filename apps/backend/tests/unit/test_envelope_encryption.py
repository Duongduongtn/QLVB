"""Smoke test envelope encryption — đảm bảo encrypt/decrypt round-trip."""

from __future__ import annotations

import pytest


@pytest.mark.unit
def test_envelope_roundtrip():
    from app.core.storage import envelope_decrypt, envelope_encrypt

    plaintext = b"noi dung CV bi mat — Tieng Viet co dau \xc3\xa1\xc3\xa0"
    result = envelope_encrypt(plaintext)
    assert result.ciphertext != plaintext
    decoded = envelope_decrypt(result.ciphertext, result.wrapped_key)
    assert decoded == plaintext
