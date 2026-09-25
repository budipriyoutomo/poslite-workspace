import base64
import hashlib
import secrets

PIN_ITERATIONS = 310_000  # sent to devices as pin_iterations (07-api-contract.md pull example)


def hash_pin(pin: str, salt_b64: str, iterations: int) -> str:
    """PBKDF2-SHA256, 32 bytes, base64 — exactly what the device verifies with WebCrypto."""
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), base64.b64decode(salt_b64), iterations, 32)
    return base64.b64encode(digest).decode()


def new_pin_salt() -> str:
    return base64.b64encode(secrets.token_bytes(16)).decode()
