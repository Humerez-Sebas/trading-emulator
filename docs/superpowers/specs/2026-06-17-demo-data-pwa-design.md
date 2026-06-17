# Diseño: Datos demo offline (XAUUSD/US30 H1) + empty-state del emulador + PWA

**Fecha:** 2026-06-17
**Estado:** Aprobado (brainstorming) — listo para `writing-plans`
**Repo:** `Humerez-Sebas/trading-emulator` · front: `emulador/` (Angular standalone + NgRx)
**Para ejecutar en:** una sesión posterior (este documento + su plan).

---

## 1. Contexto y objetivo

El modo offline del emulador ya está desplegado (Vercel, CD por GitHub Actions). Hoy, un visitante nuevo del sitio offline ve el catálogo de Mercados **vacío** hasta que sube un CSV, y el emulador abre con un **chart por defecto** sólo porque hay estado previo en IndexedDB (lo que implica una sesión ya creada). Queremos una primera experiencia coherente:

1. **Datos demo** precargados: **XAUUSD H1** y **US30 H1** aparecen por defecto en **Mercados** (sin que el usuario suba nada).
2. **Sin chart por defecto** al entrar al emulador: precargar sólo los *activos* (catálogo + velas), NO una sesión. Un visitante sin sesión ve un **empty-state** que lo invita a crear una sesión; quien ya creó una, la sigue restaurando al volver.
3. **PWA**: la app offline se vuelve instalable y usable sin red (service worker + manifest).

**Decisiones (brainstorming):**
- Datos demo: modificar `scripts/descargar_datos.py` para bajar XAUUSD H1 + US30 H1 desde **MT5** y guardarlos en `emulador/public/`. El usuario deja **MT5 abierto** durante la ejecución del plan.
- Emulador sin sesión: **empty-state con CTA** al wizard (no redirección).
- PWA: service worker activo en builds **prod + offline** (default de Angular), manifest con tema oscuro.

## 2. Arquitectura

Tres piezas cohesivas pero independientes.

### 2.1 Adquisición de datos demo — `scripts/descargar_datos.py`

El script hoy: hardcodea `SYMBOL="XAUUSD"`, baja M3/M5/M15/H1/H4 vía `MetaTrader5`, escribe a una carpeta local. Cambios:

- **Símbolos:** lista `["XAUUSD", "US30"]`. **Sólo H1** (la temporalidad del demo).
- **Resolución de nombre por símbolo:** reusar el patrón existente (`mt5.symbols_get(f"{base}*")` + `symbol_select`) **por cada** símbolo lógico, porque el broker puede nombrar US30 como `US30.cash`, `DJ30`, etc. Si un símbolo no se resuelve, imprimir aviso y continuar con el otro (no abortar todo).
- **Salida:** `emulador/public/` (ruta relativa al script: `os.path.join(os.path.dirname(__file__), "..", "emulador", "public")`). Nombres **lógicos**: `xauusd_h1.csv`, `us30_h1.csv` (independientes del nombre interno de MT5) para que `symbolFromFileName` derive `XAUUSD`/`US30`.
- **Formato:** mantener `time,open,high,low,close` con `time` en `YYYY-MM-DD HH:MM` UTC (ya compatible con `CsvLoaderService`).
- **Rango:** `DESDE` razonable para tener suficientes velas H1 (p. ej. `2026-01-01` → hoy ≈ varios miles de velas). Configurable arriba del script.
- **Prerrequisito de ejecución:** MT5 instalado y **abierto/logueado** en Windows; paquete `MetaTrader5`. Es un paso manual del entorno (no automatizable en CI).
- **Verificación:** ambos CSV existen en `emulador/public/`, con header correcto y un número de filas plausible (> ~1000 H1).

### 2.2 Seed del catálogo offline + empty-state del emulador

**`OfflineSeedService`** (`emulador/src/app/services/offline-seed.service.ts`, nuevo):
- Método `seedIfNeeded(): Promise<void>`.
- Gate: sólo actúa si `environment.offlineOnly`. En full-stack no seedea (Mercados usa backend).
- Idempotencia: flag `localStorage 'emulador.demoSeeded.v1'`. Si está → retorna sin hacer nada (así borrar un activo demo NO lo re-seedea).
- Si procede: para cada uno de `[{file:'xauusd_h1.csv', sym:'XAUUSD', desc:'Oro'}, {file:'us30_h1.csv', sym:'US30', desc:'US30'}]`:
  - `fetch('/'+file)` → texto. Si 404/empty → saltar ese símbolo (best-effort).
  - `CsvLoaderService.parseText(text, file)` → `{tf, candles}`.
  - `db.putSeries(sym, tf, candles)` y `db.putSymbol({ symbol: sym, descripcion, categoria: 'Demo', digits: derivePointSize(candles), coverage: coverageFromParsed([{tf,candles}]), createdAt: now, lastModified: now })`.
  - **No** escribir `meta`/workspace ni `currentAsset`.
- Al final (aunque algún fetch falle) setear la flag `emulador.demoSeeded.v1` para no reintentar en cada arranque. Best-effort: errores se tragan (no rompen el bootstrap).

**Wiring:** `provideAppInitializer(() => inject(OfflineSeedService).seedIfNeeded())` en `app.config.ts`. Corre antes de renderizar componentes, así Mercados ve el catálogo en el primer render. La primera visita paga un fetch+parse+writes (cientos de ms, assets same-origin); visitas siguientes: flag presente → instantáneo.

**Mercados offline:** sin cambios — ya lee `listSymbols()` y mostrará XAUUSD/US30 (categoría "Demo").

