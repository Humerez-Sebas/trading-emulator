"""A user's curated symbol selection. Stored server-side (the catalog is
server-side too, so the selection follows the user across devices). The
catalog endpoint `/symbols` stays public and complete; this is the per-user
subset used by the frontend to filter the 'Mis activos' view."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import Symbol, User, UserSymbol
from ..schemas import UserSymbolsIn, UserSymbolsOut

router = APIRouter(prefix="/user/symbols", tags=["user-symbols"])


@router.get("", response_model=UserSymbolsOut)
def get_user_symbols(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    rows = db.scalars(select(UserSymbol.symbol).where(UserSymbol.user_id == user.id)).all()
    return UserSymbolsOut(symbols=sorted(rows), total=len(rows))


@router.put("", response_model=UserSymbolsOut)
def put_user_symbols(
    payload: UserSymbolsIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Replaces the whole selection (DELETE + INSERT in one transaction).

    Unknown symbols (not in the catalog) are dropped silently — the FK would
    reject them anyway, and a stale client list should not 500.
    """
    requested = list(dict.fromkeys(s.strip() for s in payload.symbols if s.strip()))
    known = (
        set(db.scalars(select(Symbol.name).where(Symbol.name.in_(requested))).all())
        if requested
        else set()
    )
    valid = [s for s in requested if s in known]

    db.execute(delete(UserSymbol).where(UserSymbol.user_id == user.id))
    db.add_all(UserSymbol(user_id=user.id, symbol=s) for s in valid)
    db.commit()
    return UserSymbolsOut(symbols=sorted(valid), total=len(valid))
