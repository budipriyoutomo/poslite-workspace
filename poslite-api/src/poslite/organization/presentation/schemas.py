from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from poslite.shared.presentation.schemas import Bps, Email, Name, TimeZone, Ulid


class OutletOut(BaseModel):
    id: str
    brand_id: str
    code: str
    name: str
    timezone: str = "Asia/Jakarta"


Role = Literal["owner", "manager", "cashier", "waiter"]


class AccessTenant(BaseModel):
    id: str
    name: str
    status: str


class AccessOutlet(BaseModel):
    id: str
    code: str
    name: str
    role: Role


class AccessBrand(BaseModel):
    id: str
    code: str
    name: str
    role: Role | None = Field(
        description="Role over the whole brand; null = access to some of its outlets only"
    )
    outlets: list[AccessOutlet]


class AccessTree(BaseModel):
    tenant: AccessTenant
    company_scope: bool
    brands: list[AccessBrand]


class DeviceOut(BaseModel):
    id: str
    code: str
    name: str
    outlet: OutletOut


class ActivateRequest(BaseModel):
    email: Email
    password: str
    outlet_id: Annotated[str, StringConstraints(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")]
    device_name: Name
    platform: Annotated[str, StringConstraints(max_length=30)] = ""


class ActivationResult(BaseModel):
    device: DeviceOut
    token: str
    server_time: datetime


class DeviceMe(BaseModel):
    device: DeviceOut


class OutletSettingsIn(BaseModel):
    name: Name
    timezone: TimeZone
    business_day_cutoff: Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]
    tax_rate_bps: Bps
    service_rate_bps: Bps
    receipt_header: Annotated[str, StringConstraints(max_length=500)] = ""
    receipt_footer: Annotated[str, StringConstraints(max_length=500)] = ""
    # ADR-031: open bills on each device (counter) or shared through the server (table_service).
    service_mode: Literal["counter", "table_service"] = "counter"
    # P1-3: the part paid in cash is rounded to this unit (0 = off).
    cash_rounding_unit: Literal[0, 100, 500, 1000] = 0
    cash_rounding_mode: Literal["nearest", "down"] = "nearest"


class OutletSettingsOut(OutletSettingsIn):
    id: str
    code: str


class NewOutletIn(BaseModel):
    brand_id: Ulid
    code: Annotated[
        str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Z0-9]{2,10}$")
    ]
    name: Name
    timezone: TimeZone = "Asia/Jakarta"


ReceiptText = Annotated[str, StringConstraints(max_length=500)]


class DiscountPolicyIn(BaseModel):
    """Manual-discount rules of a brand (06 Order rule 5)."""

    percentages: Annotated[list[Annotated[int, Field(ge=1, le=100)]], Field(max_length=8)] = [
        5,
        10,
        15,
        20,
    ]
    amounts: Annotated[list[Annotated[int, Field(ge=1, le=10**9)]], Field(max_length=8)] = [
        5_000,
        10_000,
        25_000,
        50_000,
    ]
    allow_custom: bool = True
    cashier_max_percentage: Annotated[int, Field(ge=0, le=100)] = 20
    cashier_max_amount: Annotated[int, Field(ge=0, le=10**12)] = 50_000


class BrandIn(BaseModel):
    code: Annotated[
        str,
        StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Za-z0-9]{2,20}$"),
    ]
    name: Name
    logo_key: Annotated[str, StringConstraints(max_length=300)] | None = None
    receipt_header: ReceiptText = ""
    receipt_footer: ReceiptText = ""
    is_active: bool = True
    discount: DiscountPolicyIn = DiscountPolicyIn()
    price_includes_tax: bool = False  # ADR-030; applies to new orders only
    blind_close: bool = True  # 15 · UX-02: cashiers close shifts without seeing expected cash


class BrandOut(BaseModel):
    id: str
    code: str
    name: str
    logo_key: str | None
    logo_url: str | None
    receipt_header: str
    receipt_footer: str
    is_active: bool
    discount: DiscountPolicyIn
    price_includes_tax: bool
    blind_close: bool


class DeviceListItem(BaseModel):
    id: str
    code: str
    name: str
    platform: str
    app_version: str | None
    last_seen_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class TableIn(BaseModel):
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
    area: Annotated[str, StringConstraints(strip_whitespace=True, max_length=50)] = ""
    seats: Annotated[int, Field(ge=0, le=100)] = 0
    sort_order: Annotated[int, Field(ge=0)] = 0


class TableOut(BaseModel):
    id: str
    label: str
    area: str
    seats: int
    sort_order: int
