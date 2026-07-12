# Walkthrough: RFC-014 — Simulación de Alta Fidelidad + Telemetría (cierre)

> Este documento reemplaza por completo la versión anterior de `walkthrough.md`
> (walkthrough puntual del fix de stops fantasma en `resolveExit`); ese contenido
> sigue disponible en el historial de git. El presente walkthrough documenta el
> cierre completo del RFC-014.

**Rama:** `feature/rfc-014-alta-fidelidad-telemetria` (base `cee5fa9` → HEAD `51e2249`,
31 commits) · PR → `develop`
**Veredicto de auditoría final (branch-auditor, opus):** **PASS — "Ship it"** · 0
Critical/High/Medium · 1 Low corregido post-auditoría (`51e2249`).

## 1. Qué se implementó

### Paso 1 — Bucle a resolución base + ejecución misma-vela

`selectExecutionSeries` (la serie más fina cargada para el símbolo de la sesión, M1
como ground truth) alimenta SIEMPRE al motor, independientemente del timeframe
visualizado y de la Replay Resolution. `processFills$` y `foldForwardFills` emiten
exactamente un `processCandle` por cada vela base estrictamente cruzada, en orden
cronológico (`subCandles: null`); la ruta legacy queda intacta para los contextos sin
serie base (specs preexistentes que la ejercitan directamente).

**D14.B:** el `createdAt` de las órdenes pendientes se sella en el **horizonte de
revelado** (`selectPlacementTime` — la última vela base ya mostrada dentro del bucket
de resolución del cursor), no en el tiempo crudo del cursor. Esto preserva la
propiedad de no-hindsight (I-8) y la idempotencia (I-8) incluso con resolución de
reproducción más gruesa que el grano base. A stepping M1 el horizonte de revelado
coincide exactamente con el cursor (el texto literal del RFC).

### Paso 2 — Predicados Bid/Ask + descomposición de costes

`ExecutionCosts { spreadPoints, commissionPerLot, slippagePoints, pointSize }` más
`COST_PRESETS` por clase de activo (Forex / Índices / Metales / Cripto) y
`costPresetFor`. Los ocho predicados sided exactos del RFC (I-5, I-6) se derivan de un
único punto de conversión Ask (`toAsk = Bid + spreadPoints·pointSize`, D14.D). El
slippage determinista SOLO se aplica en ejecuciones stop, siempre en sentido adverso.
La comisión es round-turn al cierre: `profit = grossProfit − commission` (neto);
`rMultiple` queda intacto sobre el 1R geométrico (I-2).

- **V-1 (ancla de degeneración):** con costes ausentes o cero, todos los predicados y
  precios degeneran bit a bit al motor previo — verificado por la suite dorada y los
  specs preexistentes, que quedan intactos.
- **R3 confirmado:** las barras del pipeline son Bid (el único fetch de MT5 es
  `mt5.copy_rates_range`, sin ruta Ask/tick disponible).

### Paso 3 — Mark-to-market + MAE/MFE + floatingEquity

Las excursiones (MAE/MFE) se acumulan por cada vela base procesada durante el mismo
walk que hace avanzar el book (fórmulas RFC §3, lados correctos, timestamps de
primer-alcance con comparación estricta `>`), y se sellan en `ClosedTrade` en TODOS
los caminos de cierre (SL, TP, cierre manual, fin de sesión). V-11 queda probado a
nivel de walk completo.

`ProcessResult.excursionsMoved` habilita una puerta de tres vías en el reducer: la
ruta idle (vela sin cambios) queda byte-idéntica, sin churn de selectores.
`selectFloatingEquity` calcula equity flotante sided (largos a Bid close, cortos a Ask
close) como read model no persistido — nunca alimenta `balance` ni `equityCurve`
(I-11 sigue siendo realized-only por diseño).

### Paso 4 — SimulationDomain + hechos reificados

`simulation-domain.ts`, módulo puro nuevo: I-14 (coherencia de geometría, fronteras
inválidas estrictas) cableado en `placeOrder`/`openMarket`/`modifyOrder`; I-15 (SL no
ensanchable, TP libremente adaptable) en `modifyPosition`. Una colocación o
modificación inválida es un no-op silencioso con identidad de referencia (doctrina
S2, mínima fricción). V-10 lo cubre con tablas de verdad completas para ambos
invariantes.

