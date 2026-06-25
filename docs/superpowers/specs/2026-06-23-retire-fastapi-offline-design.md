# Diseño — Fase 3: retirar el backend FastAPI, el build offline y el modo invitado

**Fecha:** 2026-06-23
**Estado:** Aprobado (brainstorming) — listo para `writing-plans`
**Repo:** `Humerez-Sebas/trading-emulator` · front: `emulador/` (Angular 21 standalone + NgRx)
**Rama:** `claude/retire-fastapi-backend` (creada desde `origin/main` @ `7d321f1`, Fase 2 mergeada)

---

## 1. Contexto y objetivo

Tras las Fases 1 y 2 (Supabase Auth + sincronización de sesiones, ambas en `main`), el
deploy de producción es **Angular SPA + Supabase + Cloudflare R2**. Con `dataSource='r2'`
y auth Supabase en todos los entornos, **el backend FastAPI ya no se ejecuta en runtime**:

- Auth → Supabase (los métodos de auth de `BackendApiService` no se usan).
- Mercados → `mercados-page` solo renderiza `<app-r2-markets>` cuando `isR2`; la rama
  backend/catálogo-offline es código muerto.
- Crear sesión → toma el camino `isR2`; el toggle `source` y `downloadChunked` están muertos.
- La feature NgRx `user-symbols` nunca se carga (solo se dispara cuando `!isR2`).

Esta fase es **pura eliminación**: borrar el backend FastAPI, el stack Docker/Postgres/
Flagsmith, el build estático *offline* y el **modo invitado**, dejando un solo build que
**exige login** (invite-only). El pipeline de datos MT5→R2 se conserva (solo se reubica).

### Decisiones tomadas (brainstorming)

| Decisión | Elección |
|---|---|
| Función "subir CSV propio" (catálogo offline en IndexedDB) | **Eliminar** junto con el backend. |
| Build offline (`environment.offline.ts`, `offlineOnly`, config `offline`) | **Eliminar.** |
| Modo invitado en runtime (`continueAsGuest`, `guestModeEnabled`, logout→invitado) | **Eliminar → login obligatorio.** |
| `harvester.py` (alimenta `/ingest` del backend, NO R2) | **Borrar** con el backend. |
| Pipeline R2 superviviente (`parquet_builder`/`r2_uploader`/`manifest`) | **Reubicar a `pipeline/`**; borrar `backend/` entero. |
| Operaciones del lado de GitHub (branch protection, PR, settings) | **Vía MCP de GitHub** (no `gh`/git local). |

> **Cambio consciente respecto al master prompt:** el master prompt fijaba *local-first*
> ("login aditivo, logout = invitado, nunca un muro") y listaba `harvester.py` entre lo que
> conservar. Aquí, por decisión explícita del dueño: (a) **login obligatorio** (se elimina el
> invitado), y (b) **`harvester.py` se borra** por estar acoplado al backend (el pipeline R2
> real es `parquet_builder`/`r2_uploader`/`manifest`, que sí se conservan).

## 2. Arquitectura: antes → después

```
ANTES                                         DESPUÉS
Angular SPA                                   Angular SPA (un solo build, login obligatorio)
 ├─ Supabase (auth + sync)        ✅            ├─ Supabase (auth + sync)
 ├─ R2 (parquet → IndexedDB)      ✅            └─ R2 (parquet → IndexedDB)
 ├─ FastAPI /auth /symbols /candles  ❌
 └─ build offline + modo invitado    ❌        pipeline/  (MT5 → Parquet → R2, sin backend)
backend/ (FastAPI + pipeline R2)               ├─ parquet_builder.py · r2_uploader.py · manifest.py
infra/ (Postgres, Flagsmith, nginx)  ❌         └─ tests/
```

## 3. Frontend — quitar referencias al backend

- **Borrar:** `services/backend-api.service.ts` (+spec), `auth/auth.interceptor.ts` (+spec),
  `domain/csv-legacy.repository.ts`, y toda la feature NgRx `state/user-symbols/`
  (actions/reducer/effects + specs).
- **`domain/market-data-repository.provider.ts`:** dejar de ramificar por `environment.dataSource`;
  proveer siempre `IndexedDbMarketDataRepository`. Simplificar/ajustar
  `pickMarketDataRepository` y `market-data.repository.ts` si el parámetro `dataSource` queda
  sin uso.
- **`pages/mercados/mercados-page.component`:** colapsar al hub R2. Eliminar la rama
  backend/catálogo-offline (estado `symbols`, `toBackendSymbol`, modo `todos/mis`, curación,
  `remove`, uso de `OfflineSymbol`). Queda renderizando `<app-r2-markets>` (o se promueve
  `r2-markets.component` a la ruta directamente). Limpiar HTML/CSS muertos.
- **`pages/crear-sesion/crear-sesion-page.component`:** eliminar `source: 'backend'|'csv'`,
  la rama backend (`api.downloadChunked`, `PendingCsv` desde backend) y la rama CSV
  (dropzone, parseo, `db.putSymbol`, verificación de mismo símbolo). Queda solo el flujo R2
  (`isR2`). Ajustar specs.
