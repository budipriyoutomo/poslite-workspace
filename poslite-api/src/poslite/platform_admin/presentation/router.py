"""/platform/* — the SaaS operator console (ADR-025). Operator tokens only; every change is
audited. Reads run as poslite_system; changes to a tenant's users run in that tenant's own
transaction (RLS applies) through identity's api."""

import secrets
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from poslite.billing import api as billing
from poslite.identity import api as identity
from poslite.platform_admin.domain.totp import otpauth_uri
from poslite.platform_admin.infrastructure import audit, service, tenants
from poslite.platform_admin.presentation.schemas import (
    AuditEntryOut,
    ExtendTrialIn,
    ExtendTrialOut,
    LoginIn,
    LoginOut,
    OperatorIn,
    OperatorOut,
    PasswordResetOut,
    SessionOut,
    SummaryOut,
    TenantDetailOut,
    TenantListItem,
    TenantSubscriptionOut,
    TwoFactorIn,
    UserHitOut,
)
from poslite.shared.application.clock import Clock
from poslite.shared.domain.errors import DomainError
from poslite.shared.presentation import rate_limit
from poslite.shared.presentation.dependencies import clock, open_uow, system_sessions
from poslite.shared.presentation.envelope import ApiResponse, ok
from poslite.shared.presentation.schemas import Ulid

router = APIRouter(prefix="/platform", tags=["platform"])
System = Annotated[async_sessionmaker[AsyncSession], Depends(system_sessions)]
Now = Annotated[Clock, Depends(clock)]
Limit = Annotated[int, Query(ge=1, le=200)]
Offset = Annotated[int, Query(ge=0)]
_bearer = HTTPBearer(auto_error=False)


async def current_admin(
    system: System, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]
) -> str:
    """Operator tokens live in platform_tokens only; tenant tokens never resolve here."""
    admin_id = credentials and await service.resolve_admin(system, credentials.credentials)
    if not admin_id:
        raise DomainError(
            "UNAUTHENTICATED", "Invalid or expired operator token", kind="unauthorized"
        )
    return admin_id


Admin = Annotated[str, Depends(current_admin)]


def _page[T](data: list[T], *, total: int, limit: int, offset: int) -> ApiResponse[list[T]]:
    return ApiResponse[list[T]](data=data, meta={"total": total, "limit": limit, "offset": offset})


# --- Auth & operators --------------------------------------------------------------------


@router.post("/auth/login", response_model_exclude_none=True)
async def login(body: LoginIn, request: Request, system: System, now: Now) -> ApiResponse[LoginOut]:
    await rate_limit.enforce(
        request,
        (rate_limit.OPERATOR_LOGIN_IP, rate_limit.client_address(request)),
        (rate_limit.OPERATOR_LOGIN_EMAIL, rate_limit.email_subject(body.email)),
    )
    challenge = await service.login(system, email=body.email, password=body.password, now=now.now())
    return ok(
        LoginOut(
            challenge_token=challenge.token,
            expires_at=challenge.expires_at,
            step=challenge.step,
            totp_secret=challenge.secret,
            otpauth_uri=challenge.secret and otpauth_uri(challenge.secret, challenge.account),
        )
    )


@router.post("/auth/2fa")
async def second_factor(
    body: TwoFactorIn, request: Request, system: System, now: Now
) -> ApiResponse[SessionOut]:
    """A TOTP code (or a recovery code) after the password opens the console (P1-8)."""
    await rate_limit.enforce(
        request, (rate_limit.OPERATOR_2FA_IP, rate_limit.client_address(request))
    )
    admin_id, signed_in = await service.complete_login(
        system,
        challenge=body.challenge_token,
        code=body.code,
        recovery_code=body.recovery_code,
        now=now.now(),
    )
    if signed_in.recovery_codes:
        await audit.record(
            system, admin_id=admin_id, action="operator.2fa_enabled", target_id=admin_id
        )
    return ok(
        SessionOut(
            token=signed_in.token,
            expires_at=signed_in.expires_at,
            recovery_codes=signed_in.recovery_codes,
        )
    )


@router.get("/me")
async def me(system: System, admin: Admin) -> ApiResponse[OperatorOut]:
    return ok(
        OperatorOut.model_validate(await service.get_admin(system, admin), from_attributes=True)
    )


@router.get("/operators")
async def operators(system: System, _: Admin) -> ApiResponse[list[OperatorOut]]:
    return ok(
        [
            OperatorOut.model_validate(o, from_attributes=True)
            for o in await service.list_admins(system)
        ]
    )


