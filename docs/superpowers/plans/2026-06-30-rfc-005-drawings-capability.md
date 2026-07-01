# RFC 005: Drawings Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aislar la visualización e interacciones de las herramientas de dibujo (rectángulos, líneas, Fibonacci, reglas) en un plugin nativo del `ChartEngine` implementando la interfaz `Capability` de RFC-003.

**Architecture:** Se implementa la interfaz `Capability`. Toma datos desde `model.drawings` (de tipo `DrawingsModel`). Expone métodos de hit-testing y conversión temporal al `ChartComponent`.

**Tech Stack:** TypeScript.

## Global Constraints
- Target Branch: `feature/rfc-005-drawings-capability`.
- Dependencies: Must branch off `develop` (with RFC-004 already integrated).
- Workspace real: `emulador/`. All paths live under `emulador/src/app/...`.
- Verification gates (run inside `emulador/`):
  ```bash
  cd emulador
  npx tsc -p tsconfig.app.json --noEmit
  npm run build
  ```

---

### Task 1: Extend RenderModel for Drawings

**Files:**
- Modify: `emulador/src/app/domain/chart/render-model.ts`

**Interfaces:**
- Produces: `DrawingsModel` properties inside `RenderModel`

- [ ] **Step 1: Add DrawingsModel to RenderModel**

```typescript
// En emulador/src/app/domain/chart/render-model.ts
import { Drawing } from '../../state/drawings/drawings.models';

export interface DrawingsModel {
  items: Drawing[];
  draft: Drawing | null;
  selectedId: string | null;
  shift: number;
  times: number[];
  barSpacing: number;
  pointSize: number;
  accent: string;
  up: string;
  down: string;
}

// Extender RenderModel
export interface RenderModel {
  candles: any[]; // tipo preexistente
  config: any;   // tipo preexistente
  trading?: any;  // tipo preexistente
  drawings?: DrawingsModel;
}
```

- [ ] **Step 2: Verify** — `cd emulador && npx tsc -p tsconfig.app.json --noEmit` (exit 0)
- [ ] **Step 3: Commit**

```bash
git add emulador/src/app/domain/chart/render-model.ts
git commit -m "feat: extend RenderModel with DrawingsModel"
```

---

### Task task 2: Implement DrawingsCapability

**Files:**
- Create: `emulador/src/app/domain/chart/capabilities/drawings-capability.ts`
- Modify: `emulador/src/app/components/chart/chart.component.ts` (to register the capability and delegate hit-testing/drawing source)
- Move/Adapt: `emulador/src/app/components/chart/drawings-primitive.ts` into `emulador/src/app/domain/chart/capabilities/`
- Delete: `emulador/src/app/components/chart/drawings-primitive.ts`

**Interfaces:**
- Consumes: `Capability`, `DrawingsModel`
- Produces: `DrawingsCapability`

- [ ] **Step 1: Relocate and adapt DrawingsPrimitive**
  - Move `emulador/src/app/components/chart/drawings-primitive.ts` to `emulador/src/app/domain/chart/capabilities/drawings-primitive.ts`.
  - Fix relative imports inside `drawings-primitive.ts` to resolve `Drawing` and state imports correctly.

- [ ] **Step 2: Write capability structure**

```typescript
// emulador/src/app/domain/chart/capabilities/drawings-capability.ts
import { Capability } from '../capability';
import { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { ChartEventBus } from '../chart-event-bus';
import { RenderModel } from '../render-model';
import { DrawingsPrimitive } from './drawings-primitive';

export class DrawingsCapability implements Capability {
  public readonly id = 'drawings';
  private chart!: IChartApi;
  private bus!: ChartEventBus;
  private drawingsPrimitive = new DrawingsPrimitive();
  private destroyed = false;
  
  constructor(private series: ISeriesApi<'Candlestick'>) {}
  
  public init(chart: IChartApi, bus: ChartEventBus): void {
    this.chart = chart;
    this.bus = bus;
    this.series.attachPrimitive(this.drawingsPrimitive);
  }
  
  public render(model: Partial<RenderModel>): void {
    if (!model.drawings) return;
    const d = model.drawings;
    
    this.drawingsPrimitive.setSource({
      items: d.items,
      draft: d.draft,
      selectedId: d.selectedId,
      shift: d.shift,
      times: d.times,
      barSpacing: d.barSpacing,
      pointSize: d.pointSize,
      accent: d.accent,
      up: d.up,
      down: d.down,
    });
  }
  
  public hitTestDrawing(x: number, y: number): string | null {
    return this.drawingsPrimitive.hitTestDrawing(x, y);
  }
  
  public hitTestHandle(x: number, y: number): 'p1' | 'p2' | null {
    return this.drawingsPrimitive.hitTestHandle(x, y);
  }
  
  public timeForX(x: number): number | null {
    return this.drawingsPrimitive.timeForX(x);
  }
  
  public xForTime(timeUtc: number): number | null {
    return this.drawingsPrimitive.xForTime(timeUtc);
  }
  
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.series.detachPrimitive(this.drawingsPrimitive);
  }
}
```

- [ ] **Step 3: Integrate and register in ChartComponent**
  - Import `DrawingsCapability` in `chart.component.ts`.
  - Register the capability: `this.engine.registerCapability(new DrawingsCapability(this.series!));`
  - Remove direct reference to `drawingsPrimitive` in class properties and `ngAfterViewInit`.
  - In subscriptions that update drawings (e.g. `drawingsFeature.selectDrawingsState`), update the `pushDrawings()` method to build `DrawingsModel` and call `this.engine.render({ drawings: drawingsModel });`.
  - Update all hit-test and coordinate conversion logic (`hitTestDrawing`, `hitTestHandle`, `timeForX`, `xForTime`) in mouse event handlers to query `engine.getCapability<DrawingsCapability>('drawings')`.

- [ ] **Step 4: Verify** — `cd emulador && npx tsc -p tsconfig.app.json --noEmit && npm run build` (exit 0)
- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "refactor: migrate drawings primitives and coordinate math to DrawingsCapability"
```
