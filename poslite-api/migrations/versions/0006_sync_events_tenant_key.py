"""Key the sync_events idempotency ledger by (tenant_id, id).

With RLS a tenant cannot see another tenant's rows, so a global PK on the event id let an id
collision across tenants fail the whole push. Event ids only need to be unique per tenant.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-26
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("sync_events_pkey", "sync_events", type_="primary")
    op.create_primary_key("sync_events_pkey", "sync_events", ["tenant_id", "id"])


def downgrade() -> None:
    op.drop_constraint("sync_events_pkey", "sync_events", type_="primary")
    op.create_primary_key("sync_events_pkey", "sync_events", ["id"])
