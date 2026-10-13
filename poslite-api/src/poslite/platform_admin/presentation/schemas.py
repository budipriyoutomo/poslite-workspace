from datetime import date, datetime
from typing import Annotated, Any

from pydantic import BaseModel, Field, StringConstraints

from poslite.shared.presentation.schemas import Email, Name

OperatorPassword = Annotated[str, StringConstraints(min_length=12, max_length=128)]


class LoginIn(BaseModel):
    email: Email
    password: str


class LoginOut(BaseModel):
    token: str
    expires_at: datetime


class OperatorIn(BaseModel):
    email: Email
    name: Name
    password: OperatorPassword


class OperatorOut(BaseModel):
    id: str
    email: str
    name: str
    created_at: datetime
    disabled_at: datetime | None


class TenantListItem(BaseModel):
    id: str
    slug: str
    name: str
    status: str
    created_at: datetime
    suspended_at: datetime | None
    suspended_reason: str | None  # manual (operator) | billing (unpaid invoice, ADR-018)
    subscription_status: (
        str | None
    )  # trialing | active | past_due; None before the first billing run
    outlet_count: int
    device_count: int


class TenantOwnerOut(BaseModel):
    name: str
    email: str | None


class TenantOutletOut(BaseModel):
    id: str
    code: str
    name: str
    brand_name: str
    device_count: int


class TenantUserOut(BaseModel):
    id: str
    name: str
    email: str | None
    roles: list[str]
    has_login: bool  # email + password (back-office); False = PIN only
    is_active: bool


class TenantDeviceOut(BaseModel):
    id: str
    code: str
    name: str
    outlet_name: str
    platform: str
    app_version: str | None
    last_seen_at: datetime | None
    revoked_at: datetime | None


class TenantInvoiceOut(BaseModel):
    id: str
    period_start: date
    period_end: date
    outlet_count: int
    unit_price: int
    amount: int
    status: str  # open | paid | void
    due_at: datetime
    paid_at: datetime | None


class TenantSubscriptionOut(BaseModel):
    status: str
    trial_ends_at: datetime
    current_period_end: date | None


class TenantDetailOut(TenantListItem):
    owners: list[TenantOwnerOut]
    outlets: list[TenantOutletOut]
    users: list[TenantUserOut]
    devices: list[TenantDeviceOut]
    subscription: TenantSubscriptionOut | None  # None before the first billing run
    invoices: list[TenantInvoiceOut]


class UserHitOut(BaseModel):
    id: str
    name: str
    email: str | None
    roles: list[str]
    is_active: bool
    tenant_id: str
    tenant_name: str
    tenant_slug: str


class PasswordResetOut(BaseModel):
    password: str  # shown once; never stored or logged in clear


class ExtendTrialIn(BaseModel):
    days: int = Field(ge=1, le=90)


class ExtendTrialOut(BaseModel):
    trial_ends_at: datetime


class SummaryOut(BaseModel):
    tenants: int
    active_tenants: int
    suspended_tenants: int
    trialing: int
    paying: int
    past_due: int
    outlets: int
    devices: int
    monthly_recurring_revenue: int  # integer Rupiah
    open_invoice_amount: int  # integer Rupiah


class AuditEntryOut(BaseModel):
    id: str
    action: str
    operator_id: str
    operator_name: str
    tenant_id: str | None
    tenant_name: str | None
    target_id: str | None
    detail: dict[str, Any]
    created_at: datetime
