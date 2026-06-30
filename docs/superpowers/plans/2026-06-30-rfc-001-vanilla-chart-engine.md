# RFC 001: Vanilla Chart Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraer la lógica básica de `lightweight-charts` del componente de Angular hacia una clase Vanilla TypeScript independiente (`ChartEngine`).

**Architecture:** El `ChartEngine` aceptará un contenedor DOM y un modelo inmutable `RenderModel` con los datos a pintar (velas). `ChartComponent` instancia el engine y delega el dibujado.

**Tech Stack:** TypeScript, Lightweight Charts.

## Global Constraints
- Target Branch: `feature/rfc-001-core-chart-engine`.
- Strict Domain Separation: No Angular (`@angular/core`) or NgRx imports inside `src/app/domain/chart`.

---

### Task 1: Define Render Model Interfaces

**Files:**
- Create: `src/app/domain/chart/render-model.ts`

**Interfaces:**
- Produces: `RenderModel`, `ChartConfig`

- [ ] **Step 1: Write the minimal implementation**

```typescript
// src/app/domain/chart/render-model.ts
import { Candle } from '../../models';
import { ChartColors } from '../../state/settings/settings.models';

export interface ChartConfig {
  colors: ChartColors;
  watermarkText?: string;
  watermarkColor?: string;
}

export interface RenderModel {
  candles: Candle[];
  config: ChartConfig;
  // TODO en futuras fases: trading, drawings, etc.
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/domain/chart/render-model.ts
git commit -m "feat: define core RenderModel interface"
```

### Task 2: Create ChartEngine Class

**Files:**
- Create: `src/app/domain/chart/chart-engine.ts`

**Interfaces:**
- Consumes: `RenderModel`, `ChartConfig`
- Produces: `ChartEngine` class with `render(model: RenderModel)` and `destroy()`

- [ ] **Step 1: Write minimal implementation**

```typescript
// src/app/domain/chart/chart-engine.ts
import { createChart, IChartApi, ISeriesApi, CandlestickSeries } from 'lightweight-charts';
import { RenderModel } from './render-model';

export class ChartEngine {
  private chart: IChartApi;
  private mainSeries: ISeriesApi<"Candlestick">;
  
  constructor(container: HTMLElement) {
    this.chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: { background: { color: '#000000' }, textColor: '#ffffff' },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    });
    
    this.mainSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    
    window.addEventListener('resize', this.onResize);
  }
  
  public render(model: RenderModel): void {
    // 1. Update config
    this.chart.applyOptions({
      layout: {
        background: { color: model.config.colors.background },
        textColor: model.config.colors.text,
      }
    });
    
    // 2. Update data efficiently
    // Asumimos que model.candles viene completo para este refactor inicial.
    // La optimización setData vs update se refinará aquí.
    if (model.candles.length > 0) {
      this.mainSeries.setData(model.candles as any);
    }
  }
  
  public destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.chart.remove();
  }
  
  private onResize = () => {
    if (this.chart && this.chart.timeScale()) {
      // Container size should be handled externally or via ResizeObserver, 
      // but for simplicity in RFC 001 we bind to window.
    }
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/domain/chart/chart-engine.ts
git commit -m "feat: implement ChartEngine wrapper for lightweight-charts"
```

### Task 3: Refactor ChartComponent to use ChartEngine

**Files:**
- Modify: `src/app/components/chart/chart.component.ts`

**Interfaces:**
- Consumes: `ChartEngine`, `RenderModel`

- [ ] **Step 1: Strip basic lightweight-charts init from ChartComponent and use ChartEngine**

*Note: As this is a massive component, the execution subagent will need to locate `createChart` calls and replace them with `this.engine = new ChartEngine(this.chartContainer.nativeElement)` inside `ngAfterViewInit`. Then map NgRx selectors to a `RenderModel` and call `this.engine.render(model)`.*

```typescript
// Example refactor target structure (pseudocode instructions for execution):
// 1. Remove `createChart` and `this.chart.addSeries(CandlestickSeries)`.
// 2. Initialize `this.engine = new ChartEngine(container)`.
// 3. Map `selectDataRange` and `selectChartStyle` to `RenderModel`.
// 4. In the main `effect()` or `subscribe()`, call `this.engine.render({ candles, config })`.
```

- [ ] **Step 2: Verify compilation and functionality**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/components/chart/chart.component.ts
git commit -m "refactor: migrate ChartComponent to use vanilla ChartEngine"
```
