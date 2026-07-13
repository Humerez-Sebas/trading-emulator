# RFC 014: Simulación de Alta Fidelidad y Telemetría Conductual

| Campo | Valor |
| :--- | :--- |
| Estado | Implementado (2026-07-11) |
| Fecha | 2026-07-10 |
| Bloque | Mastery Block — Fase 1 ([ROADMAP.md](../ROADMAP.md)) |
| Rama de implementación | `feature/rfc-014-alta-fidelidad-telemetria` → PR a `develop` |
| Dependencias | RFC-013 (entregado); [TRADER_KNOWLEDGE_MODEL.md](../TRADER_KNOWLEDGE_MODEL.md) (Fase 0) |
| Documentos rectores | [DOMAIN_MODEL.md](../DOMAIN_MODEL.md) (I-1..I-15), [EVENT_STORMING.md](../EVENT_STORMING.md), [TRADER_KNOWLEDGE_MODEL.md](../TRADER_KNOWLEDGE_MODEL.md) (S1/S2, N-1..N-6), [PRODUCT_PRINCIPLES.md](../PRODUCT_PRINCIPLES.md) (P7, P8) |

## Objetivo

Refactorizar el motor de simulación para que la ejecución (fills, SL, TP y
valoración) ocurra **siempre a resolución base (M1)** con precios **Bid/Ask**,
spread y costes reales, y dotar al emulador de la **caja negra de telemetría
física** prescrita por el Trader Knowledge Model — todo en una única
refactorización matemática del mismo bucle de velas. La física de ejecución y la
observación conductual recorren las mismas velas: implementarlas juntas evita
reabrir dos veces la ruta auditada del dinero (PHILOSOPHY §2.5).

Alcance de UI de esta fase (decisión G4): columnas MAE/MFE en el historial de
trades y agregados físicos en el resumen de sesión. Nada más: la Cabina de
Reflexión pertenece a la Fase 3.

## Motivación

Cinco brechas conocidas y documentadas comparten la misma raíz — la verdad de
ejecución se evalúa al grano que la visualización decide entregar, y la ley del
ciclo de vida de órdenes vive fuera del dominio:

1. **Grano de evaluación dependiente de la vista.** Hoy `subCandles` puede ser
   `null` si el workspace no tiene cargada una serie inferior; el realismo depende
   de qué paneles existan. La invariante de realismo exige evaluar SIEMPRE a la
   resolución base de la sesión.
2. **Latencia de la vela de colocación.** La exclusión `c.time <= o.createdAt` a
   grano del TF visual difiere los fills de retroceso-y-explosión a la vela
   siguiente (DOMAIN_MODEL §8.2). Debe refinarse a grano base sin sacrificar
   idempotencia ni no-hindsight (I-8).
3. **Fills limpios.** Sin spread, comisión ni deslizamiento, la expectancy queda
   sesgada al optimismo y el SL de un corto se comprueba contra Bid cuando la
   realidad lo ejecuta a Ask (auditoría estratégica, Parte 7).
4. **Equidad solo realizada.** Sin mark-to-market no existen MAE/MFE ni drawdown
   flotante: las métricas físicas que el Knowledge Model exige (§3.3) son
   incomputables hoy (DOMAIN_MODEL §8.3).
5. **Ley de órdenes sin detector.** I-14 (geometría) e I-15 (no ensanchamiento del
   SL) son doctrina sin validación en el dominio; la validación reside, en el mejor
   caso, en la capa de presentación.

La caja negra (S1: el sistema observa y conserva; el trader interpreta) necesita
exactamente los hechos que este refactor produce: momentos de fill con índice de
vela base, excursiones con timestamps, navegación objetiva.

## Decisiones de Alineación (Grill del 2026-07-10)

