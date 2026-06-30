# RFC 005: Drawings Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar la primitiva de dibujos a una capability.

**Architecture:** `DrawingsCapability` dibuja primitivas basándose en `model.drawings` y captura clicks/arrastres según la herramienta activa.

**Tech Stack:** TypeScript.

## Global Constraints
- Target Branch: `feature/rfc-005-drawings-capability`.
- Dependencies: Must branch off `feature/rfc-004-trading-capability`.

---

### Task 1: RenderModel and Capability Base

**Files:**
- Modify: `src/app/domain/chart/render-model.ts`
- Create: `src/app/domain/chart/capabilities/drawings-capability.ts`

**Interfaces:**
- Produces: `DrawingsModel`, `DrawingsCapability`

- [ ] **Step 1: Expand RenderModel**

```typescript
export interface DrawingsModel {
  drawings: Drawing[]; // From models
  activeTool: string | null;
}
// Agregar a RenderModel...
```

- [ ] **Step 2: Create Capability**

*Note: Extract logic from `drawings-primitive.ts`.*

```typescript
// src/app/domain/chart/capabilities/drawings-capability.ts
import { Capability } from '../capability';

export class DrawingsCapability implements Capability {
  public id = 'drawings';
  
  public init(chart: any, eventBus: any) { /* ... */ }
  public render(model: any) { /* update plugins based on model.drawings */ }
  public destroy() { /* ... */ }
}
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: implement DrawingsCapability"
```
