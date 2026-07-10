# RFC 005: Drawings Capability Implementation Plan

**Goal:** Migrar la primitiva de dibujos a una capability.

**Architecture:** `DrawingsCapability` dibuja primitivas basándose en `model.drawings` y captura clicks/arrastres según la herramienta activa.

**Tech Stack:** TypeScript.

## Global Constraints
- Target Branch: `feature/rfc-005-drawings-capability`.
- Dependencies: Must branch off `feature/rfc-004-trading-capability`.

---

### Task 1: Extend RenderModel for Drawings

**Files:**
- Modify: `emulador/src/app/domain/chart/render-model.ts`

**DoD:**
1. Definición fuerte de `DrawingsModel` en `render-model.ts`.
2. Compilación exitosa (`npx tsc`).

- [ ] **Step 1: Define DrawingsModel and Extend RenderModel**
- [ ] **Step 2: Compile verification**

---

### Task 2: Implement DrawingsCapability

**Files:**
- [NEW] `emulador/src/app/domain/chart/capabilities/drawings-capability.ts`
- [NEW/MOVE] `emulador/src/app/domain/chart/capabilities/drawings-primitive.ts`
- [MODIFY] `emulador/src/app/components/chart/chart.component.ts`
- [DELETE] `emulador/src/app/components/chart/drawings-primitive.ts`
- [MODIFY] `emulador/src/app/domain/chart/chart-engine.ts`

**DoD:**
1. `DrawingsCapability` recibe la serie de velas en el constructor.
2. Registra y remueve `DrawingsPrimitive` en `init()` y `destroy()` respectivamente.
3. `destroy()` incorpora un flag de idempotencia y limpia recursos (incluyendo la primitiva).
4. Expone métodos puente públicos de hit-testing y conversiones de coordenadas.
5. `ChartComponent` inicializa la capability, actualiza el renderizado a través de `engine.render({ drawings: drawingsModel })` y consulta hit-testing consumiendo `engine.getCapability('drawings')`.
6. Compilación y build completos exitosos.

- [ ] **Step 1: Move and adjust DrawingsPrimitive**
- [ ] **Step 2: Create DrawingsCapability with bridging methods**
- [ ] **Step 3: Update ChartEngine with getCapability**
- [ ] **Step 4: Update ChartComponent initialization and render call**
- [ ] **Step 5: Run hardening gates**
