# trading-emulator

Emulador de trading (replay de velas) para practicar análisis y operativa manual
sobre datos históricos: reproduce el mercado vela a vela, con dibujos, órdenes
con SL/TP y métricas de sesión, sobre [lightweight-charts](https://github.com/tradingview/lightweight-charts).

Stack: **Angular 21 + NgRx** (frontend) · **FastAPI** (backend) · **PostgreSQL/TimescaleDB**
· **Flagsmith** (feature flags, self-host) · **harvester** Python/MetaTrader5 para
poblar datos.

> Los datos de mercado NO se incluyen en el repo. El backend arranca vacío y se
> puebla con el *harvester* desde una PC con MetaTrader 5 (ver más abajo), o se
> usa el modo **Cargar CSV** del emulador (incluye una muestra `xauusd_h4.csv`).

## Arquitectura

```
┌────────────┐      HTTPS/HTTP        ┌─────────────┐     SQL      ┌──────────────┐
│  Frontend  │ ───────────────────▶  │   Backend   │ ──────────▶  │  PostgreSQL  │
│ Angular 21 │   /auth /symbols ...   │  FastAPI    │              │ (Timescale   │
│  (nginx)   │ ◀───────────────────  │             │              │  opcional)   │
└────────────┘   cookies httpOnly     └──────┬──────┘              └──────────────┘
                                             │ lee flags                ▲
                                       ┌─────▼──────┐                   │ /ingest (X-API-Key)
                                       │ Flagsmith  │            ┌──────┴───────┐
                                       │ self-host  │            │  harvester   │  (PC + MT5)
                                       └────────────┘            └──────────────┘
```

- **Auth**: access token en cookie httpOnly + refresh con rotación (también cookie
  httpOnly). El frontend manda `withCredentials`.
- **Feature flags** (Flagsmith): `registration_enabled` y `timescale_enabled`. Con
  fallback a variables de entorno si Flagsmith no está configurado/disponible.
- **Datos**: el *harvester* (Windows + MetaTrader5) postea lotes de velas a
  `/ingest/*` con una API key. El backend es el único escritor de la DB.

## Correr en local (Docker)

Requisitos: Docker Desktop. Copia el ejemplo de entorno y ajusta valores:

```bash
cp .env.example .env   # PowerShell: Copy-Item .env.example .env
```

**Modo desarrollo** (infra + backend + Flagsmith; el frontend con `ng serve`):

```bash
docker compose up --build
# en otra terminal:
cd emulador && npm install && npm start   # http://localhost:4200  -> API en :8000
```

- Backend: http://localhost:8000 · Docs (si `ENABLE_DOCS=true`): http://localhost:8000/docs
- Flagsmith (dashboard): http://localhost:8001

**Modo full-stack** (todo en contenedores, incluido el frontend en nginx):

```bash
docker compose -f docker-compose.yml -f docker-compose.full.yml up --build
# abre http://localhost:8080  (nginx sirve la SPA y proxya la API: mismo origen)
```

## Feature flags (Flagsmith)

1. Abre el dashboard http://localhost:8001, crea cuenta → organización → proyecto →
   entorno.
2. Crea dos flags: `timescale_enabled` y `registration_enabled`.
3. Copia la **server-side environment key** del entorno y ponla en `.env`:
   `FLAGSMITH_KEY=...`. Reinicia el backend.

Si `FLAGSMITH_KEY` está vacío, el backend usa los valores de entorno
(`TIMESCALE_ENABLED`, `REGISTRATION_ENABLED`) como fallback — útil para tests y
arranques mínimos.

> **Importante (Timescale):** el *esquema* (hypertable + continuous aggregate
> `candles_daily`) lo deciden las migraciones según `TIMESCALE_ENABLED`. El flag
> de Flagsmith solo conmuta el *read-path* de `/symbols`. Manténlos coherentes:
> activar `timescale_enabled` en Flagsmith cuando la DB se migró sin Timescale
> haría fallar `/symbols` (no existe `candles_daily`).

## Variables de entorno

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `POSTGRES_USER/PASSWORD/DB` | `emulador` | DB del emulador (docker) |
| `DATABASE_URL` | (compose) | Cadena SQLAlchemy del backend |
| `JWT_SECRET` | `dev-only-change-me` | Firma de los JWT (**cambiar**) |
| `INGEST_API_KEY` | `dev-only-ingest-key` | API key del harvester (**cambiar**) |
| `CORS_ORIGINS` | `localhost:4200,...` | Orígenes permitidos (front) |
| `COOKIE_SECURE` | `false` | `true` detrás de HTTPS |
| `COOKIE_SAMESITE` | `lax` | `none` para deploy cross-site (requiere Secure) |
| `TIMESCALE_ENABLED` | `true` | Esquema Timescale (lo leen las migraciones) |
| `REGISTRATION_ENABLED` | `true` | Registro público abierto |
| `ENABLE_DOCS` | `true` | Sirve `/docs` y `/redoc` |
| `FLAGSMITH_KEY` | (vacío) | Server-side key de Flagsmith |
| `FLAGSMITH_API_URL` | `http://flagsmith:8000/api/v1/` | API de Flagsmith self-host |
| `DEMO_USERNAME/PASSWORD` | — | Usuario demo (seed) |

Genera secretos fuertes: `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

## Cosechar datos a producción (harvester)

El *harvester* corre en una PC Windows con MetaTrader 5 abierto y postea a `/ingest`:

```powershell
$env:BACKEND_URL="https://tu-backend"      # o http://127.0.0.1:8000 en local
$env:INGEST_API_KEY="<tu-api-key-fuerte>"
py backend/harvester.py --symbols XAUUSD --tfs M5,M15,H1,H4,D1 --desde 2025-01-01 --api-key $env:INGEST_API_KEY
```

El harvester reanuda automáticamente (consulta `/symbols`). **Volumen**: cosechar
M1 completo es enorme; en una DB free (~0.5 GB) cosecha un subconjunto (pocos
símbolos, TFs M5+, rango reciente).

## Usuario demo (registro cerrado en prod)

```bash
DEMO_USERNAME=demo DEMO_PASSWORD=... python backend/scripts/create_user.py
```

## Tests y calidad

```bash
cd backend && python -m pytest -q                 # backend (SQLite, sin Docker)
cd emulador && npx ng test --watch=false          # frontend (vitest)
cd emulador && npm run build                       # build de producción
cd emulador && npm run lint && npm run format:check
```

## Scripts auxiliares (estrategia / EA)

En `scripts/` (se ejecutan desde la raíz del repo): `simulador.py` (réplica Python
del EA para verificación) y `descargar_datos.py` (descarga velas de MT5 a `datos/`).
`AlgoritmoEA.mq5` es el Expert Advisor de MetaTrader 5.

## Deploy a producción (free tier) — pendiente

Topología pensada (no desplegada aún): frontend en **Cloudflare Pages**, backend en
**Render** (Docker), DB en **Neon** (Postgres plano, `TIMESCALE_ENABLED=false` →
`/symbols` usa consulta directa). En cross-site: `COOKIE_SAMESITE=none`,
`COOKIE_SECURE=true`, `CORS_ORIGINS` = dominio del front, y `backendUrl` absoluto en
`environment.prod.ts`. La edición Apache-2 de TimescaleDB de los Postgres free **no**
trae continuous aggregates, por eso el modo plano es la opción free-tier.

## Licencia

[MIT](LICENSE).
