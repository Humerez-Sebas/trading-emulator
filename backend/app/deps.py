"""Shared FastAPI dependencies: current user (cookie JWT) and ingest API key."""

from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import User
from .security import ACCESS_COOKIE, decode_token


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    access_token: Annotated[str | None, Cookie(alias=ACCESS_COOKIE)] = None,
) -> User:
    if not access_token:
        raise HTTPException(401, "No autenticado")
    payload = decode_token(access_token, "access")
    if payload is None:
        raise HTTPException(401, "Sesión expirada")
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(401, "Usuario no encontrado")
    return user


def require_ingest_key(x_api_key: Annotated[str | None, Header()] = None) -> None:
    if not x_api_key or x_api_key != get_settings().ingest_api_key:
        raise HTTPException(401, "API key inválida")
