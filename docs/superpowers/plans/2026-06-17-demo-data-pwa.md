# Datos demo offline + empty-state del emulador + PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Precargar dos activos demo (XAUUSD H1 y US30 H1) en el catálogo offline para que aparezcan por defecto en Mercados, mostrar un empty-state (en vez de un chart por defecto) cuando no hay sesión, y convertir la app offline en PWA instalable.

**Architecture:** Se modifica `scripts/descargar_datos.py` para bajar los dos CSV (H1) desde MT5 a `emulador/public/`. Un `OfflineSeedService` (vía `provideAppInitializer`) seedea el catálogo IndexedDB (`series` + `symbols`, sin sesión) en la primera carga offline. El emulador renderiza un `ui-empty-state` con CTA al wizard cuando no hay activo actual. `ng add @angular/pwa` añade service worker + manifest (tema oscuro), activos en builds prod/offline.

**Tech Stack:** Angular standalone + signals, NgRx, IndexedDB, vitest, `@angular/service-worker`, Python + MetaTrader5.

## Global Constraints

- Tests: `cd emulador && npx ng test --watch=false`. Cobertura ≥80% en `services/` y `pages/` — todo código nuevo con test.
- Lint/format: `npm run lint`, `npm run format:check` (correr `npm run format` antes de commitear).
- Copy visible en **español**. Iconos = SVG inline (sin emoji). Reusar tokens de diseño (`styles.css`) y componentes (`ButtonDirective` `appButton`, `EmptyStateComponent` `ui-empty-state` con slot `[icon]`/`[boxed]`).
- Mockear `environment.offlineOnly` en tests mutando el const (patrón de `auth.effects.offline.spec.ts`); restaurar en `afterEach`.
- Nombres EXACTOS: CSV demo en `emulador/public/` = `xauusd_h1.csv` y `us30_h1.csv`. Flag de seed = `emulador.demoSeeded.v1`. Categoría demo = `Demo`.
- Build offline objetivo: `npm run build -- --configuration offline`.
- `main` está protegida (PR + 3 checks de CI). Los cambios entran por **PR**; al mergear, el job `deploy` de GitHub Actions publica a Vercel. Los CSV demo se **commitean** en `emulador/public/`.
- Commits frecuentes; cuerpo del commit termina con: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

## File Structure

**Nuevos:**
- `emulador/src/app/services/offline-seed.service.ts` — seed del catálogo demo desde los CSV empaquetados.
- `emulador/src/app/services/offline-seed.service.spec.ts` — tests del seed.
- `emulador/public/xauusd_h1.csv`, `emulador/public/us30_h1.csv` — datos demo (generados por el script, commiteados).
- (PWA, generados por `ng add`): `emulador/ngsw-config.json`, `emulador/public/manifest.webmanifest`, `emulador/public/icons/*`.

**Modificados:**
- `scripts/descargar_datos.py` — bajar XAUUSD/US30 H1 a `emulador/public/`.
- `emulador/src/app/app.config.ts` — `provideAppInitializer` para el seed + `provideServiceWorker` (lo añade `ng add`).
- `emulador/src/app/pages/emulador/emulador-page.component.ts` (+ `.spec.ts`) — empty-state.
- `emulador/angular.json`, `emulador/src/index.html` — PWA (los toca `ng add`).

---

## Task 1: `descargar_datos.py` baja XAUUSD H1 + US30 H1 a `emulador/public/`

**Files:**
- Modify: `scripts/descargar_datos.py`
- Create (al ejecutar): `emulador/public/xauusd_h1.csv`, `emulador/public/us30_h1.csv`

**Interfaces:**
- Produces: dos CSV con header `time,open,high,low,close` (time `YYYY-MM-DD HH:MM` UTC) en `emulador/public/`. Consumidos por Task 2 (seed) y el build.

**Prerrequisito:** MT5 instalado y **abierto/logueado** en Windows, paquete `MetaTrader5` disponible. El usuario deja MT5 abierto para esta tarea.

- [ ] **Step 1: Reescribir el script**

