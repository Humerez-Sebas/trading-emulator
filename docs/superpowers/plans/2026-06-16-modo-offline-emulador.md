# Modo offline completo del emulador + branch protection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir desplegar el frontend del emulador 100% estático (sin backend, $0) con entrada de invitado y creación de sesiones por CSV centralizada en el wizard, persistiendo un catálogo de símbolos en IndexedDB; y proteger `main` para que ningún PR mergee con CI en rojo.

**Architecture:** Se reutiliza la maquinaria offline existente (parser CSV, pipeline `switchAsset`, IndexedDB `meta`/`series`). Se añade un store IndexedDB `symbols` (catálogo), un estado de auth `guest`, flags de entorno build-time (`offlineOnly`, `guestModeEnabled`) con una configuración de build `offline`, una rama CSV en el wizard, una variante offline de la página Mercados, y se reubica el import de sesión a la página Sesiones quitando el botón de carga del toolbar. La branch protection se aplica vía REST API de GitHub.

**Tech Stack:** Angular standalone + signals, NgRx (store/effects), IndexedDB, vitest (`@angular/build:unit-test`), `fake-indexeddb`, ESLint + Prettier, GitHub Actions, `gh` CLI.

## Global Constraints

- Tests: `cd emulador && npx ng test --watch=false`. Cobertura mínima **80%** líneas/statements (gate en `angular.json`) sobre `state/`, `services/`, `auth/`, `pages/` — todo código nuevo debe tener test.
- Lint/format obligatorios: `npm run lint` y `npm run format:check` (Prettier). Correr `npm run format` antes de commitear.
- IndexedDB en tests: `import 'fake-indexeddb/auto';` como primera línea del spec.
- Todo el copy visible al usuario va en **español**.
- Reusar tokens de diseño de `src/styles.css` y `src/styles/ui-primitives.css`; reusar `ButtonDirective` (`appButton`, variantes `primary|ghost|subtle|danger|danger-solid`, `[block]`), `EmptyStateComponent` (`ui-empty-state`, slot `[icon]`, `[boxed]`), `SegmentedControlComponent`, `MenuComponent`, `DialogService`, `BadgeDirective`.
- Sin emojis como iconos: usar SVG stroke (mismo estilo que los `<svg>` existentes).
- Errores mostrados con icono + texto (no solo color); focus visible `outline: 2px solid var(--accent)`.
- Commits frecuentes (uno por tarea). Mensajes en inglés, imperativo. Terminar el cuerpo del commit con:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Build estático objetivo: `npm run build -- --configuration offline`.
- Nombres EXACTOS de jobs de CI (para branch protection): `Backend (lint · tests · audit)`, `Frontend (lint · tests · build · audit)`, `Docker (compose config · image builds)`.

---

## File Structure

**Nuevos:**
- `emulador/src/environments/environment.offline.ts` — entorno del build estático.
- `emulador/src/app/services/offline-catalog.ts` — tipo `OfflineSymbol` + helper puro `coverageFromParsed`.

**Modificados:**
- `emulador/src/environments/environment.ts`, `environment.prod.ts` — flags `offlineOnly`, `guestModeEnabled`.
- `emulador/angular.json` — configuración de build/serve `offline`.
- `emulador/src/app/services/workspace-db.service.ts` — DB v4 + store `symbols` (CRUD + cascada).
- `emulador/src/app/testing/workspace-db.stub.ts` — métodos del catálogo en el stub.
- `emulador/src/app/state/auth/{auth.actions.ts,auth.reducer.ts,auth.effects.ts}` — estado `guest`.
- `emulador/src/app/auth/auth.guard.ts` — aceptar `guest`.
- `emulador/src/app/pages/auth/auth-page.component.{ts,html,css}` — botón invitado.
- `emulador/src/app/app.{html,ts}` — pill "Invitado", ocultar login en guest/offline.
- `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.{ts,html,css}` — rama CSV.
- `emulador/src/app/pages/mercados/mercados-page.component.{ts,html,css}` — variante offline.
- `emulador/src/app/components/controls/controls.component.{ts,html}` — quitar carga de velas.
- `emulador/src/app/pages/sesiones/sesiones-page.component.{ts,html}` — import de sesión.
- `README.md` (raíz) — sección despliegue estático.
- `.github/workflows/` — sin cambios (solo se consumen los nombres de jobs).

---

## Task 1: Env flags + configuración de build `offline`

**Files:**
- Modify: `emulador/src/environments/environment.ts`
- Modify: `emulador/src/environments/environment.prod.ts`
- Create: `emulador/src/environments/environment.offline.ts`
- Modify: `emulador/angular.json`

**Interfaces:**
- Produces: `environment.offlineOnly: boolean` y `environment.guestModeEnabled: boolean` (consumidos por Tasks 5, 6, 8, 9). Build config `offline` (consumida por verificación y README).

- [ ] **Step 1: Añadir los flags al entorno dev**

`emulador/src/environments/environment.ts`:

```ts
/** Dev environment. The backend URL is the docker-compose default. */
export const environment = {
  backendUrl: 'http://localhost:8000',
  // shows/hides the "create account" link; mirrors the backend registration gate
  registrationEnabled: true,
  // build-time mode flags (see environment.offline.ts for the static build)
  offlineOnly: false,
  guestModeEnabled: true,
};
```

- [ ] **Step 2: Añadir los flags al entorno prod (full-stack)**

`emulador/src/environments/environment.prod.ts` — añadir las dos claves al objeto `environment` existente (conservar el comentario de cabecera y `backendUrl: ''`, `registrationEnabled: false`):

```ts
export const environment = {
  backendUrl: '',
  registrationEnabled: false,
  offlineOnly: false,
  guestModeEnabled: true,
};
```

- [ ] **Step 3: Crear el entorno offline (build estático)**

Create `emulador/src/environments/environment.offline.ts`:

```ts
/**
 * Static, backend-less build (Cloudflare Pages / any static host, $0).
 * `offlineOnly` short-circuits the auth session check straight to guest and
 * makes every backend-only surface use the local IndexedDB catalog instead.
 * Swapped in by angular.json fileReplacements for the `offline` configuration.
 */
export const environment = {
  backendUrl: '',
  registrationEnabled: false,
  offlineOnly: true,
  guestModeEnabled: true,
};
```

- [ ] **Step 4: Añadir la configuración de build `offline` en angular.json**

En `emulador/angular.json`, dentro de `projects.emulador.architect.build.configurations`, añadir una entrada `offline` (al mismo nivel que `production`, después de ella):

```json
"offline": {
  "fileReplacements": [
    {
      "replace": "src/environments/environment.ts",
      "with": "src/environments/environment.offline.ts"
    }
  ],
  "budgets": [
    { "type": "initial", "maximumWarning": "500kB", "maximumError": "1MB" },
    { "type": "anyComponentStyle", "maximumWarning": "10kB", "maximumError": "14kB" }
  ],
  "outputHashing": "all"
},
```

Y en `projects.emulador.architect.serve.configurations`, añadir (después de `production`):

```json
"offline": {
  "buildTarget": "emulador:build:offline"
},
```

- [ ] **Step 5: Verificar que ambos builds compilan**

Run:
```bash
cd emulador && npm run build && npm run build -- --configuration offline
```
Expected: ambos terminan con "Application bundle generation complete" sin errores de TS.

- [ ] **Step 6: Lint + format + commit**

Run:
```bash
cd emulador && npm run format && npm run lint
git add emulador/src/environments emulador/angular.json
git commit -m "build: add offlineOnly/guestModeEnabled env flags and offline build config"
```

---

## Task 2: Módulo `offline-catalog.ts` (tipos + cobertura)

**Files:**
- Create: `emulador/src/app/services/offline-catalog.ts`
- Create: `emulador/src/app/services/offline-catalog.spec.ts`

**Interfaces:**
- Consumes: `Candle`, `Timeframe` de `../models`; `TfCoverage` de `./backend-api.service`.
- Produces:
  - `interface OfflineSymbol { symbol: string; descripcion: string; categoria: string; digits?: number; coverage: TfCoverage[]; createdAt: number; lastModified: number; }`
  - `interface ParsedTf { tf: Timeframe; candles: Candle[]; }`
  - `function coverageFromParsed(files: ParsedTf[]): TfCoverage[]`
  - `const DEFAULT_OFFLINE_CATEGORY = 'Mis CSV'`
  (Consumidos por Tasks 3, 7, 9.)

- [ ] **Step 1: Escribir el test que falla**

