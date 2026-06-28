# Diseño — Playback Controller + Replay Resolution

**Fecha:** 2026-06-28
**Estado:** Aprobado (brainstorming) — listo para `writing-plans`
**Repo:** `Humerez-Sebas/trading-emulator` · front: `emulador/` (Angular 21 standalone + NgRx)
**Rama:** `claude/eager-chaum-6000cb` (worktree desde `main`, tras PR #10 mergeado)

---

## 1. Contexto y objetivo

Los controles de replay (play/pausa, ±1 vela, velocidad, reloj, progreso, P/L flotante)
viven hoy embebidos en una **barra superior fija** (`controls.component.ts`), mezclados
con el contexto del gráfico (selector de activo, temporalidades). El cursor de replay ya
es **global e independiente del timeframe** (`replay.currentTime`, en segundos), lo cual
es la base perfecta para lo que sigue.

Se construye un **Playback Controller**: una barra **flotante, compacta y siempre visible**
sobre el gráfico que concentra TODA la navegación del backtesting, con avance manual muy
preciso. La barra superior queda solo como **contexto** (activo, TF, slot para el futuro
selector de layout). El P/L flotante pasa a ser un **overlay del gráfico**.

La pieza más potente es la **Replay Resolution configurable**: el TF mostrado queda fijo,
pero el usuario elige la resolución con la que avanza el replay — cualquier TF estándar que
sea **divisor válido** del TF mostrado y tenga datos para generarse (H1→M1, M15→M5, M10→M2…).
Al avanzar a resolución fina, la vela del TF mostrado **se forma progresivamente** y los
SL/TP/fills se evalúan **a esa resolución** (replay realista para price action). El progreso
de la vela se muestra como **rango temporal** (`09:37 / 10:00`), no como contador.

### Decisiones tomadas (brainstorming)

| Decisión | Elección |
|---|---|
| Barra superior | Solo contexto: activo + TFs + slot de layout. Nada de replay. |
| Barra flotante | Toda la navegación del backtesting. Siempre visible sobre el gráfico. |
| Avance preciso | `±1` con **auto-repeat** al mantener + saltos `±N` (5/10/50) + Replay Resolution. |
| Atajos de teclado | **Fuera de alcance** (el usuario eligió solo los tres modos anteriores). |
| Saltos `±N` | Tamaño **seleccionable** (chip `« ×N »` que cicla 5/10/50), no todos expuestos. |
| Scrubber | **Sí** — pista arrastrable en la barra. Es teletransporte (no procesa fills). |
| P/L flotante | **Overlay del gráfico** (esquina), separado de los controles. |
| Fills en resolución fina | **A resolución base** (realista), solo cuando el modo está activo. No cambia el auto-play a vela completa. |
| Default de resolución | **Vela completa** (= TF mostrado). |
| Cambio de TF incompatible | **Reset** a vela completa. |
| Persistencia de la resolución | **Sí**, campo opcional en `.session.json` (retrocompatible con v1). |

## 2. Semántica de navegación (regla central)

| Acción | Unidad de avance | ¿Procesa fills/SL/TP? |
|---|---|---|
| `+1` / `▶` (vela completa) | 1 vela del TF mostrado | Sí, por vela revelada (igual que hoy) |
| `+1` / `▶` (resolución R) | 1 vela de resolución R | Sí, contra esa vela R (realista) |
| `+N` adelante | N velas (TF o R) | Sí, por cada vela cruzada |
| `−1` / `−N` atrás | N velas | Cursor solo; la vela de aterrizaje se reevalúa **idempotente** (sin nuevos fills), igual que el `stepBack` actual |
| Scrubber / "Ir a fecha" | salto directo (snap a vela) | **No** — teletransporte (`seekTo`, fuera del guard de `processFills$`) |

`+N` adelante procesa fills despachando, en un solo flujo, una `processCandle` por cada vela
intermedia `[idx+1 .. to-1]` y un `goToTime(candles[to].time)` final — la última vela la
procesa `processFills$` al reaccionar a ese `goToTime`. Reusa el `processCandle` puro
(`fill-engine.ts:138`) y evita el problema de `withLatestFrom` con N despachos sincrónicos.
`to` se **clampa** para no pasar el fin de datos ni un fin de sesión programado.

## 3. Arquitectura

Reusa infraestructura existente — esto es clave para mantener el cambio acotado:

| Pieza existente | Reuso |
|---|---|
| `generateCustomSeries` / `pickBaseSeriesTf` (`state/market/custom-timeframe.ts:83-114`) | Generar la serie de resolución en memoria desde los anchors cargados; `pickBaseSeriesTf != null` = "hay datos para esa resolución". |
| `aggregateCandles` / `anchorFor` (`services/timeframe-generator.ts`) | Agregación OHLC alineada a epoch (forming candle). |
| `selectLowerSeries` / `lowerSeriesForSeconds` (`state/selectors.ts:474`) | Desempate de SL/TP (`subCandles`) en fills. |
| `series.update()` (`components/chart/chart.component.ts:678`) | Primitivo de render incremental — actualizar la vela en formación. |
| `DropdownComponent` (`components/ui/dropdown.component.ts`) | Selector de resolución y de velocidad. |
| `selectChartView` (`state/selectors.ts:225`) | Vista consistente del chart (una emisión por cambio de estado). |
| `processCandle` action (`state/trading/trading.reducer.ts:202`) | Fold de fills para `+N` y para el modo resolución. |

### Componentes

| Cambio | Rol |
|---|---|
| **Nuevo** `components/playback-controller/playback-controller.component.ts` | Barra flotante de replay. Montada dentro de `.chart-area` (absolute, bottom-center). |
| **Nuevo** `components/floating-pnl/floating-pnl.component.ts` | Overlay del P/L flotante en una esquina del gráfico. Reusa `selectFloatingPnl`. |
| **Refactor** `components/controls/controls.component.*` | Barra de contexto: activo + TFs (+ chip custom) + slot de layout. Quita replay/progreso/reloj/P/L. (Mantener el nombre `controls` minimiza churn; renombrar a `context-bar` es opcional.) |
| **Edita** `pages/emulador/emulador-page.component.ts` | Monta `<app-playback-controller>` y `<app-floating-pnl>` en `.chart-area`; deja la barra de contexto arriba. |

### Estado (NgRx)

```ts
// replay.reducer.ts — ReplayState
jumpSize: 5 | 10 | 50;           // default 10
resolutionMinutes: number | null; // null = vela completa (= TF mostrado)

// market.reducer.ts — MarketState
resolutionSeries: Candle[];       // generada (mismo patrón que customSeries)
resolutionFor: number | null;     // los minutos para los que se generó (descarta stale)
```

Acciones nuevas: `ReplayActions.{ setJumpSize, jumpForward, jumpBack, seekTo, setReplayResolution }`
y `MarketActions.replayResolutionGenerated`.

### Selectores nuevos

- `selectJumpSize`, `selectResolutionMinutes`.
- `selectAvailableResolutions`: TFs estándar cuyos segundos **dividen** `selectActiveTfSeconds`, son menores, y producibles (`pickBaseSeriesTf(series, min) != null`).
- `selectResolutionSeries`: `series[R]` si está cargada, si no la `resolutionSeries` generada, si no `null`.
- `selectFormingCandle`: vela parcial del bucket actual del TF mostrado, agregada desde las velas de resolución reveladas (`open`=primera, `high`/`low`=máx/mín acumulado, `close`=última ≤ cursor); `null` fuera de modo resolución o sin velas en el bucket.
- `selectResolutionProgress`: `{ cursorTime, bucketEndTime } | null` para el readout `HH:mm / HH:mm`.
- `selectChartView` extendido: en modo resolución emite `idx = bucketIdx - 1` (velas completas) + `forming` (la vela en formación), de modo que el chart pinte las completas y actualice la barra viva sin filtrar el futuro.

## 4. Fases

Cada fase entrega software funcional y testeable por sí sola.

### Fase 1 — Barra flotante + refactor (sin resolución)

HUD flotante con transporte (`±1` con auto-repeat), saltos `±N`, velocidad, scrubber, reloj
y progreso; P/L como overlay; barra superior reducida a contexto. Acciones `setJumpSize`,
`jumpForward`, `jumpBack`, `seekTo` + effects `jumpForward$`/`jumpBack$`.

### Fase 2 — Replay Resolution

Estado `resolutionMinutes` (+ clamp en `changeTimeframe`), `resolutionSeries` generada por
effect (espejo de `customTimeframe$`), selectores de resolución/forming/progress, ramificación
de `advance$`/`stepBack$`/`jumpForward$` y de `processFills$` sobre la serie de resolución,
render de la vela en formación en el chart, selector de resolución + readout temporal en la
barra, y persistencia en `.session.json`.

## 5. Render de la vela en formación (modo resolución)

El chart no se unit-testea hoy (no hay `chart.component.spec.ts`); el render se valida en
navegador. La lógica pura (síntesis de la forming candle, resoluciones válidas, progreso)
sí se unit-testea en los selectores.

- `selectChartView` entrega velas completas `candles[0..bucketIdx-1]` + `forming` (parcial en `bucketStart`).
- El chart pinta las completas (crecen de a 1 al cerrarse cada bucket) y hace `series.update(forming)` en cada emisión para la barra viva.
- Al cerrarse el bucket, la última `forming` ya es igual a la vela completa del TF mostrado (agregó todas las velas de resolución del bucket) → transición sin saltos; arranca una nueva `forming` en el bucket siguiente.

## 6. Persistencia

`SessionFileV1.state` suma `replayResolution?: number | null` (opcional → retrocompatible:
ausente = `null` = vela completa). Se actualizan `SessionSnapshot`, `StateSnapshotInput`,
`RestorePlan`, `buildSessionFile`, `snapshotFromState`, `restorePlan`
(`services/session.service.ts`) y el mapeo de sync Supabase (`services/session-sync.mapping.ts`),
calcando cómo viaja hoy `playbackSpeed`.

## 7. Testing y verificación

- **Unit (Vitest, `cd emulador && npm test`):** selectores puros (`selectFormingCandle`,
  `selectAvailableResolutions`, `selectResolutionProgress`), reducer (`jumpSize`,
  `resolutionMinutes`, clamp), effects (`jumpForward$`/`jumpBack$`/`replayResolution$`,
  fills a resolución), round-trip de persistencia.
- **Lint/format/build:** `npm run lint`, `npm run format:check`, `npm run build`.
- **Navegador (preview tools), sesión con anchors M1 + H1:** barra de contexto sin replay;
  HUD flotante siempre visible; `±1` con auto-repeat; saltos `« ×N »`; `+N` dispara SL/TP de
  las velas cruzadas y `−N` solo mueve el cursor; scrubber sin fills; P/L overlay; en H1 el
  selector ofrece M30/M15/M5/M1, al elegir M5 la H1 se forma y el readout muestra
  `09:37 / 10:00`, un SL tocado a mitad de hora cierra en ese minuto; cambiar a M15 con
  resolución M30 resetea a vela completa; export/import conserva la resolución y una sesión
  v1 sin el campo carga como vela completa.
