"""Emulador backend: auth + market data API over PostgreSQL/TimescaleDB."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import auth, candles, ingest, symbols, user_symbols

# Static security headers added to every response. HSTS only bites over HTTPS,
# so it is harmless on local http. The frontend's own CSP lives on the static
# host (nginx / Pages); the API serves JSON only, so a strict default is fine.
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
}


def create_app() -> FastAPI:
    s = get_settings()
    # /docs, /redoc and the OpenAPI schema are disabled in prod (enable_docs=false)
    docs = dict(docs_url="/docs", redoc_url="/redoc", openapi_url="/openapi.json")
    if not s.enable_docs:
        docs = dict(docs_url=None, redoc_url=None, openapi_url=None)
    app = FastAPI(title="Emulador Backend", version="2.8.0", **docs)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        for key, value in SECURITY_HEADERS.items():
            response.headers.setdefault(key, value)
        return response

    app.include_router(auth.router)
    app.include_router(symbols.router)
    app.include_router(candles.router)
    app.include_router(ingest.router)
    app.include_router(user_symbols.router)

    @app.get("/health", tags=["health"])
    def health():
        # expose the version so a curl confirms which build is actually live
        # (the container runs a built image, not a mounted volume)
        return {"status": "ok", "version": app.version}

    return app


app = create_app()
