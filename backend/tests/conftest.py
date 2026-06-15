"""Test fixtures: SQLite database + TestClient. The env vars must be set
BEFORE importing the app (config/engine are cached)."""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["JWT_SECRET"] = "test-secret-largo-para-hmac-sha256-0123456789"
os.environ["INGEST_API_KEY"] = "test-ingest-key"


@pytest.fixture()
def client(tmp_path):
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp_path / 'test.db'}"

    from app.config import get_settings
    from app.db import get_engine, get_sessionmaker, Base
    from app import models  # noqa: F401  (registers the tables)

    get_settings.cache_clear()
    get_engine.cache_clear()
    get_sessionmaker.cache_clear()

    Base.metadata.create_all(get_engine())

    from app.main import create_app
    from fastapi.testclient import TestClient

    with TestClient(create_app()) as c:
        yield c

    get_engine().dispose()


INGEST_HEADERS = {"X-API-Key": "test-ingest-key"}
