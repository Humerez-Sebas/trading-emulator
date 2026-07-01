# RFC 007: Domain Separation Enforcement Implementation Plan

**Goal:** Consolidar la arquitectura aislando el dominio del chart (`src/app/domain/chart`) de la capa de estado de la aplicación (`src/app/state/*`) mediante una Capa de Anti-Corrupción (ACL) e internalización de DTOs.

**Architecture:** Anti-Corruption Layer (ACL) entre NgRx y `RenderModel`.

**Tech Stack:** TypeScript, Angular.

## Global Constraints
- Target Branch: `feature/rfc-007-domain-separation`
- Base Branch: `develop` (must branch off the latest `develop` which contains RFC-003, RFC-004, RFC-005, and RFC-006 merged).

---

### Task 1: Create ChartModelMapper Service

**Objective:** Extraer toda la lógica de selectores de NgRx y transformaciones de datos del `ChartComponent` hacia un servicio independiente para mantener el componente lo más delgado posible.

**Files:**
- [NEW] `emulador/src/app/components/chart/chart-model-mapper.service.ts`
- [MODIFY] `emulador/src/app/components/chart/chart.component.ts`

**DoD:**
1. Crear `ChartModelMapper` como un servicio inyectable (`@Injectable({ providedIn: 'root' })`).
2. Mover la conversión y empaquetamiento del estado en `drawingsModel`, `sessionModel`, `tradingModel` y `countdownModel` desde el componente hacia este mapper.
3. Inyectar `ChartModelMapper` en `ChartComponent` y delegar las construcciones de los modelos de render a él.
4. Compilación exitosa.

- [ ] **Step 1: Create ChartModelMapper service and map drawings/session/trading/countdown models**
- [ ] **Step 2: Refactor ChartComponent to consume the mapper**
- [ ] **Step 3: Verify compilation**
- [ ] **Step 4: Commit changes**

---

### Task 2: Strict Domain Typings Audit and Resolution

**Objective:** Romper la dependencia de código entre el dominio del gráfico y el estado global de la aplicación.

**Files:**
- [MODIFY] `emulador/src/app/domain/chart/render-model.ts`
- [MODIFY] `emulador/src/app/domain/chart/capabilities/drawings-capability.ts`
- [MODIFY] `emulador/src/app/domain/chart/capabilities/trading-capability.ts`
- [MODIFY] `emulador/src/app/domain/chart/capabilities/session-capability.ts`
- [MODIFY] `emulador/src/app/domain/chart/capabilities/countdown-capability.ts`

**DoD:**
1. Auditar imports en todos los archivos de `emulador/src/app/domain/chart/` (incluyendo sus subcarpetas) y eliminar cualquier import que apunte a `src/app/state/*`.
2. Redefinir interfaces DTO puras localmente en `render-model.ts` (por ejemplo, `Drawing`, `DrawingTool`, `Position`, `PendingOrder`, `TradeMarker`, `TradeBoxItem`) para que sean independientes del estado.
3. Actualizar las capabilities para consumir estas interfaces DTO locales puras en lugar de las interfaces de estado.
4. Verificar que no queden referencias cruzadas del dominio hacia `state/`.
5. Ejecutar gates de control (`npx tsc` y `npm run build`) para verificar compilación y empaquetado exitoso.

- [ ] **Step 1: Clean up imports and define pure DTOs in render-model.ts**
- [ ] **Step 2: Refactor capabilities to use domain-specific DTOs**
- [ ] **Step 3: Audit remaining files in domain/chart/ for state leaks**
- [ ] **Step 4: Run compilation and production build gates**
- [ ] **Step 5: Commit changes**
