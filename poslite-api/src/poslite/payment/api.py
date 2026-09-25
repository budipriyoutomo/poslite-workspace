"""Public API of the payment module (other modules import only this)."""

from poslite.payment.infrastructure.service import payment_method_changes

__all__ = ["payment_method_changes"]
