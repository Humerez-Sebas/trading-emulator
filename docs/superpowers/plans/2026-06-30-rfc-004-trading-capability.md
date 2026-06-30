# RFC 004: Trading Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aislar la visualización e interacciones de trading en un plugin nativo del `ChartEngine` implementando la interfaz `Capability` de RFC-003.

**Architecture:** Se implementa la interfaz `Capability`. Toma datos desde `model.trading` (de tipo `TradingModel`). Emite interacciones a través del `ChartEventBus`.

**Tech Stack:** TypeScript.

## Global Constraints
- Target Branch: `feature/rfc-004-trading-capability`.
- Dependencies: Must branch off `develop` (with RFC-003 already integrated).
- Workspace real: `emulador/`. All paths live under `emulador/src/app/...`.
- Verification gates (run inside `emulador/`):
  ```bash
  cd emulador
  npx tsc -p tsconfig.app.json --noEmit
  npm run build
  ```

---

### Task 1: Extend RenderModel for Trading

**Files:**
- Modify: `emulador/src/app/domain/chart/render-model.ts`

**Interfaces:**
- Produces: `TradingModel` properties inside `RenderModel`

- [ ] **Step 1: Add TradingModel to RenderModel**

```typescript
// En emulador/src/app/domain/chart/render-model.ts
import { Position, PendingOrder } from '../../state/trading/trading.models';
import { TradeBoxItem } from '../../state/selectors';

export interface TradingModel {
  positions: Position[];
  pendingOrders: PendingOrder[];
  boxes: TradeBoxItem[];
}

// Extender RenderModel
export interface RenderModel {
  candles: any[]; // tipo preexistente
  config: any;   // tipo preexistente
  trading?: TradingModel;
}
```

- [ ] **Step 2: Verify** — `cd emulador && npx tsc -p tsconfig.app.json --noEmit` (exit 0)
- [ ] **Step 3: Commit**

```bash
git add emulador/src/app/domain/chart/render-model.ts
git commit -m "feat: extend RenderModel with TradingModel"
```

---

### Task 2: Implement TradingCapability

**Files:**
- Create: `emulador/src/app/domain/chart/capabilities/trading-capability.ts`
- Modify: `emulador/src/app/components/chart/chart.component.ts` (to instantiate and register the capability)
- Move/Adapt: `emulador/src/app/components/chart/trade-boxes-primitive.ts` and `trade-buttons-primitive.ts` into the capability

**Interfaces:**
- Consumes: `Capability`, `TradingModel`
- Produces: `TradingCapability`

- [ ] **Step 1: Write capability structure**

```typescript
// emulador/src/app/domain/chart/capabilities/trading-capability.ts
import { Capability } from '../capability';
import { IChartApi } from 'lightweight-charts';
import { ChartEventBus } from '../chart-event-bus';
import { RenderModel } from '../render-model';

export class TradingCapability implements Capability {
  public readonly id = 'trading';
  private chart!: IChartApi;
  private bus!: ChartEventBus;
  
  public init(chart: IChartApi, bus: ChartEventBus): void {
    this.chart = chart;
    this.bus = bus;
    // Setup series markers or extra lines here
  }
  
  public render(model: Partial<RenderModel>): void {
    if (!model.trading) return;
    
    // Update trade lines and boxes based on model.trading
    // Note: Perform shallow comparison of model.trading properties before pushing updates
  }
  
  public destroy(): void {
    // Remove series / lines / listeners
  }
}
```

- [ ] **Step 2: Register in ChartComponent**

Instantiate and register the capability at `emulador/src/app/components/chart/chart.component.ts`:
```typescript
this.engine.registerCapability(new TradingCapability());
```

- [ ] **Step 3: Verify** — `cd emulador && npx tsc -p tsconfig.app.json --noEmit && npm run build` (exit 0)
- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "refactor: migrate trading primitives to TradingCapability"
```