| Id | Decisión | Racional |
| :--- | :--- | :--- |
| G1 | **Costes: presets por clase de activo en código + override por sesión.** Constantes nombradas con racional (patrón `contractSizeFor`, ya auditado); el diálogo de nueva sesión muestra el preset resuelto y permite modificarlo; la sesión persiste su configuración efectiva como campo opcional retrocompatible del payload (ausente = coste cero legacy). | Sin store nuevo en IndexedDB, sin preguntas de sync, mínima complejidad. Una tabla editable user-level queda como evolución futura si la calibración por broker la demanda. |
| G2 | **Etiquetado de reglas post-colocación** (alcance RFC-015; registrado aquí por procedencia): el Playbook se configura y lista en el panel lateral del Dock; con una orden o posición ACTIVA, el atajo (p. ej. `1`) etiqueta el trade; el tag (`[R1]`) se renderiza pegado al label de la posición/orden en el gráfico y desaparece al cierre (el hecho persiste en el registro); pulsar atajos sin trades activos no hace nada. | Cero fricción (S2): el etiquetado nunca precede ni bloquea la ejecución. |
| G3 | **Escenas: foto vectorial congelada en el segundo del trade.** La caja negra captura `DrawingSnapshot` copy-on-write en colocación y cierre; la escena futura reconstruye exactamente lo que había en pantalla, aunque el dibujo se haya movido o borrado después. | Confirma la doctrina N-3/J-3: la escena es un hecho inmutable (fidelidad de registrador de vuelo). |
| G4 | **Diagnósticos en Fase 1: columnas `MAE_R`/`MFE_R` en el historial + agregados en el resumen de sesión.** | Números físicos sin interpretación (S1); la superficie de escenas espera a la Fase 3. |

## Especificación

### 1. Bucle de resolución base (M1)

1. **Serie de ejecución.** Se define como la serie más fina cargada de la sesión
   para el `primarySymbol` (M1 como ground truth; siempre un `AnchorTf`). El
   contexto de fill (`selectFillContext`) entrega SIEMPRE esta serie al motor,
   independientemente del timeframe visualizado y del Replay Resolution elegido.
   La creación de sesión ya garantiza la presencia local de los datasets ancla
   (`requiredDatasets`); la hidratación es una lectura de IndexedDB, nunca de red
   (offline-first).
2. **Fold a grano base.** `foldForwardFills` despacha exactamente un
   `Process Candle` por cada vela base estrictamente cruzada, en orden
   cronológico; ninguna se omite, ninguna se procesa dos veces.
   `lastProcessedTime` (marca de agua, I-8) pasa a granularidad base.
3. **Ejecución misma-vela sin hindsight.** `createdAt` se define como el tiempo
   del cursor de replay en el momento de la colocación. Una orden puede llenarse
   en velas base con `time > createdAt` **dentro del mismo intervalo del TF
   visualizado**. La exclusión de vela de colocación se refina así de grano padre
   a grano base, preservando las dos propiedades que la justifican:
   - *Idempotencia*: reprocesar cualquier vela base con `time <= createdAt` es
     no-op para esa orden; step-back/forward sigue siendo seguro.
   - *No-hindsight*: la vela base visible (o formándose) en el instante de la
     colocación nunca llena la orden.
4. **Disolución del caveat de I-7.** Al evaluar a grano base, el recorrido del
   intervalo padre es el único recorrido: el índice de fill y la evaluación de
   salidas ocurren sobre la misma secuencia de velas base, y la protección
   anti-stop-fantasma deja de depender de un mapa local a una invocación.
5. **Semántica congelada intacta.** `seekTo` sigue siendo teletransporte sin
   simulación; la navegación hacia atrás sigue siendo revisión pura. Este RFC no
   toca la semántica de navegación — la registra (§4).

### 2. Predicados de ejecución Bid/Ask

**Convención de precios.** Las series almacenadas son Bid (convención de barras
MT5; confirmar contra `pipeline/fill_r2.py` al implementar — riesgo R3). El
gráfico visualiza Bid. El Ask se deriva: `Ask(t) = Bid(t) + s`, con `s` el spread
de la sesión en puntos (constante, decisión G1). Las compras ejecutan a Ask; las
ventas ejecutan a Bid.

**Predicados de fill** (sobre la vela Bid `c`; el precio de ejecución es el nivel
exacto en su lado):