Create `emulador/src/app/services/offline-catalog.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { coverageFromParsed } from './offline-catalog';
import { series } from '../testing/fixtures';

describe('coverageFromParsed', () => {
  it('builds one coverage entry per timeframe with min/max/count', () => {
    const cov = coverageFromParsed([
      { tf: 'H1', candles: series(3, 1000, 3600) }, // 1000, 4600, 8200
      { tf: 'H4', candles: series(2, 2000, 14400) }, // 2000, 16400
    ]);
    expect(cov).toEqual([
      { tf: 'H1', desde: 1000, hasta: 8200, velas: 3 },
      { tf: 'H4', desde: 2000, hasta: 16400, velas: 2 },
    ]);
  });

  it('merges multiple files of the same tf and ignores empty ones', () => {
    const cov = coverageFromParsed([
      { tf: 'H1', candles: series(2, 1000, 3600) }, // 1000, 4600
      { tf: 'H1', candles: series(2, 100000, 3600) }, // 100000, 103600
      { tf: 'M1', candles: [] },
    ]);
    expect(cov).toEqual([{ tf: 'H1', desde: 1000, hasta: 103600, velas: 4 }]);
  });

  it('returns an empty array for no files', () => {
    expect(coverageFromParsed([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd emulador && npx ng test --watch=false -- offline-catalog`
Expected: FAIL — `coverageFromParsed` no existe / módulo no encontrado.

- [ ] **Step 3: Implementar el módulo**

Create `emulador/src/app/services/offline-catalog.ts`:

```ts
import { Candle, Timeframe } from '../models';
import { TfCoverage } from './backend-api.service';

/** Default category for user-uploaded CSV symbols in the offline catalog. */
export const DEFAULT_OFFLINE_CATEGORY = 'Mis CSV';

/**
 * Browser-side analog of a backend symbol: the metadata the offline Markets
 * page and the wizard need to list and re-create sessions from uploaded CSVs.
 * Candle arrays stay in the `series` store; this only holds the light rollup.
 */
export interface OfflineSymbol {
  symbol: string;
  descripcion: string;
  categoria: string;
  digits?: number;
  coverage: TfCoverage[];
  createdAt: number;
  lastModified: number;
}

/** One parsed CSV: a timeframe and its candles (the wizard's working unit). */
export interface ParsedTf {
  tf: Timeframe;
  candles: Candle[];
}

/**
 * Derives per-timeframe coverage (first/last time + count) from parsed candles.
 * Groups by timeframe so several files of the same TF merge into one entry.
 * Pure — no I/O — so both the wizard and the catalog writer can reuse it.
 */
export function coverageFromParsed(files: ParsedTf[]): TfCoverage[] {
  const byTf = new Map<Timeframe, Candle[]>();
  for (const f of files) {
    if (!f.candles.length) continue;
    byTf.set(f.tf, (byTf.get(f.tf) ?? []).concat(f.candles));
  }
  const out: TfCoverage[] = [];
  for (const [tf, candles] of byTf) {
    let desde = candles[0].time;
    let hasta = candles[0].time;
    for (const c of candles) {
      if (c.time < desde) desde = c.time;
      if (c.time > hasta) hasta = c.time;
    }
    out.push({ tf, desde, hasta, velas: candles.length });
  }
  return out;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd emulador && npx ng test --watch=false -- offline-catalog`
Expected: PASS (3 tests).

- [ ] **Step 5: Format + commit**

```bash
cd emulador && npm run format && npm run lint
git add emulador/src/app/services/offline-catalog.ts emulador/src/app/services/offline-catalog.spec.ts
git commit -m "feat(offline): add offline symbol catalog types and coverage helper"
```

---

## Task 3: Store `symbols` en IndexedDB (DB v4)

**Files:**
- Modify: `emulador/src/app/services/workspace-db.service.ts`
- Modify: `emulador/src/app/services/workspace-db.service.spec.ts`
- Modify: `emulador/src/app/testing/workspace-db.stub.ts`

**Interfaces:**
- Consumes: `OfflineSymbol` de `./offline-catalog`.
- Produces (métodos en `WorkspaceDbService`):
  - `putSymbol(sym: OfflineSymbol): Promise<void>`
  - `getSymbol(symbol: string): Promise<OfflineSymbol | undefined>`
  - `listSymbols(): Promise<OfflineSymbol[]>` (ordenado por `symbol`)
  - `removeSymbol(symbol: string): Promise<void>` (cascada: `symbols` + `meta` + `series`)
  (Consumidos por Tasks 7, 9, 10.)

- [ ] **Step 1: Escribir los tests que fallan**

Añadir al final de `emulador/src/app/services/workspace-db.service.spec.ts` (el archivo ya importa `fake-indexeddb/auto`, `series`, `workspaceMeta` y define `freshDb`/`svc`):

```ts
import type { OfflineSymbol } from './offline-catalog';

function offlineSymbol(p: Partial<OfflineSymbol> = {}): OfflineSymbol {
  return {
    symbol: 'XAUUSD',
    descripcion: '',
    categoria: 'Mis CSV',
    coverage: [{ tf: 'H1', desde: 1000, hasta: 8200, velas: 3 }],
    createdAt: 1,
    lastModified: 1,
    ...p,
  };
}

describe('WorkspaceDbService — symbols catalog (v4)', () => {
  it('putSymbol + getSymbol round-trip', async () => {
    const sym = offlineSymbol({ symbol: 'EURUSD' });
    await svc.putSymbol(sym);
    expect(await svc.getSymbol('EURUSD')).toEqual(sym);
  });

  it('getSymbol returns undefined for unknown symbol', async () => {
    expect(await svc.getSymbol('NOPE')).toBeUndefined();
  });

  it('listSymbols returns all catalog entries sorted by symbol', async () => {
    await svc.putSymbol(offlineSymbol({ symbol: 'XAUUSD' }));
    await svc.putSymbol(offlineSymbol({ symbol: 'EURUSD' }));
    await svc.putSymbol(offlineSymbol({ symbol: 'GBPUSD' }));
    const list = await svc.listSymbols();
    expect(list.map((s) => s.symbol)).toEqual(['EURUSD', 'GBPUSD', 'XAUUSD']);
  });

  it('listSymbols is empty by default', async () => {
    expect(await svc.listSymbols()).toEqual([]);
  });

  it('removeSymbol cascades catalog + meta + series', async () => {
    await svc.putSymbol(offlineSymbol({ symbol: 'XAUUSD' }));
    await svc.putMeta(workspaceMeta({ symbol: 'XAUUSD' }));
    await svc.putSeries('XAUUSD', 'H1', series(3));
    await svc.removeSymbol('XAUUSD');
    expect(await svc.getSymbol('XAUUSD')).toBeUndefined();
    expect(await svc.getMeta('XAUUSD')).toBeUndefined();
    expect(await svc.getSeriesInfo('XAUUSD', 'H1')).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd emulador && npx ng test --watch=false -- workspace-db`
Expected: FAIL — `svc.putSymbol is not a function`.

- [ ] **Step 3: Implementar el store y los métodos**

En `emulador/src/app/services/workspace-db.service.ts`:

(a) Imports y constantes — añadir el import y subir versión + nombre de store:

```ts
import { OfflineSymbol } from './offline-catalog';
```
```ts
const DB_VERSION = 4;
```
```ts
const SYMBOLS_STORE = 'symbols';
```

(b) En `onupgradeneeded`, dentro del bloque `req.onupgradeneeded`, junto a la creación de `FOLDERS_STORE`, añadir (idempotente):

```ts
// v4: offline symbol catalog (keyed by symbol)
if (!db.objectStoreNames.contains(SYMBOLS_STORE)) {
  db.createObjectStore(SYMBOLS_STORE, { keyPath: 'symbol' });
}
```

(c) Añadir los métodos (por ejemplo al final de la clase, después de `deleteFolder`):

```ts
// ---- offline symbol catalog (v4) ----

/** Upserts a catalog entry (offline analog of a backend symbol). */
async putSymbol(sym: OfflineSymbol): Promise<void> {
  const db = await this.open();
  const tx = db.transaction(SYMBOLS_STORE, 'readwrite');
  tx.objectStore(SYMBOLS_STORE).put(sym);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async getSymbol(symbol: string): Promise<OfflineSymbol | undefined> {
  const db = await this.open();
  return this.request<OfflineSymbol | undefined>(
    db.transaction(SYMBOLS_STORE, 'readonly').objectStore(SYMBOLS_STORE).get(symbol),
  );
}

/** All catalog entries, sorted by symbol (offline Markets / wizard list). */
async listSymbols(): Promise<OfflineSymbol[]> {
  const db = await this.open();
  const all = await this.request<OfflineSymbol[]>(
    db.transaction(SYMBOLS_STORE, 'readonly').objectStore(SYMBOLS_STORE).getAll(),
  );
  return all.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/** Removes a symbol everywhere: catalog entry, meta and all its series. */
async removeSymbol(symbol: string): Promise<void> {
  const db = await this.open();
  const tx = db.transaction([SYMBOLS_STORE, META_STORE, SERIES_STORE], 'readwrite');
  tx.objectStore(SYMBOLS_STORE).delete(symbol);
  tx.objectStore(META_STORE).delete(symbol);
  tx.objectStore(SERIES_STORE).delete(IDBKeyRange.bound(`${symbol}|`, `${symbol}|￿`));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

- [ ] **Step 4: Extender el stub de testing**

En `emulador/src/app/testing/workspace-db.stub.ts`, añadir dentro del objeto devuelto:

```ts
    getSymbol: vi.fn().mockResolvedValue(undefined),
    listSymbols: vi.fn().mockResolvedValue([]),
    putSymbol: vi.fn().mockResolvedValue(undefined),
    removeSymbol: vi.fn().mockResolvedValue(undefined),
