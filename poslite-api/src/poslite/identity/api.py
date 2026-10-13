"""Public API of the identity module (other modules import only this)."""

from poslite.identity.domain.access import AccessScope
from poslite.identity.domain.assignments import Assignment
from poslite.identity.domain.roles import (
    BACKOFFICE_ABILITIES,
    DEVICE_ABILITIES,
    Role,
    can_activate_devices,
)
from poslite.identity.infrastructure.passwords import hash_password, verify_password
from poslite.identity.infrastructure.service import (
    Authenticated,
    add_assignments,
    authenticate,
    can_approve,
    can_work,
    create_user,
    email_taken,
    reset_password,
    role_at,
    set_user_active,
    user_changes,
    user_names,
)
from poslite.identity.infrastructure.tokens import (
    SqlTokenResolver,
    hash_token,
    issue_token,
    revoke_token,
    revoke_tokens_of,
)
from poslite.identity.presentation.access import (
    Access,
    BrandHeader,
    CompanyAccess,
    ManagedBrand,
    ReadBrand,
    company_only,
    ensure_outlet,
    require_company,
)
from poslite.identity.presentation.schemas import AuthResult, TenantOut
from poslite.identity.presentation.session import start_backoffice_session

__all__ = [
    "BACKOFFICE_ABILITIES",
    "DEVICE_ABILITIES",
    "Access",
    "AccessScope",
    "Assignment",
    "AuthResult",
    "Authenticated",
    "BrandHeader",
    "CompanyAccess",
    "ManagedBrand",
    "ReadBrand",
    "Role",
    "SqlTokenResolver",
    "TenantOut",
    "add_assignments",
    "authenticate",
    "can_activate_devices",
    "can_approve",
    "can_work",
    "company_only",
    "create_user",
    "email_taken",
    "ensure_outlet",
    "hash_password",
    "hash_token",
    "issue_token",
    "require_company",
    "reset_password",
    "revoke_token",
    "revoke_tokens_of",
    "role_at",
    "set_user_active",
    "start_backoffice_session",
    "user_changes",
    "user_names",
    "verify_password",
]
