from dataclasses import asdict
from datetime import date

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert

from poslite.reporting.infrastructure.models import (
    DailyCashierSalesModel,
    DailyCategorySalesModel,
    DailyChannelSalesModel,
    DailyPaymentSalesModel,
    DailyProductSalesModel,
    DailySalesModel,
)
from poslite.sales import api as sales
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


async def project_daily_sales(uow: SqlAlchemyUnitOfWork, outlet_id: str, day: date) -> None:
    """Recompute one outlet-day from the orders and overwrite its rows: idempotent by design, so
    at-least-once delivery (or a rebuild) can never double count."""
    key = {"tenant_id": uow.tenant_id, "outlet_id": outlet_id, "business_date": day}
    totals = asdict(await sales.daily_totals(uow, outlet_id, day))
    await uow.session.execute(
        insert(DailySalesModel)
        .values(**key, **totals)
        .on_conflict_do_update(
            index_elements=["outlet_id", "business_date"],
            set_={**totals, "updated_at": insert(DailySalesModel).excluded.updated_at},
        )
    )
    breakdowns = (
        DailyProductSalesModel,
        DailyPaymentSalesModel,
        DailyCategorySalesModel,
        DailyCashierSalesModel,
        DailyChannelSalesModel,
    )
    for model in breakdowns:
        await uow.session.execute(
            delete(model).where(model.outlet_id == outlet_id, model.business_date == day)
        )
    uow.session.add_all(
        DailyProductSalesModel(**key, **asdict(p))
        for p in await sales.daily_product_sales(uow, outlet_id, day)
    )
    uow.session.add_all(
        DailyPaymentSalesModel(**key, **asdict(p))
        for p in await sales.daily_payment_sales(uow, outlet_id, day)
    )
    uow.session.add_all(
        DailyCategorySalesModel(**key, **asdict(c))
        for c in await sales.daily_category_sales(uow, outlet_id, day)
    )
    uow.session.add_all(
        DailyCashierSalesModel(**key, **asdict(c))
        for c in await sales.daily_cashier_sales(uow, outlet_id, day)
    )
    uow.session.add_all(
        DailyChannelSalesModel(**key, **asdict(c))
        for c in await sales.daily_channel_sales(uow, outlet_id, day)
    )
    await uow.session.flush()


async def on_order_placed(uow: SqlAlchemyUnitOfWork, payload: dict[str, object]) -> None:
    await project_daily_sales(
        uow, str(payload["outlet_id"]), date.fromisoformat(str(payload["business_date"]))
    )
