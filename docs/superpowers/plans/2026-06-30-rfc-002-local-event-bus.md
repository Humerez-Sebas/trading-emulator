# RFC 002: Local Event Bus & Render Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar `ChartEventBus` para exportar eventos interactivos desde `ChartEngine` hacia `ChartComponent` sin depender de NgRx ni RxJS en el dominio.

**Architecture:** `ChartEventBus` actúa como un pub/sub interno y agnóstico. El `ChartEngine` se suscribe a los eventos de Lightweight Charts y los reemite tipados en el bus. La capa Angular (`ChartComponent`) escucha el bus y despacha a NgRx.

**Tech Stack:** TypeScript (Vanilla en el dominio, Angular/NgRx solo en el componente).

---

## Global Constraints

- **Workspace real: `emulador/`.** TODAS las rutas viven bajo `emulador/src/app/...`.
  ⚠️ En RFC-001 un subagente creó archivos en la raíz del repo (`src/app/...`) por
  error y hubo que moverlos. **No repetir.** Si dudas, confirma con
  `ls emulador/src/app/domain/chart/`.
- **Target Branch:** `feature/rfc-002-event-bus-bridge`.
- **Base:** RFC-001 ya está mergeado y endurecido. Ramifica desde `main`
  (o desde `feature/rfc-001-core-chart-engine` si aún no se mergeó).
- **Verificación obligatoria (gate de cada tarea), ejecutada DENTRO de `emulador/`:**
  ```bash
  cd emulador
  npx tsc -p tsconfig.app.json --noEmit   # debe salir limpio (exit 0)
  npm run build                            # debe terminar en "bundle generation complete"
  ```
  (El warning de "bundle initial exceeded maximum budget" es preexistente y NO es un fallo.)

## Estado heredado de RFC-001 (contexto crítico — leer antes de tocar código)

`emulador/src/app/domain/chart/chart-engine.ts` ya existe y expone:
- `render(model: Partial<RenderModel>)`, `setInteractivity(enabled)`, `resetPriceScale()`, `destroy()`.
- Getters **puente** `chartApi: IChartApi` y `seriesApi: ISeriesApi<'Candlestick'>`
  (marcados con un `// TODO` que apunta a RFC-004/005).
  **RFC-002 NO elimina estos getters.** Solo añade el canal de eventos.

En `emulador/src/app/components/chart/chart.component.ts`, dentro de `ngAfterViewInit`,
hoy existen **exactamente 4 suscripciones directas** a Lightweight Charts que son el
único objetivo de migración de esta RFC:

```ts
this.chart.subscribeClick((p) => this.zone.run(() => this.handleClick(p)));
this.chart.subscribeDblClick((p) => this.zone.run(() => this.handleClick(p)));
this.chart.subscribeCrosshairMove((p) => this.handleCrosshair(p));
this.chart.timeScale().subscribeVisibleLogicalRangeChange((r) => this.maybeLoadMore(r));
```

Notas que el agente DEBE preservar:
- `subscribeClick` y `subscribeDblClick` ambos enrutan a `handleClick` (por el patrón
  click+dblclick de la librería). Mantener ese comportamiento: ambos emiten `ChartClicked`.
- `handleClick` / `handleCrosshair` / `maybeLoadMore` **se quedan en el componente** (tocan
  NgRx, drawings y signals). RFC-002 solo cambia *quién dispara* esos handlers.
- `handleClick` corre dentro de `this.zone.run(...)`; `handleCrosshair` corre fuera de zona
  a propósito (alta frecuencia). **Conservar exactamente esa semántica de NgZone** al
  reconectar vía el bus.
- `ngOnDestroy` ya llama `this.engine?.destroy()`. Las suscripciones al bus deben limpiarse
  ahí (guardar las funciones unsubscribe que devuelve `bus.on(...)`).

---

### Task 1: Create ChartEventBus

**Files:**
- Create: `emulador/src/app/domain/chart/chart-event-bus.ts`

**Interfaces:**
- Produces: `ChartEventBus`, `ChartEventMap` (payloads tipados), helper `Unsubscribe`.

- [ ] **Step 1: Write minimal implementation (tipado fuerte, sin `any`)**

Usa tipos de Lightweight Charts para los payloads — el dominio ya depende de esa
librería, así que es consistente y mantiene NgRx/Angular fuera del bus.

```typescript
// emulador/src/app/domain/chart/chart-event-bus.ts
import { LogicalRange, MouseEventParams, Time } from 'lightweight-charts';

/** Payload por tipo de evento. Sin `any`: usa los tipos de la librería. */
export interface ChartEventMap {
  ChartClicked: MouseEventParams<Time>;
  CrosshairMoved: MouseEventParams<Time>;
  VisibleRangeChanged: LogicalRange | null;
}

export type ChartEventType = keyof ChartEventMap;
export type Unsubscribe = () => void;

/** Pub/sub local, agnóstico de framework. */
export class ChartEventBus {
  private listeners: {
    [K in ChartEventType]?: Set<(payload: ChartEventMap[K]) => void>;
  } = {};

  public on<K extends ChartEventType>(
    type: K,
    callback: (payload: ChartEventMap[K]) => void,
  ): Unsubscribe {
    (this.listeners[type] ??= new Set()).add(callback);
    return () => this.listeners[type]?.delete(callback);
  }

  public emit<K extends ChartEventType>(type: K, payload: ChartEventMap[K]): void {
    this.listeners[type]?.forEach((cb) => cb(payload));
  }

  public destroy(): void {
    this.listeners = {};
  }
}
```

