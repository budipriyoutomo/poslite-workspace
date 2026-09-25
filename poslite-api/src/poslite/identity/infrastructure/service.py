from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.identity.domain.roles import RANK, ROLE_BY_ID, ROLE_IDS, Role
from poslite.identity.infrastructure.models import OutletUserModel, UserModel
from poslite.identity.infrastructure.passwords import verify_password
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
