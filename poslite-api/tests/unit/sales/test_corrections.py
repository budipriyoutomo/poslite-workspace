"""ADR-023 rules for corrections: a void cancels a whole order in its own shift; a refund is a
new document, possibly partial, that is flagged — never rejected — when the numbers disagree."""

from dataclasses import replace
from datetime import UTC, date, datetime

import pytest

from poslite.sales.domain.corrections import (
    OrderForCorrection,
    OrderVoid,
    Refund,
    RefundLineData,
    RefundOrderData,
    RefundPaymentData,
    SoldLine,
    VoidOrderData,
)
from poslite.shared.domain.errors import DomainError

AT = datetime(2026, 10, 7, 9, 0, tzinfo=UTC)
GUDEG = SoldLine(
    id="L1",
    product_id="P1",
    product_name="Nasi Gudeg",
    quantity=2,
    gross=70_000,
    line_discount=0,
    refunded=0,
)
ORDER = OrderForCorrection(
    id="O1",
    outlet_id="T1",
    device_id="D1",
    shift_id="S1",
    status="paid",
    business_date=date(2026, 10, 6),
    total=72_765,
    discount_amount=7_000,
    lines=(GUDEG,),
    has_refund=False,
)
VOID = VoidOrderData(
    order_id="O1", reason="Salah input", voided_by="U1", approved_by="U2", occurred_at=AT
)


def refund(
    *lines: RefundLineData, total: int | None = None, paid: int | None = None
) -> RefundOrderData:
    amount = sum(line.amount for line in lines) if total is None else total
    return RefundOrderData(
        refund_id="R1",
        order_id="O1",
        shift_id="S2",
        refund_no="JKT01A-R261007-0001",
        reason="Pelanggan komplain",
        refunded_by="U1",
        approved_by="U2",
        lines=lines,
        total=amount,
        payments=(
            RefundPaymentData("Y1", "PM1", "cash", "Tunai", amount if paid is None else paid, None),
        ),
        occurred_at=AT,
    )


# ── Void ─────────────────────────────────────────────────────────────────────────────────────


def test_voids_a_paid_order_of_this_device_in_its_open_shift() -> None:
    void = OrderVoid.of(ORDER, VOID, device_id="D1", shift_open=True)

    assert (void.order_id, void.device_id, void.reason) == ("O1", "D1", "Salah input")
    assert void.events[0].to_payload() == {
        "order_id": "O1",
        "outlet_id": "T1",
        "business_date": "2026-10-06",
    }


@pytest.mark.parametrize(
    ("order", "device", "shift_open", "code"),
    [
        (replace(ORDER, status="voided"), "D1", True, "ORDER_ALREADY_VOIDED"),
        (ORDER, "D2", True, "VOID_NOT_ALLOWED"),
        (ORDER, "D1", False, "VOID_NOT_ALLOWED"),
        (replace(ORDER, has_refund=True), "D1", True, "VOID_NOT_ALLOWED"),
    ],
)
def test_rejects_a_void_outside_its_rules(
    order: OrderForCorrection, device: str, shift_open: bool, code: str
) -> None:
    with pytest.raises(DomainError) as error:
        OrderVoid.of(order, VOID, device_id=device, shift_open=shift_open)

    assert error.value.code == code


# ── Refund ───────────────────────────────────────────────────────────────────────────────────


def record(cmd: RefundOrderData, order: OrderForCorrection = ORDER) -> Refund:
    return Refund.record(order, cmd, device_id="D1", business_date=date(2026, 10, 7))


def test_records_a_partial_refund_with_the_server_amount() -> None:
    r = record(refund(RefundLineData("L1", 1, 36_383)))

    assert (r.total, r.flags, r.business_date) == (36_383, (), date(2026, 10, 7))
    assert [(line.product_name, line.quantity, line.amount) for line in r.lines] == [
        ("Nasi Gudeg", 1, 36_383)
    ]
    assert r.events[0].to_payload() == {
        "refund_id": "R1",
        "order_id": "O1",
        "outlet_id": "T1",
        "business_date": "2026-10-07",
    }


def test_flags_an_amount_the_server_computes_differently() -> None:
    assert record(refund(RefundLineData("L1", 1, 36_000))).flags == ("TOTAL_MISMATCH",)


def test_flags_more_units_than_are_left_but_keeps_the_refund() -> None:
    order = replace(ORDER, lines=(replace(GUDEG, refunded=2),))

    assert record(refund(RefundLineData("L1", 1, 36_383)), order).flags == ("REFUND_EXCEEDS_ORDER",)


def test_flags_a_refund_of_a_voided_order() -> None:
    order = replace(ORDER, status="voided")

    assert "REFUND_ON_VOIDED" in record(refund(RefundLineData("L1", 1, 36_383)), order).flags


@pytest.mark.parametrize(
    ("cmd", "code"),
    [
        (refund(RefundLineData("L9", 1, 100)), "REFUND_INVALID_LINE"),
        (refund(RefundLineData("L1", 1, 36_383), paid=30_000), "REFUND_PAYMENT_MISMATCH"),
    ],
)
def test_rejects_a_refund_that_breaks_its_own_document(cmd: RefundOrderData, code: str) -> None:
    with pytest.raises(DomainError) as error:
        record(cmd)

    assert error.value.code == code
