from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from poslite.sync.application.events import IncomingEvent
from poslite.sync.application.push_events import EventResult
from poslite.sync.infrastructure.models import SyncEventModel


class SqlAlchemySyncEventRepository:
    def __init__(self, session: AsyncSession, tenant_id: str) -> None:
        self._session, self._tenant_id = session, tenant_id

    async def status_of(self, event_id: str) -> str | None:
        return await self._session.scalar(
            select(SyncEventModel.status).where(SyncEventModel.id == event_id)
        )

    async def save(self, event: IncomingEvent, device_id: str, result: EventResult) -> None:
        """Insert; for a re-sent rejected event, overwrite the outcome and count the attempt."""
        values = {
            "status": result.status,
            "error_code": result.code,
            "flags": list(result.flags),
            "payload": event.payload,
        }
        statement = insert(SyncEventModel).values(
            id=event.id,
            tenant_id=self._tenant_id,
            device_id=device_id,
            type=event.type,
            aggregate_id=event.aggregate_id,
            **values,
        )
        await self._session.execute(
            statement.on_conflict_do_update(
                index_elements=[SyncEventModel.tenant_id, SyncEventModel.id],
                set_={
                    **values,
                    "attempts": SyncEventModel.attempts + 1,
                    "processed_at": func.now(),
                },
            )
        )
