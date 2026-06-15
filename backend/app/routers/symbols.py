"""Symbol catalog from the DB, with per-timeframe data coverage."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .. import flags
from ..db import get_db
from ..models import Candle, Symbol
from ..schemas import CoverageOut, SymbolOut, SymbolsResponse

router = APIRouter(tags=["symbols"])

logger = logging.getLogger("uvicorn.error")


# The catalog is public metadata (no auth): `docker compose up` must serve a
# valid empty list out of the box. The candles themselves DO require auth.
@router.get("/symbols", response_model=SymbolsResponse)
def list_symbols(db: Annotated[Session, Depends(get_db)], q: str = ""):
    """All known symbols with their candle coverage (min-max range per TF)."""
    stmt = select(Symbol)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Symbol.name.ilike(like) | Symbol.descripcion.ilike(like))
    symbols = db.scalars(stmt.order_by(Symbol.categoria, Symbol.name)).all()

    if db.bind.dialect.name == "postgresql" and flags.is_timescale_enabled():
        # rows in the aggregate = days, not candles: scanning it stays fast
        # however deep the M1 series get (real-time aggregation keeps the
        # not-yet-materialized tail included, so counts are exact).
        # Only available when the Timescale continuous aggregate was built
        # (TIMESCALE_ENABLED at migration time); otherwise fall through.
        coverage_rows = db.execute(
            text(
                "SELECT symbol, tf, MIN(t_min), MAX(t_max), SUM(velas)::bigint"
                " FROM candles_daily GROUP BY symbol, tf"
            )
        ).all()
        logger.info("coverage served from candles_daily aggregate (%d series)", len(coverage_rows))
    else:
        # Plain Postgres (free tier, no Timescale) or SQLite (tests): direct
        # GROUP BY over candles. Fine for free-tier-sized subsets.
        coverage_rows = db.execute(
            select(
                Candle.symbol,
                Candle.tf,
                func.min(Candle.time),
                func.max(Candle.time),
                func.count(),
            ).group_by(Candle.symbol, Candle.tf)
        ).all()
    coverage: dict[str, list[CoverageOut]] = {}
    for sym, tf, t_min, t_max, count in coverage_rows:
        coverage.setdefault(sym, []).append(
            CoverageOut(tf=tf, desde=t_min, hasta=t_max, velas=count)
        )

    out = [
        SymbolOut(
            name=s.name,
            descripcion=s.descripcion,
            categoria=s.categoria,
            digits=s.digits,
            cobertura=sorted(coverage.get(s.name, []), key=lambda c: _tf_order(c.tf)),
        )
        for s in symbols
    ]
    return SymbolsResponse(total=len(out), symbols=out)


_TF_ORDER = [
    "M1", "M2", "M3", "M4", "M5", "M6", "M10", "M12", "M15", "M20", "M30",
    "H1", "H2", "H3", "H4", "H6", "H8", "H12", "D1", "W1", "MN1",
]  # fmt: skip


def _tf_order(tf: str) -> int:
    try:
        return _TF_ORDER.index(tf)
    except ValueError:
        return len(_TF_ORDER)
