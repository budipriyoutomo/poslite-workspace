import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from e2e.identity.helpers import bearer
from e2e.sync.helpers import Setup, outlet_with_menu_and_device
from e2e.sync.test_push import batch, push
from poslite.integration.api import deliver_webhooks
from poslite.integration.api import subscribers as webhook_subscribers
from poslite.reporting.api import subscribers as report_subscribers
from poslite.shared.domain.ids import new_ulid
from poslite.shared.infrastructure.outbox_relay import combine_subscribers, relay_outbox

NOW = datetime(2026, 9, 27, 3, 0, tzinfo=UTC)


class FakeReceiver:
    """Records what the webhook sender posts; answers with the given statuses in turn."""

    def __init__(self, *statuses: int) -> None:
        self.statuses = list(statuses) or [200]
        self.calls: list[tuple[str, bytes, dict[str, str]]] = []

    async def __call__(self, url: str, body: bytes, headers: dict[str, str]) -> int:
        self.calls.append((url, body, headers))
        return self.statuses.pop(0) if len(self.statuses) > 1 else self.statuses[0]


async def relay(app_engine: AsyncEngine, system_engine: AsyncEngine) -> None:
    await relay_outbox(
        system=async_sessionmaker(system_engine),
        app=async_sessionmaker(app_engine),
        subscribers=combine_subscribers(report_subscribers(), webhook_subscribers()),
        new_id=new_ulid,
    )


async def deliver(
    app_engine: AsyncEngine, system_engine: AsyncEngine, send: FakeReceiver, now: datetime = NOW
) -> Any:
    return await deliver_webhooks(
        system=async_sessionmaker(system_engine), send=send, now=lambda: now
    )


async def endpoint(api: AsyncClient, s: Setup, **body: Any) -> dict[str, Any]:
    response = await api.post(
        "/api/v1/webhooks",
        json={"url": "https://erp.example.id/poslite", "event_types": ["order.placed"], **body},
        headers=bearer(s.owner_token),
    )
    assert response.status_code == 201, response.text
    data: dict[str, Any] = response.json()["data"]
    return data


async def test_the_secret_is_shown_only_when_the_endpoint_is_created(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    created = await endpoint(api, s)

    listed = (await api.get("/api/v1/webhooks", headers=bearer(s.owner_token))).json()["data"]

    assert created["secret"].startswith("whsec_")
    assert listed == [
        {
            "id": created["id"],
            "url": created["url"],
            "event_types": ["order.placed"],
            "is_active": True,
        }
    ]


async def test_rejects_a_plain_http_url(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    response = await api.post(
        "/api/v1/webhooks",
        json={"url": "http://erp.example.id/hook", "event_types": ["order.placed"]},
        headers=bearer(s.owner_token),
    )

    assert response.status_code == 422


async def test_a_synced_order_reaches_the_endpoint_signed_with_its_details(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    hook = await endpoint(api, s, event_types=["order.placed", "shift.closed"])
    await push(api, s.device_token, batch(s))
    await relay(app_engine, system_engine)
    receiver = FakeReceiver(200)

    stats = await deliver(app_engine, system_engine, receiver)

    assert (stats.delivered, stats.failed) == (2, 0)
    by_type = {
        json.loads(body)["type"]: (url, body, headers) for url, body, headers in receiver.calls
    }
    url, body, headers = by_type["order.placed"]
    event = json.loads(body)
    assert url == "https://erp.example.id/poslite"
    assert event["data"]["receipt_no"] == "JKT01A-260925-0001"
    assert event["data"]["total"] == 72_765
    assert event["data"]["lines"][0]["product_name"] == "Nasi Gudeg"
    assert event["data"]["payments"][0]["method_type"] == "cash"
    t = int(headers["X-Poslite-Signature"].split(",")[0][2:])
    expected = hmac.new(
        hook["secret"].encode(), f"{t}.".encode() + body, hashlib.sha256
    ).hexdigest()
    assert headers["X-Poslite-Signature"] == f"t={t},v1={expected}"
    assert headers["Content-Type"] == "application/json"


async def test_only_subscribed_event_types_are_sent(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    await endpoint(api, s, event_types=["shift.closed"])
    await push(api, s.device_token, batch(s))
    await relay(app_engine, system_engine)
    receiver = FakeReceiver(200)

    await deliver(app_engine, system_engine, receiver)

    assert [json.loads(b)["type"] for _, b, _ in receiver.calls] == ["shift.closed"]


async def test_a_failed_send_is_retried_later_then_marked_dead(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    hook = await endpoint(api, s)
    await push(api, s.device_token, batch(s))
    await relay(app_engine, system_engine)
    down = FakeReceiver(500)

    await deliver(app_engine, system_engine, down)
    assert len(down.calls) == 1
    await deliver(app_engine, system_engine, down, NOW + timedelta(seconds=30))
    assert len(down.calls) == 1  # not due yet (1 minute backoff)

    moment = NOW
    for _ in range(10):
        moment += timedelta(days=1)
        await deliver(app_engine, system_engine, down, moment)

    deliveries = (
        await api.get(f"/api/v1/webhooks/{hook['id']}/deliveries", headers=bearer(s.owner_token))
    ).json()["data"]
    assert [(d["status"], d["attempts"], d["last_status_code"]) for d in deliveries] == [
        ("dead", 8, 500)
    ]

    retried = await api.post(
        f"/api/v1/webhook-deliveries/{deliveries[0]['id']}/retry", headers=bearer(s.owner_token)
    )
    assert retried.status_code == 200
    up = FakeReceiver(204)
    await deliver(app_engine, system_engine, up, moment)
    assert len(up.calls) == 1
    after = (
        await api.get(f"/api/v1/webhooks/{hook['id']}/deliveries", headers=bearer(s.owner_token))
    ).json()["data"]
    assert after[0]["status"] == "delivered"


async def test_relaying_the_same_order_twice_creates_one_delivery(
    api: AsyncClient, app_engine: AsyncEngine, system_engine: AsyncEngine
) -> None:
    s = await outlet_with_menu_and_device(api)
    await endpoint(api, s)
    await push(api, s.device_token, batch(s))
    await relay(app_engine, system_engine)
    async with system_engine.begin() as conn:  # at-least-once: the relay may run a message again
        await conn.execute(text("UPDATE outbox_messages SET published_at = NULL"))
    await relay(app_engine, system_engine)

    async with system_engine.begin() as conn:
        count = (await conn.execute(text("SELECT count(*) FROM webhook_deliveries"))).scalar_one()
    assert count == 1
