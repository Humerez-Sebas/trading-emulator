# RFC 006: Auxiliary Capabilities Implementation Plan

**Goal:** Migrar las funcionalidades secundarias `countdown` (temporizador de velas) y `session` (marcador visual del fin de sesión) a plugins `Capability`.

**Architecture:** Encapsular la renderización y lógica de los componentes Countdown y Session en `CountdownCapability` y `SessionCapability`.

**Tech Stack:** TypeScript, Angular, lightweight-charts.

## Global Constraints
- Target Branch: `feature/rfc-006-auxiliary-capabilities`.
- Dependencies: Must branch off `feature/rfc-005-drawings-capability`.

---

### Task 1: Create and Integrate CountdownCapability

**Objective:** Relocalizar la primitiva de countdown y encapsularla en `CountdownCapability`.

**Files:**
- [NEW/MOVE] `emulador/src/app/domain/chart/capabilities/countdown-primitive.ts`
- [DELETE] `emulador/src/app/components/chart/countdown-primitive.ts`
- [NEW] `emulador/src/app/domain/chart/capabilities/countdown-capability.ts`
- [MODIFY] `emulador/src/app/domain/chart/render-model.ts`
- [MODIFY] `emulador/src/app/components/chart/chart.component.ts`

**DoD:**
1. Mover `countdown-primitive.ts` al directorio de capabilities y resolver imports.
2. Definir la interfaz `CountdownModel` en `render-model.ts`.
3. Crear `CountdownCapability` (implementa `Capability`) que recibe la serie en el constructor, inicializa/remueve la primitiva en `init()` y `destroy()`, y actualiza su origen de datos en `render()`.
4. El método `destroy()` incluye un flag de idempotencia (`isDestroyed`).
5. En `ChartComponent`, registrar la capability, remover la propiedad local `countdownPrimitive` e invocar `engine.render({ countdown: countdownModel })` en lugar de `setSource`.
6. Compilación exitosa (`npx tsc`).

- [ ] **Step 1: Relocate countdown-primitive and fix imports**
- [ ] **Step 2: Define CountdownModel and extend RenderModel**
- [ ] **Step 3: Implement CountdownCapability**
- [ ] **Step 4: Refactor ChartComponent integration for countdown**
- [ ] **Step 5: Verify compilation**
- [ ] **Step 6: Commit changes**

---

### Task 2: Create and Integrate SessionCapability

**Objective:** Implementar un indicador visual del fin de sesión (`sessionEnd`) en forma de línea vertical discontinua.

**Files:**
- [NEW] `emulador/src/app/domain/chart/capabilities/session-primitive.ts`
- [NEW] `emulador/src/app/domain/chart/capabilities/session-capability.ts`
- [MODIFY] `emulador/src/app/domain/chart/render-model.ts`
- [MODIFY] `emulador/src/app/components/chart/chart.component.ts`

**DoD:**
1. Crear `SessionPrimitive` utilizando la API de canvas 2D (`IPrimitivePaneRenderer`) de `lightweight-charts` y la función `xForTime` de `time-coordinates.ts` para dibujar una línea vertical en la coordenada temporal `sessionEnd`.
2. Definir la interfaz `SessionModel` en `render-model.ts` con `sessionEnd`, `shift`, `times`, `barSpacing` y opcionalmente `color`.
3. Crear `SessionCapability` (implementa `Capability`) que recibe la serie en el constructor, inicializa/remueve `SessionPrimitive` en `init()` y `destroy()`, y actualiza los datos en `render()`.
4. El método `destroy()` incluye un flag de idempotencia (`isDestroyed`).
5. En `ChartComponent`, registrar la capability y realizar la llamada a `engine.render({ session: sessionModel })` cuando cambie el `sessionEnd` (o cuando cambie la metadata de coordenadas temporales en `renderWindow` y `pushDrawings`).
6. Compilación exitosa (`npx tsc`) y bundle exitoso (`npm run build`).

- [ ] **Step 1: Create SessionPrimitive**
- [ ] **Step 2: Define SessionModel and extend RenderModel**
- [ ] **Step 3: Implement SessionCapability**
- [ ] **Step 4: Refactor ChartComponent integration for session**
- [ ] **Step 5: Run hardening gates (compilation and production build)**
- [ ] **Step 6: Commit changes**