```

- [ ] **Step 5: Correr y verificar que pasa (suite completa de la DB)**

Run: `cd emulador && npx ng test --watch=false -- workspace-db`
Expected: PASS — incluyendo los tests de migración v1→ existentes (la subida a v4 mantiene la creación idempotente de stores).

- [ ] **Step 6: Format + commit**

```bash
cd emulador && npm run format && npm run lint
git add emulador/src/app/services/workspace-db.service.ts emulador/src/app/services/workspace-db.service.spec.ts emulador/src/app/testing/workspace-db.stub.ts
git commit -m "feat(offline): add IndexedDB symbols catalog store (DB v4) with cascade delete"
```

---

## Task 4: Estado `guest` — action + reducer + guard

**Files:**
- Modify: `emulador/src/app/state/auth/auth.actions.ts`
- Modify: `emulador/src/app/state/auth/auth.reducer.ts`
- Modify: `emulador/src/app/state/auth/auth.reducer.spec.ts`
- Modify: `emulador/src/app/auth/auth.guard.ts`
- Modify: `emulador/src/app/auth/auth.guard.spec.ts`

**Interfaces:**
- Produces: `AuthActions.continueAsGuest()` (emptyProps); `AuthStatus` incluye `'guest'`; el guard deja pasar `'guest'`. (Consumidos por Tasks 5, 6.)

- [ ] **Step 1: Escribir los tests que fallan (reducer)**

Añadir a `emulador/src/app/state/auth/auth.reducer.spec.ts`:

```ts
describe('auth reducer: continueAsGuest', () => {
  it('sets status guest and clears user', () => {
    const s = { ...initial(), user, status: 'anonymous' as const };
    const next = reducer(s, AuthActions.continueAsGuest());
    expect(next.status).toBe('guest');
    expect(next.user).toBeNull();
    expect(next.pending).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd emulador && npx ng test --watch=false -- auth.reducer`
Expected: FAIL — `AuthActions.continueAsGuest` no existe.

- [ ] **Step 3: Añadir la acción**

En `emulador/src/app/state/auth/auth.actions.ts`, dentro de `events`, añadir:

```ts
    /** Enter guest mode (no account; data stays local in IndexedDB). */
    'Continue As Guest': emptyProps(),
```

- [ ] **Step 4: Extender el tipo y el reducer**

En `emulador/src/app/state/auth/auth.reducer.ts`:

(a) Tipo (añadir `'guest'` y documentarlo):

```ts
/**
 * - `unknown`: still checking the session at startup.
 * - `authenticated`: cookie session valid.
 * - `anonymous`: backend reachable, no session -> guarded routes redirect.
 * - `offline`: backend unreachable -> the app stays usable with local CSVs.
 * - `guest`: deliberate no-account mode (static build or explicit choice).
 */
export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous' | 'offline' | 'guest';
```

(b) Reducer — añadir un `on` (por ejemplo tras `loggedOut`):

```ts
    on(
      AuthActions.continueAsGuest,
      (state): AuthState => ({ ...state, user: null, status: 'guest', pending: false, error: null }),
    ),
```

- [ ] **Step 5: Correr el reducer y verificar que pasa**

Run: `cd emulador && npx ng test --watch=false -- auth.reducer`
Expected: PASS.

- [ ] **Step 6: Test que falla del guard**

En `emulador/src/app/auth/auth.guard.spec.ts`, añadir un caso que verifique que `guest` deja pasar. Replicar el patrón existente del archivo; si el archivo testea por status mediante `provideMockStore` con `authFeature.selectStatus`, añadir:

```ts
it('allows navigation when status is guest', async () => {
  // Arrange the store so selectStatus emits 'guest', then assert the guard
  // resolves to `true` (mirror the existing 'offline' test in this file).
  // (Use the same harness the neighbouring tests use.)
});
```

Implementar el cuerpo copiando el test de `offline` ya presente en el archivo, reemplazando `'offline'` por `'guest'` y esperando `true`.

- [ ] **Step 7: Correr y verificar que falla**

Run: `cd emulador && npx ng test --watch=false -- auth.guard`
Expected: FAIL — `guest` aún redirige a `/login`.

- [ ] **Step 8: Aceptar `guest` en el guard**

En `emulador/src/app/auth/auth.guard.ts`, actualizar la condición y el doc:

```ts
    map((status) =>
      status === 'authenticated' || status === 'offline' || status === 'guest'
        ? true
        : router.createUrlTree(['/login'], { queryParams: { volver: state.url } }),
    ),
```

- [ ] **Step 9: Correr y verificar que pasa**

Run: `cd emulador && npx ng test --watch=false -- auth.guard auth.reducer`
Expected: PASS.

- [ ] **Step 10: Format + commit**

```bash
cd emulador && npm run format && npm run lint
git add emulador/src/app/state/auth/auth.actions.ts emulador/src/app/state/auth/auth.reducer.ts emulador/src/app/state/auth/auth.reducer.spec.ts emulador/src/app/auth/auth.guard.ts emulador/src/app/auth/auth.guard.spec.ts
git commit -m "feat(auth): add guest status to reducer, action and route guard"
```

---

## Task 5: Wiring de invitado en los effects de auth

**Files:**
- Modify: `emulador/src/app/state/auth/auth.effects.ts`
- Modify: `emulador/src/app/state/auth/auth.effects.spec.ts`
- Create: `emulador/src/app/state/auth/auth.effects.offline.spec.ts`

**Interfaces:**
- Consumes: `environment.offlineOnly`, `AuthActions.continueAsGuest`.
- Produces: `effects.persistGuest$` (escribe `localStorage['emulador.guest']`); `check$` resuelve a `continueAsGuest` cuando `offlineOnly` o cuando hay flag de invitado persistido y la sesión es anónima; `redirectAfterLogout$` limpia el flag.

- [ ] **Step 1: Tests que fallan (offlineOnly en archivo dedicado con mock de environment)**

Create `emulador/src/app/state/auth/auth.effects.offline.spec.ts`:

```ts
import { vi } from 'vitest';
// offlineOnly build: the session check must NOT touch the backend.
vi.mock('../../../environments/environment', () => ({
  environment: {
    backendUrl: '',
    registrationEnabled: false,
    offlineOnly: true,
    guestModeEnabled: true,
  },
}));

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { Subject, firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthEffects } from './auth.effects';
import { AuthActions } from './auth.actions';
import { BackendApiService } from '../../services/backend-api.service';

describe('AuthEffects (offlineOnly build)', () => {
  let actions$: Subject<any>;
  let api: { me: ReturnType<typeof vi.fn> };
  let effects: AuthEffects;

  beforeEach(() => {
    actions$ = new Subject();
    api = { me: vi.fn() } as any;
    TestBed.configureTestingModule({
      providers: [
        AuthEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        { provide: BackendApiService, useValue: api },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      ],
    });
    effects = TestBed.inject(AuthEffects);
  });

  it('check$ resolves to continueAsGuest without calling api.me', async () => {
    const p = firstValueFrom(effects.check$);
    actions$.next(AuthActions.checkSession());
    expect(await p).toEqual(AuthActions.continueAsGuest());
    expect(api.me).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Tests que fallan (flag persistido en el spec existente, offlineOnly:false)**

En `emulador/src/app/state/auth/auth.effects.spec.ts`, dentro de `describe('check$', ...)`, añadir (limpiando `localStorage` para no filtrar entre tests):

```ts
    it('honors a persisted guest flag on a 401 (anonymous) response', async () => {
      localStorage.setItem('emulador.guest', '1');
      api.me.mockReturnValue(throwError(() => httpError(401)));

      const p = firstValueFrom(effects.check$);
      actions$.next(AuthActions.checkSession());

      expect(await p).toEqual(AuthActions.continueAsGuest());
      localStorage.removeItem('emulador.guest');
    });
```

Y un test para la persistencia:

```ts
  describe('persistGuest$', () => {
    it('writes the guest flag to localStorage', async () => {
      localStorage.removeItem('emulador.guest');
      const sub = effects.persistGuest$.subscribe();
      actions$.next(AuthActions.continueAsGuest());
      await Promise.resolve();
      expect(localStorage.getItem('emulador.guest')).toBe('1');
      sub.unsubscribe();
      localStorage.removeItem('emulador.guest');
    });
  });
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: `cd emulador && npx ng test --watch=false -- auth.effects`
Expected: FAIL — `effects.persistGuest$` indefinido y `check$` no corta por offlineOnly/flag.

- [ ] **Step 4: Implementar el wiring**

En `emulador/src/app/state/auth/auth.effects.ts`:

(a) Imports — añadir `of` ya está; añadir el import del environment:

```ts
import { environment } from '../../../environments/environment';
```

(b) Constante + helper a nivel de módulo (antes de la clase):

```ts
const GUEST_KEY = 'emulador.guest';

/** Whether the user previously chose guest mode (full-stack reload). */
function guestPersisted(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === '1';
  } catch {
    return false;
  }
}
```

(c) Reemplazar `check$` por:

```ts
  /**
   * Who am I? In an offlineOnly (static) build we never reach for a backend and
   * resolve straight to guest. Otherwise: 401 = anonymous (unless a guest choice
   * was persisted), network failure = offline (CSV-only mode).
   */
  check$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.checkSession),
      exhaustMap(() => {
        if (environment.offlineOnly) return of(AuthActions.continueAsGuest());
        return this.api.me().pipe(
          map((user) => AuthActions.sessionResolved({ user, offline: false })),
          catchError((e: HttpErrorResponse) => {
            if (e.status === 0) {
              return of(AuthActions.sessionResolved({ user: null, offline: true }));
            }
            return of(
              guestPersisted()
                ? AuthActions.continueAsGuest()
                : AuthActions.sessionResolved({ user: null, offline: false }),
            );
          }),
        );
      }),
    ),
  );
```

(d) Añadir el effect de persistencia (tras `check$`):

```ts
  /** Remembers the guest choice so a reload stays in guest mode. */
  persistGuest$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.continueAsGuest),
        tap(() => {
          try {
            localStorage.setItem(GUEST_KEY, '1');
          } catch {
            /* storage unavailable: ignore */
          }
        }),
      ),
    { dispatch: false },
  );
```

(e) Limpiar el flag en logout — en `redirectAfterLogout$`, ampliar el `tap`:

```ts
  redirectAfterLogout$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.loggedOut),
        tap(() => {
          try {
            localStorage.removeItem(GUEST_KEY);
          } catch {
            /* ignore */
          }
          this.router.navigateByUrl('/login');
        }),
      ),
    { dispatch: false },
  );
