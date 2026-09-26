from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select

from poslite.identity import api as identity
from poslite.reporting.infrastructure.models import (
    DailyCashierSalesModel,
    DailyCategorySalesModel,
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
    categories: list[dict[str, object]]
    cashiers: list[dict[str, object]]


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
    categories = await uow.session.execute(
        select(
            DailyCategorySalesModel.category_name,
            func.sum(DailyCategorySalesModel.quantity),
            func.sum(DailyCategorySalesModel.gross),
        )
        .where(
            DailyCategorySalesModel.outlet_id == outlet_id,
            DailyCategorySalesModel.business_date.between(start, end),
        )
        .group_by(DailyCategorySalesModel.category_name)
        .order_by(func.sum(DailyCategorySalesModel.gross).desc())
    )
    cashier_rows = (
        await uow.session.execute(
            select(
                DailyCashierSalesModel.cashier_id,
                func.sum(DailyCashierSalesModel.order_count),
                func.sum(DailyCashierSalesModel.net),
            )
            .where(
                DailyCashierSalesModel.outlet_id == outlet_id,
                DailyCashierSalesModel.business_date.between(start, end),
            )
            .group_by(DailyCashierSalesModel.cashier_id)
            .order_by(func.sum(DailyCashierSalesModel.net).desc())
        )
    ).all()
    names = await identity.user_names(uow, [c for c, _, _ in cashier_rows])
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
        categories=[
            {"category_name": c, "quantity": int(q), "gross": int(g)} for c, q, g in categories
        ],
        cashiers=[
            {
                "cashier_id": c,
                "cashier_name": names.get(c, "?"),
                "order_count": int(n),
                "net": int(v),
            }
            for c, n, v in cashier_rows
        ],
    )
