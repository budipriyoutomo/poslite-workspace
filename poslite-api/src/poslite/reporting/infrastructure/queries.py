from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select

from poslite.reporting.infrastructure.models import (
    DailyPaymentSalesModel,
    DailyProductSalesModel,
    DailySalesModel,
)
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

TOTAL_FIELDS = ("gross", "discount", "service", "tax", "net", "order_count", "void_count")


@dataclass(frozen=True, slots=True)
class SalesSummary:
    days: list[dict[str, object]]
    totals: dict[str, int]
    payment_methods: list[dict[str, object]]
    products: list[dict[str, object]]


async def sales_summary(
    uow: SqlAlchemyUnitOfWork, outlet_id: str, start: date, end: date
) -> SalesSummary:
    """Back-office report from the read model only (never scans orders on the request path)."""
    days = (
        await uow.session.scalars(
            select(DailySalesModel)
            .where(
                DailySalesModel.outlet_id == outlet_id,
                DailySalesModel.business_date.between(start, end),
            )
            .order_by(DailySalesModel.business_date)
        )
    ).all()
    day_rows = [
        {"business_date": d.business_date.isoformat(), **{f: getattr(d, f) for f in TOTAL_FIELDS}}
        for d in days
    ]
    totals = {f: sum(int(getattr(d, f)) for d in days) for f in TOTAL_FIELDS}

    in_range = (
        DailyPaymentSalesModel.outlet_id == outlet_id,
        DailyPaymentSalesModel.business_date.between(start, end),
    )
    payments = await uow.session.execute(
        select(
            DailyPaymentSalesModel.payment_method_id,
            func.max(DailyPaymentSalesModel.method_type),
            func.sum(DailyPaymentSalesModel.amount),
            func.sum(DailyPaymentSalesModel.count),
        )
        .where(*in_range)
        .group_by(DailyPaymentSalesModel.payment_method_id)
        .order_by(func.sum(DailyPaymentSalesModel.amount).desc())
    )
    products = await uow.session.execute(
        select(
            DailyProductSalesModel.product_id,
            func.max(DailyProductSalesModel.product_name),
            func.sum(DailyProductSalesModel.quantity),
            func.sum(DailyProductSalesModel.gross),
        )
        .where(
            DailyProductSalesModel.outlet_id == outlet_id,
            DailyProductSalesModel.business_date.between(start, end),
        )
        .group_by(DailyProductSalesModel.product_id)
        .order_by(func.sum(DailyProductSalesModel.gross).desc())
    )
    return SalesSummary(
        days=day_rows,
        totals=totals,
        payment_methods=[
            {"payment_method_id": m, "method_type": t, "amount": int(a), "count": int(c)}
            for m, t, a, c in payments
        ],
        products=[
            {"product_id": p, "product_name": n, "quantity": int(q), "gross": int(g)}
            for p, n, q, g in products
        ],
    )
