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

Los compose viven en [`infra/`](infra/); **ejecútalos desde la raíz del repo** (así
se resuelven el `.env` de la raíz y los contextos de build `../backend`/`../emulador`).

**Modo desarrollo** (infra + backend + Flagsmith; el frontend con `ng serve`):

```bash
docker compose -f infra/docker-compose.yml up --build
# en otra terminal:
cd emulador && npm install && npm start   # http://localhost:4200  -> API en :8000
```

- Backend: http://localhost:8000 · Docs (si `ENABLE_DOCS=true`): http://localhost:8000/docs
- Flagsmith (dashboard): http://localhost:8001

**Modo full-stack** (todo en contenedores, incluido el frontend en nginx):

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.full.yml up --build
# abre http://localhost:8080  (nginx sirve la SPA y proxya la API: mismo origen)
```

## Feature flags (Flagsmith) — creación automática

Al levantar el stack, el servicio **`flagsmith-seed`** crea automáticamente (de
forma idempotente) la organización, el proyecto, el entorno, los dos flags
(`timescale_enabled`, `registration_enabled`), una **server-side key
determinista** y un usuario admin. No hay pasos manuales: el backend ya trae esa
misma key en `FLAGSMITH_KEY` (`.env`), así que lee los flags desde el arranque.

- Gestiona los flags en el dashboard http://localhost:8001 (login con
  `FLAGSMITH_ADMIN_EMAIL`/`FLAGSMITH_ADMIN_PASSWORD` del `.env`).
- La lógica del seed está en [`infra/flagsmith/seed.py`](infra/flagsmith/seed.py); ajusta el
  nombre del entorno, la key o los flags con las variables `FLAGSMITH_SEED_*`.
- Para **deshabilitar** Flagsmith y usar solo las variables de entorno
  (`TIMESCALE_ENABLED`, `REGISTRATION_ENABLED`) como fallback, deja
  `FLAGSMITH_KEY=` vacío en `.env` (útil para tests y arranques mínimos).
- En producción usa una key real generada en el dashboard, no la del seed.

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

## Despliegue estático ($0, solo frontend)

Despliega el emulador **100% offline** sin backend: frontend estático en **Cloudflare
Pages**, **Netlify**, **Vercel** o cualquier CDN; datos (catálogo de símbolos + sesiones)
guardan en **IndexedDB** del navegador (v4 del schema). Ideal para practicar sin cuenta.

```bash
npm run build -- --configuration offline   # en emulador/
# resulta en emulador/dist/ servible estáticamente
```

**Flujo de uso (invitado):**

1. Abre el sitio estático → app sin login, muestra pill "Invitado" (datos solo en
   este navegador).
2. **Crear sesión** con CSV propio:
   - `Sesiones` / `Crear sesión` → **Paso 1: Subir CSV** (dropzone o click).
   - Parsea automáticamente, detecta símbolo y TFs, verifica que todos los archivos
     son del mismo activo (si no, bloquea con error claro).
   - **Paso 2–3:** valida fechas, elige TFs y rango → **genera sesión** sin servidor.
   - Gráfico del emulador abre con el CSV cargado; ordena compran/venta, SL/TP, métricas
     en tiempo real.
3. **Reutiliza CSVs** en `Mercados` (sección de símbolos offline):
   - Cada CSV se guarda en catálogo local (nombre + TFs disponibles).
   - Siguiente sesión: elige del catálogo → sin re-subir.
   - Puedes "Eliminar" símbolos para limpiar espacio.
4. **Importa/exporta sesiones** (`Sesiones` / `Importar`):
   - Sube un `.csv` de sesión anterior (trades + chart state) → se reconstruye
     la sesión.

**Tech:** Angular 21 standalone + NgRx (state) · **sin API**, sin cookies. Todo
en-navegador. El catálogo vive en IndexedDB (keyPath `symbol`), con índices de
`categoria` y timestamps. Al cerrar: los datos quedan guardados; recarga mantiene
el estado sin servidor.

**Limitaciones:**
- No sincroniza entre devices (solo este navegador).
- Sin historial de cuentas (cada recarga es invitado nuevo si limpias IndexedDB).
- CSV como única fuente de datos (sin acceso a tickers en vivo).

**Versioning:** si abres una versión más nueva del build estático, el schema de
IndexedDB migra automáticamente (v3 → v4).

## Deploy a producción (free tier) — pendiente

Topología pensada (no desplegada aún): frontend en **Cloudflare Pages**, backend en
**Render** (Docker), DB en **Neon** (Postgres plano, `TIMESCALE_ENABLED=false` →
`/symbols` usa consulta directa). En cross-site: `COOKIE_SAMESITE=none`,
`COOKIE_SECURE=true`, `CORS_ORIGINS` = dominio del front, y `backendUrl` absoluto en
`environment.prod.ts`. La edición Apache-2 de TimescaleDB de los Postgres free **no**
trae continuous aggregates, por eso el modo plano es la opción free-tier.

## Licencia

[MIT](LICENSE).
