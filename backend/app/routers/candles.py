"""Chunked candle queries. M1 series run into the millions of rows, so the
endpoint never returns more than `limite` candles per request and hands back
a `siguiente` cursor (epoch seconds) for the next chunk."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Candle
from ..schemas import CandlesResponse

router = APIRouter(tags=["candles"])

MAX_LIMIT = 100_000


def _parse_time(value: str | None, param: str) -> int | None:
    """Accepts epoch seconds or ISO dates ('YYYY-MM-DD[ HH:MM]'), UTC."""
    if value is None or value == "":
        return None
    if value.isdigit():
        return int(value)
    try:
        return int(datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp())
    except ValueError:
        raise HTTPException(422, f"Parámetro '{param}' inválido: usa fecha ISO o epoch")


@router.get("/candles", response_model=CandlesResponse, dependencies=[Depends(get_current_user)])
def get_candles(
    db: Annotated[Session, Depends(get_db)],
    symbol: str,
    tf: str,
    desde: str | None = None,
    hasta: str | None = None,
    limite: Annotated[int, Query(ge=1, le=MAX_LIMIT)] = 50_000,
):
    t_from = _parse_time(desde, "desde")
    t_to = _parse_time(hasta, "hasta")

    stmt = select(Candle).where(Candle.symbol == symbol, Candle.tf == tf)
    if t_from is not None:
        stmt = stmt.where(Candle.time >= t_from)
    if t_to is not None:
        stmt = stmt.where(Candle.time <= t_to)
    # one extra row tells us whether another chunk exists
    rows = db.scalars(stmt.order_by(Candle.time).limit(limite + 1)).all()

    more = len(rows) > limite
    rows = rows[:limite]
    return CandlesResponse(
        symbol=symbol,
        tf=tf,
        velas=[(c.time, c.open, c.high, c.low, c.close) for c in rows],
        siguiente=rows[-1].time + 1 if more and rows else None,
    )
