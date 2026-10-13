import asyncio
from dataclasses import dataclass
from typing import cast

from sqlalchemy import case, delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.identity.domain.assignments import (
    Assignment,
    ScopeType,
    check_assignment,
    role_at_outlet,
)
from poslite.identity.domain.pin import PIN_ITERATIONS, hash_pin, new_pin_salt
from poslite.identity.domain.roles import ROLE_BY_ID, ROLE_IDS, Role
from poslite.identity.infrastructure.models import UserAssignmentModel, UserModel
from poslite.identity.infrastructure.passwords import hash_password, verify_password
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


async def add_assignments(
    uow: SqlAlchemyUnitOfWork, *, user_id: str, assignments: list[Assignment]
) -> None:
    uow.session.add_all(
        UserAssignmentModel(
            id=uow.new_id(),
            tenant_id=uow.tenant_id,
            user_id=user_id,
            role_id=ROLE_IDS[a.role],
            scope_type=a.scope_type,
            brand_id=a.brand_id,
            outlet_id=a.outlet_id,
        )
        for a in dict.fromkeys(assignments)
    )
    await uow.session.flush()


def _assignment(row: UserAssignmentModel) -> Assignment:
    return Assignment(
        role=ROLE_BY_ID[row.role_id],
        scope_type=cast(ScopeType, row.scope_type),  # CHECK constraint "scope"
        brand_id=row.brand_id,
        outlet_id=row.outlet_id,
    )


async def assignments_of(uow: SqlAlchemyUnitOfWork, user_id: str) -> list[Assignment]:
    rows = await uow.session.scalars(
        select(UserAssignmentModel)
        .where(UserAssignmentModel.user_id == user_id)
        .order_by(
            case(_SCOPE_ORDER, value=UserAssignmentModel.scope_type),
            UserAssignmentModel.brand_id,
            UserAssignmentModel.outlet_id,
        )
    )
    return [_assignment(r) for r in rows]


_SCOPE_ORDER = {"company": 0, "brand": 1, "outlet": 2}


async def _is_owner(uow: SqlAlchemyUnitOfWork, user_id: str) -> bool:
    return any(a.role == "owner" for a in await assignments_of(uow, user_id))


async def _ensure_another_owner(uow: SqlAlchemyUnitOfWork, user_id: str) -> None:
    """A company always keeps at least one active owner (doc 10)."""
    others = await uow.session.scalar(
        select(func.count())
        .select_from(UserAssignmentModel)
        .join(UserModel, UserModel.id == UserAssignmentModel.user_id)
        .where(
            UserAssignmentModel.role_id == ROLE_IDS["owner"],
            UserAssignmentModel.user_id != user_id,
            UserModel.deleted_at.is_(None),
            UserModel.is_active.is_(True),
        )
    )
    if not others:
        raise DomainError("LAST_OWNER", "The company needs another owner first", kind="conflict")


async def replace_assignments(
    uow: SqlAlchemyUnitOfWork, *, user_id: str, assignments: list[Assignment]
) -> None:
    """Replace every assignment of a user; re-versions the user so devices pull the new role."""
    user = await uow.session.get(UserModel, user_id)
    if user is None or user.deleted_at is not None:
        raise DomainError("USER_NOT_FOUND", kind="not_found")
    for a in assignments:
        check_assignment(a)
    if await _is_owner(uow, user_id) and not any(a.role == "owner" for a in assignments):
        await _ensure_another_owner(uow, user_id)
    await uow.session.execute(
        delete(UserAssignmentModel).where(UserAssignmentModel.user_id == user_id)
    )
    await uow.session.flush()
    await add_assignments(uow, user_id=user_id, assignments=assignments)
    user.updated_at = func.now()
    await uow.session.flush()


async def role_at(
    uow: SqlAlchemyUnitOfWork, *, user_id: str, outlet_id: str, brand_id: str
) -> Role | None:
    """Highest role among the user's assignments that cover the outlet of that brand (ADR-022)."""
    return role_at_outlet(
        await assignments_of(uow, user_id), outlet_id=outlet_id, brand_id=brand_id
    )


async def list_users(uow: SqlAlchemyUnitOfWork) -> list[tuple[UserModel, list[Assignment]]]:
    users = list(
        await uow.session.scalars(
            select(UserModel).where(UserModel.deleted_at.is_(None)).order_by(UserModel.name)
        )
    )
    return [(u, await assignments_of(uow, u.id)) for u in users]


