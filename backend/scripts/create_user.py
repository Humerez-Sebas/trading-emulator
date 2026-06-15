"""Create (or reset the password of) a single user, for seeding the demo
account on a deployment where public registration is closed.

Usage (env-driven, reads the same DATABASE_URL as the app):

    DEMO_USERNAME=demo DEMO_PASSWORD=... python backend/scripts/create_user.py

Idempotent: re-running updates the password of an existing user.
"""

import os
import sys

# allow `python backend/scripts/create_user.py` from the repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select  # noqa: E402

from app.db import get_sessionmaker  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402


def main() -> int:
    username = os.environ.get("DEMO_USERNAME")
    password = os.environ.get("DEMO_PASSWORD")
    if not username or not password:
        print("Set DEMO_USERNAME and DEMO_PASSWORD environment variables.", file=sys.stderr)
        return 2

    with get_sessionmaker()() as db:
        user = db.scalar(select(User).where(User.username == username))
        if user is None:
            db.add(User(username=username, password_hash=hash_password(password)))
            action = "created"
        else:
            user.password_hash = hash_password(password)
            action = "password reset for"
        db.commit()
    print(f"User {action} {username!r}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
