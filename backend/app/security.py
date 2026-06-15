"""Password hashing (argon2id) and JWT issuing/validation."""

import secrets
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from .config import get_settings

ALGORITHM = "HS256"
ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
# the refresh cookie only travels to the refresh/logout endpoints
REFRESH_PATH = "/auth"

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_access_token(user_id: int, username: str) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "username": username,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=s.access_token_minutes),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGORITHM)


def create_refresh_token(user_id: int) -> tuple[str, str, datetime]:
    """Returns (token, jti, expires_at). The jti is persisted for rotation."""
    s = get_settings()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=s.refresh_token_days)
    jti = secrets.token_hex(16)
    payload = {"sub": str(user_id), "type": "refresh", "jti": jti, "iat": now, "exp": expires}
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGORITHM), jti, expires


def decode_token(token: str, expected_type: str) -> dict | None:
    """Decoded payload, or None if invalid/expired/wrong type."""
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    return payload
