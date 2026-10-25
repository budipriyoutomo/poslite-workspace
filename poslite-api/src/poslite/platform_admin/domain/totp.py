"""TOTP (RFC 6238: HMAC-SHA1, 30-second steps, 6 digits) for operator sign-in (P1-8). Standard
library only: what every authenticator app speaks."""

import base64
import hmac
import secrets
from hashlib import sha1
from urllib.parse import quote

STEP_SECONDS = 30
DIGITS = 6
ISSUER = "POSLite Operator"


def new_secret() -> str:
    """160 random bits, base32 (the length RFC 4226 recommends)."""
    return base64.b32encode(secrets.token_bytes(20)).decode()


def totp(secret: str, unix_time: int) -> str:
    counter = (unix_time // STEP_SECONDS).to_bytes(8, "big")
    digest = hmac.new(base64.b32decode(secret), counter, sha1).digest()
    offset = digest[-1] & 0x0F
    value = int.from_bytes(digest[offset : offset + 4], "big") & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def verify(secret: str, code: str, unix_time: int) -> bool:
    """The code of this step or the one before/after (a phone clock a little off)."""
    if len(code) != DIGITS or not code.isdigit():
        return False
    return any(
        hmac.compare_digest(totp(secret, max(0, unix_time + drift * STEP_SECONDS)), code)
        for drift in (-1, 0, 1)
    )


def otpauth_uri(secret: str, account: str) -> str:
    """What the authenticator app scans (Key Uri Format)."""
    label = quote(f"{ISSUER}:{account}", safe=":")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(ISSUER)}"
