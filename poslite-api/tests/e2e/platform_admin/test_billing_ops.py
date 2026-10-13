"""Billing support from the console (ADR-018): extend a trial, settle an invoice paid offline."""

from datetime import datetime, timedelta
from typing import Any

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from poslite.billing.api import run_billing
from poslite.shared.infrastructure.fake_gateway import FakeGateway

from ..identity.helpers import bearer, signup
from .helpers import ops_get, ops_post

gateway = FakeGateway(secret="dev-gateway-secret", public_url="http://localhost:8000")  # noqa: S106


async def bill(system_engine: AsyncEngine, now: datetime) -> None:
    await run_billing(
        system=async_sessionmaker(system_engine), gateway=gateway, now=now, price_per_outlet=150_000
    )


async def signed_up_at(system_engine: AsyncEngine) -> datetime:
    async with system_engine.begin() as conn:
        value: datetime = (await conn.execute(text("SELECT created_at FROM tenants"))).scalar_one()
    return value


async def detail(api: AsyncClient, token: str, tenant_id: str) -> dict[str, Any]:
    data: dict[str, Any] = (await ops_get(api, token, f"/tenants/{tenant_id}"))["data"]
    return data


async def test_extends_a_trial_before_the_first_billing_run(
    api: AsyncClient, admin_token: str, system_engine: AsyncEngine
) -> None:
    tenant_id = (await signup(api))["tenant"]["id"]
    start = await signed_up_at(system_engine)

    response = await ops_post(api, admin_token, f"/tenants/{tenant_id}/extend-trial", {"days": 7})

    assert response.status_code == 200, response.text
    sub = (await detail(api, admin_token, tenant_id))["subscription"]
    assert sub["status"] == "trialing"
    assert datetime.fromisoformat(sub["trial_ends_at"]) == start + timedelta(days=21)
    await bill(system_engine, start + timedelta(days=15))
    assert (await detail(api, admin_token, tenant_id))["invoices"] == []  # still in the trial


async def test_extends_a_running_trial(
    api: AsyncClient, admin_token: str, system_engine: AsyncEngine
) -> None:
    tenant_id = (await signup(api))["tenant"]["id"]
    start = await signed_up_at(system_engine)
    await bill(system_engine, start + timedelta(hours=1))

    await ops_post(api, admin_token, f"/tenants/{tenant_id}/extend-trial", {"days": 30})

    sub = (await detail(api, admin_token, tenant_id))["subscription"]
    assert datetime.fromisoformat(sub["trial_ends_at"]) == start + timedelta(days=44)


async def test_only_a_trial_can_be_extended(
    api: AsyncClient, admin_token: str, system_engine: AsyncEngine
) -> None:
    tenant_id = (await signup(api))["tenant"]["id"]
    start = await signed_up_at(system_engine)
    await bill(system_engine, start + timedelta(days=15))  # trial over: first invoice issued
    [invoice] = (await detail(api, admin_token, tenant_id))["invoices"]
    await ops_post(api, admin_token, f"/invoices/{invoice['id']}/mark-paid")

    response = await ops_post(api, admin_token, f"/tenants/{tenant_id}/extend-trial", {"days": 7})

    assert (response.status_code, response.json()["code"]) == (409, "TRIAL_NOT_ACTIVE")


async def test_trial_extension_is_between_1_and_90_days(api: AsyncClient, admin_token: str) -> None:
    tenant_id = (await signup(api))["tenant"]["id"]

    response = await ops_post(api, admin_token, f"/tenants/{tenant_id}/extend-trial", {"days": 91})

    assert response.status_code == 422


async def test_marking_an_overdue_invoice_paid_reactivates_the_tenant(
    api: AsyncClient, admin_token: str, system_engine: AsyncEngine
) -> None:
    owner = await signup(api)
    tenant_id = owner["tenant"]["id"]
    start = await signed_up_at(system_engine)
    await bill(system_engine, start + timedelta(days=15))
    await bill(system_engine, start + timedelta(days=23))  # past the grace days: suspended
    assert (await detail(api, admin_token, tenant_id))["status"] == "suspended"
    [invoice] = (await detail(api, admin_token, tenant_id))["invoices"]

    response = await ops_post(api, admin_token, f"/invoices/{invoice['id']}/mark-paid")

    assert response.status_code == 200, response.text
    tenant = await detail(api, admin_token, tenant_id)
    assert (tenant["status"], tenant["subscription"]["status"]) == ("active", "active")
    assert tenant["invoices"][0]["status"] == "paid"
    assert tenant["invoices"][0]["paid_at"] is not None
    allowed = await api.post(
        "/api/v1/categories", json={"name": "X"}, headers=bearer(owner["token"])
    )
    assert allowed.status_code == 201


async def test_an_invoice_is_settled_once(
    api: AsyncClient, admin_token: str, system_engine: AsyncEngine
) -> None:
    tenant_id = (await signup(api))["tenant"]["id"]
    await bill(system_engine, await signed_up_at(system_engine) + timedelta(days=15))
    [invoice] = (await detail(api, admin_token, tenant_id))["invoices"]
    await ops_post(api, admin_token, f"/invoices/{invoice['id']}/mark-paid")

    again = await ops_post(api, admin_token, f"/invoices/{invoice['id']}/mark-paid")

    assert (again.status_code, again.json()["code"]) == (409, "INVOICE_ALREADY_PAID")


async def test_unknown_invoice_is_not_found(api: AsyncClient, admin_token: str) -> None:
    response = await ops_post(api, admin_token, "/invoices/01K5ZT00000000000000000099/mark-paid")

    assert (response.status_code, response.json()["code"]) == (404, "INVOICE_NOT_FOUND")


async def test_billing_actions_are_audited(
    api: AsyncClient, admin_token: str, system_engine: AsyncEngine
) -> None:
    tenant_id = (await signup(api))["tenant"]["id"]

    await ops_post(api, admin_token, f"/tenants/{tenant_id}/extend-trial", {"days": 7})

    [entry] = (await ops_get(api, admin_token, f"/audit?tenant_id={tenant_id}"))["data"]
    assert (entry["action"], entry["detail"]) == ("subscription.extend_trial", {"days": 7})