- **`app.config.ts`:** quitar `authInterceptor` de `provideHttpClient(withInterceptors([...]))`,
  y `userSymbolsFeature` / `UserSymbolsEffects` de `provideStore`/`provideEffects`.
- **Catálogo CSV offline:** eliminar `services/offline-catalog.ts` y el store `symbols` de
  `services/workspace-db.service.ts` (métodos `putSymbol`/`getSymbol`/`listSymbols`/
  `removeSymbol`). **No se baja `DB_VERSION`**; el store simplemente deja de crearse/usarse
  (las bases existentes lo ignoran). Documentar en el código.
- **`environments/environment*.ts`:** quitar `backendUrl`, `registrationEnabled`, `dataSource`,
  `offlineOnly`, `guestModeEnabled`. Quedan `supabaseUrl`, `supabaseAnonKey`,
  `marketDataBaseUrl`. Actualizar el tipo inline de los tres archivos.
- **`components/data-wizard/`:** `onboarding-decision.ts` y `data-wizard.guard.ts` ya no
  dependen del flag `dataSource` (siempre R2): simplificar `needsR2Onboarding` y el guard.

## 4. Frontend — quitar build offline + modo invitado (login obligatorio)

- **Borrar:** `environments/environment.offline.ts`; la configuración `offline` (build + serve)
  en `emulador/angular.json`; el paso "Offline static build" de `ci.yml`;
  `state/auth/auth.effects.offline.spec.ts`.
- **Auth (modo invitado fuera):**
  - `state/auth/auth.reducer.ts`: `AuthStatus` se reduce a
    **`'unknown' | 'authenticated' | 'anonymous'`** (se eliminan `guest` y `offline`).
    Quitar el `on(continueAsGuest)`. `sessionResolved` pierde el flag `offline` y mapea
    `user ? 'authenticated' : 'anonymous'`.
  - `state/auth/auth.actions.ts`: borrar `continueAsGuest`; `sessionResolved` pasa a
    `props<{ user: AuthUser | null }>()`.
  - `state/auth/auth.effects.ts`: `check$` sin short-circuit `offlineOnly` ni `guestPersisted`;
    `getSession()` (lectura local) → usuario ⇒ `authenticated`, null ⇒ `anonymous`. Borrar
    `persistGuest$`, `GUEST_KEY`, `guestPersisted`, y la limpieza de guest en `redirectAfterLogout$`.
  - `auth/auth.guard.ts`: pasa **solo `authenticated`**; cualquier otro ⇒
    `/login?volver=<url>`.
  - `pages/auth/auth-page.component.*`: quitar el botón "Continuar como invitado" y su acción.
  - `app.html` / `app.ts`: quitar el pill "Invitado" y toda la lógica condicional de guest;
    "Iniciar/Cerrar sesión" según `authenticated`/`anonymous`.
- **Sync (Fase 2):** eliminar el camino "adoptar sesiones de invitado al iniciar sesión" en
  `state/sync/session-sync.effects.ts` (+spec). Queda muerto: con login obligatorio no existen
  sesiones locales anónimas previas al login.
- **Resiliencia (nota de diseño):** como `SupabaseAuthService.getUser()` usa `getSession()`
  (lectura **local**, sin red), colapsar `offline` en `anonymous` no expulsa a un usuario ya
  logueado (su sesión persiste en localStorage). Por eso se elimina el estado `offline`.

## 5. Python — borrar backend, reubicar el pipeline

