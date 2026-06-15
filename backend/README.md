# Backend del Emulador (V2.5)

FastAPI + PostgreSQL/TimescaleDB. Sirve auth (JWT en cookies httpOnly),
catálogo de símbolos con cobertura por temporalidad y velas paginadas para
la app Angular. Se puebla con el **harvester** (ver abajo).

## Arranque

```bash
# en la raíz del proyecto
cp .env.example .env   # y cambia JWT_SECRET / INGEST_API_KEY
docker compose up --build
# -> API en http://127.0.0.1:8000  (docs en /docs)
```

`docker compose up` deja `db` (TimescaleDB) y `backend` healthy **sin
necesidad de MT5**: con la DB vacía, `GET /symbols` responde una lista
vacía válida. Las migraciones (Alembic) corren solas al arrancar el
contenedor.

## TimescaleDB opcional + feature flags (Flagsmith)

TimescaleDB es **opcional**. El hypertable y la continuous aggregate
`candles_daily` solo se crean cuando `TIMESCALE_ENABLED=true` (lo leen las
migraciones, así que debe coincidir con la DB real). En Postgres plano
—p. ej. una DB gestionada free, cuya edición Apache-2 de TimescaleDB no trae
continuous aggregates— se deja `TIMESCALE_ENABLED=false` y `/symbols` sirve la
cobertura con una consulta directa `GROUP BY` sobre `candles`.

El *read-path* (qué consulta usa `/symbols`, si `/ingest/refresh` hace algo) y
el gate de registro se leen de **Flagsmith** (`app/flags.py`): flags
`timescale_enabled` y `registration_enabled`. Si `FLAGSMITH_KEY` está vacío o
Flagsmith no responde, cada flag cae al valor de entorno equivalente
(`TIMESCALE_ENABLED`, `REGISTRATION_ENABLED`), por lo que los tests y un
`uvicorn` pelado no necesitan Flagsmith. Mantén el flag `timescale_enabled`
coherente con el esquema migrado.

El stack crea los flags automáticamente: el servicio `flagsmith-seed`
(docker-compose) ejecuta [`flagsmith/seed.py`](../flagsmith/seed.py) y genera
org/proyecto/entorno + los dos flags + una server-side key determinista que el
backend ya trae en `FLAGSMITH_KEY`. Cero pasos manuales.

## Arquitectura: ¿por qué el harvester corre en el host?

La librería `MetaTrader5` de Python **solo existe para Windows** y habla
con la terminal MT5 abierta en la misma máquina; un contenedor Linux no
puede conectarse a ella. Por eso:

- el backend (Linux, Docker) es el **único escritor** de la DB y expone
  `POST /ingest/candles` y `POST /ingest/symbols` protegidos por el header
  `X-API-Key == INGEST_API_KEY`;
- `harvester.py` corre **en el host Windows**, lee de MT5 (reutilizando
  `mt5_common.py`, el mismo módulo del helper `datasource_api.py`) y postea
  lotes de hasta 50k velas con reintentos;
- el compose levanta y sirve datos aunque MT5 esté cerrado.

```bash
# con MT5 abierto y el compose levantado:
py backend/harvester.py --symbols US30,XAUUSD --tfs M5,H1 --desde 2024-01-01
```

Re-ejecutar el harvester **no duplica velas**: el backend hace upsert por
la PK `(symbol, tf, time)`. Cada lote aceptado queda auditado en la tabla
`ingest_runs`.

## Endpoints

| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| POST | `/auth/register` | — | crea usuario (argon2id) y deja sesión iniciada; 403 si el registro está cerrado |
| POST | `/auth/login` | — | setea cookies `access_token` (15 min) y `refresh_token` (7 días, path `/auth`) |
| POST | `/auth/refresh` | cookie refresh | rota el refresh token (el anterior queda revocado) |
| POST | `/auth/logout` | cookie refresh | revoca el refresh y limpia cookies |
| GET | `/auth/me` | cookie access | usuario actual |
| GET | `/symbols?q=` | cookie access | catálogo con `cobertura` por TF (`desde`/`hasta`/`velas`, epoch UTC) |
| GET | `/candles?symbol&tf&desde&hasta&limite` | cookie access | velas `[time,o,h,l,c]` ordenadas; `siguiente` = cursor del próximo lote (pasarlo como `desde`) |
| GET/PUT | `/user/symbols` | cookie access | selección de símbolos del usuario |
| POST | `/ingest/symbols` | X-API-Key | upsert de metadatos de símbolos |
| POST | `/ingest/candles` | X-API-Key | upsert idempotente de velas (máx 100k por lote) |
| POST | `/ingest/refresh` | X-API-Key | refresca `candles_daily` (no-op si Timescale off) |
| GET | `/health` | — | healthcheck (devuelve versión) |

Los campos user-facing del contrato van en español (`descripcion`,
`categoria`, `velas`, `desde`, `hasta`, `siguiente`, `cobertura`) por
consistencia con el helper MT5 existente. Los tiempos de velas son **epoch
segundos UTC** (idéntico al `Candle.time` del frontend).

## Esquema

- `users(id, username UNIQUE, password_hash, created_at)`
- `symbols(name PK, descripcion, categoria, digits, updated_at)`
- `candles(symbol, tf, time, open, high, low, close, PK(symbol,tf,time))`
  → **hypertable** TimescaleDB particionada por `time` (chunks de ~4 semanas)
  cuando `TIMESCALE_ENABLED=true`; si no, tabla Postgres normal
- `ingest_runs(id, symbol, tf, desde, hasta, velas, started_at, finished_at)`
- `refresh_tokens(jti PK, user_id, expires_at, revoked)` — rotación/revocación

## Tests

```bash
cd backend
py -m pip install -r requirements-dev.txt
py -m pytest
```

Los tests usan SQLite (el upsert es dialect-aware), así que no necesitan
el compose levantado. Cubren: register/login/me, refresh con rotación,
ingest idempotente + auditoría y queries de velas por rango/cursor.

## Usuario demo (registro cerrado)

Con `REGISTRATION_ENABLED=false` el registro público devuelve 403. Crea/resetea
una cuenta con el script (lee la misma `DATABASE_URL`):

```bash
DEMO_USERNAME=demo DEMO_PASSWORD=... python backend/scripts/create_user.py
```

## Variables de entorno

Ver `.env.example` en la raíz: además de `DATABASE_URL`, `JWT_SECRET`,
`INGEST_API_KEY`, `CORS_ORIGINS`, `COOKIE_SECURE` (true solo con HTTPS), están
`COOKIE_SAMESITE` (`none` para cross-site), `TIMESCALE_ENABLED`,
`REGISTRATION_ENABLED`, `ENABLE_DOCS`, y `FLAGSMITH_KEY`/`FLAGSMITH_API_URL`.
Logs a stdout; el contenedor no guarda estado (12-factor).