| Orden | Lado de ejecución | Predicado |
| :--- | :--- | :--- |
| Buy Limit a `E` | Ask | `c.low + s <= E` |
| Buy Stop a `E` | Ask | `c.high + s >= E` |
| Sell Limit a `E` | Bid | `c.high >= E` |
| Sell Stop a `E` | Bid | `c.low <= E` |

**Predicados de salida:**

| Posición | Nivel | Lado (acción de cierre) | Predicado |
| :--- | :--- | :--- | :--- |
| Larga | SL | Bid (venta) | `c.low <= SL` |
| Larga | TP | Bid (venta) | `c.high >= TP` |
| Corta | SL (stop protector = compra de cobertura) | Ask | `c.high + s >= SL` |
| Corta | TP (compra de cobertura) | Ask | `c.low + s <= TP` |

**Costes:**

- **Comisión**: `commissionPerLot` por round-turn, cargada al cierre.
  Descomposición en `ClosedTrade`: `grossProfit` (a precios ejecutados),
  `commission`, `profit = grossProfit - commission` (neto). `rMultiple` se
  mantiene sobre el neto con el 1R geométrico intacto (I-2).
- **Deslizamiento**: `slippagePoints` determinista, aplicado SOLO a ejecuciones
  tipo stop (entradas stop y SL), siempre en contra del trader; desactivado por
  defecto.
- **Invariante ancla (V-1)**: con `ExecutionCosts = {0, 0, 0}` todos los
  predicados degeneran exactamente en los actuales y el motor reproduce **bit a
  bit** las salidas de la suite vigente.

La semántica de ambigüedad (I-9) no cambia: si SL y TP caen dentro de la misma
vela base, resolución pesimista (SL) marcada como `ambiguous` — ahora confinada
al átomo de resolución base, por lo que se espera que `ambiguousCount` caiga (KPI
de fidelidad medible).

### 3. Equidad flotante continua y MAE/MFE

**Mark-to-market.** En cada vela base procesada, toda posición abierta se valora
al lado de su cierre: larga a Bid (`c.close`), corta a Ask (`c.close + s`).

```
floatingPnL(p, c) = (val(c) - p.entryPrice) * dir(p.side) * p.lots * K
floatingEquity    = balance + SUMA(floatingPnL de posiciones abiertas)
```

`floatingEquity` se expone como read model (selector); no se persiste.

**Excursiones** (acumuladas en el mismo recorrido de velas, sin pasada extra).
Para una posición con entrada `E`, stop `S`, distancia `d = |E - S|`, sobre las
velas base `c_k` de `[openTime, closeTime]`, con precios del lado adverso
correcto (larga: extremos Bid; corta: extremos Ask):

```
adverso_k   = (E - low_k)+        larga   |   (high_k + s - E)+   corta
favorable_k = (high_k - E)+       larga   |   (E - low_k - s)+    corta

MAE = max_k adverso_k      tMAE = tiempo de la primera vela que alcanza el máximo
MFE = max_k favorable_k    tMFE = análogo

MAE_R = MAE / d            MFE_R = MFE / d
```

Al cierre, `ClosedTrade` sella `{mae, mfe, tMae, tMfe}` (campos aditivos,
retrocompatibles). Propiedades ejecutables: un trade con `outcome = 'sl'` cumple
`MAE_R >= 1`; un trade con `outcome = 'tp'` cumple `MFE >= |tp - entry|` (V-11).

Estas cantidades son **medidas físicas** (S1): el sistema las registra y las
muestra; jamás deriva juicios de ellas.

### 4. La Caja Negra (Telemetry Register)

**Almacenamiento.** Store nuevo en IndexedDB (`emulador-workspaces`), local-only,
clave `[sessionId, seq]`, append-only. Fuera de `SessionPayloadV2` (D9 intacto);
sin ciclo LWW (pérdida tolerable por la asimetría de conservación,
TRADER_KNOWLEDGE_MODEL §2.2).

**Sobre (envelope):**

```
TelemetryEvent := { seq, wallClockMs, marketTime, kind, payload }
```

**Eventos v1:**

