from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from poslite.shared.domain.errors import DomainError


async def flush_or_conflict(session: AsyncSession) -> None:
    """Flush device-supplied rows; a unique violation becomes a per-event rejection, not a 500.

    With RLS a row of another tenant is invisible, so an id collision surfaces only here.
    """
    try:
        await session.flush()
    except IntegrityError as err:
        if "refund_no" in str(err.orig):
            raise DomainError(
                "REFUND_NO_TAKEN", "Refund number already used", kind="conflict"
            ) from err
        if "receipt_no" in str(err.orig):
            raise DomainError(
                "RECEIPT_NO_TAKEN", "Receipt number already used", kind="conflict"
            ) from err
        raise DomainError(
            "ID_CONFLICT", "An id in this event is already used", kind="conflict"
        ) from err
