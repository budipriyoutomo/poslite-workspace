from typing import Any

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from poslite.worker import relay_job

from ..identity.helpers import bearer
from ..sync.helpers import outlet_with_menu_and_device
from ..sync.test_push import batch, push


async def summary(api: AsyncClient, token: str, query: str) -> Any:
    response = await api.get(f"/api/v1/reports/sales-summary?{query}", headers=bearer(token))
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def test_reports_daily_sales_after_the_worker_projected_them(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    await push(api, s.device_token, batch(s))

    await relay_job(
        {
            "app_sessions": async_sessionmaker(app_engine),
            "system_sessions": async_sessionmaker(system_engine),
        }
    )

    data = await summary(
        api, s.owner_token, f"outlet_id={s.outlet_id}&from=2026-09-25&to=2026-09-25"
    )
    assert data["days"] == [
        {
            "business_date": "2026-09-25",
            "gross": 70_000,
            "discount": 7_000,
            "service": 3_150,
            "tax": 6_615,
            "net": 72_765,
            "order_count": 1,
            "void_count": 0,
            "refund_amount": 0,
            "refund_count": 0,
            "pre_payment_void_count": 0,
            "pre_payment_void_amount": 0,
            "cash_rounding": 0,
        }
    ]
    assert data["totals"]["net"] == 72_765
    assert data["payment_methods"] == [
        {
            "payment_method_id": s.ids["cash"],
            "method_type": "cash",
            "amount": 72_765,
            "count": 1,
            "refund_amount": 0,
        }
    ]
    assert data["products"] == [
        {
            "product_id": s.ids["product"],
            "product_name": "Nasi Gudeg",
            "quantity": 2,
            "gross": 70_000,
            "refund_qty": 0,
            "refund_amount": 0,
        }
    ]


async def test_is_empty_outside_the_date_range(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    await push(api, s.device_token, batch(s))
    await relay_job(
        {
            "app_sessions": async_sessionmaker(app_engine),
            "system_sessions": async_sessionmaker(system_engine),
        }
    )

    data = await summary(
        api, s.owner_token, f"outlet_id={s.outlet_id}&from=2026-09-26&to=2026-09-30"
    )

    assert (data["days"], data["totals"]["net"]) == ([], 0)


async def test_rejects_a_range_that_ends_before_it_starts(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    response = await api.get(
        f"/api/v1/reports/sales-summary?outlet_id={s.outlet_id}&from=2026-09-26&to=2026-09-25",
        headers=bearer(s.owner_token),
    )

    assert (response.status_code, response.json()["code"]) == (422, "INVALID_DATE_RANGE")