- [ ] **Step 2: Verify** — `cd emulador && npx tsc -p tsconfig.app.json --noEmit` (exit 0).
- [ ] **Step 3: Commit**

```bash
git add emulador/src/app/domain/chart/chart-event-bus.ts
git commit -m "feat: implement typed vanilla ChartEventBus"
```

---

### Task 2: Integrate EventBus into ChartEngine

**Files:**
- Modify: `emulador/src/app/domain/chart/chart-engine.ts`

**Interfaces:**
- Consumes: `ChartEventBus`
- Produces: getter público `events: ChartEventBus` en `ChartEngine`.

- [ ] **Step 1: Instanciar el bus, suscribir Lightweight Charts y reemitir**

En el constructor de `ChartEngine` (tras crear `this.chart` y `this.mainSeries`):

```ts
// campo privado + getter de solo lectura
private bus = new ChartEventBus();
public get events(): ChartEventBus { return this.bus; }

// dentro del constructor:
this.chart.subscribeClick((p) => this.bus.emit('ChartClicked', p));
this.chart.subscribeDblClick((p) => this.bus.emit('ChartClicked', p));
this.chart.subscribeCrosshairMove((p) => this.bus.emit('CrosshairMoved', p));
this.chart
  .timeScale()
  .subscribeVisibleLogicalRangeChange((r) => this.bus.emit('VisibleRangeChanged', r));
```

- [ ] **Step 2: Limpiar el bus en `destroy()`**

```ts
public destroy(): void {
  this.bus.destroy();
  this.chart.remove(); // chart.remove() ya desuscribe los listeners internos de la librería
}
```

- [ ] **Step 3: Verify** — `cd emulador && npx tsc -p tsconfig.app.json --noEmit` (exit 0).
- [ ] **Step 4: Commit**

```bash
git add emulador/src/app/domain/chart/chart-engine.ts
git commit -m "feat: emit lightweight-charts events through ChartEventBus"
```

---

### Task 3: Bridge EventBus to NgRx in ChartComponent

**Files:**
- Modify: `emulador/src/app/components/chart/chart.component.ts`

**Interfaces:**
- Consumes: `ChartEngine.events` (el bus). NO se introduce ningún import nuevo de Lightweight Charts.

- [ ] **Step 1: Reemplazar las 4 suscripciones directas por listeners del bus**

Sustituir el bloque actual (ver "Estado heredado" arriba) por:

```ts
// preservar EXACTAMENTE la semántica de NgZone que tenía cada handler:
this.busUnsubs.push(
  this.engine.events.on('ChartClicked', (p) => this.zone.run(() => this.handleClick(p))),
  this.engine.events.on('CrosshairMoved', (p) => this.handleCrosshair(p)), // fuera de zona, a propósito
  this.engine.events.on('VisibleRangeChanged', (r) => this.maybeLoadMore(r)),
);
```

Añadir el campo para guardar las desuscripciones:

```ts
private busUnsubs: Array<() => void> = [];
```

- [ ] **Step 2: Desuscribirse en `ngOnDestroy`** (antes o después de `this.engine?.destroy()`):

```ts
this.busUnsubs.forEach((off) => off());
this.busUnsubs = [];
```

- [ ] **Step 3: Verify (funcional + tipos + build)**
  - `cd emulador && npx tsc -p tsconfig.app.json --noEmit` (exit 0) y `npm run build` (success).
  - Smoke manual: replay corre, click selecciona/dibuja, el crosshair mueve overlays y
    el lazy-load de velas al hacer scroll a la izquierda sigue funcionando.

- [ ] **Step 4: Commit**

```bash
git add emulador/src/app/components/chart/chart.component.ts
git commit -m "refactor: bridge ChartEventBus events to NgRx in ChartComponent"
```

---

## Definition of Done (RFC-002)

- `ChartComponent` ya no llama `this.chart.subscribe*` ni `timeScale().subscribe*` directamente;
  toda interacción entra por `engine.events`.
- Sin fugas: cada `bus.on()` tiene su unsubscribe en `ngOnDestroy`; `engine.destroy()` limpia el bus.
- Sin `any` en `chart-event-bus.ts`.
- `tsc --noEmit` limpio y `npm run build` exitoso.
- Los getters puente `chartApi`/`seriesApi` siguen intactos (se retiran en RFC-004/005).
- Actualizar `.superpowers/sdd/progress.md` al cerrar.