| Evento | Payload | Momento de captura |
| :--- | :--- | :--- |
| `ReplaySeek` | `{ fromTime, toTime, direction }` | Teletransporte del scrubber (registrado, no simulado) |
| `ReplayJump` | `{ fromTime, toTime, grain }` | Saltos con fold / revisión |
| `PlaybackToggled` | `{ playing }` | Play/pausa |
| `SpeedChanged` | `{ msPerCandle }` | Cambio de velocidad |
| `TimeElapsedBeforeOrder` | `{ orderRef, anchorKind, pausedMs, playingMs, candlesRevealed }` | Colocación de orden; ancla = el más reciente de {inicio de sesión, último seek, último evento de orden} |
| `DrawingSnapshot` | `{ eventRef, drawings: [{ type, anchorPoints[(time, price)], styleToken }] }` | Colocación y cierre (G3: copia congelada copy-on-write) |

**Invariantes del registro:**

- **Neutralidad (N-1).** Ningún identificador de esquema interpretativo
  (`hesitation`, `honesty`, `discipline`, `cheat`, `score`, ...); detector: grep
  de vocabulario prohibido (UBIQUITOUS_LANGUAGE §11).
- **Pasividad (N-2).** Escritura batched fuera del hot path; cero prompts; el
  presupuesto de 16 ms/frame se mide con la captura activa.
- **Candle-free (N-5).** `assertNoCandles` se reutiliza sobre el store nuevo.
- **Captura como observador.** Un effect `dispatch: false` (el patrón ya auditado
  de los sync effects) escucha los hechos reificados (§5) y los comandos de
  navegación; la telemetría no añade comportamiento de dominio ni rutas de
  escritura al estado de trading.

### 5. Pureza del dominio: `SimulationDomain`

Módulo puro de la ley del ciclo de vida de órdenes, invocado por los reducers
(sin conceptos de framework nuevos — formaliza la práctica existente de funciones
puras en un módulo nombrado):

- **I-14 — Geometría de la orden.** Compra: `sl < E` y (`tp = null` o `tp > E`);
  venta simétrica, validado coherentemente con el lado de ejecución (§2). Una
  colocación inválida **no muta estado**; el feedback es no bloqueante (sin
  modales — S2).
- **I-15 — No ensanchamiento del SL.** `modifyPosition` acepta `SL'` solo si
  acerca el stop (larga: `SL' >= SL`; corta: `SL' <= SL`); el TP es libre
  (gestión asimétrica del comercio).
- **Punto único de dimensionamiento.** Toda derivación de lotaje pasa por
  `lotsForRisk` (I-1); ningún camino alternativo.
- **Hechos reificados.** El motor emite `OrderFilled { tradeId, fillBaseIndex,
  executedPrice, marketTime }` y `PositionClosed { tradeId, outcome, ambiguous,
  executedPrice, marketTime }` como hechos de primera clase — cierran
  EVENT_STORMING §8 (puntos 1-2) y alimentan la caja negra y las Fases 2-3.

## Modelo de datos (cambios aditivos, sin migraciones destructivas)

- `ExecutionCosts := { spreadPoints, commissionPerLot, slippagePoints }` — value
  object, argumento explícito del motor (pureza intacta: sin lecturas de config
  dentro del motor).
- `COST_PRESETS` por clase de activo (Forex / Índices / Metales / Cripto) como
  constantes nombradas con racional (G1).
- `ClosedTrade += { grossProfit?, commission?, mae?, mfe?, tMae?, tMfe? }`.
- Payload de sesión `+= executionCosts?` (opcional; ausente = coste cero legacy;
  tests round-trip de migración obligatorios).
- Sin cambios en velas, layout, linkGroups ni drawings.

## Alcance de UI (Fase 1 — decisión G4)

- Columnas `MAE_R` / `MFE_R` en la tabla de historial de trades (junto a
  R-múltiple; `tabular-nums`).
- Agregados físicos en el resumen de sesión (media y máximo de `MAE_R`/`MFE_R`)
  junto a `ambiguousCount`, más el disclosure de costes simulados con sus
  supuestos visibles (P7: "costes simulados", nunca precisión fingida).
- Nada más en esta fase.

## No-objetivos