@router.post("/operators", status_code=status.HTTP_201_CREATED)
async def create_operator(
    body: OperatorIn, system: System, admin: Admin
) -> ApiResponse[OperatorOut]:
    new_id = await service.create_admin(
        system, email=body.email, name=body.name, password=body.password
    )
    await audit.record(
        system,
        admin_id=admin,
        action="operator.create",
        target_id=new_id,
        detail={"email": body.email},
    )
    return ok(
        OperatorOut.model_validate(await service.get_admin(system, new_id), from_attributes=True)
    )


async def _set_operator(
    system: System, actor: str, operator_id: str, *, disabled: bool
) -> OperatorOut:
    operator = await service.set_admin_disabled(
        system, actor_id=actor, admin_id=operator_id, disabled=disabled
    )
    await audit.record(
        system,
        admin_id=actor,
        action="operator.disable" if disabled else "operator.enable",
        target_id=operator_id,
        detail={"email": operator.email},
    )
    return OperatorOut.model_validate(operator, from_attributes=True)


@router.post("/operators/{operator_id}/disable")
async def disable_operator(
    operator_id: Ulid, system: System, admin: Admin
) -> ApiResponse[OperatorOut]:
    """The operator is signed out everywhere and cannot sign in until enabled again."""
    return ok(await _set_operator(system, admin, operator_id, disabled=True))


@router.post("/operators/{operator_id}/reset-2fa")
async def reset_two_factor(operator_id: Ulid, system: System, admin: Admin) -> ApiResponse[None]:
    """A lost authenticator: the operator sets 2FA up again at the next sign-in."""
    if operator_id == admin:
        raise DomainError("CANNOT_RESET_SELF", "Ask another operator to reset your 2FA")
    await service.reset_two_factor(system, operator_id)
    await audit.record(system, admin_id=admin, action="operator.2fa_reset", target_id=operator_id)
    return ok(None)


@router.post("/operators/{operator_id}/enable")
async def enable_operator(
    operator_id: Ulid, system: System, admin: Admin
) -> ApiResponse[OperatorOut]:
    return ok(await _set_operator(system, admin, operator_id, disabled=False))


# --- Platform overview ---------------------------------------------------------------------


@router.get("/summary")
async def summary(system: System, _: Admin) -> ApiResponse[SummaryOut]:
    return ok(SummaryOut.model_validate(await tenants.summary(system), from_attributes=True))


