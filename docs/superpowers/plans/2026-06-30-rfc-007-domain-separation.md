# RFC 007: Domain Separation Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar la arquitectura aislando el mapping de datos y limpiando referencias globales en el dominio del chart.

**Architecture:** Anti-Corruption Layer (ACL) entre NgRx y `RenderModel`.

**Tech Stack:** TypeScript, Angular.

## Global Constraints
- Target Branch: `feature/rfc-007-domain-separation`.
- Dependencies: Must branch off `feature/rfc-006-auxiliary-capabilities`.

---

### Task 1: Create ChartModelMapper Service

**Files:**
- Create: `src/app/components/chart/chart-model-mapper.service.ts`

**Interfaces:**
- Produces: `ChartModelMapper` injectable service

- [ ] **Step 1: Write mapper logic**

```typescript
// Extraer toda la lógica de selectores de NgRx que puebla el RenderModel
// desde el ChartComponent hacia este servicio.
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "refactor: extract NgRx to RenderModel mapping to Anti-Corruption Layer"
```

### Task 2: Strict Domain Typings Audit

**Files:**
- Modify: `src/app/domain/chart/render-model.ts`

**Interfaces:**
- Refines: `RenderModel`

- [ ] **Step 1: Remove global imports**

```typescript
// Eliminar cualquier import a `src/app/state/*` desde dentro de `src/app/domain/chart/*`.
// Redefinir interfaces DTO puras si es necesario.
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "refactor: enforce strict typing boundary for Chart Domain"
```
