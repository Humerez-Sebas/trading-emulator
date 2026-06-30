# RFC 003: Capabilities Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el `ChartEngine` en un *host de plugins*: definir la interfaz `Capability` y un registro interno, de modo que la lógica visual futura (trading, drawings, countdown…) se inyecte sin modificar el motor (Open/Closed). RFC-003 es **solo el andamiaje** — NO migra ninguna lógica todavía y NO cambia comportamiento observable.

**Architecture:** El `ChartEngine` mantiene un `Map<string, Capability>`. `registerCapability(cap)` guarda la capability e invoca `cap.init(chart, bus)`. En `render(model)`, tras actualizar la serie principal, el engine reenvía el modelo a cada capability (`cap.render(model)`). En `destroy()`, el engine destruye cada capability **antes** de cerrar el bus y el chart.

**Tech Stack:** TypeScript (Vanilla en el dominio; sin Angular/NgRx/RxJS en `ChartEngine` ni en las capabilities).

---

## Global Constraints

- **Workspace real: `emulador/`.** TODAS las rutas viven bajo `emulador/src/app/...`.
  ⚠️ En RFC-001 un subagente creó archivos en la raíz del repo (`src/app/...`) por error y
  hubo que moverlos. **No repetir.** Si dudas, confirma con `ls emulador/src/app/domain/chart/`
  (debes ver `chart-engine.ts`, `chart-event-bus.ts`, `chart-event-bus.spec.ts`, `render-model.ts`).
- **Target Branch:** `feature/rfc-003-capabilities-foundation`.
- **Base / dependencia:** RFC-003 depende de RFC-002 (la interfaz `Capability` usa `ChartEventBus`).
  RFC-002 está en [PR #16](https://github.com/Humerez-Sebas/trading-emulator/pull/16) (`→ develop`).
  - **Preferido:** ramifica desde `develop` **una vez que PR #16 esté mergeado** (entonces
    `chart-event-bus.ts` y el `bus`/`events` del engine ya están en `develop`).
  - Antes de empezar, **verifica** que la base contiene RFC-002:
    `git ls-tree -r <base> --name-only | grep chart-event-bus.ts` debe devolver el archivo, y
    `grep -n "private bus" emulador/src/app/domain/chart/chart-engine.ts` debe existir.
  - Si PR #16 **aún no está mergeado**, NO ramifiques desde `develop` (le faltaría el bus):
    espera el merge, o —solo con visto bueno del usuario— ramifica desde
    `feature/rfc-002-event-bus-bridge` y rebasa a `develop` tras el merge.
- Al cerrar: PR `feature/rfc-003-capabilities-foundation` → `develop`. **NO mergear a `main`.**
  Usa GitHub MCP para crear ramas/PRs; usa git para commits/push.
- **Verificación obligatoria (gate de cada tarea), ejecutada DENTRO de `emulador/`:**
  ```bash
  cd emulador
  npx tsc -p tsconfig.app.json --noEmit   # debe salir limpio (exit 0)
  npm run build                            # debe terminar en "Application bundle generation complete"
  ```
  (El warning de "bundle initial exceeded maximum budget" es preexistente y NO es un fallo.)
- **Testing:** RFC-003 **no añade specs**. Justificación: la interfaz `Capability` es un tipo puro
  (no hay runtime que probar), y el registro vive dentro de `ChartEngine`, cuyo constructor llama a
  `createChart()` y requiere un `<canvas>` real. El entorno de tests del repo es `jsdom` (sin backend
  de canvas), así que `ChartEngine` no es instanciable en vitest hoy. El registro obtiene cobertura
  real cuando RFC-004 registre la primera capability concreta. El gate sigue siendo `tsc` + `build`.

## Estado heredado de RFC-001 + RFC-002 (contexto crítico — leer antes de tocar código)

