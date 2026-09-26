from datetime import date, datetime

from pydantic import BaseModel


class InvoiceOut(BaseModel):
    id: str
    period_start: date
    period_end: date
    outlet_count: int
    unit_price: int
    amount: int
    status: str
    due_at: datetime
    paid_at: datetime | None
    payment_url: str | None


class SubscriptionOut(BaseModel):
    status: str
    trial_ends_at: datetime
    current_period_end: date | None
    invoices: list[InvoiceOut]