1. Sin datos de tick ni interpolación sintética intra-M1: la vela base sigue
   siendo el cuanto de tiempo (I-9 se mantiene, ahora a grano base).
2. Sin spread variable, feeds de liquidez, profundidad, margen o apalancamiento.
3. Sin telemetría interpretativa de ningún tipo (N-1) y sin scores.
4. Sin Web Workers (medir contra el presupuesto primero — patrón RFC-012).
5. Sin cambios a la semántica congelada de navegación (seek = teletransporte;
   atrás = revisión). Los seeks se registran, jamás se juzgan.
6. Sin UI de Playbook (Fase 2) ni Cabina de Reflexión (Fase 3).

## Invariantes y detectores

| Id | Invariante | Detector |
| :--- | :--- | :--- |
| V-1 | Coste cero reproduce el motor actual bit a bit | Suite dorada de regresión con `{0,0,0}` |
| V-2 | `profit <= grossProfit` para todo coste no negativo | Property test de monotonicidad |
| V-3 | Predicados sided correctos (4 fills + 4 salidas) | Suite unitaria de los 8 predicados Bid/Ask |
| V-4 | Idempotencia a grano base (step-back/forward = no-op) | Property tests de reproceso |
| V-5 | Determinismo del motor (C5) | Test de doble aplicación idéntica |
| V-6 | Regresión anti-stop-fantasma intacta | Spec preexistente sin tocar (regla STOP) |
| V-7 | Neutralidad de esquemas (N-1) | Grep de vocabulario prohibido |
| V-8 | Presupuesto de frame con captura activa (N-2) | Medición 16 ms/frame, jump-50 sobre M1 |
| V-9 | Stores nuevos candle-free (N-5) | `assertNoCandles` reutilizado |
| V-10 | I-14 / I-15 rechazan estados inválidos sin mutar | Suites unitarias del `SimulationDomain` |
| V-11 | Coherencia física: `outcome='sl' => MAE_R >= 1`; `outcome='tp' => MFE >= \|tp-entry\|` | Property tests sobre el walk |

## Plan de aterrizaje incremental (cada paso compila y testea en verde)

1. Bucle a resolución base + ejecución misma-vela (motor puro, TDD duro; ancla
   V-1 establecida ANTES de tocar predicados).
2. Predicados Bid/Ask + descomposición de costes (V-2, V-3).
3. Mark-to-market + MAE/MFE + selector de `floatingEquity` (V-11).
4. `SimulationDomain` (I-14/I-15) + hechos reificados (V-10).
5. Caja negra: store + observer pasivo (V-7, V-8, V-9).
6. UI: columnas de historial + agregados del resumen (G4).

## Riesgos y mitigaciones

- **R1 — Densidad de folds** (jump-50 sobre M1 = 50 velas base × posiciones):
  medir contra 16 ms/frame antes de considerar optimización alguna (PHILOSOPHY
  §2.9).
- **R2 — Deriva de semántica en sesiones guardadas**: campo ausente = coste cero
  + tests round-trip; la suite dorada V-1 protege el pasado.
- **R3 — Convención Bid de las barras MT5**: confirmar en `pipeline/fill_r2.py`;
  si la fuente fuera distinta, el mapeo se ajusta en un único punto (la
  derivación de Ask).
- **R4 — Volumen de telemetría**: log por sesión, acotado en tamaño, local-only;
  su pérdida es tolerable por diseño.
- **R5 — Es el mayor cambio a la ruta del dinero desde RFC-004**: aterrizaje por
  pasos en verde con la ancla V-1 como red permanente.

## Criterios de aceptación (Definition of Done)

1. Los seis pasos del plan aterrizados con los cuatro gates en verde
   (`tsc app`, `tsc spec`, `ng test`, `lint`) y `npm run build` limpio al cierre.
2. V-1..V-11 implementados como tests o verificaciones documentadas con salida
   fresca.
3. `ambiguousCount` medido antes/después sobre una sesión de referencia
   (KPI de fidelidad, se espera descenso).
4. Ningún spec preexistente modificado (regla STOP); la suite anti-stop-fantasma
   pasa intacta.
