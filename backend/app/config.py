"""12-factor configuration: everything comes from environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://emulador:emulador@localhost:5432/emulador"
    jwt_secret: str = "dev-only-change-me"
    ingest_api_key: str = "dev-only-ingest-key"
    cors_origins: str = "http://localhost:4200,http://127.0.0.1:4200"
    cookie_secure: bool = False
    # "lax" same-site (default); set to "none" for a cross-site deploy
    # (frontend and API on different registrable domains). "none" requires
    # cookie_secure=true or browsers drop the cookie.
    cookie_samesite: str = "lax"
    access_token_minutes: int = 15
    refresh_token_days: int = 7

    # --- feature toggles (env defaults; Flagsmith can override at runtime) ---
    # Whether public self-registration is open. Closed in prod + a demo user.
    registration_enabled: bool = True
    # Read-path fallback for the Timescale `candles_daily` aggregate. The SCHEMA
    # is decided by the TIMESCALE_ENABLED env var read in the migrations; this
    # only steers the /symbols read path and is the fallback when Flagsmith is
    # unreachable. Default off = plain-Postgres / SQLite direct query.
    timescale_enabled: bool = False
    # Serve FastAPI's /docs, /redoc, /openapi.json. Turn off in prod.
    enable_docs: bool = True

    # --- Flagsmith (self-hosted) ---
    # Server-side environment key (secret). When unset, all flags use the env
    # defaults above, so tests and a bare `uvicorn` run need no Flagsmith.
    flagsmith_key: str | None = None
    # Base API URL of the self-hosted Flagsmith, e.g.
    # "http://flagsmith:8000/api/v1/". Leave unset to use Flagsmith SaaS.
    flagsmith_api_url: str | None = None

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