`emulador/src/app/domain/chart/chart-engine.ts` (Vanilla TS, sin Angular/NgRx) hoy expone:
- Getters **puente** `chartApi: IChartApi` y `seriesApi: ISeriesApi<'Candlestick'>`
  (marcados con un `// TODO` que apunta a RFC-004/005). **RFC-003 NO los elimina.**
- Campos privados `chart: IChartApi`, `mainSeries: ISeriesApi<'Candlestick'>`, y **`bus = new ChartEventBus()`**
  con getter público `get events(): ChartEventBus`.
- Constructor: crea `this.chart` (`createChart`), `this.mainSeries` (`addSeries`) y suscribe las 4 fuentes
  de Lightweight Charts reemitiéndolas tipadas en el bus (RFC-002).
- `render(model: Partial<RenderModel>)` — actualiza config + candles de la serie principal.
- `setInteractivity(enabled)`, `resetPriceScale()`, `hexToRgba(...)` privado.
- `destroy()` — hoy es exactamente: `this.bus.destroy(); this.chart.remove();`

Otros archivos del dominio (no se tocan en RFC-003):
- `emulador/src/app/domain/chart/chart-event-bus.ts` — `ChartEventBus` (pub/sub tipado: `ChartEventMap`,
  `on<K>(): Unsubscribe`, `emit<K>()`, `destroy()`; sin `any`).
- `emulador/src/app/domain/chart/render-model.ts` — `RenderModel { candles: Candle[]; config: ChartConfig }`
  + `ChartConfig`. **Importante:** `RenderModel` aún NO tiene sub-dominios `trading`/`drawings`. Esa
  expansión es de RFC-004/005, **no de RFC-003** (YAGNI: no añadir claves que ninguna capability consume todavía).

**`ChartComponent` (`emulador/src/app/components/chart/.../chart.component.ts`) NO se modifica en RFC-003.**
Nadie registra capabilities aún; eso llega en RFC-004. RFC-003 solo deja la base lista.

---

### Task 1: Definir la interfaz `Capability`

**Files:**
- Create: `emulador/src/app/domain/chart/capability.ts`

**Interfaces:**
- Produces: `Capability`

- [ ] **Step 1: Escribir la interfaz (tipado fuerte, sin `any`)**

```typescript
// emulador/src/app/domain/chart/capability.ts
import { IChartApi } from 'lightweight-charts';
import { ChartEventBus } from './chart-event-bus';
import { RenderModel } from './render-model';

/**
 * Plugin del ChartEngine. El motor permanece cerrado a modificación: nueva
 * lógica visual = nueva Capability registrada al inicio.
 */
export interface Capability {
  /** Identificador único; clave en el registro del engine. */
  readonly id: string;

  /**
   * Se invoca una vez al registrar la capability. Recibe el chart y el bus de
   * eventos para suscribirse / adjuntar primitivas.
   * NOTA (RFC-004/005): es probable que `init` se extienda para recibir también
   * la serie principal (`ISeriesApi<'Candlestick'>`) cuando Trading/Drawings la
   * necesiten; hasta entonces los getters puente `seriesApi` cubren ese acceso.
   */
  init(chart: IChartApi, bus: ChartEventBus): void;

  /**
   * Se invoca en cada `engine.render(model)`. Recibe el MISMO `Partial<RenderModel>`
   * que el engine — la firma es `Partial` a propósito, porque los callers envían
   * modelos parciales (p. ej. `engine.render({ config })`). Cada capability lee solo
   * su sub-estado y debería hacer shallow-compare antes de tocar la API de
   * lightweight-charts (ver Mitigaciones del RFC).
   */
  render(model: Partial<RenderModel>): void;

  /** Limpieza: desuscribir del bus, quitar primitivas, liberar recursos. */
  destroy(): void;
}
```

- [ ] **Step 2: Verify** — `cd emulador && npx tsc -p tsconfig.app.json --noEmit` (exit 0).
- [ ] **Step 3: Commit**

```bash
git add emulador/src/app/domain/chart/capability.ts
git commit -m "feat: define base Capability interface"
```

