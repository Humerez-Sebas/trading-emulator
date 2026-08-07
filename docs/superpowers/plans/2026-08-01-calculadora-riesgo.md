# Calculadora de riesgo — CFD/Forex (v1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una página `/calculadora` que dimensione posiciones **exactamente igual que el emulador**, reutilizando `lotsForRisk()`/`contractSizeFor()` sin duplicarlas, y que además haga visibles las tres formas en que el dimensionado puede engañar (SL = entrada, entradas no positivas, y el suelo de 0.01 lotes que infla el riesgo en silencio).

**Architecture:** `lotsForRisk`/`contractSizeFor` viven en `state/trading/trading.models.ts`; el módulo nuevo vive en `domain/risk/`. Como el dominio no puede importar del estado (Dependency Rule), `risk-calculator.ts` queda **totalmente parametrizado** (recibe `contractSize`, nunca importa `state/`) y la **página** compone ambas piezas. Sin NgRx de escritura: la página solo lee `selectAssets` para poblar el desplegable. Todo el cálculo es `computed` sobre signals de entrada — sin efectos, sin suscripciones.

**Tech Stack:** Angular 21 (standalone, signals), NgRx (solo lectura de `selectAssets`), Vitest. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-08-01-calculadora-riesgo-design.md`

## Global Constraints

- Rama `claude/calculadora-riesgo` desde `origin/main` → PR a **`main`** (track de producto, `docs/engineering/git-workflow.md` §Two-track flow). NO trabajar sobre `main`.
- **Tras el merge a `main`: back-merge `main → develop`** y re-correr las puertas allí (regla de `git-workflow.md` §Two-track flow). Forma parte de cerrar el PR, no es una tarea aparte.
- Puertas, desde `emulador/`, en crudo y **sin tuberías** (`| tail`/`| head` ocultan el exit code): `npx tsc -p tsconfig.app.json --noEmit` · `npx tsc -p tsconfig.spec.json --noEmit` · `npx ng test --watch=false` · `npm run lint` (0 problemas). `npm run build` al finalizar la rama.
- Medir el número de tests al empezar la rama; al terminar debe ser ese número **más** los nuevos, sin ninguno rojo.
- `npm run format` antes de cada commit (CI corre `format:check`).
- Sin dependencias runtime nuevas.
- **Prohibido reimplementar el dimensionado.** El único origen de lotes es `lotsForRisk`. Si aparece una segunda fórmula en cualquier archivo, la tarea está mal resuelta.
- Tokens de diseño desde `DESIGN.md`; primitivas existentes (`[appInput]`, `[appButton]`, `[appBadge]`, `ui-dropdown`, `app-risk-slider`). No crear primitivas nuevas.
- Trailer en cada commit: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Commits por pathspec (`git add <rutas>` explícitas). Nunca `git add -A`: el árbol tiene `.opencode/` y ledgers sin seguimiento que no son de esta rama.

---

## File Structure

- `emulador/src/app/domain/risk/risk-calculator.ts` — NUEVO módulo puro parametrizado. (Task 1)
- `emulador/src/app/domain/risk/risk-calculator.spec.ts` — NUEVO. (Task 1)
- `emulador/src/app/pages/calculadora/calculadora-page.component.ts` (+ `.html`, `.css`) — NUEVA página. (Task 2)
- `emulador/src/app/pages/calculadora/calculadora-page.component.spec.ts` — NUEVO. (Task 2)
- `emulador/src/app/app.routes.ts` — ruta lazy `/calculadora`. (Task 3)
- `emulador/src/app/app.html` — enlace de navegación tras «Nueva sesión». (Task 3)

---

### Task 1: Módulo puro `domain/risk/risk-calculator.ts`

Cuatro funciones puras, sin DI ni I/O. **`pipSizeFor` es la única con trampa**: los metales (`XAUUSD`, `XAGUSD`) son símbolos de 6 letras, así que una regla ingenua «6 letras ⇒ forex» les asignaría pips inexistentes. El orden de evaluación replica el de `contractSizeFor`, que ya comprueba `XAU*`/`XAG*` antes de `/^[A-Z]{6}$/`.

**Files:**
- Create: `emulador/src/app/domain/risk/risk-calculator.ts`
- Test: `emulador/src/app/domain/risk/risk-calculator.spec.ts`

**Interfaces:**
- Produces: `pipSizeFor(symbol): number | null`, `priceDistance(entry, sl): number`, `riskUsdFor(balance, riskPct): number`, `riskForLots(lots, entry, sl, contractSize): number`.
- Consumes: nada. **Ni un solo import de `state/`** — es la restricción estructural de la tarea.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
import { describe, expect, it } from 'vitest';
import { pipSizeFor, priceDistance, riskForLots, riskUsdFor } from './risk-calculator';

describe('pipSizeFor — orden de evaluación', () => {
  it('los metales van primero: son de 6 letras pero se miden en puntos', () => {
    expect(pipSizeFor('XAUUSD')).toBeNull();
    expect(pipSizeFor('XAGUSD')).toBeNull();
  });
  it('pares con JPY usan pip 0.01, no 0.0001', () => {
    expect(pipSizeFor('USDJPY')).toBe(0.01);
    expect(pipSizeFor('EURJPY')).toBe(0.01);
  });
  it('resto de pares de 6 letras: 0.0001', () => {
    expect(pipSizeFor('EURUSD')).toBe(0.0001);
    expect(pipSizeFor('gbpusd')).toBe(0.0001); // insensible a mayúsculas, como contractSizeFor
  });
  it('índices y CFDs: null (puntos)', () => {
    expect(pipSizeFor('US30')).toBeNull();
    expect(pipSizeFor('NAS100')).toBeNull();
  });
});

describe('priceDistance', () => {
  it('es simétrica y siempre no negativa', () => {
    expect(priceDistance(40000, 39950)).toBe(50);
    expect(priceDistance(39950, 40000)).toBe(50);
    expect(priceDistance(40000, 40000)).toBe(0);
  });
});

describe('riskUsdFor', () => {
  it('reproduce (balance * riskPct) / 100', () => {
    expect(riskUsdFor(5000, 1)).toBe(50);
    expect(riskUsdFor(100, 0.1)).toBeCloseTo(0.1, 10);
  });
});

describe('riskForLots — inverso de lotsForRisk', () => {
  it('cierra el ciclo en el caso de aceptación', () => {
    expect(riskForLots(1, 40000, 39950, 1)).toBe(50);
  });
  it('escala con el contractSize', () => {
    expect(riskForLots(1, 2000, 1990, 100)).toBe(1000); // XAUUSD: 10 * 1 * 100
  });
});
```

