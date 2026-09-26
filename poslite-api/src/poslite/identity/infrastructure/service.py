import asyncio
from dataclasses import dataclass

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.identity.domain.pin import PIN_ITERATIONS, hash_pin, new_pin_salt
from poslite.identity.domain.roles import RANK, ROLE_BY_ID, ROLE_IDS, Role
from poslite.identity.infrastructure.models import OutletUserModel, UserModel
from poslite.identity.infrastructure.passwords import verify_password
from poslite.shared.application.sync import Change
from poslite.shared.domain.errors import DomainError
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


@dataclass(frozen=True, slots=True)
class Authenticated:
    user_id: str
    tenant_id: str
    name: str


async def email_taken(system: async_sessionmaker[AsyncSession], email: str) -> bool:
    async with system() as session:
        found = await session.scalar(
            select(UserModel.id).where(func.lower(UserModel.email) == email.lower())
        )
        return found is not None


async def authenticate(
    system: async_sessionmaker[AsyncSession], email: str, password: str
) -> Authenticated:
    """Email + password → user and tenant. Runs as poslite_system: the tenant is not known yet."""
    async with system() as session:
        user = await session.scalar(
            select(UserModel).where(
                func.lower(UserModel.email) == email.lower(),
                UserModel.deleted_at.is_(None),
                UserModel.is_active.is_(True),
            )
        )
    if (
        user is None
        or user.password_hash is None
        or not await verify_password(user.password_hash, password)
    ):
        raise DomainError("INVALID_CREDENTIALS", "Email or password is wrong", kind="unauthorized")
    return Authenticated(user_id=user.id, tenant_id=user.tenant_id, name=user.name)


async def create_user(
    uow: SqlAlchemyUnitOfWork,
    *,
    user_id: str,
    name: str,
    email: str | None,
    password_hash: str | None,
) -> None:
    uow.session.add(
        UserModel(
            id=user_id, tenant_id=uow.tenant_id, name=name, email=email, password_hash=password_hash
        )
    )
    await uow.session.flush()


async def assign_role(
    uow: SqlAlchemyUnitOfWork, *, user_id: str, outlet_id: str, role: Role
) -> None:
    uow.session.add(
        OutletUserModel(
            tenant_id=uow.tenant_id, outlet_id=outlet_id, user_id=user_id, role_id=ROLE_IDS[role]
        )
    )
    await uow.session.flush()


async def roles_of(uow: SqlAlchemyUnitOfWork, user_id: str) -> dict[str, Role]:
    rows = await uow.session.execute(
        select(OutletUserModel.outlet_id, OutletUserModel.role_id).where(
            OutletUserModel.user_id == user_id
        )
    )
    return {outlet_id: ROLE_BY_ID[role_id] for outlet_id, role_id in rows}


def highest(roles: dict[str, Role]) -> Role:
    return max(roles.values(), key=RANK.__getitem__, default="cashier")


async def role_at(uow: SqlAlchemyUnitOfWork, *, user_id: str, outlet_id: str) -> Role | None:
    """Role that applies at an outlet; an owner is owner at every outlet of the tenant."""
    roles = await roles_of(uow, user_id)
    if "owner" in roles.values():
        return "owner"
    return roles.get(outlet_id)


async def list_users(uow: SqlAlchemyUnitOfWork) -> list[tuple[UserModel, dict[str, Role]]]:
    users = list(
        await uow.session.scalars(
            select(UserModel).where(UserModel.deleted_at.is_(None)).order_by(UserModel.name)
        )
    )
    return [(u, await roles_of(uow, u.id)) for u in users]


async def set_pin(uow: SqlAlchemyUnitOfWork, *, user_id: str, pin: str) -> None:
    """Server-side PIN hash (fresh salt); devices get it through sync pull and verify offline."""
    user = await uow.session.get(UserModel, user_id)
    if user is None or user.deleted_at is not None:
        raise DomainError("USER_NOT_FOUND", kind="not_found")
    salt = new_pin_salt()
    user.pin_salt, user.pin_iterations = salt, PIN_ITERATIONS
    user.pin_hash = await asyncio.to_thread(hash_pin, pin, salt, PIN_ITERATIONS)
    await uow.session.flush()


async def user_changes(
    uow: SqlAlchemyUnitOfWork, *, outlet_id: str, cursor: int, limit: int
) -> list[Change]:
    """Users who may log in on the device's outlet, with their PIN hash for offline login.

    Every tenant user is considered (role changes touch users.version); anyone deleted, inactive or
    without a role at this outlet is sent as a delete so the device forgets them.
    """
    rows = await uow.session.scalars(
        select(UserModel)
        .where(UserModel.version > cursor)
        .order_by(UserModel.version)
        .limit(limit + 1)
    )
    changes: list[Change] = []
    for user in rows:
        role = (
            None
            if user.deleted_at or not user.is_active
            else await role_at(uow, user_id=user.id, outlet_id=outlet_id)
        )
        if role is None:
            changes.append(
                Change(entity="user", op="delete", id=user.id, version=user.version, data=None)
            )
            continue
        changes.append(
            Change(
                entity="user",
                op="upsert",
                id=user.id,
                version=user.version,
                data={
                    "name": user.name,
                    "role": role,
                    "pin_hash": user.pin_hash,
                    "pin_salt": user.pin_salt,
                    "pin_iterations": user.pin_iterations,
                },
            )
        )
    return changes


async def can_work(uow: SqlAlchemyUnitOfWork, *, user_id: str, outlet_id: str) -> bool:
    """Active user with a role at the outlet (owners work everywhere); checked per event."""
    user = await uow.session.get(UserModel, user_id)
    if user is None or user.deleted_at is not None or not user.is_active:
        return False
    return await role_at(uow, user_id=user_id, outlet_id=outlet_id) is not None


async def update_user(
    uow: SqlAlchemyUnitOfWork,
    *,
    user_id: str,
    name: str,
    is_active: bool,
    outlets: list[tuple[str, Role]],
) -> None:
    """Replace name, status and outlet roles; the UPDATE re-versions the user (ADR-009)."""
    user = await uow.session.get(UserModel, user_id)
    if user is None or user.deleted_at is not None:
        raise DomainError("USER_NOT_FOUND", kind="not_found")
    user.name, user.is_active, user.updated_at = name, is_active, func.now()
    await uow.session.execute(delete(OutletUserModel).where(OutletUserModel.user_id == user_id))
    await uow.session.flush()
    for outlet_id, role in outlets:
        await assign_role(uow, user_id=user_id, outlet_id=outlet_id, role=role)


async def delete_user(uow: SqlAlchemyUnitOfWork, *, user_id: str, actor_id: str) -> None:
    if user_id == actor_id:
        raise DomainError(
            "CANNOT_DELETE_SELF", "You cannot delete your own account", kind="conflict"
        )
    user = await uow.session.get(UserModel, user_id)
    if user is None or user.deleted_at is not None:
        raise DomainError("USER_NOT_FOUND", kind="not_found")
    user.deleted_at = func.now()
    await uow.session.flush()


async def user_names(uow: SqlAlchemyUnitOfWork, user_ids: list[str]) -> dict[str, str]:
    """Names for reports; deleted users keep their name (sales history outlives the account)."""
    rows = await uow.session.execute(
        select(UserModel.id, UserModel.name).where(UserModel.id.in_(user_ids))
    )
    return {user_id: name for user_id, name in rows}
