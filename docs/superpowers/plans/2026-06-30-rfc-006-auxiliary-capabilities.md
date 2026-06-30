# RFC 006: Auxiliary Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar countdown y sesiones a capabilities nativas.

**Architecture:** Mover primitivas existentes a implementaciones de la interfaz `Capability`.

**Tech Stack:** TypeScript.

## Global Constraints
- Target Branch: `feature/rfc-006-auxiliary-capabilities`.
- Dependencies: Must branch off `feature/rfc-005-drawings-capability`.

---

### Task 1: Create CountdownCapability

**Files:**
- Create: `src/app/domain/chart/capabilities/countdown-capability.ts`
- Modify: `src/app/domain/chart/render-model.ts`

**Interfaces:**
- Produces: `CountdownCapability`

- [ ] **Step 1: Write capability**

```typescript
// Implementar CountdownCapability extrayendo lógica de countdown-primitive.ts
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat: extract countdown to capability"
```

### Task 2: Create SessionCapability

**Files:**
- Create: `src/app/domain/chart/capabilities/session-capability.ts`

**Interfaces:**
- Produces: `SessionCapability`

- [ ] **Step 1: Write capability**

```typescript
// Implementar SessionCapability para renderizar líneas verticales de sesión
```

- [ ] **Step 2: Commit**

```bash
git add .
git commit -m "feat: extract session markers to capability"
```
