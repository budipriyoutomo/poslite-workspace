import json
from collections.abc import Mapping
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from e2e.sync.helpers import Setup, outlet_with_menu_and_device
from e2e.sync.test_push import batch, fresh_batch, push
from poslite.reporting.api import subscribers
from poslite.shared.domain.ids import new_ulid
from poslite.shared.infrastructure.outbox_relay import Subscriber, relay_outbox


async def relay(
    app_engine: AsyncEngine,
    system_engine: AsyncEngine,
    subs: Mapping[str, Subscriber] | None = None,
) -> Any:
    return await relay_outbox(
        system=async_sessionmaker(system_engine),
        app=async_sessionmaker(app_engine),
        subscribers=subscribers() if subs is None else subs,
        new_id=new_ulid,
    )


async def rows(engine: AsyncEngine, sql: str) -> list[dict[str, Any]]:
    async with engine.begin() as conn:
        return [dict(r._mapping) for r in await conn.execute(text(sql))]


def second_order(s: Setup) -> dict[str, Any]:
    """Another sale on the same day: new ids and receipt number, same shape."""
    order = json.loads(json.dumps(batch(s)[2]))
    order["id"], order["aggregate_id"] = new_ulid(), new_ulid()
    order["payload"]["receipt_no"] = "JKT01A-260925-0002"
    order["payload"]["lines"][0]["id"] = new_ulid()
    order["payload"]["payments"][0]["id"] = new_ulid()
    return order


async def test_projects_a_pushed_order_into_the_daily_read_model(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    await push(api, s.device_token, batch(s))

    stats = await relay(app_engine, system_engine)

    assert (stats.published, stats.failed) == (3, 0)
    assert await rows(
        system_engine,
        "SELECT gross, discount, service, tax, net, order_count, void_count FROM rpt_daily_sales",
    ) == [
        {
            "gross": 70_000,
            "discount": 7_000,
            "service": 3_150,
            "tax": 6_615,
            "net": 72_765,
            "order_count": 1,
            "void_count": 0,
        }
    ]
    assert await rows(
        system_engine, "SELECT method_type, amount, count FROM rpt_daily_payment_sales"
    ) == [
        {"method_type": "cash", "amount": 72_765, "count": 1}  # 100.000 tendered - 27.235 change
    ]
    assert await rows(
        system_engine, "SELECT product_name, quantity, gross FROM rpt_daily_product_sales"
    ) == [{"product_name": "Nasi Gudeg", "quantity": 2, "gross": 70_000}]
    assert await rows(
        system_engine, "SELECT count(*) AS n FROM outbox_messages WHERE published_at IS NULL"
    ) == [{"n": 0}]


async def test_projecting_twice_does_not_double_count(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    await push(api, s.device_token, batch(s))
    await relay(app_engine, system_engine)
    async with system_engine.begin() as conn:  # at-least-once delivery: the same messages again
        await conn.execute(text("UPDATE outbox_messages SET published_at = NULL"))

    await relay(app_engine, system_engine)

    assert await rows(system_engine, "SELECT net, order_count FROM rpt_daily_sales") == [
        {"net": 72_765, "order_count": 1}
    ]


async def test_sums_all_orders_of_the_day(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    events = batch(s)
    await push(api, s.device_token, [*events[:3], second_order(s)])

    await relay(app_engine, system_engine)

    assert await rows(system_engine, "SELECT net, order_count FROM rpt_daily_sales") == [
        {"net": 145_530, "order_count": 2}
    ]


async def test_a_failing_subscriber_leaves_its_message_for_the_next_run(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    await push(api, s.device_token, batch(s))

    async def broken(*_: object) -> None:
        raise RuntimeError("projector down")

    stats = await relay(app_engine, system_engine, {"sales.order_placed": broken})

    assert (stats.published, stats.failed) == (2, 1)
    assert await rows(
        system_engine,
        "SELECT topic, attempts, last_error FROM outbox_messages WHERE published_at IS NULL",
    ) == [{"topic": "sales.order_placed", "attempts": 1, "last_error": "projector down"}]


async def test_each_tenant_gets_its_own_report(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    a = await outlet_with_menu_and_device(api)
    b = await outlet_with_menu_and_device(
        api, slug="lain", email="b@b.id", outlet={"code": "BDG01", "name": "Bandung"}
    )
    await push(api, a.device_token, batch(a))
    await push(api, b.device_token, fresh_batch(b)[:3])

    await relay(app_engine, system_engine)

    assert sorted(
        r["tenant_id"] for r in await rows(system_engine, "SELECT tenant_id FROM rpt_daily_sales")
    ) == sorted(
        [r["tenant_id"] for r in await rows(system_engine, "SELECT id AS tenant_id FROM tenants")]
    )


@pytest.fixture(autouse=True)
def _uses_db(app_engine: AsyncEngine) -> None:
    """All tests here touch the database (cleanup is attached to app_engine)."""
