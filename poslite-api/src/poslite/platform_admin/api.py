"""Public API of the platform_admin module (operator accounts; used by the CLI)."""

from poslite.platform_admin.infrastructure.service import create_admin

__all__ = ["create_admin"]
