import pytest

from poslite.organization.domain.brand_code import brand_code


@pytest.mark.parametrize(
    ("slug", "expected"),
    [
        ("maharasa", "MAHARASA"),
        ("rasa-nusantara", "RASANUSANTARA"),
        ("a-very-long-business-slug-name", "AVERYLONGBUSINESSSLU"),
        ("---", "UTAMA"),
    ],
)
def test_first_brand_code_comes_from_the_company_slug(slug: str, expected: str) -> None:
    assert brand_code(slug) == expected
