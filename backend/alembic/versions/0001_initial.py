"""Initial schema: users, symbols, candles (hypertable), ingest_runs,
refresh_tokens.

Revision ID: 0001
Revises:
Create Date: 2026-06-12

"""

import os

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def _timescale_enabled() -> bool:
    """Schema-level Timescale switch. Must match the DB the app runs against:
    a managed free Postgres (Neon/Supabase) only ships TimescaleDB Apache-2,
    which lacks continuous aggregates, so we keep it OFF there and ON for the
    self-hosted Timescale image used in dev."""
    return os.environ.get("TIMESCALE_ENABLED", "").lower() in {"1", "true", "yes", "on"}


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "symbols",
        sa.Column("name", sa.String(32), primary_key=True),
        sa.Column("descripcion", sa.String(255), nullable=False, server_default=""),
        sa.Column("categoria", sa.String(64), nullable=False, server_default="Otros"),
        sa.Column("digits", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "candles",
        sa.Column("symbol", sa.String(32), nullable=False),
        sa.Column("tf", sa.String(8), nullable=False),
        sa.Column("time", sa.BigInteger(), nullable=False),
        sa.Column("open", sa.Float(), nullable=False),
        sa.Column("high", sa.Float(), nullable=False),
        sa.Column("low", sa.Float(), nullable=False),
        sa.Column("close", sa.Float(), nullable=False),
        sa.PrimaryKeyConstraint("symbol", "tf", "time"),
    )
    op.create_table(
        "ingest_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("symbol", sa.String(32), nullable=False),
        sa.Column("tf", sa.String(8), nullable=False),
        sa.Column("desde", sa.BigInteger(), nullable=False),
        sa.Column("hasta", sa.BigInteger(), nullable=False),
        sa.Column("velas", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "refresh_tokens",
        sa.Column("jti", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # candles -> hypertable, partitioned by epoch-seconds `time`. Chunks of
    # ~4 weeks keep M1 series (60k rows/symbol/month) in healthy chunk sizes.
    # Skipped on plain Postgres (no Timescale extension) and SQLite (tests):
    # the table works fine as a regular table, just without partitioning.
    if op.get_bind().dialect.name == "postgresql" and _timescale_enabled():
        op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")
        op.execute(
            "SELECT create_hypertable('candles', 'time',"
            " chunk_time_interval => 2419200, migrate_data => true)"
        )


def downgrade() -> None:
    op.drop_table("refresh_tokens")
    op.drop_table("ingest_runs")
    op.drop_table("candles")
    op.drop_table("symbols")
    op.drop_table("users")
