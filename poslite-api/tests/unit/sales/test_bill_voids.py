"""ADR-028: items cancelled from an open bill after the kitchen had them are an immutable record,
kept for the leakage report — they never touch sales or the drawer."""

from datetime import UTC, date, datetime

from poslite.sales.domain.bill_voids import BillVoid, VoidBillItemsData, VoidedBillLine
from poslite.sales.domain.events import BillItemsVoided

AT = datetime(2026, 10, 7, 5, 10, tzinfo=UTC)
GUDEG = VoidedBillLine(
    product_id="P1",
    product_name="Nasi Gudeg",
    modifiers=("Tambah Ayam",),
    unit_price=35_000,
    quantity=2,
    amount=70_000,
)
TEH = VoidedBillLine(
    product_id="P2", product_name="Es Teh", modifiers=(), unit_price=8_000, quantity=1, amount=8_000
)
CMD = VoidBillItemsData(
    void_id="V1",
    bill_id="B1",
    scope="bill_cancelled",
    table_label="A3",
    shift_id="S1",
    cashier_id="U1",
    approved_by="U2",
    reason="Pelanggan batal",
    lines=(GUDEG, TEH),
    occurred_at=AT,
)


def record() -> BillVoid:
    return BillVoid.record(CMD, outlet_id="T1", device_id="D1", business_date=date(2026, 10, 7))


def test_the_void_amount_is_the_sum_of_its_lines() -> None:
    assert record().amount == 78_000


def test_the_void_is_reported_on_its_own_business_day() -> None:
    assert record().events == [BillItemsVoided("V1", "T1", "2026-10-07")]


def test_the_record_keeps_who_cancelled_and_who_approved() -> None:
    void = record()

    assert (void.cashier_id, void.approved_by, void.reason) == ("U1", "U2", "Pelanggan batal")