Reemplazar el contenido de `scripts/descargar_datos.py` por:

```python
# -*- coding: utf-8 -*-
"""Descarga velas H1 de XAUUSD y US30 desde MT5 a emulador/public para el demo offline."""
import os
import sys
from datetime import datetime, timezone

import MetaTrader5 as mt5

# Símbolos LÓGICOS del demo. El archivo y el catálogo usan este nombre,
# independiente del nombre interno del broker (US30 puede ser US30.cash/DJ30...).
SIMBOLOS = ["XAUUSD", "US30"]
TF_NOMBRE = "H1"
TF = mt5.TIMEFRAME_H1
DESDE = datetime(2026, 1, 1, tzinfo=timezone.utc)
HASTA = datetime.now(timezone.utc)
# emulador/public relativo a este script (scripts/..)
CARPETA = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "emulador", "public"))


def resolver(base):
    """Nombre real del símbolo en el broker, probando wildcard si no existe tal cual."""
    candidatos = [base] + [s.name for s in (mt5.symbols_get(f"{base}*") or [])]
    for c in candidatos:
        if mt5.symbol_select(c, True):
            return c
    return None


def main():
    if not mt5.initialize():
        print(f"ERROR: no se pudo conectar a MT5: {mt5.last_error()}")
        sys.exit(1)
    print(f"Terminal : {mt5.terminal_info().name} | build {mt5.version()[1]}")
    os.makedirs(CARPETA, exist_ok=True)

    ok = 0
    for base in SIMBOLOS:
        real = resolver(base)
        if real is None:
            print(f"{base:>7}: NO ENCONTRADO en el broker; se omite")
            continue
        rates = mt5.copy_rates_range(real, TF, DESDE, HASTA)
        if rates is None or len(rates) == 0:
            print(f"{base:>7}: SIN DATOS ({real}); historico no descargado en el terminal?")
            continue
        salida = os.path.join(CARPETA, f"{base.lower()}_{TF_NOMBRE.lower()}.csv")
        with open(salida, "w", encoding="utf-8") as f:
            f.write("time,open,high,low,close\n")
            for r in rates:
                t = datetime.fromtimestamp(int(r["time"]), tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
                f.write(f"{t},{r['open']},{r['high']},{r['low']},{r['close']}\n")
        print(f"{base:>7}: {len(rates):>6} velas ({real}) -> {salida}")
        ok += 1

    mt5.shutdown()
    print(f"Descarga completa: {ok}/{len(SIMBOLOS)} simbolos.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Ejecutar el script (MT5 abierto)**

Run: `python scripts/descargar_datos.py`
Expected: imprime `XAUUSD: NNNN velas ...` y `US30: NNNN velas ...` y "Descarga completa: 2/2 simbolos." Si US30 no resuelve, ajustar `SIMBOLOS` al nombre real que liste el broker y re-ejecutar.

- [ ] **Step 3: Verificar los CSV**

Run: `head -2 emulador/public/xauusd_h1.csv && wc -l emulador/public/xauusd_h1.csv && head -2 emulador/public/us30_h1.csv && wc -l emulador/public/us30_h1.csv`
Expected: header `time,open,high,low,close`, primera fila de datos plausible, y > ~1000 líneas en cada uno.

- [ ] **Step 4: Commit (script + datos)**

```bash
git add scripts/descargar_datos.py emulador/public/xauusd_h1.csv emulador/public/us30_h1.csv
git commit -m "feat(demo): download XAUUSD/US30 H1 to emulador/public via descargar_datos.py"
```

---

## Task 2: `OfflineSeedService` — seedear el catálogo demo en la primera carga offline

**Files:**
- Create: `emulador/src/app/services/offline-seed.service.ts`
- Create: `emulador/src/app/services/offline-seed.service.spec.ts`
- Modify: `emulador/src/app/app.config.ts`

**Interfaces:**
- Consumes: `CsvLoaderService.parseText(text, name): { tf: Timeframe; candles: Candle[] }`; `WorkspaceDbService.putSeries(symbol, tf, candles)`, `putSymbol(sym: OfflineSymbol)`; `coverageFromParsed`, `OfflineSymbol` de `offline-catalog`; `symbolFromFileName`, `derivePointSize`, `Candle` de `../models`; `environment.offlineOnly`.
- Produces: `OfflineSeedService.seedIfNeeded(): Promise<void>` (consumido por el `provideAppInitializer`).

- [ ] **Step 1: Escribir los tests que fallan**

Create `emulador/src/app/services/offline-seed.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineSeedService } from './offline-seed.service';
import { CsvLoaderService } from './csv-loader.service';
import { WorkspaceDbService } from './workspace-db.service';
import { workspaceDbStub } from '../testing/workspace-db.stub';
import { environment } from '../../environments/environment';

