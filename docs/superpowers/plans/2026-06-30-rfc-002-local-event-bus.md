# RFC 002: Local Event Bus & Render Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar `ChartEventBus` para exportar eventos interactivos desde `ChartEngine` hacia `ChartComponent` sin depender de NgRx en el dominio.

**Architecture:** `ChartEventBus` actúa como un pub/sub interno. El componente Angular escucha este bus y despacha a NgRx.

**Tech Stack:** TypeScript.

## Global Constraints
- Target Branch: `feature/rfc-002-event-bus-bridge`.
- Dependencies: Must branch off `feature/rfc-001-core-chart-engine`.

---

### Task 1: Create ChartEventBus

**Files:**
- Create: `src/app/domain/chart/chart-event-bus.ts`

**Interfaces:**
- Produces: `ChartEventBus`, `ChartEvent` types

- [ ] **Step 1: Write the failing test (Optional/Minimal for Vanilla TS event emitter)**
- [ ] **Step 2: Write minimal implementation**

```typescript
// src/app/domain/chart/chart-event-bus.ts
export type ChartEventType = 'CrosshairMoved' | 'ChartClicked' | 'TimeRangeChanged';

export interface ChartEvent {
  type: ChartEventType;
  payload: any;
}

export class ChartEventBus {
  private listeners: Map<ChartEventType, Set<(payload: any) => void>> = new Map();

  public on(type: ChartEventType, callback: (payload: any) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
    
    // Return unsubscribe function
    return () => this.listeners.get(type)!.delete(callback);
  }

  public emit(type: ChartEventType, payload: any): void {
    if (this.listeners.has(type)) {
      this.listeners.get(type)!.forEach(cb => cb(payload));
    }
  }

  public destroy(): void {
    this.listeners.clear();
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/domain/chart/chart-event-bus.ts
git commit -m "feat: implement vanilla ChartEventBus"
```

### Task 2: Integrate EventBus into ChartEngine

**Files:**
- Modify: `src/app/domain/chart/chart-engine.ts`

**Interfaces:**
- Consumes: `ChartEventBus`

- [ ] **Step 1: Add EventBus to engine and emit events**

```typescript
// En src/app/domain/chart/chart-engine.ts
// Instanciar ChartEventBus en el constructor
// Suscribirse a eventos de lightweight-charts (subscribeCrosshairMove, subscribeClick)
// Emitir hacia el EventBus
```

- [ ] **Step 2: Commit**

```bash
git add src/app/domain/chart/chart-engine.ts
git commit -m "feat: emit lightweight-charts events through ChartEventBus"
```

### Task 3: Bridge EventBus to NgRx in ChartComponent

**Files:**
- Modify: `src/app/components/chart/chart.component.ts`

**Interfaces:**
- Consumes: `ChartEventBus`, NgRx `Store`

- [ ] **Step 1: Listen to EventBus and dispatch NgRx actions**

```typescript
// En src/app/components/chart/chart.component.ts
// Suscribirse a this.engine.eventBus.on('ChartClicked', payload => {
//    this.store.dispatch(TradingActions.chartClicked({ payload }));
// });
// Asegurar desuscripción en ngOnDestroy
```

- [ ] **Step 2: Commit**

```bash
git add src/app/components/chart/chart.component.ts
git commit -m "refactor: bridge ChartEventBus to NgRx actions"
```
