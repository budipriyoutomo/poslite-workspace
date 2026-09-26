from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.shared.infrastructure.outbox import OutboxMessageModel
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

Subscriber = Callable[[SqlAlchemyUnitOfWork, dict[str, object]], Awaitable[None]]


def combine_subscribers(*groups: Mapping[str, Subscriber]) -> dict[str, Subscriber]:
    """Several modules on one topic: they run in order, in the same transaction, so a failure
    retries the whole message and every subscriber must be idempotent."""
    by_topic: dict[str, list[Subscriber]] = {}
    for group in groups:
        for topic, subscriber in group.items():
            by_topic.setdefault(topic, []).append(subscriber)

    def chain(subs: list[Subscriber]) -> Subscriber:
        async def run(uow: SqlAlchemyUnitOfWork, payload: dict[str, object]) -> None:
            for sub in subs:
                await sub(uow, payload)

        return run

    return {topic: chain(subs) for topic, subs in by_topic.items()}


@dataclass(frozen=True, slots=True)
class RelayStats:
    published: int
    failed: int


async def relay_outbox(
    *,
    system: async_sessionmaker[AsyncSession],
    app: async_sessionmaker[AsyncSession],
    subscribers: Mapping[str, Subscriber],
    new_id: Callable[[], str],
    batch_size: int = 100,
) -> RelayStats:
    """Deliver unpublished outbox messages to their subscribers (ADR-012), at least once.

    The batch is claimed as poslite_system with FOR UPDATE SKIP LOCKED (concurrent relays never
    take the same message); each message is handled in its own tenant-scoped app transaction.
    A failure only bumps that message's attempts; it is retried on the next run.
    """
    published = failed = 0
    async with system() as claim, claim.begin():
        messages = (
            await claim.scalars(
                select(OutboxMessageModel)
                .where(OutboxMessageModel.published_at.is_(None))
                .order_by(OutboxMessageModel.created_at, OutboxMessageModel.id)
                .limit(batch_size)
                .with_for_update(skip_locked=True)
            )
        ).all()
        for message in messages:
            subscriber = subscribers.get(message.topic)
            try:
                if subscriber is not None:
                    async with SqlAlchemyUnitOfWork(
                        app, tenant_id=message.tenant_id, new_id=new_id
                    ) as uow:
                        await subscriber(uow, message.payload)
                        await uow.commit()
            except Exception as err:
                await claim.execute(
                    update(OutboxMessageModel)
                    .where(OutboxMessageModel.id == message.id)
                    .values(attempts=OutboxMessageModel.attempts + 1, last_error=str(err)[:500])
                )
                failed += 1
                continue
            await claim.execute(
                update(OutboxMessageModel)
                .where(OutboxMessageModel.id == message.id)
                .values(published_at=func.now())
            )
            published += 1
    return RelayStats(published, failed)
