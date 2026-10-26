"""15 · UX-02: each brand chooses whether its cashiers close a shift blind (counting cash without
seeing the expected amount). On by default; the device reads it from the outlet setting."""

from httpx import AsyncClient

from ..identity.helpers import bearer
from .helpers import Setup, outlet_with_menu_and_device
from .test_price_includes_tax import _outlet_setting


async def _set_blind_close(api: AsyncClient, s: Setup, value: bool) -> None:
    response = await api.put(
        f"/api/v1/brands/{s.brand_id}",
        json={"code": "MAHARASA", "name": "Warung Maharasa", "blind_close": value},
        headers=bearer(s.owner_token),
    )
    assert response.status_code == 200, response.text


async def test_a_brand_closes_shifts_blind_by_default(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    brands = (await api.get("/api/v1/brands", headers=bearer(s.owner_token))).json()["data"]

    assert brands[0]["blind_close"] is True
    assert (await _outlet_setting(api, s))["blind_close"] is True


async def test_turning_blind_close_off_reaches_the_device(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    await _set_blind_close(api, s, False)

    brands = (await api.get("/api/v1/brands", headers=bearer(s.owner_token))).json()["data"]
    assert brands[0]["blind_close"] is False
    assert (await _outlet_setting(api, s))["blind_close"] is False
