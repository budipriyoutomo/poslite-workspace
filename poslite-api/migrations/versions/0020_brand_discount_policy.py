"""Discount policy per brand (06 Order rule 5): the presets cashiers pick from, whether they may
type their own value, and how far a cashier may go without a manager's PIN.

Defaults keep today's behaviour: the old presets and a 20% / Rp 50.000 cashier limit.

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-07
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "brands",
        sa.Column(
            "discount_percentages",
            ARRAY(sa.SmallInteger()),
            nullable=False,
            server_default="{5,10,15,20}",
        ),
    )
    op.add_column(
        "brands",
        sa.Column(
            "discount_amounts",
            ARRAY(sa.BigInteger()),
            nullable=False,
            server_default="{5000,10000,25000,50000}",
        ),
    )
    op.add_column(
        "brands",
        sa.Column("allow_custom_discount", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "brands",
        sa.Column(
            "cashier_max_discount_percentage",
            sa.SmallInteger(),
            nullable=False,
            server_default="20",
        ),
    )
    op.add_column(
        "brands",
        sa.Column(
            "cashier_max_discount_amount", sa.BigInteger(), nullable=False, server_default="50000"
        ),
    )
    op.create_check_constraint(
        "discount_limits",
        "brands",
        "cashier_max_discount_percentage BETWEEN 0 AND 100 AND cashier_max_discount_amount >= 0",
    )


def downgrade() -> None:
    op.drop_constraint("discount_limits", "brands")
    for column in (
        "cashier_max_discount_amount",
        "cashier_max_discount_percentage",
        "allow_custom_discount",
        "discount_amounts",
        "discount_percentages",
    ):
        op.drop_column("brands", column)
