"""Register/login/refresh/logout with JWT in httpOnly cookies."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import flags
from ..config import get_settings
from ..db import get_db
from ..deps import get_current_user
from ..models import RefreshToken, User
from ..schemas import Credentials, UserOut
from ..security import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    REFRESH_PATH,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookies(response: Response, user: User, db: Session) -> None:
    """Issues a fresh access+refresh pair as httpOnly cookies."""
    s = get_settings()
    access = create_access_token(user.id, user.username)
    refresh, jti, expires = create_refresh_token(user.id)
    db.add(RefreshToken(jti=jti, user_id=user.id, expires_at=expires))
    db.commit()
    # samesite="none" (cross-site deploy) requires secure=true or browsers drop
    # the cookie; same-site/local uses "lax". Configured via env.
    common = {"httponly": True, "samesite": s.cookie_samesite, "secure": s.cookie_secure}
    response.set_cookie(ACCESS_COOKIE, access, max_age=s.access_token_minutes * 60, **common)
    response.set_cookie(
        REFRESH_COOKIE,
        refresh,
        max_age=s.refresh_token_days * 86400,
        path=REFRESH_PATH,
        **common,
    )


def _clear_auth_cookies(response: Response) -> None:
    # match samesite/secure so the browser actually clears a cross-site cookie
    s = get_settings()
    attrs = {"samesite": s.cookie_samesite, "secure": s.cookie_secure}
    response.delete_cookie(ACCESS_COOKIE, **attrs)
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_PATH, **attrs)


@router.post("/register", response_model=UserOut, status_code=201)
def register(creds: Credentials, response: Response, db: Annotated[Session, Depends(get_db)]):
    if not flags.is_registration_enabled():
        raise HTTPException(403, "El registro está deshabilitado")
    exists = db.scalar(select(User).where(User.username == creds.username))
    if exists:
        raise HTTPException(409, "Ese nombre de usuario ya está en uso")
    user = User(username=creds.username, password_hash=hash_password(creds.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    # registering also logs the user in (no email verification by design)
    _set_auth_cookies(response, user, db)
    return UserOut(id=user.id, username=user.username)


@router.post("/login", response_model=UserOut)
def login(creds: Credentials, response: Response, db: Annotated[Session, Depends(get_db)]):
    user = db.scalar(select(User).where(User.username == creds.username))
    if user is None or not verify_password(user.password_hash, creds.password):
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    _set_auth_cookies(response, user, db)
    return UserOut(id=user.id, username=user.username)


@router.post("/refresh", response_model=UserOut)
def refresh(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
):
    payload = decode_token(refresh_token, "refresh") if refresh_token else None
    if payload is None:
        raise HTTPException(401, "Sesión expirada")
    stored = db.get(RefreshToken, payload["jti"])
    now = datetime.now(timezone.utc)
    if stored is None or stored.revoked or stored.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(401, "Sesión expirada")
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(401, "Usuario no encontrado")
    # rotation: the old token is revoked and can never be replayed
    stored.revoked = True
    _set_auth_cookies(response, user, db)
    return UserOut(id=user.id, username=user.username)


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    refresh_token: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
):
    payload = decode_token(refresh_token, "refresh") if refresh_token else None
    if payload is not None:
        stored = db.get(RefreshToken, payload["jti"])
        if stored is not None:
            stored.revoked = True
            db.commit()
    _clear_auth_cookies(response)


@router.get("/me", response_model=UserOut)
def me(user: Annotated[User, Depends(get_current_user)]):
    return UserOut(id=user.id, username=user.username)
