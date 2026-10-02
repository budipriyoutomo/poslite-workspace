import re
from typing import Any

from httpx import AsyncClient, Response

from ..identity.helpers import bearer, signup
from ..sync.helpers import outlet_with_menu_and_device

JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 64
KEY = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}/products/[0-9A-HJKMNP-TV-Z]{26}\.jpg$")


async def upload(
    api: AsyncClient, token: str, data: bytes, content_type: str = "image/jpeg"
) -> Response:
    return await api.post(
        "/api/v1/media/images",
        content=data,
        headers=bearer(token) | {"Content-Type": content_type},
    )


async def test_an_uploaded_image_gets_a_key_and_a_public_url(api: AsyncClient) -> None:
    token = (await signup(api))["token"]

    response = await upload(api, token, JPEG)

    assert response.status_code == 201, response.text
    image = response.json()["data"]
    assert KEY.match(image["key"])
    assert image["url"] == f"http://localhost:8000/media/{image['key']}"
    served = await api.get(f"/media/{image['key']}")
    assert served.status_code == 200
    assert served.content == JPEG


async def test_the_type_comes_from_the_bytes_not_the_header(api: AsyncClient) -> None:
    token = (await signup(api))["token"]

    response = await upload(api, token, b"GIF89a" + b"\0" * 64, content_type="image/jpeg")

    assert response.status_code == 422
    assert response.json()["code"] == "UNSUPPORTED_IMAGE"


async def test_rejects_an_image_over_2_mb(api: AsyncClient) -> None:
    token = (await signup(api))["token"]

    response = await upload(api, token, JPEG + b"\0" * (2 * 1024 * 1024))

    assert response.status_code == 422
    assert response.json()["code"] == "IMAGE_TOO_LARGE"


async def test_a_device_cannot_upload(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    assert (await upload(api, s.device_token, JPEG)).status_code == 403


async def test_needs_a_token(api: AsyncClient) -> None:
    response = await api.post("/api/v1/media/images", content=JPEG)

    assert response.status_code == 401


async def product_with(api: AsyncClient, token: str, image_key: str | None) -> Response:
    cat = await api.post("/api/v1/categories", json={"name": "Minuman"}, headers=bearer(token))
    body = {
        "category_id": cat.json()["data"]["id"],
        "sku": "MN-1",
        "name": "Es Teh",
        "price": 5000,
        "image_key": image_key,
    }
    return await api.post("/api/v1/products", json=body, headers=bearer(token))


async def test_a_product_stores_the_key_and_answers_with_the_url(api: AsyncClient) -> None:
    token = (await signup(api))["token"]
    image = (await upload(api, token, JPEG)).json()["data"]

    response = await product_with(api, token, image["key"])

    assert response.status_code == 201, response.text
    product: dict[str, Any] = response.json()["data"]
    assert product["image_key"] == image["key"]
    assert product["image_url"] == image["url"]
    listed = (await api.get("/api/v1/products", headers=bearer(token))).json()["data"]
    assert listed[0]["image_url"] == image["url"]


async def test_a_product_cannot_point_at_another_tenants_image(api: AsyncClient) -> None:
    other = (await signup(api, email="lain@example.id", slug="lain"))["token"]
    foreign = (await upload(api, other, JPEG)).json()["data"]["key"]
    token = (await signup(api))["token"]

    response = await product_with(api, token, foreign)

    assert response.status_code == 422
    assert response.json()["code"] == "INVALID_IMAGE_KEY"
