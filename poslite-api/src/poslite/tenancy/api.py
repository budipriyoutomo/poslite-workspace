"""Public API of the tenancy module (other modules import only this)."""

from poslite.tenancy.infrastructure.service import (
    TenantInfo,
    TenantSignup,
    all_tenants,
    create_tenant,
    get_tenant,
    reactivate_after_payment,
    slug_taken,
    suspend_for_billing,
    tenant_status,
)

__all__ = [
    "TenantInfo",
    "TenantSignup",
    "all_tenants",
    "create_tenant",
    "get_tenant",
    "reactivate_after_payment",
    "slug_taken",
    "suspend_for_billing",
    "tenant_status",
]