```

- [ ] **Step 5: Correr y verificar que pasan (ambos archivos)**

Run: `cd emulador && npx ng test --watch=false -- auth.effects`
Expected: PASS — incluyendo los tests de `check$` previos (con `offlineOnly:false` del dev environment) y el nuevo archivo offline.

- [ ] **Step 6: Format + commit**

```bash
cd emulador && npm run format && npm run lint
git add emulador/src/app/state/auth/auth.effects.ts emulador/src/app/state/auth/auth.effects.spec.ts emulador/src/app/state/auth/auth.effects.offline.spec.ts
git commit -m "feat(auth): resolve guest on offlineOnly build and persist guest choice"
```

---

## Task 6: Botón "Continuar como invitado" + pill de invitado en la nav

**Files:**
- Modify: `emulador/src/app/pages/auth/auth-page.component.ts`
- Modify: `emulador/src/app/pages/auth/auth-page.component.html`
- Modify: `emulador/src/app/pages/auth/auth-page.component.css`
- Modify: `emulador/src/app/pages/auth/auth-page.component.spec.ts`
- Modify: `emulador/src/app/app.ts`
- Modify: `emulador/src/app/app.html`

**Interfaces:**
- Consumes: `environment.guestModeEnabled`, `AuthActions.continueAsGuest`, `authFeature.selectStatus`.
- Produces: `AuthPageComponent.continueAsGuest()` (dispatch + navega a `/`).

- [ ] **Step 1: Test que falla (auth-page)**

En `emulador/src/app/pages/auth/auth-page.component.spec.ts`, añadir un test que verifique que `continueAsGuest()` despacha la acción y navega. Seguir el harness existente del archivo (probablemente `provideMockStore` + spy de `dispatch`). Test:

```ts
it('continueAsGuest dispatches the action and navigates home', () => {
  // create the component via the file's existing TestBed harness, injecting a
  // Router stub with navigateByUrl: vi.fn()
  const dispatch = vi.spyOn(store, 'dispatch');
  component.continueAsGuest();
  expect(dispatch).toHaveBeenCalledWith(AuthActions.continueAsGuest());
  expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/');
});
```

Si el spec actual no inyecta `Router`, añadir al `providers` del TestBed: `{ provide: Router, useValue: { navigateByUrl: vi.fn() } }` y capturarlo como `routerStub`.

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd emulador && npx ng test --watch=false -- auth-page`
Expected: FAIL — `component.continueAsGuest` no existe.

- [ ] **Step 3: Implementar en el componente**

En `emulador/src/app/pages/auth/auth-page.component.ts`:

(a) Imports — añadir `Router`:

```ts
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
```

(b) Inyectar router y exponer el flag + método (dentro de la clase):

```ts
  private router = inject(Router);

  guestModeEnabled = environment.guestModeEnabled;

  continueAsGuest(): void {
    this.store.dispatch(AuthActions.continueAsGuest());
    this.router.navigateByUrl('/');
  }
```

- [ ] **Step 4: Añadir el botón en la plantilla**

En `emulador/src/app/pages/auth/auth-page.component.html`, después del bloque `<p class="alt">…</p>` y antes del cierre `</form>`, añadir:

```html
@if (guestModeEnabled && isLogin()) {
  <div class="divider"><span>o</span></div>
  <button appButton variant="ghost" [block]="true" type="button" (click)="continueAsGuest()">
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
      <circle cx="12" cy="7" r="4"></circle>
    </svg>
    Continuar como invitado
  </button>
  <p class="alt">Sin cuenta · tus CSV se guardan solo en este navegador.</p>
}
```

- [ ] **Step 5: Estilo del divisor**

En `emulador/src/app/pages/auth/auth-page.component.css`, añadir:

```css
.divider {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 12px;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}
```

- [ ] **Step 6: Pill "Invitado" y ocultar login en la nav**

En `emulador/src/app/app.ts`, asegurar que el componente expone `status` (signal) desde `authFeature.selectStatus` y un flag de offline. Si no existe, añadir:

```ts
  // (junto a los demás selectSignal del componente)
  status = this.store.selectSignal(authFeature.selectStatus);
```

En `emulador/src/app/app.html`, reemplazar el bloque de la derecha de la nav (`@else if (status() === 'anonymous')` / `@else if (status() === 'offline')`) por uno que también contemple `guest` y oculte "Iniciar sesión" en guest/offline:

```html
    } @else if (status() === 'guest') {
      <span class="offline-pill" title="Modo invitado — datos guardados solo en este navegador"
        >Invitado</span
      >
    } @else if (status() === 'offline') {
      <span class="offline-pill" title="Backend no disponible — modo local con CSV"
        >Sin conexión</span
      >
    } @else if (status() === 'anonymous') {
      <a class="login-link" routerLink="/login">Iniciar sesión</a>
    }
```

(Mantener el bloque `@if (user(); as u) { … }` inicial intacto; solo se reordenan/añaden las ramas `@else if`.)

- [ ] **Step 7: Correr y verificar que pasa**

Run: `cd emulador && npx ng test --watch=false -- auth-page`
Expected: PASS.

- [ ] **Step 8: Build de humo + format + commit**

```bash
cd emulador && npm run build -- --configuration offline && npm run format && npm run lint
git add emulador/src/app/pages/auth/ emulador/src/app/app.ts emulador/src/app/app.html
git commit -m "feat(auth): add guest entry button and guest nav pill"
```

---

## Task 7: Rama CSV del wizard — lógica

**Files:**
- Modify: `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.ts`
- Modify: `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.spec.ts`

**Interfaces:**
- Consumes: `CsvLoaderService.parseText`, `symbolFromFileName`, `derivePointSize` (de `../../models`), `coverageFromParsed`, `OfflineSymbol`, `DEFAULT_OFFLINE_CATEGORY` (de `offline-catalog`), `db.putSymbol/listSymbols/getSeriesInfo`, `environment.offlineOnly`, `authFeature.selectStatus`.
- Produces (en `CrearSesionPageComponent`):
  - `source = signal<'backend' | 'csv'>(...)`
  - `csvOnly = computed<boolean>()` (true si `offlineOnly` o status guest/offline)
  - `catalog = signal<OfflineSymbol[]>([])`
  - `csvError = signal<string>('')`
  - `parsedFiles = signal<ParsedTf[]>([])`, `parsedSymbol = signal<string>('')`
  - `onCsvFiles(event: Event): Promise<void>`
  - `pickCatalogSymbol(s: OfflineSymbol): void`
  - `confirmCsv(): Promise<void>`

- [ ] **Step 1: Tests que fallan**

Añadir a `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.spec.ts` un bloque nuevo. Usa el `workspaceDbStub` y un `fileEvent` helper. Añadir al inicio del archivo:

