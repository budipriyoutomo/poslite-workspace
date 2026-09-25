"""Public API of the identity module (other modules import only this)."""

from poslite.identity.domain.roles import (
    BACKOFFICE_ABILITIES,
    DEVICE_ABILITIES,
    Role,
    can_activate_devices,
)
from poslite.identity.infrastructure.passwords import hash_password
from poslite.identity.infrastructure.service import (
    Authenticated,
    assign_role,
    authenticate,
    create_user,
    email_taken,
    highest,
    role_at,
    roles_of,
    user_changes,
)
from poslite.identity.infrastructure.tokens import SqlTokenResolver, issue_token, revoke_token
from poslite.identity.presentation.schemas import AuthResult, TenantOut
from poslite.identity.presentation.session import start_backoffice_session

__all__ = [
    "BACKOFFICE_ABILITIES",
    "DEVICE_ABILITIES",
    "AuthResult",
    "Authenticated",
    "Role",
    "SqlTokenResolver",
    "TenantOut",
    "assign_role",
    "authenticate",
    "can_activate_devices",
    "create_user",
    "email_taken",
    "hash_password",
    "highest",
    "issue_token",
    "revoke_token",
    "role_at",
    "roles_of",
    "start_backoffice_session",
    "user_changes",
]
