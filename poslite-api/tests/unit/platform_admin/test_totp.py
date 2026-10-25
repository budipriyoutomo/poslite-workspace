"""P1-8: TOTP (RFC 6238) for operator sign-in, with the RFC's own SHA-1 test vectors."""

import base64

import pytest

from poslite.platform_admin.domain.totp import new_secret, otpauth_uri, totp, verify

RFC_SECRET = base64.b32encode(b"12345678901234567890").decode()  # the RFC 6238 SHA-1 key


@pytest.mark.parametrize(
    ("unix_time", "code"),
    [
        (59, "287082"),
        (1111111109, "081804"),
        (1111111111, "050471"),
        (1234567890, "005924"),
        (2000000000, "279037"),
        (20000000000, "353130"),
    ],
)
def test_matches_the_rfc_6238_test_vectors(unix_time: int, code: str) -> None:
    assert totp(RFC_SECRET, unix_time) == code


def test_accepts_the_previous_and_next_step_for_clock_drift() -> None:
    assert verify(RFC_SECRET, "287082", 59 + 30)
    assert verify(RFC_SECRET, "287082", 59 - 30)
    assert not verify(RFC_SECRET, "287082", 59 + 90)


def test_refuses_anything_that_is_not_six_digits() -> None:
    assert not verify(RFC_SECRET, "28708", 59)
    assert not verify(RFC_SECRET, "abcdef", 59)


def test_a_new_secret_is_160_bits_of_base32() -> None:
    secret = new_secret()

    assert len(base64.b32decode(secret)) == 20


def test_the_uri_names_the_issuer_and_the_operator() -> None:
    uri = otpauth_uri(RFC_SECRET, "ops@poslite.id")

    assert (
        uri
        == f"otpauth://totp/POSLite%20Operator:ops%40poslite.id?secret={RFC_SECRET}&issuer=POSLite%20Operator"
    )