- [ ] **Step 2: Implementar hasta verde**

`pipSizeFor` normaliza a mayúsculas, descarta `XAU*`/`XAG*`, exige `/^[A-Z]{6}$/`, y dentro de ese grupo devuelve `0.01` si el símbolo contiene `JPY`, si no `0.0001`. `priceDistance` es `Math.abs`. `riskUsdFor` es `(balance * riskPct) / 100`. `riskForLots` es `priceDistance(entry, sl) * lots * contractSize`.

- [ ] **Step 3: Puertas + commit**

Correr las cuatro puertas en crudo. Commit: `feat(risk): módulo puro de cálculo de riesgo parametrizado`.

---

### Task 2: Página `CalculadoraPageComponent`

Aquí vive la composición (§2.1 del spec) y los tres estados honestos (§3.1). El aviso del suelo de 0.01 lotes es el contenido de más valor de la página: `lotsForRisk` hace `Math.max(0.01, …)`, así que en cuentas pequeñas o con stops anchos devuelve 0.01 y el riesgo real **supera** al solicitado sin decirlo. Caso reproducible: balance 100, riesgo 0.1 %, entrada 40000, SL 39950, `contractSize` 1 → solicitado 0.10 USD, `lotsForRisk` devuelve 0.01, riesgo real 0.50 USD (5×).

**Files:**
- Create: `emulador/src/app/pages/calculadora/calculadora-page.component.ts` (+ `.html`, `.css`)
- Test: `emulador/src/app/pages/calculadora/calculadora-page.component.spec.ts`

