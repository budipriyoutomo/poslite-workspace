from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select

from poslite.catalog import api as catalog
from poslite.identity import api as identity
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

TOTAL_FIELDS = (
    "gross",
    "discount",
    "service",
    "tax",
    "net",
    "order_count",
    "void_count",
    "refund_amount",  # refunds paid out that day (ADR-023), not subtracted from net
    "refund_count",
    "pre_payment_void_count",  # bill items cancelled after the kitchen had them (ADR-028)
    "pre_payment_void_amount",
)


@dataclass(frozen=True, slots=True)
class SalesSummary:
    days: list[dict[str, object]]
    totals: dict[str, int]
    payment_methods: list[dict[str, object]]
    products: list[dict[str, object]]
    categories: list[dict[str, object]]
    cashiers: list[dict[str, object]]
    channels: list[dict[str, object]]


async def sales_summary(
    uow: SqlAlchemyUnitOfWork, outlet_ids: list[str], start: date, end: date
) -> SalesSummary:
    """Back-office report from the read model only (never scans orders on the request path),
    summed over the given outlets (one outlet, a brand, or the whole company — ADR-022)."""
    days = (
        await uow.session.execute(
            select(
                DailySalesModel.business_date,
                *(func.sum(getattr(DailySalesModel, f)) for f in TOTAL_FIELDS),
            )
            .where(
                DailySalesModel.outlet_id.in_(outlet_ids),
                DailySalesModel.business_date.between(start, end),
            )
            .group_by(DailySalesModel.business_date)
            .order_by(DailySalesModel.business_date)
        )
    ).all()
    per_day = [(d[0], {f: int(v) for f, v in zip(TOTAL_FIELDS, d[1:], strict=True)}) for d in days]
    day_rows: list[dict[str, object]] = [
        {"business_date": day.isoformat(), **sums} for day, sums in per_day
    ]
    totals = {f: sum(sums[f] for _, sums in per_day) for f in TOTAL_FIELDS}

    in_range = (
        DailyPaymentSalesModel.outlet_id.in_(outlet_ids),
        DailyPaymentSalesModel.business_date.between(start, end),
    )
    payments = await uow.session.execute(
        select(
            DailyPaymentSalesModel.payment_method_id,
            func.max(DailyPaymentSalesModel.method_type),
            func.sum(DailyPaymentSalesModel.amount),
            func.sum(DailyPaymentSalesModel.count),
            func.sum(DailyPaymentSalesModel.refund_amount),
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
            func.sum(DailyProductSalesModel.refund_qty),
            func.sum(DailyProductSalesModel.refund_amount),
        )
        .where(
            DailyProductSalesModel.outlet_id.in_(outlet_ids),
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
            DailyCategorySalesModel.outlet_id.in_(outlet_ids),
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
                DailyCashierSalesModel.outlet_id.in_(outlet_ids),
                DailyCashierSalesModel.business_date.between(start, end),
            )
            .group_by(DailyCashierSalesModel.cashier_id)
            .order_by(func.sum(DailyCashierSalesModel.net).desc())
        )
    ).all()
    names = await identity.user_names(uow, [c for c, _, _ in cashier_rows])
    channel_rows = (
        await uow.session.execute(
            select(
                DailyChannelSalesModel.channel_id,
                func.sum(DailyChannelSalesModel.order_count),
                func.sum(DailyChannelSalesModel.gross),
                func.sum(DailyChannelSalesModel.net),
            )
            .where(
                DailyChannelSalesModel.outlet_id.in_(outlet_ids),
                DailyChannelSalesModel.business_date.between(start, end),
            )
            .group_by(DailyChannelSalesModel.channel_id)
            .order_by(func.sum(DailyChannelSalesModel.net).desc())
        )
    ).all()
    labels = await catalog.channel_labels(uow, [c for c, *_ in channel_rows])
    return SalesSummary(
        days=day_rows,
        totals=totals,
        payment_methods=[
            {
                "payment_method_id": m,
                "method_type": t,
                "amount": int(a),
                "count": int(c),
                "refund_amount": int(r),
            }
            for m, t, a, c, r in payments
        ],
        products=[
            {
                "product_id": p,
                "product_name": n,
                "quantity": int(q),
                "gross": int(g),
                "refund_qty": int(rq),
                "refund_amount": int(ra),
            }
            for p, n, q, g, rq, ra in products
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
        channels=[
            {
                "channel_id": c,
                "channel_name": labels.get(c, ("?", ""))[0],
                "kind": labels.get(c, ("?", ""))[1],
                "order_count": int(n),
                "gross": int(g),
                "net": int(v),
            }
            for c, n, g, v in channel_rows
        ],
    )


async def bill_void_report(
    uow: SqlAlchemyUnitOfWork, outlet_ids: list[str], start: date, end: date
) -> dict[str, object]:
    """Pre-payment voids (ADR-028) with the names of who cancelled and who approved."""
    voids = await sales.list_bill_voids(uow, outlet_ids, start, end)
    people = {str(v["cashier_id"]) for v in voids} | {
        str(v["approved_by"]) for v in voids if v["approved_by"]
    }
    names = await identity.user_names(uow, sorted(people))
    return {
        "voids": [
            v
            | {
                "cashier_name": names.get(str(v["cashier_id"]), ""),
                "approver_name": names.get(str(v["approved_by"])) if v["approved_by"] else None,
            }
            for v in voids
        ],
        "totals": {
            "count": len(voids),
            "amount": sum(int(str(v["amount"])) for v in voids),
        },
    }
