from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StrictInt, StringConstraints

from poslite.shared.presentation.schemas import Name

PaymentType = Literal["cash", "debit", "qris", "credit_card", "voucher", "other"]


class PaymentMethodIn(BaseModel):
    type: PaymentType
    name: Name
    requires_reference: bool = False
    sort_order: int = 0
    logo_url: str | None = None


class NewPaymentMethodIn(PaymentMethodIn):
    """Without `outlet_ids` the method is switched on at every outlet."""

    outlet_ids: list[str] | None = None


class MethodOutletsIn(BaseModel):
    outlet_ids: list[str]


class PaymentMethodOut(PaymentMethodIn):
    id: str
    outlet_ids: list[str]


class QrisChargeIn(BaseModel):
    id: Annotated[str, StringConstraints(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")]
    amount: Annotated[StrictInt, Field(gt=0, le=10**12)]


class QrisChargeOut(BaseModel):
    id: str
    amount: int
    status: Literal["pending", "paid", "expired"]
    qr_string: str
    expires_at: datetime
    paid_at: datetime | None
