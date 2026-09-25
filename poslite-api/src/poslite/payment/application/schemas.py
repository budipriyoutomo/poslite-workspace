from typing import Literal

from pydantic import BaseModel

from poslite.shared.presentation.schemas import Name

PaymentType = Literal["cash", "debit", "qris", "credit_card", "voucher", "other"]


class PaymentMethodIn(BaseModel):
    type: PaymentType
    name: Name
    requires_reference: bool = False
    sort_order: int = 0
    logo_url: str | None = None


class PaymentMethodOut(PaymentMethodIn):
    id: str
