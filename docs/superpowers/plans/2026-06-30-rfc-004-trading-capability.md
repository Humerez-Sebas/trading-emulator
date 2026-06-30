# RFC 004: Trading Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aislar la visualización e interacciones de trading en un plugin nativo del `ChartEngine`.

**Architecture:** Se implementa la interfaz `Capability`. Toma datos desde `model.trading`. Emite interacciones a través del `EventBus`.

**Tech Stack:** TypeScript.

## Global Constraints
- Target Branch: `feature/rfc-004-trading-capability`.
- Dependencies: Must branch off `feature/rfc-003-capabilities-foundation`.

---

### Task 1: Extend RenderModel for Trading

**Files:**
- Modify: `src/app/domain/chart/render-model.ts`

**Interfaces:**
- Produces: `TradingModel` properties

- [ ] **Step 1: Add TradingModel to RenderModel**

```typescript
// En src/app/domain/chart/render-model.ts
import { Position, PendingOrder } from '../../state/trading/trading.models';
import { TradeBoxItem } from '../../state/selectors';

export interface TradingModel {
  positions: Position[];
  pendingOrders: PendingOrder[];
  boxes: TradeBoxItem[];
}

// Extender RenderModel
export interface RenderModel {
  // ...
  trading?: TradingModel;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/domain/chart/render-model.ts
git commit -m "feat: extend RenderModel with TradingModel"
```

### Task 2: Implement TradingCapability

**Files:**
- Create: `src/app/domain/chart/capabilities/trading-capability.ts`
- Move/Adapt: `src/app/components/chart/trade-boxes-primitive.ts` and `trade-buttons-primitive.ts`

**Interfaces:**
- Consumes: `Capability`, `TradingModel`
- Produces: `TradingCapability`

- [ ] **Step 1: Write capability structure**

*Note: The execution subagent must convert the existing primitives into this Capability, storing series references internally and updating them in `render(model: RenderModel)`.*

```typescript
// src/app/domain/chart/capabilities/trading-capability.ts
import { Capability } from '../capability';
import { IChartApi } from 'lightweight-charts';
import { ChartEventBus } from '../chart-event-bus';
import { RenderModel } from '../render-model';

export class TradingCapability implements Capability {
  public id = 'trading';
  private chart!: IChartApi;
  private eventBus!: ChartEventBus;
  
  public init(chart: IChartApi, eventBus: ChartEventBus): void {
    this.chart = chart;
    this.eventBus = eventBus;
    // Setup series markers or extra lines here
  }
  
  public render(model: RenderModel): void {
    if (!model.trading) return;
    
    // Update trade lines and boxes based on model.trading
  }
  
  public destroy(): void {
    // Remove series / lines
  }
}
```

- [ ] **Step 2: Register in ChartComponent**

```typescript
// En src/app/components/chart/chart.component.ts
// Instanciar y registrar `this.engine.registerCapability(new TradingCapability())`
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "refactor: migrate trading primitives to TradingCapability"
```
