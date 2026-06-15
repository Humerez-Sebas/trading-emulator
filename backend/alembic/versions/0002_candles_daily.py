"""Continuous aggregate `candles_daily`: per (symbol, tf, day) candle counts
and min/max times, so /symbols reads coverage from day-sized rows instead of
COUNT(*)-scanning millions of candles on every request.

PostgreSQL/TimescaleDB only — SQLite (tests) keeps the direct query fallback
in the symbols router.

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-12

"""

import os

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _timescale_enabled() -> bool:
    return os.environ.get("TIMESCALE_ENABLED", "").lower() in {"1", "true", "yes", "on"}


def upgrade() -> None:
    # Continuous aggregates are a TimescaleDB TSL/Community feature, absent from
    # the Apache-2 edition that managed free Postgres ships -- and from plain
    # Postgres/SQLite. Skip unless Timescale is explicitly enabled; /symbols
    # then serves coverage from a direct GROUP BY over candles instead.
    if op.get_bind().dialect.name != "postgresql" or not _timescale_enabled():
        return

    # integer-time hypertables need a "now" function for refresh policies
    op.execute(
        "CREATE OR REPLACE FUNCTION unix_now() RETURNS BIGINT"
        " LANGUAGE SQL STABLE AS $$ SELECT extract(epoch FROM now())::bigint $$"
    )
    op.execute("SELECT set_integer_now_func('candles', 'unix_now', replace_if_exists => true)")

    # CREATE MATERIALIZED VIEW ... WITH (timescaledb.continuous) and the
    # policy calls cannot run inside the migration transaction
    with op.get_context().autocommit_block():
        op.execute(
            "CREATE MATERIALIZED VIEW candles_daily"
            " WITH (timescaledb.continuous) AS"
            " SELECT symbol, tf, time_bucket(86400, time) AS day,"
            "        count(*) AS velas, min(time) AS t_min, max(time) AS t_max"
            " FROM candles GROUP BY 1, 2, 3"
            " WITH NO DATA"
        )
        # real-time aggregation: queries transparently include the not-yet-
        # materialized tail, so counts always match the raw table exactly
        op.execute(
            "ALTER MATERIALIZED VIEW candles_daily SET (timescaledb.materialized_only = false)"
        )
        op.execute(
            "SELECT add_continuous_aggregate_policy('candles_daily',"
            " start_offset => NULL, end_offset => 0,"
            " schedule_interval => INTERVAL '5 minutes')"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    with op.get_context().autocommit_block():
        op.execute("DROP MATERIALIZED VIEW IF EXISTS candles_daily")
