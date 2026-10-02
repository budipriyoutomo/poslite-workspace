from pathlib import Path

from poslite.shared.infrastructure.object_storage import LocalStorage


async def test_writes_the_object_under_its_key(tmp_path: Path) -> None:
    await LocalStorage(tmp_path).put("T1/products/P1.png", b"png-bytes", "image/png")

    assert (tmp_path / "T1" / "products" / "P1.png").read_bytes() == b"png-bytes"
