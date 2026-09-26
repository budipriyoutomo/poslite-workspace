import json
from datetime import UTC, datetime
from typing import Any

from httpx import AsyncClient

from poslite.shared.infrastructure.fake_gateway import FakeGateway

from ..identity.helpers import bearer
from ..sync.helpers import Setup, outlet_with_menu_and_device
from ..sync.test_push import batch, push, statuses

CHARGE_ID = "01K5ZK00000000000000000001"
gateway = FakeGateway(secret="dev-gateway-secret", public_url="http://localhost:8000")  # noqa: S106


async def create(
    api: AsyncClient, s: Setup, charge_id: str = CHARGE_ID, amount: int = 72_765
) -> Any:
    return await api.post(
        "/api/v1/payments/qris",
        json={"id": charge_id, "amount": amount},
        headers=bearer(s.device_token),
    )


async def pay(api: AsyncClient, charge_id: str) -> None:
    body, headers = gateway.notification(f"fake_{charge_id}", "paid", datetime.now(UTC))
    assert (
        await api.post("/api/v1/gateway/webhook", content=body, headers=headers)
    ).status_code == 200


def qris_order(s: Setup, reference: str) -> list[dict[str, Any]]:
    """The fixture batch with its order paid in full by QRIS (no change)."""
    events = batch(s)
    order = json.loads(json.dumps(events[2]))
    order["payload"]["payments"] = [
        {
            "id": "01K5ZY00000000000000000009",
            "payment_method_id": s.ids["qris"],
            "method_type": "qris",
            "amount": order["payload"]["totals"]["total"],
            "reference": reference,
        }
    ]
    order["payload"]["change_amount"] = 0
    return [events[0], order]


async def test_a_device_creates_a_dynamic_qris_for_the_bill(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    response = await create(api, s)
    again = await create(api, s)

    assert response.status_code == 201, response.text
    charge = response.json()["data"]
    assert charge["id"] == CHARGE_ID
    assert charge["status"] == "pending"
    assert "72765" in charge["qr_string"]
    assert again.json()["data"] == charge  # same id → same charge (retry-safe)


async def test_the_charge_turns_paid_when_the_gateway_confirms(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await create(api, s)

    await pay(api, CHARGE_ID)

    status = await api.get(f"/api/v1/payments/qris/{CHARGE_ID}", headers=bearer(s.device_token))
    assert status.json()["data"]["status"] == "paid"


async def test_an_order_paid_by_a_confirmed_qris_is_not_flagged(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await create(api, s)
    await pay(api, CHARGE_ID)

    assert statuses(await push(api, s.device_token, qris_order(s, CHARGE_ID))) == [
        "accepted",
        "accepted",
    ]


async def test_an_order_with_an_unconfirmed_qris_is_flagged(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)
    await create(api, s)

    response = await push(api, s.device_token, qris_order(s, CHARGE_ID))

    assert response.json()["data"]["results"][1] == {
        "id": qris_order(s, CHARGE_ID)[1]["id"],
        "status": "flagged",
        "flags": ["QRIS_UNPAID"],
    }


async def test_a_static_qris_reference_is_not_flagged(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    assert statuses(await push(api, s.device_token, qris_order(s, "QR-STATIC-9981"))) == [
        "accepted",
        "accepted",
    ]


async def test_back_office_tokens_cannot_create_charges(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    response = await api.post(
        "/api/v1/payments/qris",
        json={"id": CHARGE_ID, "amount": 1000},
        headers=bearer(s.owner_token),
    )

    assert response.status_code == 403


async def test_a_charge_needs_a_positive_amount(api: AsyncClient) -> None:
    s = await outlet_with_menu_and_device(api)

    assert (await create(api, s, amount=0)).status_code == 422