```ts
import { OfflineSymbol } from '../../services/offline-catalog';

/** Builds a fake <input type=file> change event from CSV texts. */
function csvFileEvent(files: { name: string; text: string }[]): Event {
  const list = files.map((f) => ({ name: f.name, text: async () => f.text }));
  return { target: { files: list, value: '' } } as unknown as Event;
}

const H1_CSV = ['time,open,high,low,close', '2024-01-01 00:00,10,11,9,10', '2024-01-01 01:00,10,11,9,10', '2024-01-01 02:00,10,11,9,10'].join('\n');
const H1_CSV_B = ['time,open,high,low,close', '2024-02-01 00:00,10,11,9,10', '2024-02-01 01:00,10,11,9,10', '2024-02-01 02:00,10,11,9,10'].join('\n');
```

Tests (dentro del `describe('CrearSesionPageComponent', …)`):

```ts
  describe('CSV branch (offline)', () => {
    it('onCsvFiles parses a single asset and exposes coverage', async () => {
      create();
      await component.onCsvFiles(csvFileEvent([{ name: 'xauusd_h1.csv', text: H1_CSV }]));
      expect(component.csvError()).toBe('');
      expect(component.parsedSymbol()).toBe('XAUUSD');
      expect(component.coverage().length).toBe(1);
      expect(component.coverage()[0].tf).toBe('H1');
      expect(component.step()).toBe(2);
    });

    it('onCsvFiles rejects files of different assets', async () => {
      create();
      await component.onCsvFiles(
        csvFileEvent([
          { name: 'xauusd_h1.csv', text: H1_CSV },
          { name: 'eurusd_h1.csv', text: H1_CSV_B },
        ]),
      );
      expect(component.csvError()).toContain('mismo activo');
      expect(component.parsedSymbol()).toBe('');
    });

    it('confirmCsv writes the catalog and dispatches switchAsset with thenLoad', async () => {
      create();
      await component.onCsvFiles(csvFileEvent([{ name: 'xauusd_h1.csv', text: H1_CSV }]));
      // pick a valid start inside the parsed range
      component.startDate.set('2024-01-01');
      await component.confirmCsv();

      expect(dbStub.putSymbol).toHaveBeenCalled();
      const sym = (dbStub.putSymbol as any).mock.calls[0][0] as OfflineSymbol;
      expect(sym.symbol).toBe('XAUUSD');
      expect(sym.coverage[0].tf).toBe('H1');

      const action = dispatch.mock.calls.find(
        (c) => (c[0] as any).type === '[Workspaces] Switch Asset',
      )![0] as any;
      expect(action.symbol).toBe('XAUUSD');
      expect(Array.isArray(action.thenLoad)).toBe(true);
      expect(routerStub.navigateByUrl).toHaveBeenCalledWith('/');
    });

    it('pickCatalogSymbol selects an existing symbol from the catalog', () => {
      create();
      const entry: OfflineSymbol = {
        symbol: 'XAUUSD',
        descripcion: '',
        categoria: 'Mis CSV',
        coverage: [{ tf: 'H1', desde: 1_700_000_000, hasta: 1_710_000_000, velas: 100 }],
        createdAt: 1,
        lastModified: 1,
      };
      component.pickCatalogSymbol(entry);
      expect(component.selected()?.name).toBe('XAUUSD');
      expect(component.coverage()[0].tf).toBe('H1');
      expect(component.step()).toBe(2);
    });
  });
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd emulador && npx ng test --watch=false -- crear-sesion`
Expected: FAIL — `onCsvFiles`/`confirmCsv`/`pickCatalogSymbol` no existen.

- [ ] **Step 3: Implementar la lógica CSV en el componente**

En `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.ts`:

(a) Imports:

```ts
import { Candle, Timeframe, derivePointSize, symbolFromFileName } from '../../models';
import { CsvLoaderService } from '../../services/csv-loader.service';
import {
  OfflineSymbol,
  ParsedTf,
  coverageFromParsed,
  DEFAULT_OFFLINE_CATEGORY,
} from '../../services/offline-catalog';
import { authFeature } from '../../state/auth/auth.reducer';
import { environment } from '../../../environments/environment';
```

(b) Inyecciones y nuevas señales (dentro de la clase, junto a las existentes):

```ts
  private csvLoader = inject(CsvLoaderService);
  private status = this.store.selectSignal(authFeature.selectStatus);

  /** csv = create from uploaded files / catalog; backend = stored harvester. */
  source = signal<'backend' | 'csv'>(environment.offlineOnly ? 'csv' : 'backend');
  /** Forced CSV mode: static build or guest/offline session. */
  csvOnly = computed(
    () => environment.offlineOnly || this.status() === 'guest' || this.status() === 'offline',
  );
  catalog = signal<OfflineSymbol[]>([]);
  csvError = signal('');
  parsedFiles = signal<ParsedTf[]>([]);
  parsedSymbol = signal('');
```

(c) Hacer que `coverage` también sirva a la rama CSV. Reemplazar el computed `coverage` existente por uno que use la cobertura parseada/del catálogo cuando aplica:

```ts
  /** TFs offered: from the parsed CSV / catalog in CSV mode, else the backend symbol. */
  coverage = computed<TfCoverage[]>(() => {
    if (this.source() === 'csv') {
      if (this.parsedFiles().length) return coverageFromParsed(this.parsedFiles());
      return this.selected()?.cobertura ?? [];
    }
    return this.selected()?.cobertura ?? [];
  });
```

(d) En el `constructor`, no llamar al backend en modo CSV; cargar el catálogo:

```ts
  constructor() {
    const preselect = this.route.snapshot.queryParamMap.get('symbol');
    if (this.csvOnly()) {
      this.source.set('csv');
      this.loadCatalog(preselect);
      return;
    }
    this.api.symbols().subscribe({
      next: (r) => {
        this.symbols.set(r.symbols.filter((s) => s.cobertura.length > 0));
        this.state.set('ok');
        if (preselect) {
          const match = this.symbols().find((s) => s.name === preselect);
          if (match) {
            this.pickSymbol(match);
            this.step.set(2);
          }
        }
      },
      error: () => this.state.set('error'),
    });
  }

  private async loadCatalog(preselect: string | null): Promise<void> {
    try {
      const list = await this.db.listSymbols();
      this.catalog.set(list);
      this.state.set('ok');
      if (preselect) {
        const match = list.find((s) => s.symbol === preselect);
        if (match) this.pickCatalogSymbol(match);
      }
    } catch {
      this.catalog.set([]);
      this.state.set('ok');
    }
  }
```

(e) Métodos de la rama CSV:

```ts
  /** Parses dropped/selected CSVs, enforces a single asset, prefills step 2. */
  async onCsvFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.csvError.set('');
    const parsed: ParsedTf[] = [];
    let symbol = '';
    try {
      for (const file of Array.from(input.files)) {
        const text = await file.text();
        const { tf, candles, fileName } = this.csvLoader.parseText(text, file.name);
        const sym = symbolFromFileName(fileName);
        if (!symbol) symbol = sym;
        else if (sym !== symbol) {
          throw new Error(
            `Todos los archivos deben ser del mismo activo (${symbol} ≠ ${sym}).`,
          );
        }
        parsed.push({ tf, candles });
      }
    } catch (e) {
      this.csvError.set((e as Error).message);
      this.parsedFiles.set([]);
      this.parsedSymbol.set('');
      input.value = '';
      return;
    }
    input.value = '';
    this.parsedFiles.set(parsed);
    this.parsedSymbol.set(symbol);
    // synthesize a BackendSymbol so the rest of the wizard works unchanged
    this.selected.set({
      name: symbol,
      descripcion: '',
      categoria: DEFAULT_OFFLINE_CATEGORY,
      digits: derivePointSize(parsed[0].candles),
      cobertura: coverageFromParsed(parsed),
    });
    this.selectedTfs.set(new Set(this.coverage().map((c) => c.tf)));
    this.defaultDate();
    this.step.set(2);
  }

  /** Step 1 (catalog path): reuse a previously uploaded symbol. */
  pickCatalogSymbol(s: OfflineSymbol): void {
    this.parsedFiles.set([]); // hydrate series from IndexedDB, not from memory
    this.parsedSymbol.set(s.symbol);
    this.selected.set({
      name: s.symbol,
      descripcion: s.descripcion,
      categoria: s.categoria,
      digits: s.digits ?? 0,
      cobertura: s.coverage,
    });
    this.selectedTfs.set(new Set(s.coverage.map((c) => c.tf)));
    this.defaultDate();
    this.step.set(2);
  }

  /**
   * CSV confirm: persist the catalog entry, then either hand the parsed candles
   * to the workspace flow (fresh upload) or let switchAsset hydrate them from
   * IndexedDB (existing catalog symbol).
   */
  async confirmCsv(): Promise<void> {
    const symbol = this.parsedSymbol();
    const start = this.startEpoch();
    if (!symbol || start === null) return;
    const tfs = this.chosenTfs() as Timeframe[];
    const parsed = this.parsedFiles();

    // build/merge the catalog entry from the chosen coverage
    const now = Date.now();
    const existing = await this.db.getSymbol(symbol).catch(() => undefined);
    const entry: OfflineSymbol = {
      symbol,
      descripcion: existing?.descripcion ?? '',
      categoria: existing?.categoria ?? DEFAULT_OFFLINE_CATEGORY,
      digits: this.selected()?.digits || existing?.digits,
      coverage: this.coverage(),
      createdAt: existing?.createdAt ?? now,
      lastModified: now,
    };
    await this.db.putSymbol(entry).catch(() => undefined);

    // fresh upload → hand candles directly; catalog pick → hydrate from DB
    const thenLoad =
      parsed.length > 0
        ? parsed
            .filter((p) => tfs.includes(p.tf))
            .map((p) => ({
              tf: p.tf,
              candles: p.candles,
              fileName: `${symbol.toLowerCase()}_${p.tf.toLowerCase()}.csv`,
            }))
        : undefined;

    this.store.dispatch(
      WorkspacesActions.switchAsset({
        symbol,
        selectedTfs: tfs,
        thenLoad,
        thenNewSession: { name: this.sessionName().trim() || null },
        thenGoTo: start,
        thenSessionEnd: this.endEpoch() ?? undefined,
      }),
    );
    await this.router.navigateByUrl('/');
  }
```

