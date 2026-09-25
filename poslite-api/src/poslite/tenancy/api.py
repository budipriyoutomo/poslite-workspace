"""Public API of the tenancy module (other modules import only this)."""

from poslite.tenancy.infrastructure.service import TenantInfo, create_tenant, get_tenant, slug_taken

__all__ = ["TenantInfo", "create_tenant", "get_tenant", "slug_taken"]