@router.get("/audit")
async def audit_log(
    system: System,
    _: Admin,
    tenant_id: Annotated[Ulid | None, Query()] = None,
    limit: Limit = 50,
    offset: Offset = 0,
) -> ApiResponse[list[AuditEntryOut]]:
    rows, total = await audit.entries(system, tenant_id=tenant_id, limit=limit, offset=offset)
    return _page(
        [AuditEntryOut.model_validate(r, from_attributes=True) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


# --- Tenants -------------------------------------------------------------------------------


@router.get("/tenants")
async def tenant_list(
    system: System,
    _: Admin,
    status: Annotated[Literal["active", "suspended"] | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Limit = 50,
    offset: Offset = 0,
) -> ApiResponse[list[TenantListItem]]:
    rows, total = await tenants.list_tenants(
        system, status=status, q=(q or "").strip() or None, limit=limit, offset=offset
    )
    return _page(
        [TenantListItem.model_validate(t, from_attributes=True) for t in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/tenants/{tenant_id}")
async def tenant_detail(tenant_id: Ulid, system: System, _: Admin) -> ApiResponse[TenantDetailOut]:
    async with system() as session:
        found = await tenants.tenant_detail(session, tenant_id)
        sub = await billing.subscription_of(session, tenant_id)
    return ok(
        TenantDetailOut.model_validate(
            {
                **TenantListItem.model_validate(found.tenant, from_attributes=True).model_dump(),
                "owners": found.owners,
                "outlets": found.outlets,
                "users": found.users,
                "devices": found.devices,
                "subscription": sub and TenantSubscriptionOut.model_validate(sub.model_dump()),
                "invoices": [i.model_dump() for i in sub.invoices] if sub else [],
            },
            from_attributes=True,
        )
    )


async def _set_tenant_status(system: System, admin: str, tenant_id: str, new_status: str) -> None:
    await service.set_tenant_status(system, tenant_id, new_status)
    action = "tenant.suspend" if new_status == "suspended" else "tenant.activate"
    await audit.record(system, admin_id=admin, action=action, tenant_id=tenant_id)


@router.post("/tenants/{tenant_id}/suspend")
async def suspend(tenant_id: Ulid, system: System, admin: Admin) -> ApiResponse[None]:
    """Back-office writes stop; devices keep pushing sales (05 "Multi-tenancy")."""
    await _set_tenant_status(system, admin, tenant_id, "suspended")
    return ok(None)


@router.post("/tenants/{tenant_id}/activate")
async def activate(tenant_id: Ulid, system: System, admin: Admin) -> ApiResponse[None]:
    """Lifts any suspension, a billing one included."""
    await _set_tenant_status(system, admin, tenant_id, "active")
    return ok(None)


@router.post("/tenants/{tenant_id}/extend-trial")
async def extend_trial(
    tenant_id: Ulid, body: ExtendTrialIn, system: System, admin: Admin
) -> ApiResponse[ExtendTrialOut]:
    async with system() as session, session.begin():
        tenant = await tenants.tenant_row(session, tenant_id)
        ends = await billing.extend_trial(
            session, tenant_id=tenant_id, signed_up_at=tenant.created_at, days=body.days
        )
    await audit.record(
        system,
        admin_id=admin,
        action="subscription.extend_trial",
        tenant_id=tenant_id,
        detail={"days": body.days},
    )
    return ok(ExtendTrialOut(trial_ends_at=ends))


@router.post("/invoices/{invoice_id}/mark-paid")
async def mark_invoice_paid(
    invoice_id: Ulid, system: System, admin: Admin, now: Now
) -> ApiResponse[None]:
    """Payment received outside the gateway (e.g. bank transfer); same effect as the webhook."""
    async with system() as session, session.begin():
        tenant_id = await billing.settle_invoice(session, invoice_id, now.now())
    await audit.record(
        system,
        admin_id=admin,
        action="invoice.mark_paid",
        tenant_id=tenant_id,
        target_id=invoice_id,
    )
    return ok(None)


# --- Users of a tenant ---------------------------------------------------------------------


@router.get("/users")
async def user_search(
    system: System, _: Admin, q: Annotated[str, Query(min_length=2, max_length=100)]
) -> ApiResponse[list[UserHitOut]]:
    hits = await tenants.search_users(system, q=q.strip(), limit=50)
    return ok([UserHitOut.model_validate(h, from_attributes=True) for h in hits])


async def _ensure_tenant(system: System, tenant_id: str) -> None:
    async with system() as session:
        await tenants.tenant_row(session, tenant_id)


@router.post("/tenants/{tenant_id}/users/{user_id}/reset-password")
async def reset_password(
    tenant_id: Ulid, user_id: Ulid, request: Request, system: System, admin: Admin
) -> ApiResponse[PasswordResetOut]:
    """A temporary password, shown to the operator once; every session of the user ends.

    Runs in the tenant's own transaction (RLS): a user of another tenant is not found."""
    await _ensure_tenant(system, tenant_id)
    password = secrets.token_urlsafe(12)
    async with open_uow(request, tenant_id) as uow:
        name = await identity.reset_password(uow, user_id=user_id, password=password)
        await identity.revoke_tokens_of(uow, owner_type="user", owner_id=user_id)
        await uow.commit()
    await audit.record(
        system,
        admin_id=admin,
        action="user.reset_password",
        tenant_id=tenant_id,
        target_id=user_id,
        detail={"name": name},
    )
    return ok(PasswordResetOut(password=password))


async def _set_user_active(
    request: Request, system: System, admin: str, tenant_id: str, user_id: str, *, active: bool
) -> None:
    await _ensure_tenant(system, tenant_id)
    async with open_uow(request, tenant_id) as uow:
        name = await identity.set_user_active(uow, user_id=user_id, is_active=active)
        if not active:
            await identity.revoke_tokens_of(uow, owner_type="user", owner_id=user_id)
        await uow.commit()
    await audit.record(
        system,
        admin_id=admin,
        action="user.activate" if active else "user.deactivate",
        tenant_id=tenant_id,
        target_id=user_id,
        detail={"name": name},
    )


@router.post("/tenants/{tenant_id}/users/{user_id}/deactivate")
async def deactivate_user(
    tenant_id: Ulid, user_id: Ulid, request: Request, system: System, admin: Admin
) -> ApiResponse[None]:
    """Signs the user out; the company's last active owner stays (LAST_OWNER)."""
    await _set_user_active(request, system, admin, tenant_id, user_id, active=False)
    return ok(None)


@router.post("/tenants/{tenant_id}/users/{user_id}/activate")
async def activate_user(
    tenant_id: Ulid, user_id: Ulid, request: Request, system: System, admin: Admin
) -> ApiResponse[None]:
    await _set_user_active(request, system, admin, tenant_id, user_id, active=True)
    return ok(None)