(f) `CsvLoaderService` y `authFeature` deben quedar importados (paso a). El `imports` del `@Component` no cambia (la lógica es TS).

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd emulador && npx ng test --watch=false -- crear-sesion`
Expected: PASS — incluyendo los tests backend existentes (en `offlineOnly:false` el constructor sigue llamando `api.symbols()`).

- [ ] **Step 5: Format + commit**

```bash
cd emulador && npm run format && npm run lint
git add emulador/src/app/pages/crear-sesion/crear-sesion-page.component.ts emulador/src/app/pages/crear-sesion/crear-sesion-page.component.spec.ts
git commit -m "feat(wizard): add CSV branch (upload + catalog) logic to crear-sesion"
```

---

## Task 8: Rama CSV del wizard — UI (plantilla + dropzone)

**Files:**
- Modify: `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.html`
- Modify: `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.css`
- Modify: `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.ts` (imports de UI: `SegmentedControlComponent`, `BadgeDirective`)

**Interfaces:**
- Consumes: señales/métodos de Task 7 (`source`, `csvOnly`, `catalog`, `csvError`, `parsedSymbol`, `coverage`, `onCsvFiles`, `pickCatalogSymbol`, `confirm`/`confirmCsv`).

- [ ] **Step 1: Registrar componentes UI en el wizard**

En `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.ts`, ampliar `imports` del decorador:

```ts
import { SegmentedControlComponent } from '../../components/ui/segmented-control.component';
import { BadgeDirective } from '../../components/ui/badge.directive';
```
```ts
  imports: [ButtonDirective, DatePickerComponent, SegmentedControlComponent, BadgeDirective],
```

- [ ] **Step 2: Plantilla — Paso 1 con toggle + dropzone + catálogo**

En `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.html`, en el Paso 1, antes (o en lugar) de la grilla `.assets` que hoy lista símbolos del backend, añadir el toggle (solo si NO es CSV-only) y la rama CSV. Estructura objetivo del Paso 1:

```html
@if (step() === 1) {
  @if (!csvOnly()) {
    <ui-segmented-control
      ariaLabel="Origen de los datos"
      [options]="[{ value: 'backend', label: 'Catálogo' }, { value: 'csv', label: 'Subir CSV' }]"
      [value]="source()"
      (valueChange)="source.set($any($event))"
    />
  }

  @if (source() === 'csv') {
    <!-- símbolos ya subidos (catálogo offline) -->
    @if (catalog().length) {
      <h2>Tus activos</h2>
      <div class="assets">
        @for (s of catalog(); track s.symbol) {
          <button class="asset" type="button" (click)="pickCatalogSymbol(s)">
            <span class="name">{{ s.symbol }}</span>
            <span class="desc">{{ s.descripcion || s.categoria }}</span>
            <span class="tfs">{{ s.coverage.length }} temporalidad(es)</span>
          </button>
        }
      </div>
      <h2>O sube nuevos CSV</h2>
    }

    <!-- dropzone -->
    <label
      class="dropzone"
      [class.dragover]="dragOver()"
      (dragover)="onDragOver($event)"
      (dragleave)="dragOver.set(false)"
      (drop)="onDrop($event)"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
      <span class="dz-title">Arrastra tus CSV o haz clic para elegir</span>
      <span class="dz-help">Mismo activo, una temporalidad por archivo (p. ej. <code>xauusd_h4.csv</code>).</span>
      <input type="file" accept=".csv" multiple (change)="onCsvFiles($event)" hidden />
    </label>

    @if (csvError()) {
      <p class="csv-error" role="alert">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        {{ csvError() }}
      </p>
    }

    @if (parsedSymbol() && !csvError()) {
      <div class="review">
        <span class="name">{{ parsedSymbol() }}</span>
        <span class="tf-chips">
          @for (c of coverage(); track c.tf) {
            <span uiBadge>{{ c.tf }}</span>
          }
        </span>
      </div>
    }
  } @else {
    <!-- rama backend existente: dejar la grilla .assets actual sin cambios -->
  }
}
```

Conservar la grilla `.assets` del backend dentro del `@else` (mover el markup actual ahí). Mantener Pasos 2 y 3 sin cambios.

- [ ] **Step 3: Botón de confirmar — enrutar a confirmCsv en modo CSV**

En el Paso 3 (o donde esté el botón "Crear sesión"), enrutar el confirm según el origen:

```html
<button appButton variant="primary" (click)="source() === 'csv' ? confirmCsv() : confirm()" ...>
  Crear sesión
</button>
```

Y para CSV ocultar la barra de progreso (`@if (progress(); as p)` solo aplica al backend; envolver con `@if (source() !== 'csv')` si fuera necesario).

- [ ] **Step 4: Señales de drag y handlers en el componente**

En `crear-sesion-page.component.ts` añadir:

```ts
  dragOver = signal(false);

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const files = event.dataTransfer?.files;
    if (files?.length) {
      void this.onCsvFiles({ target: { files, value: '' } } as unknown as Event);
    }
  }