async def get_user(uow: SqlAlchemyUnitOfWork, user_id: str) -> UserModel:
    user = await uow.session.get(UserModel, user_id)
    if user is None or user.deleted_at is not None:
        raise DomainError("USER_NOT_FOUND", kind="not_found")
    return user


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
    uow: SqlAlchemyUnitOfWork, *, outlet_id: str, brand_id: str, cursor: int, limit: int
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
            else await role_at(uow, user_id=user.id, outlet_id=outlet_id, brand_id=brand_id)
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


async def can_work(
    uow: SqlAlchemyUnitOfWork, *, user_id: str, outlet_id: str, brand_id: str
) -> bool:
    """Active user with a role at the outlet (owners work everywhere); checked per event."""
    user = await uow.session.get(UserModel, user_id)
    if user is None or user.deleted_at is not None or not user.is_active:
        return False
    role = await role_at(uow, user_id=user_id, outlet_id=outlet_id, brand_id=brand_id)
    return role is not None


async def can_approve(
    uow: SqlAlchemyUnitOfWork, *, user_id: str, outlet_id: str, brand_id: str, permission: str
) -> bool:
    """Active user whose role at the outlet holds `permission` (seeded role permissions)."""
    user = await uow.session.get(UserModel, user_id)
    if user is None or user.deleted_at is not None or not user.is_active:
        return False
    role = await role_at(uow, user_id=user_id, outlet_id=outlet_id, brand_id=brand_id)
    if role is None:
        return False
    granted = await uow.session.scalar(
        text(
            "SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id"
            " WHERE rp.role_id = :role AND p.name = :permission"
        ),
        {"role": ROLE_IDS[role], "permission": permission},
    )
    return granted is not None


async def update_user(
    uow: SqlAlchemyUnitOfWork,
    *,
    user_id: str,
    name: str,
    is_active: bool,
    assignments: list[Assignment] | None,
) -> None:
    """Replace name, status and (when given) assignments; the UPDATE re-versions the user."""
    user = await uow.session.get(UserModel, user_id)
    if user is None or user.deleted_at is not None:
        raise DomainError("USER_NOT_FOUND", kind="not_found")
    if user.is_active and not is_active and await _is_owner(uow, user_id):
        await _ensure_another_owner(uow, user_id)
    user.name, user.is_active, user.updated_at = name, is_active, func.now()
    if assignments is not None:
        await replace_assignments(uow, user_id=user_id, assignments=assignments)
    await uow.session.flush()


async def set_user_active(uow: SqlAlchemyUnitOfWork, *, user_id: str, is_active: bool) -> str:
    """(De)activate a user, e.g. by a platform operator; the last active owner stays. Returns the
    user's name. Callers revoke the user's tokens when deactivating."""
    user = await get_user(uow, user_id)
    if user.is_active and not is_active and await _is_owner(uow, user_id):
        await _ensure_another_owner(uow, user_id)
    user.is_active, user.updated_at = is_active, func.now()
    await uow.session.flush()
    return user.name


async def reset_password(uow: SqlAlchemyUnitOfWork, *, user_id: str, password: str) -> str:
    """Replace the password of a back-office login (support); PIN-only users have none. Returns
    the user's name. Callers revoke the user's tokens so every session must sign in again."""
    user = await get_user(uow, user_id)
    if user.email is None or user.password_hash is None:
        raise DomainError(
            "USER_HAS_NO_LOGIN", "This user signs in with a PIN only", kind="conflict"
        )
    user.password_hash = await hash_password(password)
    await uow.session.flush()
    return user.name


async def delete_user(uow: SqlAlchemyUnitOfWork, *, user_id: str, actor_id: str) -> None:
    if user_id == actor_id:
        raise DomainError(
            "CANNOT_DELETE_SELF", "You cannot delete your own account", kind="conflict"
        )
    user = await uow.session.get(UserModel, user_id)
    if user is None or user.deleted_at is not None:
        raise DomainError("USER_NOT_FOUND", kind="not_found")
    if await _is_owner(uow, user_id):
        await _ensure_another_owner(uow, user_id)
    user.deleted_at = func.now()
    await uow.session.flush()


async def user_names(uow: SqlAlchemyUnitOfWork, user_ids: list[str]) -> dict[str, str]:
    """Names for reports; deleted users keep their name (sales history outlives the account)."""
    rows = await uow.session.execute(
        select(UserModel.id, UserModel.name).where(UserModel.id.in_(user_ids))
    )
    return {user_id: name for user_id, name in rows}
