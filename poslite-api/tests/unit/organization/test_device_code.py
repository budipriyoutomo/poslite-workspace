import pytest

from poslite.organization.domain.device_code import device_code


@pytest.mark.parametrize(
    ("existing", "expected"),
    [
        (0, "A"),
        (1, "B"),
        (25, "Z"),
        (26, "AA"),
        (27, "AB"),
        (51, "AZ"),
        (52, "BA"),
        (701, "ZZ"),
        (702, "AAA"),
    ],
)
def test_device_codes_count_like_spreadsheet_columns(existing: int, expected: str) -> None:
    assert device_code(existing) == expected


def test_rejects_a_negative_count() -> None:
    with pytest.raises(ValueError, match="existing"):
        device_code(-1)
