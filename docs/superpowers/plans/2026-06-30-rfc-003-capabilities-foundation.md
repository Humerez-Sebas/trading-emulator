# RFC 003: Capabilities Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el sistema de plugins (Capabilities) en el `ChartEngine` para permitir su extensión sin modificar su código base.

**Architecture:** El Engine expone una interfaz `Capability`. Durante la inicialización, se registran las capabilities, que reciben acceso a la instancia del chart y al event bus.

**Tech Stack:** TypeScript.

## Global Constraints
- Target Branch: `feature/rfc-003-capabilities-foundation`.
- Dependencies: Must branch off `feature/rfc-002-event-bus-bridge`.

---

### Task 1: Define Capability Interface

**Files:**
- Create: `src/app/domain/chart/capability.ts`

**Interfaces:**
- Produces: `Capability` interface

- [ ] **Step 1: Write implementation**

```typescript
// src/app/domain/chart/capability.ts
import { IChartApi } from 'lightweight-charts';
import { ChartEventBus } from './chart-event-bus';
import { RenderModel } from './render-model';

export interface Capability {
  id: string;
  init(chart: IChartApi, eventBus: ChartEventBus): void;
  render(model: RenderModel): void;
  destroy(): void;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/domain/chart/capability.ts
git commit -m "feat: define base Capability interface"
```

### Task 2: Refactor ChartEngine to Support Capabilities

**Files:**
- Modify: `src/app/domain/chart/chart-engine.ts`

**Interfaces:**
- Consumes: `Capability`

- [ ] **Step 1: Add registry and lifecycle calls**

```typescript
// En src/app/domain/chart/chart-engine.ts
// 1. Agregar `private capabilities: Map<string, Capability> = new Map();`
// 2. Agregar método `registerCapability(cap: Capability)` que llama a `cap.init(this.chart, this.eventBus)`.
// 3. Modificar `render(model)` para iterar: `this.capabilities.forEach(cap => cap.render(model));`
// 4. Modificar `destroy()` para iterar: `this.capabilities.forEach(cap => cap.destroy());`
```

- [ ] **Step 2: Commit**

```bash
git add src/app/domain/chart/chart-engine.ts
git commit -m "feat: implement capability registry in ChartEngine"
```
