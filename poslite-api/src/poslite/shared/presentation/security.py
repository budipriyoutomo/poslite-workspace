from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated, Protocol

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from poslite.shared.domain.errors import DomainError


@dataclass(frozen=True, slots=True)
class Principal:
    """Who is calling: resolved from an opaque bearer token (tenant always comes from here)."""

    token_id: str
    tenant_id: str
    owner_type: str  # "user" | "device"
    owner_id: str
    abilities: frozenset[str]

    def can(self, ability: str) -> bool:
        scope = ability.split(":", 1)[0]
        return ability in self.abilities or f"{scope}:*" in self.abilities


class TokenResolver(Protocol):
    async def resolve(self, token: str) -> Principal | None: ...


_bearer = HTTPBearer(auto_error=False)


async def current_principal(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Principal:
    if credentials is None:
        raise DomainError("UNAUTHENTICATED", "Missing bearer token", kind="unauthorized")
    resolver: TokenResolver = request.app.state.token_resolver
    principal = await resolver.resolve(credentials.credentials)
    if principal is None:
        raise DomainError("UNAUTHENTICATED", "Invalid or revoked token", kind="unauthorized")
    return principal


def require_ability(ability: str) -> Callable[[Principal], Awaitable[Principal]]:
    async def dependency(principal: Annotated[Principal, Depends(current_principal)]) -> Principal:
        if not principal.can(ability):
            raise DomainError("FORBIDDEN", f"Token lacks ability {ability}", kind="forbidden")
        return principal

    return dependency