---

### Task 2: Registrar capabilities en `ChartEngine`

**Files:**
- Modify: `emulador/src/app/domain/chart/chart-engine.ts`

**Interfaces:**
- Consumes: `Capability`
- Produces: método público `registerCapability(cap: Capability): void` en `ChartEngine`.

- [ ] **Step 1: Importar y añadir el registro**

1. Añadir el import: `import { Capability } from './capability';`
2. Añadir un campo privado (junto a los demás campos, p. ej. tras `private bus = ...`):
   ```ts
   private capabilities = new Map<string, Capability>();
   ```
3. Añadir el método de registro (invoca `init` con los campos reales del engine — son
   **`this.chart`** y **`this.bus`**, NO `this.eventBus`):
   ```ts
   public registerCapability(cap: Capability): void {
     this.capabilities.set(cap.id, cap);
     cap.init(this.chart, this.bus);
   }
   ```

- [ ] **Step 2: Reenviar `render` a las capabilities**

Al **final** de `render(model)`, tras actualizar config y candles de la serie principal, añadir:
```ts
    // Capabilities (RFC-003): el engine actualiza su serie y delega el resto del
    // modelo a los plugins registrados.
    this.capabilities.forEach((cap) => cap.render(model));
```
(`render` mantiene su firma actual `render(model: Partial<RenderModel>)`.)

- [ ] **Step 3: Destruir capabilities en `destroy()` con el orden correcto**

Las capabilities pueden tener primitivas adjuntas a la serie/chart y suscripciones al bus, así que
deben destruirse **antes** de cerrar el bus y el chart:
```ts
  public destroy(): void {
    this.capabilities.forEach((cap) => cap.destroy());
    this.bus.destroy();
    this.chart.remove();
  }
```

- [ ] **Step 4: Verify** — `cd emulador && npx tsc -p tsconfig.app.json --noEmit` (exit 0) y
  `npm run build` (termina en "Application bundle generation complete").

- [ ] **Step 5: Commit**

```bash
git add emulador/src/app/domain/chart/chart-engine.ts
git commit -m "feat: implement capability registry in ChartEngine"
```

---

## Definition of Done (RFC-003)

- Existe `emulador/src/app/domain/chart/capability.ts` con la interfaz `Capability`
  (`id`, `init(chart, bus)`, `render(Partial<RenderModel>)`, `destroy()`), sin `any`.
- `ChartEngine` tiene `registerCapability(cap)`, reenvía `render(model)` a todas las capabilities,
  y en `destroy()` las destruye **antes** de `bus.destroy()` y `chart.remove()`.
- Sin cambios de comportamiento: nadie registra capabilities todavía, así que el render del chart es
  idéntico (el `forEach` sobre un Map vacío es no-op). `ChartComponent` no se toca.
- Getters puente `chartApi`/`seriesApi` intactos (se retiran en RFC-004/005).
- `tsc --noEmit` limpio y `npm run build` exitoso. Sin specs nuevos (ver "Testing" en Global Constraints).
- Actualizar `.superpowers/sdd/progress.md` al cerrar.

## Notas hacia adelante (NO implementar en RFC-003)

- **Extensión de `init`:** RFC-004/005 probablemente pasará la serie principal a `init` (o un objeto
  de contexto) cuando `TradingCapability`/`DrawingsCapability` la necesiten. No lo añadas ahora (YAGNI;
  un parámetro sin uso sería marcado por el review).
- **Sub-dominios de `RenderModel`:** `model.trading`, `model.drawings`, etc. se añaden cuando exista la
  capability que los consume (RFC-004/005), no antes.
- **Invariante de teardown:** mantener el orden "destruir capabilities → cerrar bus → quitar chart".
- **Performance:** cada capability debe hacer shallow-compare de su sub-estado antes de forzar updates
  sobre lightweight-charts (Mitigación del RFC), relevante recién cuando haya capabilities reales.
