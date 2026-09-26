from dataclasses import replace
from datetime import UTC, date, datetime

import pytest

from poslite.sales.domain.entities import LineModifier, Order, OrderLine, Payment, PlaceOrderData
from poslite.sales.domain.events import OrderPlaced
from poslite.sales.domain.value_objects import Discount, PriceBreakdown, Rates
from poslite.shared.domain.errors import DomainError

RATES = Rates(service_bps=500, tax_bps=1000)
GUDEG = OrderLine(
    id="L1",
    product_id="P1",
    product_name="Nasi Gudeg",
    category_name="Makanan",
    unit_price=25_000,
    quantity=2,
    notes="tidak pedas",
    modifiers=(LineModifier(modifier_option_id="M1", name="Tambah Ayam", price=10_000),),
)
# 70.000 - 10% = 63.000; service 3.150; PB1 6.615 → 72.765 (07-api-contract.md push example)
TOTALS = PriceBreakdown(
    subtotal=70_000, discount_amount=7_000, service_charge=3_150, tax=6_615, total=72_765
)
DATA = PlaceOrderData(
    order_id="O1",
    shift_id="S1",
    receipt_no="JKT01A-260925-0042",
    cashier_id="U1",
    order_type="take_away",
    lines=(GUDEG,),
    discount=Discount("percentage", 10),
    rates=RATES,
    totals=TOTALS,
    payments=(
        Payment(
            id="Y1", payment_method_id="CASH", method_type="cash", amount=100_000, reference=None
        ),
    ),
    change_amount=27_235,
    occurred_at=datetime(2026, 9, 25, 4, 3, tzinfo=UTC),
)


def place(data: PlaceOrderData = DATA, current_rates: Rates = RATES) -> Order:
    return Order.place(
        data,
        outlet_id="T1",
        device_id="D1",
        business_date=date(2026, 9, 25),
        current_rates=current_rates,
    )


def test_a_consistent_order_is_placed_without_flags() -> None:
    order = place()

    assert order.status == "paid"
    assert order.flags == ()
    assert order.paid_amount == 100_000


def test_totals_are_recomputed_with_the_rates_snapshot_and_a_mismatch_is_flagged_not_rejected() -> (
    None
):
    order = place(
        replace(DATA, totals=replace(TOTALS, tax=6_600, total=72_750), change_amount=27_250)
    )

    assert order.flags == ("TOTAL_MISMATCH",)
    assert order.totals.total == 72_750  # what the customer paid and the receipt shows is kept


def test_rates_that_differ_from_the_outlets_current_rates_are_flagged() -> None:
    order = place(current_rates=Rates(service_bps=500, tax_bps=1100))

    assert order.flags == ("RATES_OUTDATED",)


def test_records_an_order_placed_event() -> None:
    order = place()

    assert [type(e) for e in order.events] == [OrderPlaced]
    assert order.events[0].to_payload()["total"] == 72_765


@pytest.mark.parametrize(
    ("change", "code"),
    [
        ({"lines": ()}, "ORDER_WITHOUT_LINES"),
        ({"payments": ()}, "ORDER_WITHOUT_PAYMENT"),
        (
            {
                "payments": (
                    Payment(
                        id="Y1",
                        payment_method_id="CASH",
                        method_type="cash",
                        amount=50_000,
                        reference=None,
                    ),
                )
            },
            "PAYMENT_INSUFFICIENT",
        ),
        (
            {
                "payments": (
                    Payment(
                        id="Y1",
                        payment_method_id="BCA",
                        method_type="debit",
                        amount=80_000,
                        reference="1",
                    ),
                )
            },
            "NON_CASH_EXCEEDS_TOTAL",
        ),
    ],
)
def test_rejects_orders_that_break_payment_rules(change: dict[str, object], code: str) -> None:
    with pytest.raises(DomainError) as err:
        place(replace(DATA, **change))  # type: ignore[arg-type]  # parametrized field overrides

    assert err.value.code == code