const FLAG = 'emulador.demoSeeded.v1';
// 3 velas H1 (espaciado 3600s) → detectTimeframe = H1
const H1_CSV = [
  'time,open,high,low,close',
  '2024-01-01 00:00,10,11,9,10',
  '2024-01-01 01:00,10,11,9,10',
  '2024-01-01 02:00,10,11,9,10',
].join('\n');

function stubFetch(files: Record<string, string>) {
  return vi.fn(async (url: unknown) => {
    const name = String(url).replace(/^\//, '');
    return name in files
      ? ({ ok: true, text: async () => files[name] } as unknown as Response)
      : ({ ok: false, text: async () => '' } as unknown as Response);
  });
}

describe('OfflineSeedService', () => {
  let db: ReturnType<typeof workspaceDbStub>;
  let svc: OfflineSeedService;

  beforeEach(() => {
    environment.offlineOnly = true;
    localStorage.removeItem(FLAG);
    db = workspaceDbStub();
    vi.stubGlobal('fetch', stubFetch({ 'xauusd_h1.csv': H1_CSV, 'us30_h1.csv': H1_CSV }));
    TestBed.configureTestingModule({
      providers: [
        OfflineSeedService,
        CsvLoaderService,
        { provide: WorkspaceDbService, useValue: db },
      ],
    });
    svc = TestBed.inject(OfflineSeedService);
  });

  afterEach(() => {
    environment.offlineOnly = false;
    localStorage.removeItem(FLAG);
    vi.unstubAllGlobals();
  });

  it('seeds series + catalog for both demo symbols and sets the flag', async () => {
    await svc.seedIfNeeded();
    expect(db.putSeries).toHaveBeenCalledWith('XAUUSD', 'H1', expect.any(Array));
    expect(db.putSeries).toHaveBeenCalledWith('US30', 'H1', expect.any(Array));
    const seeded = (db.putSymbol as any).mock.calls.map((c: any[]) => c[0].symbol).sort();
    expect(seeded).toEqual(['US30', 'XAUUSD']);
    expect((db.putSymbol as any).mock.calls[0][0].categoria).toBe('Demo');
    expect(localStorage.getItem(FLAG)).toBe('1');
  });

  it('is idempotent — does nothing when the flag is already set', async () => {
    localStorage.setItem(FLAG, '1');
    await svc.seedIfNeeded();
    expect(db.putSymbol).not.toHaveBeenCalled();
    expect(db.putSeries).not.toHaveBeenCalled();
  });

  it('does nothing when not in offline mode', async () => {
    environment.offlineOnly = false;
    await svc.seedIfNeeded();
    expect(db.putSymbol).not.toHaveBeenCalled();
  });

  it('skips a symbol whose CSV is missing but still seeds the other', async () => {
    vi.stubGlobal('fetch', stubFetch({ 'xauusd_h1.csv': H1_CSV })); // us30 missing
    await svc.seedIfNeeded();
    const seeded = (db.putSymbol as any).mock.calls.map((c: any[]) => c[0].symbol);
    expect(seeded).toEqual(['XAUUSD']);
    expect(localStorage.getItem(FLAG)).toBe('1');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd emulador && npx ng test --watch=false -- offline-seed`
Expected: FAIL — módulo `offline-seed.service` no existe.

- [ ] **Step 3: Implementar el servicio**

Create `emulador/src/app/services/offline-seed.service.ts`:

```ts
import { inject, Injectable } from '@angular/core';
import { Candle, derivePointSize, symbolFromFileName } from '../models';
import { CsvLoaderService } from './csv-loader.service';
import { WorkspaceDbService } from './workspace-db.service';
import { OfflineSymbol, coverageFromParsed } from './offline-catalog';
import { environment } from '../../environments/environment';

const SEED_FLAG = 'emulador.demoSeeded.v1';
const DEMO_CATEGORY = 'Demo';
const DEMO_FILES = [
  { file: 'xauusd_h1.csv', descripcion: 'Oro (demo)' },
  { file: 'us30_h1.csv', descripcion: 'US30 (demo)' },
];

/**
 * On the first load of the static (offlineOnly) build, seeds the IndexedDB
 * catalog with the bundled demo CSVs (XAUUSD H1, US30 H1): candle series +
 * catalog entries ONLY — no session/workspace — so the emulator stays empty
 * until the user creates one. Flag-gated so deleting a demo asset never
 * re-seeds. Best-effort: never blocks bootstrap.
 */
@Injectable({ providedIn: 'root' })
export class OfflineSeedService {
  private csv = inject(CsvLoaderService);
  private db = inject(WorkspaceDbService);

  async seedIfNeeded(): Promise<void> {
    if (!environment.offlineOnly) return;
    try {
      if (localStorage.getItem(SEED_FLAG)) return;
    } catch {
      return; // storage unavailable → don't seed
    }
    for (const { file, descripcion } of DEMO_FILES) {
      try {
        const res = await fetch('/' + file);
        if (!res.ok) continue;
        const text = await res.text();
        const { tf, candles } = this.csv.parseText(text, file);
        const symbol = symbolFromFileName(file);
        await this.db.putSeries(symbol, tf, candles);
        const now = Date.now();
        const entry: OfflineSymbol = {
          symbol,
          descripcion,
          categoria: DEMO_CATEGORY,
          digits: this.digitsOf(candles),
          coverage: coverageFromParsed([{ tf, candles }]),
          createdAt: now,
          lastModified: now,
        };
        await this.db.putSymbol(entry);
      } catch {
        /* skip this symbol, keep going */
      }
    }
    try {
      localStorage.setItem(SEED_FLAG, '1');
    } catch {
      /* ignore */
    }
  }

  /** Decimal places from the data's point size (gold 0.01 → 2, index 1 → 0). */
  private digitsOf(candles: Candle[]): number {
    const p = derivePointSize(candles);
    return p >= 1 ? 0 : Math.round(-Math.log10(p));
  }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd emulador && npx ng test --watch=false -- offline-seed`
Expected: PASS (4 tests).

- [ ] **Step 5: Cablear el seed en el arranque**

En `emulador/src/app/app.config.ts`:

(a) Imports — añadir `provideAppInitializer` e `inject` a la línea de `@angular/core`, y el servicio:

```ts
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideAppInitializer, inject } from '@angular/core';
```
```ts
import { OfflineSeedService } from './services/offline-seed.service';
```

(b) Añadir al array `providers` (p. ej. tras `provideBrowserGlobalErrorListeners()`):

```ts
    provideAppInitializer(() => inject(OfflineSeedService).seedIfNeeded()),
```

- [ ] **Step 6: Verificar build + suite**

Run: `cd emulador && npx ng test --watch=false && npm run build -- --configuration offline`
Expected: suite verde (incluye los 4 nuevos); build offline compila.

- [ ] **Step 7: Format + lint + commit**

```bash
cd emulador && npm run format && npm run lint
git add emulador/src/app/services/offline-seed.service.ts emulador/src/app/services/offline-seed.service.spec.ts emulador/src/app/app.config.ts
git commit -m "feat(offline): seed demo catalog (XAUUSD/US30 H1) on first offline load"
```

---

## Task 3: Empty-state del emulador cuando no hay sesión

**Files:**
- Modify: `emulador/src/app/pages/emulador/emulador-page.component.ts`
- Modify: `emulador/src/app/pages/emulador/emulador-page.component.spec.ts`

**Interfaces:**
- Consumes: `selectCurrentAsset` de `../../state/selectors` (signal → símbolo actual o `null`); `EmptyStateComponent`, `ButtonDirective`, `RouterLink`.
- Produces: `EmuladorPageComponent.hasSession()` (computed `boolean`).

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `emulador/src/app/pages/emulador/emulador-page.component.spec.ts`:

(a) import del selector arriba:

```ts
import { selectCurrentAsset } from '../../state/selectors';
```

(b) tests dentro del `describe`:

```ts
  it('hasSession() is false when there is no current asset', () => {
    create();
    store.overrideSelector(selectCurrentAsset, null);
    store.refreshState();
    expect(component.hasSession()).toBe(false);
  });

  it('hasSession() is true when a current asset is set', () => {
    create();
    store.overrideSelector(selectCurrentAsset, 'XAUUSD');
    store.refreshState();
    expect(component.hasSession()).toBe(true);
  });
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd emulador && npx ng test --watch=false -- emulador-page`
Expected: FAIL — `component.hasSession` no existe.

- [ ] **Step 3: Implementar el empty-state**

Reemplazar `emulador-page.component.ts` por (conserva la lógica existente, añade `currentAsset`/`hasSession`, imports y el `@if/@else` en el template):

```ts
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { ChartComponent } from '../../components/chart/chart.component';
import { ControlsComponent } from '../../components/controls/controls.component';
import { DrawingToolbarComponent } from '../../components/drawing-toolbar/drawing-toolbar.component';
import { SideDockComponent } from '../../components/side-dock/side-dock.component';
import { SessionSummaryComponent } from '../../components/session-summary/session-summary.component';
import { FloatingToolbarComponent } from '../../components/floating-toolbar/floating-toolbar.component';
import { CsvStartDialogComponent } from '../../components/csv-start-dialog/csv-start-dialog.component';
import { EmptyStateComponent } from '../../components/ui/empty-state.component';
import { ButtonDirective } from '../../components/ui/button.directive';
import { tradingFeature } from '../../state/trading/trading.reducer';
import { settingsFeature } from '../../state/settings/settings.reducer';
import { selectCurrentAsset } from '../../state/selectors';

@Component({
  selector: 'app-emulador-page',
  standalone: true,
  imports: [
    ChartComponent,
    ControlsComponent,
    DrawingToolbarComponent,
    SideDockComponent,
    SessionSummaryComponent,
    FloatingToolbarComponent,
    CsvStartDialogComponent,
    EmptyStateComponent,
    ButtonDirective,
    RouterLink,
  ],
  template: `
    @if (hasSession()) {
      <div class="layout">
        <app-controls></app-controls>
        <div class="workspace">
          <app-drawing-toolbar></app-drawing-toolbar>
          <main class="chart-area">
            <app-chart></app-chart>
            @if (floatingToolbar()) {
              <app-floating-toolbar></app-floating-toolbar>
            }
          </main>
          <app-side-dock></app-side-dock>
        </div>
        @if (summaryOpen()) {
          <app-session-summary></app-session-summary>
        }
        <app-csv-start-dialog></app-csv-start-dialog>
      </div>
    } @else {
      <div class="empty-wrap">
        <ui-empty-state
          title="Aún no tienes una sesión activa"
          hint="Crea una sesión desde un activo en Mercados o subiendo tus CSV en el asistente."
          [boxed]="true"
        >
          <svg
            icon
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
            <polyline points="16 7 22 7 22 13"></polyline>
          </svg>
          <a appButton variant="primary" routerLink="/sesiones/crear">Crear sesión</a>
        </ui-empty-state>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .layout {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .workspace {
        display: flex;
        flex: 1;
        min-height: 0;
      }
      .chart-area {
        flex: 1;
        min-width: 0;
        position: relative;
      }
      .empty-wrap {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-6);
      }
    `,
  ],
})
export class EmuladorPageComponent {
  private store = inject(Store);

  summaryOpen = this.store.selectSignal(tradingFeature.selectSummaryOpen);
  floatingToolbar = this.store.selectSignal(settingsFeature.selectFloatingToolbar);
  private currentAsset = this.store.selectSignal(selectCurrentAsset);

  /** No current asset = no session restored/created → show the empty-state. */
  hasSession = computed(() => !!this.currentAsset());
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd emulador && npx ng test --watch=false -- emulador-page`
Expected: PASS (los smoke tests previos + los 2 nuevos).

- [ ] **Step 5: Build de humo + format + commit**

```bash
cd emulador && npm run build -- --configuration offline && npm run format && npm run lint
git add emulador/src/app/pages/emulador/
git commit -m "feat(emulador): show empty-state with CTA when there is no active session"
```

---

## Task 4: PWA (service worker + manifest)

**Files:**
- Modify (vía schematic): `emulador/angular.json`, `emulador/src/app/app.config.ts`, `emulador/src/index.html`
- Create (vía schematic): `emulador/ngsw-config.json`, `emulador/public/manifest.webmanifest`, `emulador/public/icons/*`
- Modify: `emulador/ngsw-config.json`, `emulador/public/manifest.webmanifest` (ajustes)

**Interfaces:** N/A (config/infra).

- [ ] **Step 1: Añadir PWA con el schematic de Angular**

Run: `cd emulador && npx ng add @angular/pwa --skip-confirmation`
Expected: instala `@angular/service-worker`, crea `ngsw-config.json` + `public/manifest.webmanifest` + `public/icons/`, añade `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })` a `app.config.ts`, y `"serviceWorker": "ngsw-config.json"` + el manifest a `angular.json`. Verificar con `git status` que esos archivos cambiaron.

- [ ] **Step 2: Ajustar el manifest (tema oscuro TradingView)**

Editar `emulador/public/manifest.webmanifest` para que `name`, `short_name` y colores sean:

```json
{
  "name": "Emulador de Backtesting",
  "short_name": "Emulador",
  "theme_color": "#2962ff",
  "background_color": "#000000",
  "display": "standalone",
  "scope": "/",
  "start_url": "/",
  "icons": [
    { "src": "icons/icon-72x72.png", "sizes": "72x72", "type": "image/png", "purpose": "maskable any" },
    { "src": "icons/icon-96x96.png", "sizes": "96x96", "type": "image/png", "purpose": "maskable any" },
    { "src": "icons/icon-128x128.png", "sizes": "128x128", "type": "image/png", "purpose": "maskable any" },
    { "src": "icons/icon-144x144.png", "sizes": "144x144", "type": "image/png", "purpose": "maskable any" },
    { "src": "icons/icon-152x152.png", "sizes": "152x152", "type": "image/png", "purpose": "maskable any" },
    { "src": "icons/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable any" },
    { "src": "icons/icon-384x384.png", "sizes": "384x384", "type": "image/png", "purpose": "maskable any" },
    { "src": "icons/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable any" }
  ]
}
```

> Mantener la lista de iconos exactamente como la generó `ng add` (nombres/paths). Sólo cambiar `name`/`short_name`/`theme_color`/`background_color` si difieren. Ajustar `<meta name="theme-color">` en `emulador/src/index.html` a `#000000` si `ng add` puso otro valor.

- [ ] **Step 3: Cachear los CSV demo en el service worker**

En `emulador/ngsw-config.json`, dentro del assetGroup que tiene `"installMode": "prefetch"` (normalmente llamado `"app"` o `"assets"`), añadir los CSV a `resources.files` para que estén disponibles offline. Añadir al array `files` del grupo de assets (el que incluye favicon/manifest):

```json
"/*.csv"
```

(Si el grupo `assets` usa `"installMode": "lazy"`, mover los `/*.csv` a un grupo con `"installMode": "prefetch"` o crear uno nuevo:)

```json
{
  "name": "demo-data",
  "installMode": "prefetch",
  "updateMode": "prefetch",
  "resources": { "files": ["/*.csv"] }
}
```

- [ ] **Step 4: Verificar que el build offline emite el SW y el manifest**

Run:
```bash
cd emulador && npm run build -- --configuration offline
ls dist/emulador/browser/ngsw-worker.js dist/emulador/browser/manifest.webmanifest dist/emulador/browser/ngsw.json
```
Expected: los tres archivos existen. (`ngsw.json` lista los assets cacheados, incluidos los `.csv` si se configuró bien.)

- [ ] **Step 5: Suite + lint + commit**

```bash
cd emulador && npx ng test --watch=false && npm run format && npm run lint
git add emulador/angular.json emulador/ngsw-config.json emulador/src/app/app.config.ts emulador/src/index.html emulador/public/manifest.webmanifest emulador/public/icons emulador/package.json emulador/package-lock.json
git commit -m "feat(pwa): add service worker + manifest (dark theme), cache demo CSVs"
```

---

## Verificación final (end-to-end)

- [ ] `cd emulador && npx ng test --watch=false` → verde, cobertura ≥80%.
- [ ] `npm run lint && npm run format:check` → limpios.
- [ ] `npm run build -- --configuration offline` → compila; `dist/emulador/browser/` contiene `ngsw-worker.js`, `manifest.webmanifest`, `xauusd_h1.csv`, `us30_h1.csv`.
- [ ] Preview offline (`npm start -- --configuration offline`, o servir el dist). Borrar datos del sitio / IndexedDB + `localStorage` para simular visitante nuevo. Verificar con las preview tools (`preview_start` + snapshot):
  - **Mercados** muestra **XAUUSD** y **US30** (H1, categoría "Demo") sin subir nada.
  - **Emulador** muestra el **empty-state** (sin chart) con el botón "Crear sesión".
  - Crear sesión desde un activo demo → abre el chart posicionado.
  - Recargar → catálogo intacto, **no** re-seedea (flag `emulador.demoSeeded.v1`).
  - Borrar un activo demo en Mercados → no reaparece tras recargar.
- [ ] PWA: en el dist servido, manifest válido e instalable; el SW cachea el app-shell (DevTools → Application → Service Workers / Lighthouse PWA).
- [ ] Abrir **PR a `main`**; con CI verde, mergear → el job `deploy` publica la nueva versión a Vercel.

## Self-Review (cobertura del spec)

- **Datos demo XAUUSD/US30 H1 (spec §2.1)** → Task 1. ✓
- **Seed catálogo sin sesión + flag + gating (spec §2.2)** → Task 2. ✓
- **Mercados muestra los demo (spec §2.2)** → emergente de Task 2 (sin cambios de código). ✓
- **Empty-state del emulador (spec §2.2)** → Task 3. ✓
- **PWA: SW + manifest + cache CSV (spec §2.3)** → Task 4. ✓
- **Tests (spec §4)** → cada task incluye sus specs (Tasks 2 y 3); Task 1/4 verificación por ejecución/build. ✓
- **Verificación (spec §5) y despliegue (spec §6)** → sección de verificación final + PR. ✓

Consistencia de tipos/nombres: `seedIfNeeded()`, flag `emulador.demoSeeded.v1`, categoría `Demo`, archivos `xauusd_h1.csv`/`us30_h1.csv`, `hasSession()`, `selectCurrentAsset` — usados idénticamente entre tareas y coherentes con APIs existentes (`putSeries`/`putSymbol`/`coverageFromParsed`/`parseText`/`symbolFromFileName`/`derivePointSize`).

## Notas para el ejecutor

- **MT5 debe estar abierto** durante Task 1 (el usuario lo deja listo). Si US30 no resuelve, listar símbolos del broker (`mt5.symbols_get("US30*")` / `"*30*"`) y ajustar `SIMBOLOS`.
- Trabajar en un worktree/branch nuevo desde `main`; los cambios entran por PR (main protegida). Al mergear, se despliega solo.
- `ng add @angular/pwa` modifica varios archivos de forma semi-automática; tras correrlo, revisar el diff y aplicar sólo los ajustes de los Steps 2–3.