**D14.E (decisión explícita del usuario):** dos fixtures de specs de reducer
preexistentes usaban geometría (SL/TP igual al precio de entrada) que I-14 rechaza
correctamente; se migraron mínimamente preservando la intención original de cada
spec — la única excepción autorizada a la regla STOP en todo el run.

Los hechos `OrderFilled`/`PositionClosed` se emiten desde el motor en
`ProcessResult.facts` (cierra EVENT_STORMING §8). **D14.F:** surfacing en
`TradingState` es TYPE-IMPOSSIBLE (`createFeature` de NgRx rechaza props opcionales en
el feature state, y un campo obligatorio rompería literales de payload protegidos);
el observador de telemetría deriva estos eventos independientemente, diffando
`positions[]`/`history[]` entre snapshots consecutivos post-reducer.
`ProcessResult.facts` queda como punto de extensión reservado (cero lectores en
producción, PHILOSOPHY §2.6) para las Fases 2-3.

### Paso 5 — La caja negra (Telemetry Register)

Store IndexedDB **dedicado `emulador-telemetry`** (desviación documentada — ver
DOMAIN_MODEL.md §8), append-only por `[sessionId, seq]`, con cap por sesión y
escritura batched asíncrona (N-2); `assertNoCandles` se reaplica en cada batch (V-9).

Observadores `dispatch:false` puramente pasivos: `ReplaySeek`, `ReplayJump`,
`PlaybackToggled`, `SpeedChanged`, `TimeElapsedBeforeOrder` (anclado a inicio de
sesión / último seek / último evento de orden), `DrawingSnapshot` (copia congelada
copy-on-write en colocación y cierre), y `OrderFilled`/`PositionClosed` (derivados por
diff de estado, D14.F).

- **V-7:** grep de vocabulario prohibido en el directorio de telemetría — limpio.
- **V-8:** 8.1–13.0 ms por ráfaga de jump-50 (69 eventos) vs presupuesto de 16 ms/frame
  — sin brecha medida, sin optimización aplicada (PHILOSOPHY §2.9/R1).
- El flight recorder degrada por *drop*, nunca fabrica un evento inexistente
  (asimetría de degradación suave, verificada por el revisor).

### Paso 6 — UI (histórico, resumen, diálogo de creación)

Columnas `MAE R` / `MFE R` en el historial de trades (derivación en display,
`tabular-nums`, `—` para trades legacy sin mae/mfe), agregados de media/máximo, y
`ambiguousCount` renderizado por primera vez (antes se calculaba pero nunca se
mostraba). Disclosure de "Costes simulados" en el resumen de sesión, con wording
legacy explícito cuando `executionCosts` es null.

En el diálogo de nueva sesión: preset de costes resuelto por clase de activo, con
override editable de los 3 números (spread, comisión, slippage — `pointSize` nunca
editable por el usuario, D14.D); la configuración efectiva persiste en
`executionCosts` de la sesión al confirmar.

### Paso 7 — Cierre documental + KPI

`DOMAIN_MODEL.md` (I-5/I-6 sided, I-7 sin caveat, I-8 reveal horizon, I-14/I-15 con
detectores, §8 con las cuatro limitaciones originales saldadas/reformuladas más las
dos desviaciones de implementación registradas aparte), `UBIQUITOUS_LANGUAGE.md` (9
entradas nuevas/afectadas), RFC-014 → **Implementado (2026-07-11)** con su tabla de
"Desviaciones registradas".

**KPI DoD #3:** escenario de referencia determinista —
`state/trading/ambiguous-kpi.spec.ts` mide `ambiguousCount` bajo el peor caso
pre-RFC-014 (envolvente H1, sin serie menor) = **3**, contra el mismo recorrido de
precio bajo grano base M1 = **1** (la única colisión que sobrevive es una colisión
SL/TP genuina dentro del mismo minuto — irreducible). El descenso es honesto: no un
3-vs-0 forzado, sino la confirmación de que la ambigüedad se acota a un piso
irreducible, nunca desaparece del todo.