- **Borrar `backend/` por completo salvo el pipeline:** `app/` (FastAPI: config, db, deps,
  flags, main, models, routers/*, schemas, security), `alembic/` + `alembic.ini`, `Dockerfile`,
  `scripts/create_user.py`, `tests/conftest.py`, y los tests del backend (`test_auth`,
  `test_candles`, `test_ingest`, `test_user_symbols`, `test_health`), `README.md`, `ruff.toml`.
- **Borrar `harvester.py` + `tests/test_harvester.py`** (alimentaban `/ingest`; muertos sin
  backend).
- **Reubicar a `pipeline/` (`git mv`):** `parquet_builder.py`, `r2_uploader.py`, `manifest.py`
  + `tests/test_parquet_builder.py`, `tests/test_r2_uploader.py`, `tests/test_manifest.py`.
  Ajustar los `sys.path.insert` de los tests (hoy `dirname(dirname(__file__))` apunta a
  `backend/`; pasa a `pipeline/`, y la raíz —donde vive `mt5_common.py`— sigue accesible vía
  `dirname(dirname(dirname(__file__)))`). Verificar el import `import manifest` de
  `r2_uploader.py` con el nuevo layout.
- **`pipeline/requirements*.txt`:** solo lo que usa el pipeline (pandas, pyarrow, boto3) +
  dev (pytest, ruff). Sin FastAPI/SQLAlchemy/alembic/passlib/python-jose.
- **Conservar en raíz:** `mt5_common.py`. **Conservar `scripts/`** (`simulador.py`,
  `descargar_datos.py`) y `AlgoritmoEA.mq5` (estrategia/EA, no relacionados con el backend).

## 6. Infra, CI/CD y deploy

**Las operaciones del lado de GitHub se ejecutan con el MCP de GitHub** (branch protection,
creación del PR, settings del repo). Los *contenidos* de los YAML de workflow se editan como
cualquier archivo y viajan en el PR.

- **Borrar:** `infra/` entero (`docker-compose.yml`, `docker-compose.full.yml`,
  `flagsmith/seed.py`), `emulador/Dockerfile`, `emulador/nginx.conf`.
- **`.github/workflows/ci.yml`:**
  - Job `backend` → renombrar a **`Pipeline (lint · tests)`**, `working-directory: pipeline`,
    pasos ruff + pytest + pip-audit (corre en Linux; los tests con MT5 siguen *skipped*).
  - Borrar el job `docker-build` (ya no hay imágenes).
  - En el job `frontend`, borrar el paso "Offline static build".
  - El job `deploy` (Vercel · prod) se mantiene.
- **`.github/workflows/cd.yml`:** borrar (publicaba imágenes GHCR de backend+frontend; el
  frontend se despliega por Vercel).
- **Branch protection de `main` (vía MCP de GitHub):** actualizar los *required status checks*
  a **`Pipeline (lint · tests)`** + **`Frontend (lint · tests · build · audit)`** (quitar
  `Backend (...)` y `Docker (...)`). Paso explícito de cierre tras mergear, o coordinado para
  no bloquear el propio PR.
- **`emulador/vercel.json`:** ya usa `npm run build` (prod) — sin cambios.

## 7. Config y documentación

- **`.env` / `.env.example`:** dejar solo las variables R2 (`R2_ACCOUNT_ID`, `R2_BUCKET_NAME`,
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` opcional). Quitar Postgres/JWT/
  INGEST/CORS/COOKIE/TIMESCALE/REGISTRATION/FLAGSMITH/DEMO/BACKEND_URL/HARVEST_*.
- **`README.md`:** reescribir la arquitectura a *Angular 21 + NgRx + Supabase + R2 + pipeline*.
  Quitar las secciones FastAPI/Postgres/Flagsmith/Docker/full-stack/harvester/usuario-demo y la
  de "Despliegue estático ($0, solo frontend)" (el invitado desaparece). Documentar `pipeline/`
  (flujo `parquet_builder` → `r2_uploader`, variables R2). `emulador/README.md` queda alineado.

## 8. Manejo de errores y bordes

- **Sin sesión:** `getSession()` → null ⇒ `anonymous` ⇒ el guard redirige a `/login?volver=`.
- **Fallo raro de `getSession()`:** se trata como `anonymous` (no hay estado `offline`); el
  usuario va a `/login`. Aceptable porque la lectura es local (un throw implica storage roto).
- **Datos R2:** sin cambios; los errores de descarga/parquet siguen manejados por
  `manifest.service`/`parquet-download.service`.
- **Migración de DB local (IndexedDB):** el store `symbols` deja de usarse sin bajar
  `DB_VERSION`; las bases existentes no se rompen (el store huérfano se ignora).

## 9. Pruebas y verificación

- **Frontend** (desde `emulador/`): `npm run lint`, `npm run format:check`,
  `npx ng test --no-watch`, `npm run build` verdes tras la poda. Specs ajustados/nuevos:
  - `auth.guard`: solo `authenticated` pasa; el resto → `/login`.
  - `auth.effects`/`auth.reducer`: `check$` resuelve `authenticated`/`anonymous` sin guest;
    sin `continueAsGuest`/`persistGuest`.
  - `mercados` y `crear-sesion`: solo flujo R2; sin ramas backend/CSV.
  - Confirmar que **no quedan imports** de `BackendApiService`/`authInterceptor`/`user-symbols`/
    `csv-legacy`/`offline-catalog`/`environment.offline`.
- **Pipeline** (desde `pipeline/`): `pytest -q` verde (`parquet_builder`/`r2_uploader`/
  `manifest`; MT5 sigue *skipped*); `ruff check .` y `ruff format --check .`.
- **Build offline eliminado:** `npm run build -- --configuration offline` ya **no** debe existir
  (ni en CI).
- **Navegador (preview_*):** arranque sin sesión → redirige a `/login`; login Supabase →
  Mercados R2 y crear sesión; recarga mantiene sesión. Verificar en la consola/red que **no**
  hay llamadas a `localhost:8000` ni a `/auth`,`/symbols`,`/candles`.
- **CI:** el PR pasa con `Pipeline` + `Frontend`; el deploy Vercel corre en `push` a `main`.

## 10. Fuera de alcance

- Pipeline MT5→R2 (lógica **intacta**; solo cambia de carpeta).
- Supabase auth/sync (Fases 1 y 2, ya en `main`).
- Datos del bucket R2.
- Herramientas de estrategia (`scripts/simulador.py`, `scripts/descargar_datos.py`,
  `AlgoritmoEA.mq5`) y `mt5_common.py`.
