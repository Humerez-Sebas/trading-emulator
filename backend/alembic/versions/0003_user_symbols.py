"""user_symbols: per-user curated catalog selection (join table user<->symbol).

Both FKs cascade on delete so dangling selections disappear with the user or
a retired symbol.

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-13

"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_symbols",
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "symbol",
            sa.String(32),
            sa.ForeignKey("symbols.name", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("user_symbols")