**Emulador empty-state** (`emulador-page.component.ts`):
- Inyectar `selectCurrentAsset`; `hasSession = computed(() => !!currentAsset())`.
- Envolver el bloque `.layout` (workspace+chart) en `@if (hasSession()) { … } @else { <empty-state> }`.
- Empty-state: `ui-empty-state` con título "Aún no tienes una sesión activa", hint "Crea una desde un activo demo o subiendo tus CSV", icono SVG, y CTA `<a appButton variant="primary" routerLink="/sesiones/crear">Crear sesión</a>`.
- Visitante nuevo (catálogo seedeado, sin workspace) → `currentAsset` null → empty-state. Quien ya creó sesión → `loadInitial` restaura `currentAsset` → chart (continuidad intacta). Al crear sesión por el wizard, `switchAsset` setea `currentAsset` → chart.
- Nota menor: durante el init async podría haber un parpadeo empty-state→chart; aceptable. (Opcional: gate con un flag "workspaces inicializados" si molesta.)

### 2.3 PWA

- `ng add @angular/pwa` (genera `@angular/service-worker`, `ngsw-config.json`, `public/manifest.webmanifest`, iconos en `public/icons/`, registro en `app.config.ts`, y `serviceWorker`/assets en `angular.json`).
- **Registro:** `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })` → activo en builds prod-class (incluye `offline`), inactivo en dev.
- **Manifest** (tema TradingView): `name: "Emulador de Backtesting"`, `short_name: "Emulador"`, `theme_color: "#2962ff"`, `background_color: "#000000"`, `display: "standalone"`, `start_url: "/"`, iconos 192/512 (los placeholder de `ng add` o derivados del brand; aceptable para esta iteración).
- **`ngsw-config.json`:** asset group `app` (prefetch: index.html, *.css, *.js) + asset group para `/*.csv` (prefetch o lazy) y `/favicon.ico`, `/manifest.webmanifest`, iconos — para que la app y los CSV demo funcionen offline tras la primera carga.
- **`index.html`:** link al manifest + `<meta name="theme-color" content="#000000">` (lo agrega `ng add`; ajustar valores).
- **Vercel:** el rewrite SPA (`/(.*) → /index.html`) NO afecta a `ngsw-worker.js`/`manifest.webmanifest`/`ngsw.json` porque Vercel sirve archivos estáticos existentes antes de aplicar rewrites. **Sin cambios en `vercel.json`.**

## 3. Manejo de errores

- **Seed:** todo best-effort. Fetch fallido de un CSV → se salta ese símbolo; error general → se traga y se setea la flag igual (no reintentar en bucle). Nunca bloquea el bootstrap.
- **`descargar_datos.py`:** si MT5 no inicializa → error claro y exit. Si un símbolo no resuelve → aviso y seguir con el otro.
- **PWA:** si el SW falla al registrarse, la app sigue funcionando (registro best-effort de Angular).

## 4. Pruebas (vitest, mantener verde; cobertura ≥80% en services/pages)

- **`OfflineSeedService`** (`offline-seed.service.spec.ts`): mock de `fetch` (devuelve CSV de prueba) + `workspaceDbStub`; con `offlineOnly` y sin flag → llama `putSeries`+`putSymbol` para ambos símbolos y setea la flag; con la flag puesta → no hace nada (idempotente); con `offlineOnly=false` → no hace nada. (Mockear `environment.offlineOnly` mutando el const en el test, patrón ya usado en `auth.effects.offline.spec.ts`.)
- **Emulador** (`emulador-page.component.spec.ts`, nuevo o ampliado): `currentAsset` null → renderiza el empty-state con el CTA a `/sesiones/crear`; `currentAsset` seteado → renderiza el workspace/chart.
- **`descargar_datos.py`:** sin test unitario (requiere MT5); verificación por ejecución.
- **PWA:** sin test unitario del SW; verificación por build (manifest + ngsw-config presentes y el `offline` build emite `ngsw-worker.js`).

## 5. Verificación (end-to-end)

- `cd emulador && npx ng test --watch=false` → verde; lint/format limpios.
- `python scripts/descargar_datos.py` con MT5 abierto → `emulador/public/xauusd_h1.csv` y `us30_h1.csv` creados (header + filas plausibles).
- `npm run build -- --configuration offline` → compila e incluye `ngsw-worker.js` + `manifest.webmanifest` en `dist/emulador/browser`.
- Preview offline (`npm start -- --configuration offline` o servir el dist): primer arranque seedea → **Mercados muestra XAUUSD y US30 (H1, categoría "Demo")**; el emulador muestra **empty-state** (sin chart) con CTA; crear sesión desde un activo demo abre el chart; recargar conserva el catálogo y NO re-seedea.
- PWA: en el dist servido, la app es instalable (manifest válido) y el SW cachea el app-shell (Lighthouse PWA / DevTools → Application → Service Workers).

## 6. Despliegue

Cambios de código van por **PR a `main`** (protegida: PR + 3 checks). Al mergear, el job `deploy` de GitHub Actions publica a Vercel (offline build con SW + datos demo empaquetados). Los CSV demo se versionan en `emulador/public/` (se commitean) para que el build los incluya.

## 7. Fuera de alcance / notas

- `descargar_datos.py` requiere MT5 abierto/logueado (paso manual del entorno); no corre en CI.
- El nombre interno de US30 varía por broker; el script lo resuelve por wildcard pero el archivo y el catálogo usan el símbolo lógico `US30`.
- Iconos PWA: se usan los generados por `ng add` (placeholder/brand) en esta iteración; refinamiento de iconos queda fuera de alcance.
- No se crea sesión/workspace demo (deliberado): sólo catálogo + velas, para no imponer un chart por defecto.
