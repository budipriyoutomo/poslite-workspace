from datetime import timedelta

from poslite.identity.domain.roles import BACKOFFICE_ABILITIES
from poslite.identity.infrastructure.service import highest, roles_of
from poslite.identity.infrastructure.tokens import issue_token
from poslite.identity.presentation.schemas import AuthResult, TenantOut, UserOut
from poslite.shared.application.clock import Clock
from poslite.shared.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

BACKOFFICE_TOKEN_TTL = timedelta(hours=12)


async def start_backoffice_session(
    uow: SqlAlchemyUnitOfWork,
    *,
    user_id: str,
    name: str,
    tenant: TenantOut,
    token_id: str,
    clock: Clock,
) -> AuthResult:
    """Back-office access token (opaque, 12 h) for an owner/manager, with tenant and role info."""
    expires_at = clock.now() + BACKOFFICE_TOKEN_TTL
    token = await issue_token(
        uow,
        token_id=token_id,
        owner_type="user",
        owner_id=user_id,
        abilities=BACKOFFICE_ABILITIES,
        expires_at=expires_at,
    )
    role = highest(await roles_of(uow, user_id))
    return AuthResult(
        token=token,
        expires_at=expires_at,
        user=UserOut(id=user_id, name=name, role=role),
        tenant=tenant,
    )