```

- [ ] **Step 5: Estilos del dropzone y la revisión**

En `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.css` añadir:

```css
.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  margin-top: 12px;
  padding: var(--space-8) var(--space-6);
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  text-align: center;
  cursor: pointer;
  transition:
    border-color var(--duration-base) var(--ease-out),
    background var(--duration-base) var(--ease-out);
}
.dropzone:hover {
  border-color: var(--border-strong);
}
.dropzone.dragover {
  border-color: var(--accent);
  background: var(--accent-subtle);
}
.dropzone .dz-title {
  color: var(--text);
  font-weight: var(--weight-medium);
}
.dropzone .dz-help {
  font-size: 12.5px;
}
.dropzone code {
  background: var(--surface-2);
  border-radius: 4px;
  padding: 1px 6px;
}
.csv-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 0;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--danger);
  background: var(--danger-subtle);
  border: 1px solid var(--danger);
  border-radius: var(--radius);
}
.review {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.review .name {
  font-weight: var(--weight-semibold);
}
.review .tf-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
```

- [ ] **Step 6: Build de humo + render manual**

Run:
```bash
cd emulador && npm run build -- --configuration offline
```
Expected: compila. El budget `anyComponentStyle` (14kB) no debe superarse por el CSS añadido.

- [ ] **Step 7: Format + lint + commit**

```bash
cd emulador && npm run format && npm run lint
git add emulador/src/app/pages/crear-sesion/
git commit -m "feat(wizard): add CSV source toggle, dropzone and review UI"
```

---

## Task 9: Página Mercados en modo offline

**Files:**
- Modify: `emulador/src/app/pages/mercados/mercados-page.component.ts`
- Modify: `emulador/src/app/pages/mercados/mercados-page.component.html`
- Modify: `emulador/src/app/pages/mercados/mercados-page.component.spec.ts`

**Interfaces:**
- Consumes: `db.listSymbols`, `db.removeSymbol`, `OfflineSymbol`, `environment.offlineOnly`, `authFeature.selectStatus`, `DialogService`, `MenuComponent`.
- Produces: `MercadosPageComponent.offline = computed<boolean>()`; en offline alimenta `symbols()` desde el catálogo (mapeado a `BackendSymbol`) y oculta la curación.

- [ ] **Step 1: Tests que fallan**

Añadir a `emulador/src/app/pages/mercados/mercados-page.component.spec.ts` (seguir el harness del archivo; inyectar `WorkspaceDbService` con `workspaceDbStub`, `DialogService` stub, y `provideMockStore`). Si el spec aún no inyecta `WorkspaceDbService`, añadirlo a los providers.

```ts
import { OfflineSymbol } from '../../services/offline-catalog';

const catalogEntry: OfflineSymbol = {
  symbol: 'XAUUSD',
  descripcion: 'Oro (CSV)',
  categoria: 'Mis CSV',
  coverage: [{ tf: 'H1', desde: 1_700_000_000, hasta: 1_710_000_000, velas: 1000 }],
  createdAt: 1,
  lastModified: 1,
};

describe('MercadosPageComponent (offline)', () => {
  it('loads symbols from the catalog and maps them to cards', async () => {
    // create the component with db.listSymbols resolving [catalogEntry] and
    // offline=true (mock environment.offlineOnly via the harness, or set
    // status='guest' through the mock store selector).
    // Assert component.symbols()[0].name === 'XAUUSD' and categoria === 'Mis CSV'.
  });

  it('removeSymbol cascades and reloads the catalog after confirm', async () => {
    // db.removeSymbol resolves; DialogService.confirm resolves true.
    // call component.remove('XAUUSD'); expect dbStub.removeSymbol called with 'XAUUSD'
    // and dbStub.listSymbols called again (reload).
  });
});
```

Implementar los cuerpos copiando el harness `create()` del archivo y añadiendo `{ provide: WorkspaceDbService, useValue: dbStub }`. Para forzar offline en el test, preferir setear el selector de status del mock store a `'guest'` (más simple que mockear environment).

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd emulador && npx ng test --watch=false -- mercados`
Expected: FAIL — `offline`/`remove` no existen o `listSymbols` no se usa.

- [ ] **Step 3: Implementar la fuente condicional**

En `emulador/src/app/pages/mercados/mercados-page.component.ts`:

(a) Imports:

```ts
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { OfflineSymbol, DEFAULT_OFFLINE_CATEGORY } from '../../services/offline-catalog';
import { authFeature } from '../../state/auth/auth.reducer';
import { DialogService } from '../../components/ui/dialog.service';
import { MenuComponent } from '../../components/ui/menu.component';
import { environment } from '../../../environments/environment';
```

(b) Inyecciones, flag y añadir `MenuComponent` a `imports` del decorador:

```ts
  private db = inject(WorkspaceDbService);
  private dialog = inject(DialogService);
  private statusSig = this.store.selectSignal(authFeature.selectStatus);

  offline = computed(
    () => environment.offlineOnly || this.statusSig() === 'guest' || this.statusSig() === 'offline',
  );
```

(c) Reemplazar `load()` para ramificar por origen:

```ts
  load(): void {
    this.state.set('loading');
    if (this.offline()) {
      this.db
        .listSymbols()
        .then((list) => {
          this.symbols.set(list.map((s) => this.toBackendSymbol(s)));
          this.state.set('ok');
        })
        .catch(() => {
          this.symbols.set([]);
          this.state.set('ok');
        });
      return;
    }
    this.api.symbols().subscribe({
      next: (r) => {
        this.symbols.set(r.symbols);
        this.state.set('ok');
      },
      error: () => this.state.set('error'),
    });
  }

  /** Maps a catalog entry to the BackendSymbol shape the template renders. */
  private toBackendSymbol(s: OfflineSymbol): BackendSymbol {
    return {
      name: s.symbol,
      descripcion: s.descripcion,
      categoria: s.categoria || DEFAULT_OFFLINE_CATEGORY,
      digits: s.digits ?? 0,
      cobertura: s.coverage,
    };
  }

  /** Offline: delete a symbol everywhere (catalog + meta + series). */
  async remove(name: string): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'Eliminar activo',
      message: `Se borrarán los datos y sesiones de ${name} de este navegador. ¿Continuar?`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    await this.db.removeSymbol(name).catch(() => undefined);
    this.load();
  }
```

> Nota: ajustar la firma de `this.dialog.confirm(...)` a la API real de `DialogService` (revisar `components/ui/dialog.service.ts`); si expone `confirm(message: string)` u opciones distintas, adaptarlo. El contrato necesario: abre confirmación y resuelve booleano.

(d) En el constructor, NO despachar `UserSymbolsActions.load()` en offline (la curación es backend):

```ts
  constructor() {
    this.load();
    if (!this.offline()) this.store.dispatch(UserSymbolsActions.load());
  }
```

- [ ] **Step 4: Plantilla — ocultar curación y añadir acciones offline**

En `emulador/src/app/pages/mercados/mercados-page.component.html`:

- Envolver el `ui-segmented-control` "todos/mis" y el checkbox `.pick` de cada card con `@if (!offline()) { … }`.
- Añadir en cada card (cuando `offline()`): botón "Crear sesión" (`<a appButton variant="primary" [routerLink]="['/sesiones/crear']" [queryParams]="{ symbol: s.name }">Crear sesión</a>`) y un menú con "Eliminar" que llame `remove(s.name)`.
- Estado vacío en offline: reemplazar/añadir un `ui-empty-state` cuando `offline() && symbols().length === 0`:

```html
@if (offline() && state() === 'ok' && symbols().length === 0) {
  <ui-empty-state
    title="Aún no subiste ningún CSV"
    hint="Crea tu primera sesión subiendo archivos CSV de velas; los activos aparecerán aquí."
    [boxed]="true"
  >
    <svg icon width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="17 8 12 3 7 8"></polyline>
      <line x1="12" y1="3" x2="12" y2="15"></line>
    </svg>
    <a appButton variant="primary" [routerLink]="['/sesiones/crear']">Subir tu primer CSV</a>
  </ui-empty-state>
}
```

Registrar `EmptyStateComponent` en `imports` del decorador si no está.

- [ ] **Step 5: Correr y verificar que pasa**

Run: `cd emulador && npx ng test --watch=false -- mercados`
Expected: PASS.

- [ ] **Step 6: Build offline + format + commit**

```bash
cd emulador && npm run build -- --configuration offline && npm run format && npm run lint
git add emulador/src/app/pages/mercados/
git commit -m "feat(mercados): offline catalog source, delete cascade and empty state"
```

---

## Task 10: Reubicar import de sesión a Sesiones y quitar carga de velas del toolbar

**Files:**
- Modify: `emulador/src/app/components/controls/controls.component.ts`
- Modify: `emulador/src/app/components/controls/controls.component.html`
- Modify: `emulador/src/app/components/controls/controls.component.spec.ts` (si existe; si no, ajustar specs que dependan de `onFiles`)
- Modify: `emulador/src/app/pages/sesiones/sesiones-page.component.ts`
- Modify: `emulador/src/app/pages/sesiones/sesiones-page.component.html`
- Modify: `emulador/src/app/pages/sesiones/sesiones-page.component.spec.ts`

**Interfaces:**
- Produces: `SesionesPageComponent.onImportSession(event: Event): Promise<void>` (parsea CSV de sesión y despacha import/switchAsset).

- [ ] **Step 1: Test que falla (Sesiones import)**

En `emulador/src/app/pages/sesiones/sesiones-page.component.spec.ts`, añadir (con el harness del archivo; `provideMockStore` + spy de dispatch):

```ts
const SESSION_CSV = [
  'id,side,origin,entryPrice,exitPrice,sl,tp,lots,riskPct,riskUsd,openTime,closeTime,outcome,profit,rMultiple',
  't1,buy,market,4000,4020,3990,4020,0.1,1,100,0,60,tp,200,2',
].join('\n');

function sessionFileEvent(name: string, text: string): Event {
  return { target: { files: [{ name, text: async () => text }], value: '' } } as unknown as Event;
}

it('onImportSession parses a session CSV and dispatches into the matching asset', async () => {
  // current asset is 'XAUUSD' (set the selector via mock store)
  const dispatch = vi.spyOn(store, 'dispatch');
  await component.onImportSession(sessionFileEvent('xauusd_sesion.csv', SESSION_CSV));
  expect(dispatch).toHaveBeenCalled();
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd emulador && npx ng test --watch=false -- sesiones`
Expected: FAIL — `onImportSession` no existe.

- [ ] **Step 3: Mover la lógica de import a Sesiones**

En `emulador/src/app/pages/sesiones/sesiones-page.component.ts`:

(a) Imports:

```ts
import { CsvLoaderService } from '../../services/csv-loader.service';
import { isSessionCsv, parseSessionCsv } from '../../state/trading/session-csv';
import { symbolFromFileName } from '../../models';
import { TradingActions } from '../../state/trading/trading.actions';
import { ReplayActions } from '../../state/replay/replay.actions';
import { selectCurrentAsset, selectCurrentTime } from '../../state/selectors';
```

(b) Inyecciones/señales (si no presentes ya):

```ts
  private csvLoader = inject(CsvLoaderService);
  private currentAsset = this.store.selectSignal(selectCurrentAsset);
  private currentTime = this.store.selectSignal(selectCurrentTime);
  importInfo = signal('');
  importError = signal('');
```

(c) Método (portado desde `controls.component.ts`):

```ts
  /** Imports a session CSV exported from the summary into its workspace. */
  async onImportSession(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.importError.set('');
    this.importInfo.set('');
    for (const file of Array.from(input.files)) {
      try {
        const text = await file.text();
        if (!isSessionCsv(text)) {
          this.importError.set(`${file.name}: no parece un CSV de sesión del emulador.`);
          continue;
        }
        const trades = parseSessionCsv(text);
        if (!trades.length) {
          this.importError.set(`${file.name}: sin trades reconocibles.`);
          continue;
        }
        const symbol = symbolFromFileName(file.name);
        if (symbol === this.currentAsset()) {
          this.store.dispatch(
            TradingActions.sessionImported({ trades, currentCursor: this.currentTime() }),
          );
          const lastClose = trades.reduce((m, t) => Math.max(m, t.closeTime), 0);
          if (lastClose > 0) this.store.dispatch(ReplayActions.goToTime({ time: lastClose }));
        } else {
          this.store.dispatch(WorkspacesActions.switchAsset({ symbol, thenImport: { trades } }));
        }
        this.importInfo.set(`Sesión importada en ${symbol} (${trades.length} trades).`);
      } catch (e) {
        this.importError.set((e as Error).message);
      }
    }
    input.value = '';
  }
```

- [ ] **Step 4: Plantilla de Sesiones — botón de import**

En `emulador/src/app/pages/sesiones/sesiones-page.component.html`, en el header (junto a "Nueva sesión"), añadir:

```html
<label appButton variant="subtle">
  Importar sesión (.csv)
  <input type="file" accept=".csv" (change)="onImportSession($event)" hidden />
</label>
@if (importInfo()) {
  <p class="import-info" role="status" aria-live="polite">{{ importInfo() }}</p>
}
@if (importError()) {
  <p class="import-error" role="alert">{{ importError() }}</p>
}
```

(`appButton` aplica sobre `<label>` igual que sobre `<button>`/`<a>`.)

- [ ] **Step 5: Quitar la carga de velas del toolbar**

En `emulador/src/app/components/controls/controls.component.html`, eliminar el bloque `<label class="file-btn"> … Cargar CSV … <input type="file" …/></label>` completo (líneas del primer `<label>`).

En `emulador/src/app/components/controls/controls.component.ts`, eliminar:
- el método `onFiles(...)` y el método privado `importSession(...)`,
- las propiedades/estados `error`, `info` si solo las usaba esa carga,
- imports ahora sin uso: `symbolFromFileName`, `CsvLoaderService`, `isSessionCsv`, `parseSessionCsv`, `MarketActions` (si `csvLoaded` ya no se usa aquí), `PendingCsv`, `selectCurrentAsset`/`selectCurrentTime` si quedaron sin uso.

> Verificar con el compilador qué imports quedan sin uso (ESLint `no-unused-vars` fallará el lint si sobra alguno). Mantener todo lo que el resto del componente sí usa (dropdown de activo, TFs, replay).

- [ ] **Step 6: Ajustar specs de controls**

En `emulador/src/app/components/controls/controls.component.spec.ts` (si existe), eliminar los tests que ejercitaban `onFiles`/`importSession`. Si no existe ese spec, omitir.

- [ ] **Step 7: Correr toda la suite**

Run: `cd emulador && npx ng test --watch=false`
Expected: PASS, cobertura ≥ 80%.

- [ ] **Step 8: Build offline + format + commit**

```bash
cd emulador && npm run build -- --configuration offline && npm run format && npm run lint
git add emulador/src/app/components/controls/ emulador/src/app/pages/sesiones/
git commit -m "refactor: move session CSV import to Sessions page, drop candle upload from toolbar"
```

---

## Task 11: Branch protection en `main`

**Files:** ninguno en el repo (operación vía API de GitHub).

**Interfaces:** N/A. Requiere `gh` autenticado con permiso `Administration: write` sobre `Humerez-Sebas/trading-emulator`.

- [ ] **Step 1: Aplicar la protección**

Run (los nombres de contexto deben coincidir EXACTO con los jobs de CI):

```bash
gh api -X PUT repos/Humerez-Sebas/trading-emulator/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Backend (lint · tests · audit)",
      "Frontend (lint · tests · build · audit)",
      "Docker (compose config · image builds)"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null
}
JSON
```

Expected: HTTP 200 con el objeto de protección.

- [ ] **Step 2: Si responde 403**

Ampliar el PAT/token de `gh` para incluir `Administration: write` en el repo (Fine-grained token → Repository permissions → Administration: Read and write), luego repetir Step 1.

- [ ] **Step 3: Verificar**

Run:
```bash
gh api repos/Humerez-Sebas/trading-emulator/branches/main/protection \
  --jq '{strict: .required_status_checks.strict, contexts: .required_status_checks.contexts, reviews: .required_pull_request_reviews.required_approving_review_count, admins: .enforce_admins.enabled}'
```
Expected: `strict: true`, los 3 contexts, `reviews: 0`, `admins: false`.

- [ ] **Step 4: Verificación funcional (opcional pero recomendada)**

Abrir un PR de prueba con un cambio que rompa el CI (p. ej. un test que falle), confirmar que GitHub no ofrece "Merge"; revertir/cerrar el PR.

---

## Task 12: Documentación de despliegue estático

**Files:**
- Modify: `README.md` (raíz)

**Interfaces:** N/A.

- [ ] **Step 1: Añadir la sección al README**

Añadir a `README.md` una sección:

````markdown
## Despliegue estático ($0, solo frontend)

El emulador puede desplegarse **sin backend** como sitio estático (Cloudflare
Pages, Netlify, GitHub Pages, etc.). En este modo arranca en **modo invitado**:
no hay login y las sesiones se crean subiendo CSV desde el asistente.

```bash
cd emulador
npm ci
npm run build -- --configuration offline
# publica el contenido de emulador/dist/emulador/browser
```

Flujo de uso (invitado → CSV):

1. Abre la app: entra directo como **Invitado** (sin cuenta).
2. **Nueva sesión** → pestaña **Subir CSV** → arrastra los CSV de velas de un
   mismo activo (una temporalidad por archivo, p. ej. `xauusd_h4.csv`).
3. Elige temporalidades y fecha de inicio → **Crear sesión**.
4. Los activos subidos quedan guardados en este navegador (IndexedDB) y aparecen
   en **Mercados** para reusarlos en futuras sesiones.

> Los datos viven solo en el navegador del usuario; borrar los datos del sitio
> elimina los CSV importados y las sesiones.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document static offline deploy and guest CSV flow"
```

---

## Verificación final (end-to-end)

- [ ] `cd emulador && npx ng test --watch=false` → verde, cobertura ≥ 80%.
- [ ] `cd emulador && npm run lint && npm run format:check` → sin errores.
- [ ] `cd emulador && npm run build` (prod) y `npm run build -- --configuration offline` → ambos compilan.
- [ ] `cd backend && pytest -q` → sin cambios, verde.
- [ ] Servir el `dist` del build offline y verificar con preview (`preview_start` + snapshot):
  - Arranca sin login con pill **Invitado**; "Iniciar sesión" oculto.
  - `/sesiones/crear` en modo CSV: subir `emulador/public/xauusd_h4.csv` (+ otra TF del mismo activo) → verifica mismo activo, valida fechas, genera sesión, abre el chart posicionado.
  - Recargar → el catálogo persiste; **Mercados** lista el símbolo subido; "Crear sesión" desde la card preselecciona el símbolo; "Eliminar" hace cascada.
  - El toolbar del emulador ya **no** tiene "Cargar CSV"; "Importar sesión (.csv)" vive en **Sesiones**.
- [ ] Full-stack: `docker compose -f infra/docker-compose.yml up` → "Continuar como invitado" entra al wizard CSV; login normal sigue; Mercados con backend sigue.
- [ ] `gh api .../branches/main/protection` refleja las reglas; PR con CI en rojo no ofrece "Merge".

---

## Self-Review (cobertura del spec)

- **Branch protection (spec §3.6)** → Task 11. ✓
- **Store `symbols` IndexedDB (spec §3.1)** → Tasks 2 (helper/tipos) + 3 (store). ✓
- **Wizard centralizado / rama CSV (spec §3.2)** → Tasks 7 (lógica) + 8 (UI). ✓
- **Mercados offline (spec §3.3)** → Task 9. ✓
- **Invitado + env flags / build offline (spec §3.4)** → Tasks 1 (flags/build) + 4 (status) + 5 (effects) + 6 (UI). ✓
- **Reubicar import de sesión y quitar botón (spec §3.5)** → Task 10. ✓
- **UI/UX (spec §4)** → Tasks 6, 8, 9, 10 (tokens/componentes reutilizados; dropzone, pill, empty-state, errores con icono). ✓
- **Manejo de errores (spec §5)** → Task 7 (símbolos mezclados, catálogo best-effort), Task 9 (vacío), Task 11 (403). ✓
- **Tests (spec §6)** → cada task incluye sus specs. ✓
- **Docs (spec §7)** → Task 12. ✓

Consistencia de tipos verificada: `OfflineSymbol`, `ParsedTf`, `coverageFromParsed`, `putSymbol/getSymbol/listSymbols/removeSymbol`, `AuthActions.continueAsGuest`, `AuthStatus` con `'guest'`, `environment.offlineOnly/guestModeEnabled`, `GUEST_KEY='emulador.guest'` — usados de forma idéntica entre tareas.