## 2. Áreas de código modificadas (31 commits, resumen)

- **Motor / dominio:** `state/trading/fill-engine.ts`, `simulation-domain.ts` (nuevo),
  `execution-costs.ts` (nuevo), `domain-facts.ts` (nuevo), `trading.models.ts`,
  `trading.reducer.ts`, `trading.effects.ts`, `trading.actions.ts`.
- **Replay / selectores:** `state/replay/replay.effects.ts`, `state/selectors.ts`.
- **Telemetría (todo nuevo):**
  `state/telemetry/{telemetry.models,telemetry.effects,telemetry-anchors,telemetry-facts,telemetry-drawings}.ts`,
  `services/telemetry-db.service.ts`, registro en `app.config.ts`.
- **UI:** `components/session-summary/*` (+ `excursion-stats.ts` nuevo),
  `pages/crear-sesion/*`, `components/chart/chart.component.ts`,
  `components/trade-panel/trade-panel.component.ts`,
  `state/workspaces/{workspaces.actions,workspaces.effects}.ts`.
- **Docs:** `docs/architecture/{DOMAIN_MODEL,UBIQUITOUS_LANGUAGE}.md`, RFC-014, plan +
  ledger SDD.
- **Specs:** 28 archivos de spec nuevos; único preexistente tocado:
  `trading.reducer.spec.ts` (D14.E, autorizado, 2 tests).

## 3. Evidencia de suite y build (auditoría final, re-ejecutada personalmente)

```
npx tsc -p tsconfig.app.json --noEmit   → exit 0
npx tsc -p tsconfig.spec.json --noEmit  → exit 0
npx ng test --watch=false               → Test Files 102 passed (102) · Tests 1278 passed (1278)
npm run lint                            → All files pass linting (0 problems)
npm run build                           → exit 0 · 623.11 kB inicial (warning de presupuesto
                                          conocido-aceptado, dominado por Arrow/parquet;
                                          SIN chunks centinela de vitest)
```

Progresión de tests del run: 993 → 1016 → 1073 → 1096 → 1124 → 1131 → 1140 → 1151 →
1167 → 1230 → 1231 → 1252 → 1277 → 1278. La suite creció +285 tests con el RFC y pasa
al 100 %.

## 4. Desviaciones registradas (todas clasificadas, ninguna silenciosa)

1. **D14.B** — `createdAt` sellado en el horizonte de revelado (no el cursor
   literal): forzado por la propia propiedad no-hindsight del RFC (ver §1 arriba).
2. **DB de telemetría dedicada `emulador-telemetry`** (no `emulador-workspaces`):
   un spec STOP-protegido fija el conteo exacto de object stores de la base
   compartida. Ver `DOMAIN_MODEL.md` §8 para el detalle completo.
3. **D14.E** — 2 fixtures de specs preexistentes migradas bajo autorización explícita
   del usuario (única excepción a la regla STOP del run).
4. **D14.F** — los hechos reificados no se surfacean en `TradingState` (imposible por
   tipos); el observador de telemetría los deriva por diffing post-reducer.
5. **Limitación del teletransporte `goToTime`** — el "ir a fecha" y otras cargas
   programáticas (restauración de sesión, CSV-start) no pasan por `seekTo` ni por el
   armado de jump, así que no se capturan como `ReplaySeek` ni `ReplayJump` en la
   caja negra, y no resetean sus anclas. Gap conocido y disclosed, no corregido en
   este cierre — candidato de Fase 2. Ver `DOMAIN_MODEL.md` §8 para el detalle
   completo.

## 5. Proceso (para el ledger histórico)

Run SDD en modo FULL: 11 despachos de implementación (3 interrumpidos por límite de
sesión — trabajo capturado del working tree/commits sin pérdida), 7 revisiones por
tarea (opus en las tareas de ruta del dinero) con 3 fix waves, 1 colisión STOP
escalada al usuario (D14.E), auditoría final de rama con veredicto PASS.
