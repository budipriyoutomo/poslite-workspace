from poslite.sales.api import (
    OrderRepository,
    PlaceOrderHandler,
    RefundOrderHandler,
    SqlAlchemyOrderRepository,
    VoidBillItemsHandler,
    VoidOrderHandler,
)
from poslite.shared.application.sync import DeviceContext
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from poslite.shift.api import (
    CloseShiftHandler,
    MoveCashHandler,
    OpenShiftHandler,
    ShiftRepository,
    SqlAlchemyShiftRepository,
)
from poslite.sync.application.events import IncomingEvent
from poslite.sync.application.push_events import EventRegistry, EventResult, PushEventsHandler
from poslite.sync.infrastructure.adapters import (
    IdentityApprovers,
    IdentityCashiers,
    OrganizationOutlets,
    PaymentMethods,
    PaymentQris,
    ShiftStatuses,
)
from poslite.sync.infrastructure.repository import SqlAlchemySyncEventRepository


class PushUnitOfWork:
    """The push transaction seen through the module repositories (one session, one tenant)."""

    def __init__(self, uow: SqlAlchemyUnitOfWork) -> None:
        self._uow = uow
        self.orders: OrderRepository = SqlAlchemyOrderRepository(uow.session, uow.tenant_id)
        self.shifts: ShiftRepository = SqlAlchemyShiftRepository(uow.session, uow.tenant_id)
        self.record = uow.record
        self.savepoint = uow.savepoint
        self.lock_device = uow.lock_device


async def push_events(
    uow: SqlAlchemyUnitOfWork, ctx: DeviceContext, events: list[IncomingEvent]
) -> list[EventResult]:
    """Composition root of a push: wire use cases to this transaction and run the batch."""
    outlets, cashiers, approvers = (
        OrganizationOutlets(uow),
        IdentityCashiers(uow),
        IdentityApprovers(uow),
    )
    push_uow = PushUnitOfWork(uow)
    shifts = ShiftStatuses(push_uow.shifts)
    handler = PushEventsHandler(
        EventRegistry(
            place_order=PlaceOrderHandler(
                outlets, cashiers, PaymentQris(uow), PaymentMethods(uow), approvers
            ),
            open_shift=OpenShiftHandler(outlets, cashiers),
            close_shift=CloseShiftHandler(cashiers),
            move_cash=MoveCashHandler(cashiers),
            void_order=VoidOrderHandler(cashiers, approvers, shifts),
            refund_order=RefundOrderHandler(outlets, cashiers, approvers, shifts),
            void_bill_items=VoidBillItemsHandler(outlets, cashiers, approvers, shifts),
        )
    )
    return await handler(
        ctx, events, push_uow, SqlAlchemySyncEventRepository(uow.session, uow.tenant_id)
    )
