from datetime import date

from sqlalchemy import CHAR, Boolean, Date, Integer, SmallInteger, String
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from poslite.shared.infrastructure.columns import MasterColumns
from poslite.shared.infrastructure.database import Base


class PromotionModel(MasterColumns, Base):
    __tablename__ = "promotions"

    id: Mapped[str] = mapped_column(CHAR(26), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(CHAR(26))
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(20))
    percentage: Mapped[int | None] = mapped_column(Integer)
    buy_qty: Mapped[int | None] = mapped_column(Integer)
    get_qty: Mapped[int | None] = mapped_column(Integer)
    product_ids: Mapped[list[str]] = mapped_column(ARRAY(CHAR(26)))
    category_ids: Mapped[list[str]] = mapped_column(ARRAY(CHAR(26)))
    outlet_ids: Mapped[list[str]] = mapped_column(ARRAY(CHAR(26)))
    days_of_week: Mapped[list[int]] = mapped_column(ARRAY(SmallInteger))
    start_time: Mapped[str | None] = mapped_column(String(5))
    end_time: Mapped[str | None] = mapped_column(String(5))
    starts_on: Mapped[date | None] = mapped_column(Date)
    ends_on: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
