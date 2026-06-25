# trading-emulator

Emulador de trading (replay de velas) para practicar análisis y operativa manual
sobre datos históricos: reproduce el mercado vela a vela, con dibujos, órdenes
con SL/TP y métricas de sesión, sobre [lightweight-charts](https://github.com/tradingview/lightweight-charts).

Stack: **Angular 21 + NgRx** (SPA, sin backend propio) · **Supabase** (Auth +
Postgres/RLS para sincronizar sesiones entre dispositivos) · **Cloudflare R2**
(datos de mercado en Parquet, consumidos en el navegador vía `parquet-wasm` →
IndexedDB) · desplegado de forma estática en **Vercel**.

> Los datos de mercado se publican en R2 con el pipeline `pipeline/` (corre en
> una PC Windows con MetaTrader 5) y la SPA los descarga directo desde el
> navegador a IndexedDB. No hay servidor intermedio: la app habla con Supabase
> (auth + sync) y con R2 (datos) directamente desde el cliente.

## Arquitectura

```
┌──────────────────────┐        Auth + REST/RLS        ┌──────────────┐
│      Frontend         │ ─────────────────────────────▶│   Supabase   │
│  Angular 21 + NgRx     │  (sesiones, trades, settings) │ Postgres/RLS │
│  (SPA estática)        │ ◀─────────────────────────────│   + Auth     │
└──────────┬─────────────┘                                └──────────────┘
           │ fetch Parquet (parquet-wasm)
           ▼
   ┌───────────────┐        sube Parquet + manifest.json
   │ Cloudflare R2 │ ◀───────────────────────────────────┐
   │   (bucket)    │                                      │
   └───────────────┘                              ┌────────┴────────┐
                                                   │  pipeline/      │
                                                   │ fill_r2.py      │ (PC + MT5)
                                                   └─────────────────┘
```

- **Auth + sync**: Supabase Auth gestiona el login; las sesiones (trades, chart
  state) se sincronizan contra Postgres con Row Level Security (cada usuario
  solo ve sus propias filas). El login es obligatorio: no hay modo invitado ni
  build offline.
- **Datos de mercado**: el pipeline `pipeline/` cosecha velas de MetaTrader 5,
  las convierte a Parquet y las sube a un bucket R2 junto a un `manifest.json`.
  La SPA descarga esos Parquet directamente desde el navegador (CORS en el
  bucket), los decodifica con `parquet-wasm` y los guarda en IndexedDB para
  uso sin red posterior.
- **Despliegue**: el build de Angular es 100% estático (sin SSR ni backend) y
  se publica en **Vercel**.

## Pipeline de datos (`pipeline/`)

Orquestador end-to-end MT5 → Parquet → R2, pensado para correr en una PC
Windows con la terminal MetaTrader 5 abierta (la librería `MetaTrader5` habla
con ella):

```bash
py pipeline/fill_r2.py --symbols US30,NAS100,XAUUSD --desde 2024-01-01 --env C:/ruta/al/.env
```

- `pipeline/fill_r2.py` — entry point: cosecha M1 de MT5, remuestrea y escribe
  Parquet local (vía `parquet_builder.harvest_to_parquet`), después sube todo
  el árbol a R2 y publica `manifest.json` (vía `r2_uploader`). Acepta
  `--skip-upload` para generar solo los Parquet sin subir, y `--env <ruta>`
  para cargar las credenciales desde un `.env` (útil al correr desde un git
  worktree, donde el `.env` de la raíz no está presente).
- `pipeline/parquet_builder.py` — cosecha de MT5 y escritura de Parquet
  (M1 particionado por año, además de H1/D1), usa `mt5_common.py` (raíz del
  repo) para la conexión a la terminal.
- `pipeline/r2_uploader.py` — sube el árbol Parquet local a R2 (boto3, API S3
  compatible) y construye los registros para el manifest.
- `pipeline/manifest.py` — lógica pura (sin red) que genera el `manifest.json`
  a partir de los registros de subida; ver el esquema documentado en el
  docstring del módulo.

Credenciales R2 (variables de entorno, ver [`.env.example`](.env.example)):

| Variable | Descripción |
| --- | --- |
| `R2_ACCOUNT_ID` | ID de la cuenta de Cloudflare |
| `R2_BUCKET_NAME` | Bucket R2 donde se publican Parquet + manifest |
| `R2_ACCESS_KEY_ID` | Access Key ID del token R2 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key del token R2 |
| `R2_ENDPOINT` | Opcional; si se omite se construye desde `R2_ACCOUNT_ID` |

## Supabase (Auth + sincronización de sesiones)

La URL pública y la `anon key` de Supabase viven en
`emulador/src/environments/environment*.ts` (no en `.env`: son claves
públicas, pensadas para el cliente). Las políticas de Row Level Security se
versionan en [`supabase/verify_session_rls.sql`](supabase/verify_session_rls.sql),
usado para verificar que cada usuario solo puede leer/escribir sus propias
sesiones.

## Correr en local

```bash
cd emulador
npm install
npm start   # http://localhost:4200
```

La SPA habla directo con Supabase y con el bucket R2 configurado en
`environment.ts`; no hace falta levantar ningún servicio adicional.

## Tests y calidad

```bash
# pipeline (Python)
cd pipeline && python -m pytest -q
cd pipeline && ruff check .
cd pipeline && ruff format --check .

# frontend (Angular)
cd emulador && npm run lint
cd emulador && npm run format:check
cd emulador && npx ng test --no-watch
cd emulador && npm run build
```

## Scripts auxiliares (estrategia / EA)

En `scripts/` (se ejecutan desde la raíz del repo): `simulador.py` (réplica Python
del EA para verificación) y `descargar_datos.py` (descarga velas de MT5 a `datos/`).
`AlgoritmoEA.mq5` es el Expert Advisor de MetaTrader 5. Ambos scripts usan
`mt5_common.py` (raíz del repo) para la conexión a la terminal MetaTrader 5.

## Licencia

[MIT](LICENSE).
