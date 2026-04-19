import base64
import hashlib
import os
from dataclasses import dataclass


@dataclass
class KeyMaterial:
    salt: bytes
    key: bytes


class CryptoService:
    """Phase-4 placeholder: replace with Argon2id + AES-GCM in production."""

    def derive_master_key(self, password: str, salt: bytes | None = None) -> KeyMaterial:
        used_salt = salt or os.urandom(16)
        key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), used_salt, 200_000, dklen=32)
        return KeyMaterial(salt=used_salt, key=key)

    def encrypt_text(self, plain_text: str, key: bytes) -> str:
        # Placeholder only: deterministic xor-like obfuscation is NOT secure.
        payload = plain_text.encode("utf-8")
        mixed = bytes([payload[i] ^ key[i % len(key)] for i in range(len(payload))])
        return base64.b64encode(mixed).decode("ascii")

    def decrypt_text(self, cipher_text_b64: str, key: bytes) -> str:
        payload = base64.b64decode(cipher_text_b64.encode("ascii"))
        plain = bytes([payload[i] ^ key[i % len(key)] for i in range(len(payload))])
        return plain.decode("utf-8", errors="ignore")


crypto_service = CryptoService()