5. Documentación actualizada: DOMAIN_MODEL (I-7 sin caveat, I-14/I-15 con
   detector, §8 limitaciones saldadas), UBIQUITOUS_LANGUAGE (entradas afectadas),
   walkthrough de cierre.

## Desviaciones registradas (cierre, 2026-07-11)

El aterrizaje siguió el plan incremental de la sección anterior sin reabrir pasos ya
cerrados (STOP rule). Cinco desviaciones puntuales quedaron registradas durante la
implementación, ninguna oculta:

| Id | Desviación | Racional |
| :--- | :--- | :--- |
| D14.B | `PendingOrder.createdAt` se sella en el **horizonte de revelado** (`selectPlacementTime`: última vela base ya mostrada en el bucket de resolución del cursor), no en el tiempo crudo del cursor como dice literalmente §1.3. | FORZADO por la propia propiedad de no-hindsight de §1.3 una vez que la ejecución corre a grano base: con resolución de reproducción más gruesa que el grano base, sellar el cursor crudo permitiría llenar en velas base aún no reveladas dentro del mismo intervalo visual. A grano base ambos tiempos coinciden — sin cambio observable en ese modo. |
| — | La caja negra usa una base de datos IndexedDB DEDICADA (`emulador-telemetry`), no el store `emulador-workspaces` que nombra literalmente §4. | Unir el store al `emulador-workspaces` compartido rompía una aserción STOP-protegida de conteo exacto de object stores en `workspace-db.service.spec.ts`; una base dedicada deja ese spec intacto. |
| D14.E | 2 specs de reducer preexistentes (fixtures con geometría SL/TP ahora inválida bajo I-14) se editaron puntualmente, bajo autorización explícita del owner — excepción acotada a la regla STOP. | Las fixtures usaban geometría límite (SL/TP igual al precio de entrada) que I-14 rechaza correctamente; la intención de cada spec se preservó, solo la geometría de fixture cambió. |
| D14.F | Los hechos reificados (`OrderFilled`/`PositionClosed`) NO se surfacean en `TradingState`; el observador de telemetría los deriva independientemente diffando `positions[]`/`history[]` entre snapshots consecutivos. | `createFeature` de NgRx rechaza propiedades opcionales en el feature state, y un campo obligatorio rompería los literales de payload protegidos de las acciones existentes — surfacing es TYPE-IMPOSSIBLE sin tocar código STOP-protegido. `ProcessResult.facts` queda como punto de extensión reservado (cero lectores en producción) para las Fases 2-3. |
| — | El teletransporte "ir a fecha" (y las cargas programáticas de restauración de sesión/CSV-start) despachan `goToTime` directamente, sin pasar por `seekTo` ni por el armado de `jumpForward`/`jumpBack`/`advanceDisplay` — no se capturan como `ReplaySeek` ni como `ReplayJump`. | Gap de captura conocido, no corregido en este cierre: esos call sites nunca pasan por el efecto que arma la captura de jump ni por `seekTo`. Queda registrado como trabajo futuro de telemetría, no como comportamiento oculto. |

## Referencias

- [TRADER_KNOWLEDGE_MODEL.md](../TRADER_KNOWLEDGE_MODEL.md) — doctrina S1/S2, caja negra (§3), invariantes N-1..N-6.
- [DOMAIN_MODEL.md](../DOMAIN_MODEL.md) — invariantes I-1..I-15 y limitaciones §8.
- [EVENT_STORMING.md](../EVENT_STORMING.md) — §8 (hechos por reificar), pipeline `foldForwardFills`.
- [PRODUCT_PRINCIPLES.md](../PRODUCT_PRINCIPLES.md) — P7 (honestidad de simulación), P8 (entrada risk-first).
- [RFC-014_AND_BEYOND.md](../RFC-014_AND_BEYOND.md) — borrador abstracto en inglés (revisión 2) del que este RFC es la forma normativa.
- [strategic_audit.md](../strategic_audit.md) — Parte 7 (crítica del motor, vigente).
- `docs/engineering/domain/replay-trading.md` — invariante de realismo y semántica congelada de navegación.