**Interfaces:**
- Consumes: `lotsForRisk`, `contractSizeFor` (`state/trading/trading.models`), las cuatro funciones de Task 1, `selectAssets` (`state/selectors`).
- Produces: ninguna acción NgRx. La página no despacha nada.

- [ ] **Step 1: Escribir los tests que fallan**

Cubrir: (a) el caso de aceptación renderiza `1.00` lotes, riesgo `50`, distancia `50` puntos; (b) SL = entrada muestra el mensaje dedicado y **no** «0.00 lotes»; (c) balance o riesgo no positivos, ídem; (d) el caso 5× de arriba **muestra** el aviso del suelo; (e) el caso de aceptación **no** muestra el aviso (guarda contra un aviso que salta siempre); (f) el `contractSize` aplicado aparece en pantalla.

- [ ] **Step 2: Implementar hasta verde**

Signals de entrada: `balance`, `riskPct`, `symbol`, `entry`, `sl`, `manualLots`. Derivados `computed`: `contractSize` (vía `contractSizeFor`), `distance`, `requestedRisk`, `lots` (vía `lotsForRisk`), `actualRisk` (vía `riskForLots(lots())`), `pipSize`, `distanceLabel` (pips si `pipSize !== null`, puntos si no), `minLotWarning` (activo cuando `requestedRisk > 0` y `Math.abs(actualRisk - requestedRisk) / requestedRisk > 0.01`), `invalidReason` (SL = entrada · balance ≤ 0 · riesgo ≤ 0 · entrada ≤ 0), y el bloque inverso sobre `manualLots`.

Cuando `invalidReason()` no es `null`, la plantilla muestra el motivo **en lugar de** la cifra de lotes.

- [ ] **Step 3: Puertas + commit**

Commit: `feat(calculadora): página de dimensionado CFD/Forex con estados honestos`.

---

### Task 3: Ruta, navegación y cierre de rama

**Files:**
- Modify: `emulador/src/app/app.routes.ts`
- Modify: `emulador/src/app/app.html`

**Interfaces:**
- Produces: ruta `/calculadora`, lazy, con `canActivate: [authGuard]` **y sin `r2OnboardingGuard`** — la calculadora no necesita datasets, mismo criterio que `/mercados` y `/sesiones`. Colocarla **antes** del comodín `{ path: '**' }`.

- [ ] **Step 1: Ruta + enlace**

Añadir la ruta lazy y el `<a routerLink="/calculadora" routerLinkActive="active">Calculadora</a>` tras «Nueva sesión» en `app.html`.

- [ ] **Step 2: Verificación completa de rama**

Las cuatro puertas **más** `npm run build`. Vigilar tipos de chunk nuevos en el build (el aviso de presupuesto 648 kB vs 500 kB es conocido y aceptado, dominado por Arrow/parquet — no es una regresión de esta rama).

- [ ] **Step 3: PR a `main`**

Vía GitHub MCP. Cuerpo: qué/por qué, evidencia (recuento de tests antes/después, puertas), y la nota de que el modo Futuros queda diferido a un spec propio por falta de los multiplicadores del bróker.

- [ ] **Step 4: Back-merge `main → develop`**

Inmediatamente tras el merge, con el árbol limpio: `git merge origin/main` sobre `develop`, re-correr las puertas y empujar. Esta rama no toca `sesiones-page.component.ts` ni ningún archivo divergente, así que el back-merge debe ser limpio; si aparece un conflicto, es señal de que algo se coló fuera del alcance.

---

## Riesgos y notas

- **Deriva de paridad.** La restricción global «prohibido reimplementar el dimensionado» es lo que la evita; verificar en revisión que no hay una segunda fórmula.
- **Símbolo libre.** `contractSizeFor` cae a `1` para todo lo que no reconoce, así que un símbolo mal escrito da un número plausible pero falso. Por eso Task 2 (f) exige mostrar el `contractSize` aplicado en pantalla.
- **`origin/main` va 400 commits por detrás de `develop`.** Todas las dependencias de esta rama (`trading.models.ts`, primitivas UI, `app.routes.ts`, `risk-slider`) están verificadas presentes en esa base. No asumir que existe nada de RFC-014..019 aquí.
