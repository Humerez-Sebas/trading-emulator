"""Ingest endpoints used by the Windows-host harvester. The backend is the
ONLY writer of the DB; the harvester just POSTs batches with the API key.
Upserts are idempotent by primary key, so re-running a harvest never
duplicates candles."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import flags
from ..db import get_db, get_engine
from ..deps import require_ingest_key
from ..models import Candle, IngestRun, Symbol, utcnow
from ..schemas import IngestCandles, IngestRefresh, IngestResult, IngestSymbols

router = APIRouter(prefix="/ingest", tags=["ingest"], dependencies=[Depends(require_ingest_key)])

logger = logging.getLogger("uvicorn.error")

MAX_BATCH = 100_000

# candles_daily buckets by day; a refresh window must align to this and span
# at least one full bucket.
COVERAGE_BUCKET = 86_400


def _coverage_window(min_time: int, max_time: int) -> tuple[int, int]:
    """Bucket-aligned ``[start, end)`` covering every ``candles_daily`` bucket
    the ``[min_time, max_time]`` epoch range touches. ``end`` is exclusive and
    always at least one bucket past ``start``, so a single-candle batch still
    spans a whole bucket (``refresh_continuous_aggregate`` errors on a window
    narrower than one bucket)."""
    start = (min_time // COVERAGE_BUCKET) * COVERAGE_BUCKET
    end = (max_time // COVERAGE_BUCKET) * COVERAGE_BUCKET + COVERAGE_BUCKET
    return start, end


def _refresh_coverage(min_time: int, max_time: int) -> None:
    """Re-materialize ``candles_daily`` over an ingested epoch range so /symbols
    reflects the new candles.

    /symbols reads coverage from the ``candles_daily`` continuous aggregate.
    Real-time aggregation only covers the tail ABOVE the materialization
    watermark, so a historical backfill (all times below "now") lands in
    already-materialized buckets and stays stale until the background refresh
    policy next runs. Forcing a refresh of the affected buckets fixes that at
    once. Called once per (symbol, tf) via /ingest/refresh after its batches
    land, NOT per batch -- so the heavy refresh lock is taken once per series
    instead of once per 50k-candle batch.

    ``refresh_continuous_aggregate`` cannot run inside a transaction block, so
    it goes on its own AUTOCOMMIT connection. NULL bounds proved unreliable on
    this BIGINT-time hypertable (reported "already up-to-date" mid-harvest), so
    we pass explicit bucket-aligned integers. They are INLINED, not bound: a
    bound ``:param`` clashes with the ``::bigint`` cast and the proc's "any"
    arg types confuse driver binding -- and since both bounds are pure-int
    arithmetic from ``_coverage_window`` there is no injection surface. A
    refresh failure must not fail the request (the candles are already
    committed; the policy will catch up), so it is logged and swallowed.
    """
    engine = get_engine()
    if engine.dialect.name != "postgresql":  # SQLite tests read candles directly
        return
    if not flags.is_timescale_enabled():  # no candles_daily aggregate to refresh
        return
    start, end = _coverage_window(min_time, max_time)
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.exec_driver_sql(
                f"CALL refresh_continuous_aggregate('candles_daily', {int(start)}, {int(end)})"
            )
    except Exception:  # pragma: no cover - freshness optimization, never fatal
        logger.warning("candles_daily refresh failed for [%d, %d)", start, end, exc_info=True)


def _upsert(db: Session, model, rows: list[dict], pk: list[str], update_cols: list[str]) -> None:
    """INSERT ... ON CONFLICT (pk) DO UPDATE, on PostgreSQL or SQLite (tests).

    The rows go as executemany parameters (NOT inlined multi-VALUES): a 50k
    batch inlined would exceed PostgreSQL's 65 535-parameter limit.
    """
    if not rows:
        return
    if db.bind.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    ins = insert(model)
    stmt = ins.on_conflict_do_update(
        index_elements=pk,
        set_={col: getattr(ins.excluded, col) for col in update_cols},
    )
    db.execute(stmt, rows)


@router.post("/symbols", response_model=IngestResult)
def ingest_symbols(payload: IngestSymbols, db: Annotated[Session, Depends(get_db)]):
    rows = [
        {
            "name": s.name,
            "descripcion": s.descripcion,
            "categoria": s.categoria,
            "digits": s.digits,
            "updated_at": utcnow(),
        }
        for s in payload.symbols
    ]
    _upsert(db, Symbol, rows, pk=["name"], update_cols=["descripcion", "categoria", "digits", "updated_at"])
    db.commit()
    return IngestResult(recibidas=len(rows))


@router.post("/candles", response_model=IngestResult)
def ingest_candles(payload: IngestCandles, db: Annotated[Session, Depends(get_db)]):
    if len(payload.velas) > MAX_BATCH:
        raise HTTPException(413, f"Lote demasiado grande (máx {MAX_BATCH} velas)")
    started = utcnow()
    rows = [
        {
            "symbol": payload.symbol,
            "tf": payload.tf,
            "time": t,
            "open": o,
            "high": h,
            "low": lo,
            "close": c,
        }
        for (t, o, h, lo, c) in payload.velas
    ]
    _upsert(
        db,
        Candle,
        rows,
        pk=["symbol", "tf", "time"],
        update_cols=["open", "high", "low", "close"],
    )
    if rows:
        times = [r["time"] for r in rows]
        db.add(
            IngestRun(
                symbol=payload.symbol,
                tf=payload.tf,
                desde=min(times),
                hasta=max(times),
                velas=len(rows),
                started_at=started,
                finished_at=utcnow(),
            )
        )
    db.commit()
    # NB: candles_daily is NOT refreshed here -- a pure, fast writer lets the
    # harvester post batches concurrently. The harvester calls /ingest/refresh
    # once per (symbol, tf) when its batches are all in.
    return IngestResult(recibidas=len(rows))


@router.post("/refresh")
def refresh_coverage(payload: IngestRefresh) -> dict:
    """Re-materialize candles_daily over [desde, hasta] so /symbols reflects a
    just-finished (symbol, tf) backfill. Idempotent; safe to call repeatedly."""
    start, end = _coverage_window(payload.desde, payload.hasta)
    _refresh_coverage(payload.desde, payload.hasta)
    return {"ok": True, "buckets": (end - start) // COVERAGE_BUCKET}
