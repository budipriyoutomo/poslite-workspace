from datetime import date
from typing import Annotated, Literal, Self

from pydantic import BaseModel, Field, StringConstraints, model_validator

from poslite.shared.presentation.schemas import Name, Ulid

HhMm = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]


class PromotionIn(BaseModel):
    """06 "Promo" rules: percent_off needs 1..100; buy_x_get_y needs quantities and a scope."""

    name: Name
    type: Literal["percent_off", "buy_x_get_y"]
    percentage: Annotated[int, Field(ge=1, le=100)] | None = None
    buy_qty: Annotated[int, Field(ge=1, le=99)] | None = None
    get_qty: Annotated[int, Field(ge=1, le=99)] | None = None
    product_ids: list[Ulid] = []
    category_ids: list[Ulid] = []
    outlet_ids: list[Ulid] = []
    days_of_week: Annotated[list[Annotated[int, Field(ge=1, le=7)]], Field(max_length=7)] = []
    start_time: HhMm | None = None
    end_time: HhMm | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def _rule(self) -> Self:
        if self.type == "percent_off" and self.percentage is None:
            raise ValueError("percent_off needs a percentage from 1 to 100")
        if self.type == "buy_x_get_y":
            if self.buy_qty is None or self.get_qty is None:
                raise ValueError("buy_x_get_y needs buy_qty and get_qty")
            if not self.product_ids and not self.category_ids:
                raise ValueError("buy_x_get_y needs products or categories")
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError("start_time and end_time go together")
        if self.starts_on and self.ends_on and self.ends_on < self.starts_on:
            raise ValueError("ends_on is before starts_on")
        return self


class PromotionOut(PromotionIn):
    id: str
