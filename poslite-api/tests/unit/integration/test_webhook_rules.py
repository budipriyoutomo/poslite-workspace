import hashlib
import hmac
from datetime import timedelta

import pytest

from poslite.integration.domain.webhooks import MAX_ATTEMPTS, next_retry_delay, sign


def test_signs_timestamp_and_body_with_hmac_sha256() -> None:
    body = b'{"id":"E1"}'

    header = sign("whsec_test", 1_790_000_000, body)

    expected = hmac.new(b"whsec_test", b'1790000000.{"id":"E1"}', hashlib.sha256).hexdigest()
    assert header == f"t=1790000000,v1={expected}"


def test_a_different_body_gives_a_different_signature() -> None:
    assert sign("s", 1, b"a") != sign("s", 1, b"b")


@pytest.mark.parametrize(
    ("attempts", "delay"),
    [
        (1, timedelta(minutes=1)),
        (2, timedelta(minutes=5)),
        (3, timedelta(minutes=15)),
        (4, timedelta(hours=1)),
        (7, timedelta(hours=12)),
    ],
)
def test_backs_off_after_each_failed_attempt(attempts: int, delay: timedelta) -> None:
    assert next_retry_delay(attempts) == delay


def test_gives_up_after_the_last_attempt() -> None:
    assert next_retry_delay(MAX_ATTEMPTS) is None
    assert MAX_ATTEMPTS == 8
