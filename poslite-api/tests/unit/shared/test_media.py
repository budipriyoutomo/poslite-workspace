import pytest

from poslite.shared.domain.errors import DomainError
from poslite.shared.domain.media import MAX_IMAGE_BYTES, image_extension, media_url

JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 16
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 16
WEBP = b"RIFF\x10\x00\x00\x00WEBPVP8 " + b"\0" * 8


def test_joins_the_base_url_and_the_key() -> None:
    assert media_url("https://is3.cloudhost.id/poslite", "T1/products/P1.jpg") == (
        "https://is3.cloudhost.id/poslite/T1/products/P1.jpg"
    )


def test_ignores_a_trailing_slash_on_the_base_url() -> None:
    assert (
        media_url("http://localhost:8000/media/", "T1/a.png")
        == "http://localhost:8000/media/T1/a.png"
    )


def test_no_key_means_no_url() -> None:
    assert media_url("https://cdn.example.id", None) is None


def test_a_full_url_is_kept_as_is() -> None:
    """Images saved before object storage (ADR-021) or hosted elsewhere."""
    assert media_url("https://cdn.example.id", "https://old.example.com/teh.jpg") == (
        "https://old.example.com/teh.jpg"
    )


@pytest.mark.parametrize(("data", "ext"), [(JPEG, "jpg"), (PNG, "png"), (WEBP, "webp")])
def test_recognises_jpeg_png_and_webp_from_their_bytes(data: bytes, ext: str) -> None:
    assert image_extension(data) == ext


@pytest.mark.parametrize("data", [b"GIF89a" + b"\0" * 16, b"<svg xmlns=...>", b""])
def test_rejects_anything_else(data: bytes) -> None:
    with pytest.raises(DomainError) as err:
        image_extension(data)

    assert err.value.code == "UNSUPPORTED_IMAGE"


def test_rejects_an_image_over_the_size_limit() -> None:
    with pytest.raises(DomainError) as err:
        image_extension(JPEG + b"\0" * MAX_IMAGE_BYTES)

    assert err.value.code == "IMAGE_TOO_LARGE"
