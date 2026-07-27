# RFC-019 Implementation Plan — Pane-Space Guard & Cross-TF Forming Candle

| Field | Value |
| :--- | :--- |
| **RFC** | `docs/architecture/rfcs/019-pane-guard-cross-tf-forming.md` |
| **Branch** | `feature/rfc-019-pane-guard-cross-tf-forming` (off `develop` @ `0e66392`, the RFC-018 merge / PR #46) |
| **PR target** | `develop` (architectural/RFC track) |
| **Date** | 2026-07-27 |
| **Decisions implemented** | D19.A – D19.J |
| **Dev log** | `.superpowers/rfc-019/dev-log.md` |
| **Orchestration prompt** | `docs/superpowers/plans/2026-07-27-rfc-019-sdd-prompt.md` |

---

## 0. Corrections to the briefing (verified against the tree at `0e66392`)

The task brief was written from the architectural review, not from the tree. Every claim
in the review was re-verified here; **one decision in the brief is defective and is
overridden.** Implementers follow this section, not the brief.

| # | Brief says | Reality at `0e66392` | Consequence |
| :--- | :--- | :--- | :--- |
| **C1** | D19.E: "Symbol gate — **reuse `panelRendersTrades`**", and Task 2 pseudocode `subGrain = … && panelRendersTrades(descriptor, currentAsset)` | `panelRendersTrades` (`layout.models.ts:48-55`) is `symbol match **∧** !hideTrades`. A panel with `hideTrades: true` would lose its forming candle and **fall back to `idx` inclusive — re-painting the future candle.** The gate would reintroduce the exact defect this RFC closes. | **BLOCKING OVERRIDE.** Use the isolated T-1 clause only. Task 2 extracts `panelTracksPrimarySeries` (see Task 2, Step 1) and uses that. `panelRendersTrades` must NOT appear in `chartView$`. |
| **C2** | D19.F: shared fn "takes **seconds**" | Passing any duration at all is unnecessary. Every caller already computes `bucketStart` from its own `activeSeconds`. Threading a duration through only re-creates the `/60` hazard one layer down. | The shared fn signature is `aggregateFormingCandle(resSeries, bucketStart, cursor)` — **no duration parameter, no policy**. Policy (the `grain >= activeSeconds` guard) stays in each caller. |
| **C3** | Task 4: "Extract `distToSegment` to module-level (was a private instance method)" | Correct — `drawings-primitive.ts:338-354` is `private distToSegment(...)`. It has **no** `this` usage, so the extraction is mechanical. | Confirmed as written. Extract it above the classes; `hitTestDrawing` calls the free function. |
| **C4** | Task 3: "`hitTestTradeLine(x, y)` — add x parameter" | The method is called from **two** sites: `chart.component.ts:1447` (mousedown) and `chart.component.ts:1513` (hover feedback). Both must be updated or `tsc` fails. | Both call sites are in Task 3's scope. Listed explicitly in Task 3, Step 4. |
| **C5** | Bug-B risk: "Parked/hidden panels still compute forming — wasteful" | **Already false.** `chartView$` carries `.gated()` (`chart-model-mapper.service.ts:373`) — RFC-009 D6 update-gating pauses it for hidden panels. | No work needed. Task 5 adds a spec asserting the gating still holds after the change. |
| **C6** | Implied: `activeSeconds` may be 0 for custom M-timeframes | `descriptor.timeframe` is typed `Timeframe`; `TIMEFRAME_SECONDS` (`models.ts:28-49`) covers every member. The `?? 0` fallback and the `activeSeconds = minutes * 60` recompute in `chartView$` are **dead code**. | D19.G deletes both. `activeSeconds = TIMEFRAME_SECONDS[tf]` unconditionally. |

Additional verified facts that shape the plan:

- **The hit-test regression surface is essentially zero.** `drawings-capability.spec.ts`
  is the only spec file referencing `hitTestDrawing`/`hitTestHandle` (14 `it`s total, and
  only lines 64-65 touch the hit-tests — both destroy-guard assertions). **No existing
  spec asserts area-hit semantics.** Task 4 must therefore *add* the coverage it changes.
- **`panelChartView$` is not on the render path.** It feeds
  `chart-panel.component.ts:376`; the render stream is `chartView$`
  (`chart.component.ts:637`). Do not "fix" `panelChartView$` — it is out of scope.
- **`chartView$`'s unconfigured branch** (`if (!descriptor) return globalChartView;`)
  returns the global `selectChartView`. Task 1 must keep `selectFormingCandle`'s policy
  byte-identical so this legacy one-frame fallback does not change behavior.
- **The `paneWidth` pattern already exists** at `trade-boxes-primitive.ts:193` and
  `trade-buttons-primitive.ts:145`. Task 3 extends it; it does not invent it.

---

## 1. Task graph and wave parallelism

```
WAVE 1  (parallel — disjoint file sets, separate worktrees)
├── Task 1  forming collapse        selectors.ts, chart-model-mapper.service.ts (fn only)
├── Task 3  paneRect + guards       chart-engine.ts, chart.component.ts, trading-capability.ts
└── Task 4  paint-geometry hit-test drawings-primitive.ts  (vanilla TS, fully isolated)

WAVE 2  (sequential, after Wave 1 merges)
└── Task 2  chartView$ swap         chart-model-mapper.service.ts, layout.models.ts
                                    ── depends on Task 1 (aggregateFormingCandle)

WAVE 3  (after Waves 1+2)
└── Task 5  assertNoLookahead       *.spec-util.ts, *.spec.ts  (additive only)
```

**File-overlap analysis (why Wave 1 is safe to parallelize):**

| File | T1 | T2 | T3 | T4 | T5 |
| :--- | :-: | :-: | :-: | :-: | :-: |
| `state/selectors.ts` | ✎ | | | | |
| `components/chart/chart-model-mapper.service.ts` | ✎ (fn) | ✎ (stream) | | | |
| `domain/chart/chart-engine.ts` | | | ✎ | | |
| `components/chart/chart.component.ts` | | | ✎ | | |
| `domain/chart/capabilities/trading-capability.ts` | | | ✎ | | |
| `domain/chart/capabilities/drawings-primitive.ts` | | | | ✎ | |
| `state/layout/layout.models.ts` | | ✎ | | | |
| `*.spec.ts` / `*.spec-util.ts` | ✎ | ✎ | ✎ | ✎ | ✎ |

Only `chart-model-mapper.service.ts` is touched twice — by T1 (the module-level function)
and T2 (the `chartView$` stream). **That is the whole reason T2 is Wave 2, not Wave 1.**
Spec files are additive per task; each task creates or appends to its own `describe`
blocks, never rewrites another's.

**Shippability:** Task 2 is the lookahead fix and outranks everything else. If the run
degrades, **Task 2 ships alone** (it only needs Task 1 merged).

---

## 2. Global constraints

- **STOP rule.** Pre-existing specs are authority. If a task cannot proceed without
  editing a spec beyond TestBed providers, it STOPS and reports — it does not "fix" the
  spec. The one pre-declared exception is Task 4's `drawings-capability.spec.ts`
  destroy-guard assertions (lines 64-65), which keep their intent unchanged.
- **Kernel invariant 7.** No `*.spec-util.ts` import, and no vitest import, in app code.
  `assertNoLookahead` is test-only. Verified by grep in the DoD.
- **D8.** No new parametrized/factory selectors. Grep for `selectFormingCandle(` with an
  argument must return zero hits.
- **No new runtime dependencies.** Zero.
- **TDD.** Failing test first, then implementation, per task.
- **Angular 21 syntax.** Consult the `context7` MCP before writing any Signals /
  `linkedSignal` / `resource()` / standalone code. (Tasks here are mostly plain TS and
  RxJS, but the rule stands.)
- **Pathspec commits.** `git commit <paths> -m ...`. Never `git add -A`.
- **Gates raw.** Never pipe a gate through `| tail` / `| head`.

---

## 3. Tasks

### Task 1 — Collapse the two forming-candle implementations into one pure function

**Decisions:** D19.F
**Risk:** LOW — mechanical extraction of a pure function, no behavior change.
**Files:** `emulador/src/app/state/selectors.ts`,
`emulador/src/app/components/chart/chart-model-mapper.service.ts` (module-level function
only — **do not touch `chartView$`**), plus specs.

**Step 1 — Write the pure function.** Place it where both callers can import it without a
cycle. `selectors.ts` already imports `firstIndexAtOrAfter` / `lastIndexAtOrBefore` from
`state/trading/fill-engine`; the mapper imports them too. Put `aggregateFormingCandle`
in **`emulador/src/app/state/market/forming-candle.ts`** (new file, Angular-free, pure):

```ts
/**
 * RFC-019 (D19.F) — aggregates the resolution/replay candles revealed inside one display
 * bucket into a partial "forming" candle. PURE AGGREGATION, NO POLICY: it does not decide
 * whether a forming candle is appropriate — every caller owns that guard (see N19-2/N19-3).
 * Deliberately takes `bucketStart` rather than a duration: threading minutes (or seconds)
 * through re-creates the /60 round-trip that is a latent hazard for sub-minute timeframes.
 */
export function aggregateFormingCandle(
  resSeries: Candle[] | null,
  bucketStart: number,
  cursor: number,
): Candle | null {
  if (!resSeries || !resSeries.length) return null;
  const lo = firstIndexAtOrAfter(resSeries, bucketStart);
  const hi = lastIndexAtOrBefore(resSeries, cursor);
  if (lo < 0 || hi < lo || hi >= resSeries.length) return null;
  let high = resSeries[lo].high;
  let low = resSeries[lo].low;
  for (let i = lo + 1; i <= hi; i++) {
    if (resSeries[i].high > high) high = resSeries[i].high;
    if (resSeries[i].low < low) low = resSeries[i].low;
  }
  return { time: bucketStart, open: resSeries[lo].open, high, low, close: resSeries[hi].close };
}
```

> Verify `firstIndexAtOrAfter`'s out-of-range contract before finalizing the `lo < 0`
> guard — read `fill-engine.ts`, do not assume. If it returns `resSeries.length` on
> overflow, the `hi >= resSeries.length` guard covers it and `lo < 0` may be redundant;
> keep whichever the source actually requires and say which in the report.

**Step 2 — Rewire `selectFormingCandle` (`selectors.ts:521-547`).** Keep its policy guard
**verbatim** (`minutes == null || !resSeries || activeSeconds <= 0 || cursor <= 0`), keep
its `bucketStart` computation, delegate the aggregation:

```ts
export const selectFormingCandle = createSelector(
  selectResolutionSeries, selectActiveTfSeconds, selectCurrentTime, selectResolutionMinutes,
  (resSeries, activeSeconds, cursor, minutes): Candle | null => {
    if (minutes == null || !resSeries || activeSeconds <= 0 || cursor <= 0) return null;
    return aggregateFormingCandle(resSeries, Math.floor(cursor / activeSeconds) * activeSeconds, cursor);
  },
);
```

`selectChartView` (`selectors.ts:581-597`) is **unchanged** — it already consumes
`selectFormingCandle`.

**Step 3 — Rewire `computeFormingCandle` (`chart-model-mapper.service.ts:57-82`).** Keep
the function and its signature for now (Task 2 replaces its call site); delegate its body
to `aggregateFormingCandle`, preserving the `minutes * 60 >= activeSeconds` guard.
**Do not modify `chartView$` in this task.**

**Tests (new file `forming-candle.spec.ts`, pure, no TestBed):**

| # | Scenario | Expectation |
| :-- | :--- | :--- |
| 1 | normal bucket, several candles revealed | `open` = first, `close` = last, `high`/`low` = extremes, `time` = `bucketStart` |
| 2 | `hi < lo` (gap: no candle in `[bucketStart, cursor]`) | `null` |
| 3 | `hi === lo` (exactly one revealed) | that candle, re-timed to `bucketStart` |
| 4 | `cursor === bucketStart` | the single candle at the boundary |
| 5 | empty series / `null` series | `null` |
| 6 | cursor beyond the series end | last available candle's close, no crash |

Plus: existing `selectFormingCandle` specs must pass **untouched**. If any needs editing,
STOP and report.

**Acceptance:** four gates green; test count rises by ≥ 6; `selectFormingCandle` and
`computeFormingCandle` contain no aggregation loop of their own.

**Out of scope:** `chartView$`, `selectChartView` semantics, any behavior change.

---

### Task 2 — `chartView$`: input swap, D-B1, T-1 gate, memo, `resolvePanelCandles`

**Decisions:** D19.C, D19.D, D19.E (as amended by C1), D19.G, D19.H
**Risk:** **HIGH** — correctness of D-B1, multi-panel behavior, lookahead, and a new memo
slot. This is the task the whole RFC exists for.
**Files:** `emulador/src/app/state/layout/layout.models.ts`,
`emulador/src/app/components/chart/chart-model-mapper.service.ts`, plus specs.
**Depends on:** Task 1 (`aggregateFormingCandle`).

**Step 1 — Extract the T-1 clause (`layout.models.ts`).** Pure refactor, provable by
substitution:

```ts
/**
 * RFC-019 (D19.E, N19-3) — the T-1 clause on its own: does this panel display the
 * PRIMARY symbol's series? Extracted from `panelRendersTrades`/`panelMayExecute` so
 * candle fidelity can gate on the symbol invariant WITHOUT inheriting `hideTrades`,
 * which is a trade-ink preference and must never govern which candles are honest.
 */
export function panelTracksPrimarySeries(
  descriptor: PanelDescriptor,
  primarySymbol: string | null,
): boolean {
  return primarySymbol != null && effectivePanelSymbol(descriptor, primarySymbol) === primarySymbol;
}
```

Re-express both existing predicates in its terms:

```ts
export function panelRendersTrades(d: PanelDescriptor, primarySymbol: string | null): boolean {
  return panelTracksPrimarySeries(d, primarySymbol) && !d.hideTrades;
}
export function panelMayExecute(d: PanelDescriptor, primarySymbol: string | null): boolean {
  return panelTracksPrimarySeries(d, primarySymbol);
}
```

All existing `panelRendersTrades` / `panelMayExecute` specs must pass **untouched** — that
is the proof the refactor is behavior-preserving. If one fails, the refactor is wrong.

**Step 2 — Swap `chartView$`'s inputs.** In the `combineLatest` array
(`chart-model-mapper.service.ts:327-335`):

- remove `selectResolutionMinutes`, `selectResolutionSeries`
- add `selectReplayTfSeconds`, `selectReplaySeries`, `selectCurrentAsset`

**Step 3 — Rewrite the projection body.** Target shape:

```ts
const tf = descriptor.timeframe;
const candles = this.resolvePanelCandles(series, tf);          // D19.G — F3's shared memo
const activeSeconds = TIMEFRAME_SECONDS[tf];                    // C6 — no ?? 0, no recompute
const idx = lastIndexAtOrBefore(candles, currentTime);
const countdown = computeCountdown(activeSeconds, currentTime);

// D19.D/D19.E (N19-2, N19-3). NOT panelRendersTrades — see plan §0 C1.
const subGrain =
  activeSeconds > replayTfSeconds &&
  currentTime > 0 &&
  panelTracksPrimarySeries(descriptor, currentAsset);

if (!subGrain) return { tf, candles, idx, utcOffset, forming: null, countdown };

const bucketStart = Math.floor(currentTime / activeSeconds) * activeSeconds;
const forming = this.resolveForming(replaySeries, bucketStart, currentTime);   // D19.H
// D-B1: idx-1 is conditioned on subGrain, NEVER on `forming != null`.
return idx >= 0
  ? { tf, candles, idx: idx - 1, utcOffset, forming, countdown }
  : { tf, candles, idx, utcOffset, forming, countdown };
```

**Step 4 — Add the memo slot (D19.H).** Same discipline as `lastCandlesInputs` /
`lastCandlesOutput` (`:425-449`) — one slot per mapper instance, N panels ⇒ N slots:

```ts
private lastFormingInputs: { series: Candle[] | null; bucketStart: number; cursor: number } | null = null;
private lastFormingOutput: Candle | null = null;

private resolveForming(series: Candle[] | null, bucketStart: number, cursor: number): Candle | null {
  const last = this.lastFormingInputs;
  if (last && last.series === series && last.bucketStart === bucketStart && last.cursor === cursor) {
    return this.lastFormingOutput;
  }
  this.lastFormingInputs = { series, bucketStart, cursor };
  this.lastFormingOutput = aggregateFormingCandle(series, bucketStart, cursor);
  return this.lastFormingOutput;
}
```

**Step 5 — Delete the dead code.** The inline `generateCustomSeries` block
(`:352-358`) and the now-unused `computeFormingCandle` wrapper. Remove the
`generateCustomSeries` import **only if** no other call site in the file remains — grep
first; `resolvePanelCandles` still uses it, so the import stays.

**Tests (`chart-model-mapper.service.spec.ts`, new `describe`):**

| # | Scenario | Expectation |
| :-- | :--- | :--- |
| 1 | **Single panel, TF == active TF, resolution null** | Emission equivalent to today: `forming === null`, `idx` NOT decremented. *The byte-identity guard.* |
| 2 | **H1 panel, M5 replay grain** | `forming != null`, `idx` decremented, `forming.time === bucketStart` |
| 3 | **H1 panel, M5 grain, gap in replay series (`hi < lo`)** | `forming === null` **and `idx` still decremented** (D-B1) |
| 4 | **M1 panel, H1 grain** (panel finer than grain) | `subGrain === false`, `forming === null`, `idx` untouched |
| 5 | **Foreign-symbol panel, H1, M5 grain** | `forming === null`, `idx` untouched (N19-3) |
| 6 | **Panel with `hideTrades: true`, H1, M5 grain** | `forming != null`, `idx` decremented — **`hideTrades` must NOT suppress forming** (regression guard for C1) |
| 7 | **`idx === 0` boundary** | `idx` emitted as `-1`, `forming` present, no throw |
| 8 | **Memo:** two emissions with an unrelated input changed | `aggregateFormingCandle` called once (spy) |
| 9 | **`resolvePanelCandles` routing** | `generateCustomSeries` called at most once across repeated ticks on an unloaded M-timeframe |

**Acceptance:** four gates green; scenario 1 proves single-panel identity; scenarios 3 and
6 are the two that would silently regress the RFC's purpose.

**Out of scope:** `panelChartView$`, `tradeChartView$`, `selectChartView`,
`chart.component.ts` render logic.

---

### Task 3 — `ChartEngine.paneRect()`, pane guards, `hitTestTradeLine(x, y)`

**Decisions:** D19.A, D19.J
**Risk:** LOW — a read-only accessor plus an early return in three handlers; the geometry
pattern already exists at two call sites.
**Files:** `emulador/src/app/domain/chart/chart-engine.ts`,
`emulador/src/app/components/chart/chart.component.ts`,
`emulador/src/app/domain/chart/capabilities/trading-capability.ts`, plus specs.

**Step 1 — `ChartEngine.paneRect()`.** Read-only geometry, no behavior (kernel inv. 2):

```ts
/**
 * RFC-019 (D19.A) — the PLOT rectangle in container CSS px: excludes the right price
 * scale and the bottom time axis. Every overlay hit-test resolves coordinates in this
 * space (`priceToCoordinate`, `xForTime`); the DOM listeners measure from the container,
 * which is WIDER. Without this the price-axis strip reads as valid pane space (N19-1).
 * Same `timeScale().width()` source already used by trade-boxes/trade-buttons primitives.
 */
public paneRect(): { width: number; height: number } | null {
  if (this.destroyed) return null;
  const ts = this.chart.timeScale();
  return { width: ts.width(), height: this.container.clientHeight - ts.height() };
}
```

Confirm against the real class: whether the container element and a `destroyed` flag are
already fields, and match their names. Do not invent members.

**Step 2 — `inPane(x, y)` in `ChartComponent`:**

```ts
private inPane(x: number, y: number): boolean {
  const r = this.engine?.paneRect();
  return r != null && x >= 0 && x < r.width && y >= 0 && y < r.height;
}
```

**Step 3 — Guard the three DOM handlers.**

- `handleMouseDown` (`:1388`): insert **after** `chartFocused.emit()` and the menu
  dismissal, **before** the middle-button quick-ruler branch. Axis clicks must still focus
  the panel and close menus. Compute `x`/`y` once at the top and reuse them (today they
  are computed at `:1408`, after the early returns — hoist carefully without changing the
  existing `placing()` / `quickRuler` / `activeTool()` short-circuits).
- `handleHoverFeedback` (`:1502`): if out of pane, reset
  `container.nativeElement.style.cursor = ''` and return — the axis must not show
  `ns-resize`.
- `handleContextMenu` (`:898`): early return **after** the `placing` branch (right-click
  during placement is a placement verb, not a chart gesture) and before
  `coordinateToPrice`.

**Step 4 — `hitTestTradeLine(x, y)` (D19.J).** Add the leading `x` parameter in
`trading-capability.ts:220` and update **both** call sites: `chart.component.ts:1447` and
`chart.component.ts:1513` (C4). Inside, reject `x` outside the pane width using the same
`chart.timeScale().width()` source. If the capability has no `chart` handle, keep the
parameter accepted-but-unused with a comment saying D19.A is the enforcing guard — and say
so in the report rather than inventing a handle.

**Tests:**

| # | Scenario | Expectation |
| :-- | :--- | :--- |
| 1 | `paneRect()` excludes the price scale | `width < container.clientWidth` |
| 2 | `paneRect()` after `destroy()` | `null` |
| 3 | mousedown at `x` inside the price-axis strip, over a rect spanning that price | no drawing selected, no `setInteractivity(false)` |
| 4 | mousedown on the axis at an SL price level | no `lineDrag` started (the T-3-adjacent hole) |
| 5 | mousedown inside the pane on a drawing edge | still selects (no regression) |
| 6 | hover on the axis | cursor is not `ns-resize` |

**Acceptance:** four gates green; scenarios 3 and 4 are the bug.

**Out of scope:** `handleClick` (bus path — already pane-space), any hit-test *shape*
change (that is Task 4).

---

### Task 4 — Paint-geometry hit-test

**Decisions:** D19.B
**Risk:** LOW — one vanilla-TS file, no Angular, no NgRx, no side effects.
**Files:** `emulador/src/app/domain/chart/capabilities/drawings-primitive.ts`, plus specs.

**Step 1 — Extract `distToSegment` to module level.** `:338-354`, uses no `this` (C3).
Place it above the classes and export it for the spec.

**Step 2 — `fibLevelY` helper, shared with the renderer:**

```ts
/** Y of a fib level between the two anchors. Shared by `drawFib` and `hitTestDrawing` so
 *  painted geometry and hit geometry cannot drift (RFC-019 D19.B, N19-5). */
export function fibLevelY(y1: number, y2: number, level: number): number {
  return y1 + (y2 - y1) * level;
}
```

Use it in `drawFib` (`:123`) **and** in the hit-test. This shared call is the invariant.

**Step 3 — Rewrite the `rect`/`fib` branch of `hitTestDrawing` (`:308-311`):**

```ts
const near = (ax: number, ay: number, bx: number, by: number) =>
  distToSegment(x, y, ax, ay, bx, by) <= tol;

if (d.kind === 'rect') {
  const l = Math.min(x1, x2), r = Math.max(x1, x2);
  const t = Math.min(y1, y2), b = Math.max(y1, y2);
  if (near(l, t, r, t) || near(l, b, r, b) || near(l, t, l, b) || near(r, t, r, b)) return d.id;
} else if (d.kind === 'fib') {
  const l = Math.min(x1, x2), r = Math.max(x1, x2);
  for (const level of FIB_LEVELS) {
    const ly = fibLevelY(y1, y2, level);
    if (near(l, ly, r, ly)) return d.id;
  }
} else {
  if (distToSegment(x, y, x1, y1, x2, y2) <= tol) return d.id;
}
```

`FIB_LEVELS` is already exported at `:12`. `hitTestHandle` (`:323-336`) is **unchanged** —
handles still take priority in `handleMouseDown`.

**Tests (`drawings-capability.spec.ts` or a new `drawings-primitive.spec.ts`):**

| # | Scenario | Expectation |
| :-- | :--- | :--- |
| 1 | click at the geometric centre of a large rect | `null` (interior no longer selects) |
| 2 | click within 6 px of the rect's top edge | the rect id |
| 3 | click within 6 px of the rect's left edge | the rect id |
| 4 | click on a fib level line | the fib id |
| 5 | click midway **between** two fib levels | `null` |
| 6 | 2 px-tall rect, click anywhere on it | still selectable (thin-shape guard) |
| 7 | `line` / `ruler` | unchanged behavior |
| 8 | overlapping rects, click on the lower one's exposed edge | the lower one's id |

**Acceptance:** four gates green; the two destroy-guard assertions at
`drawings-capability.spec.ts:64-65` still pass untouched.

**Out of scope:** the renderer's visual output (only the level-Y formula is factored out —
pixels must be identical), `hitTestHandle`, event dispatch.

---

### Task 5 — `assertNoLookahead` + boundary specs

**Decisions:** D19.I
**Risk:** LOW — additive test code only; touches no production logic.
**Files:** new `emulador/src/app/components/chart/lookahead-invariants.spec-util.ts`,
`chart-model-mapper.service.spec.ts`.

**Step 1 — The helper.** Model it on `layout-invariants.spec-util.ts` (the existing
precedent: a vitest-free predicate plus a thin vitest wrapper). **Test-only — never
imported by app code** (kernel inv. 7):

```ts
/**
 * RFC-019 (D19.I, N19-4) — no candle whose CLOSE exceeds the replay cursor may reach the
 * render model, on any panel, at any timeframe. A candle opening at `t` on an
 * `activeSeconds` timeframe closes at `t + activeSeconds`; it is honest only once the
 * cursor has reached that close. The forming candle is exempt from the close test by
 * construction — it is the partial bar — but its OPEN must not be in the future.
 */
export function lookaheadViolation(
  candles: readonly Candle[], idx: number, forming: Candle | null,
  cursor: number, activeSeconds: number,
): string | null;

export function assertNoLookahead(...): void;   // vitest wrapper
```

Check every candle in `[0..idx]` for `c.time + activeSeconds <= cursor`, and `forming`
(when present) for `forming.time <= cursor`. Return a granular message naming the
offending index and times.

**Step 2 — Prove the helper catches the real defect.** Feed it the **pre-RFC** shape (an
H1 panel with `idx` un-decremented at a mid-bucket cursor) and assert
`lookaheadViolation` returns non-null. A test invariant that cannot fail on the bug it
was written for is worthless.

**Step 3 — Apply it across the mapper's scenario matrix** in
`chart-model-mapper.service.spec.ts`:

| # | Scenario | Assertion |
| :-- | :--- | :--- |
| 1 | H1 panel + M5 grain, mid-bucket | `assertNoLookahead` passes |
| 2 | Single M5 panel, no resolution | passes, and the emission matches the pre-RFC shape |
| 3 | `idx === 0` boundary | passes, no throw |
| 4 | Hidden panel (`setUpdatesEnabled(false)`) | no emission at all (C5 — gating still holds) |
| 5 | Foreign-symbol panel | passes; `forming === null` |
| 6 | Unconfigured mapper (descriptor `null`) | falls back to `globalChartView`, passes |

**Acceptance:** four gates green; Step 2 demonstrates the helper's sensitivity; a grep for
`spec-util` imports from `src/app/**` excluding `*.spec.ts` returns zero.

**Out of scope:** any production change. If a scenario fails, that is a **Task 2 defect** —
report it, do not patch the assertion.

---

## 4. Risk register

| # | Risk | Owner | Mitigation |
| :--- | :--- | :--- | :--- |
| R1 | **Silent lookahead regression.** `subGrain` computed wrong → future candles return. | Task 2 | Scenario matrix 1-9; `assertNoLookahead` (Task 5) as an independent second check. |
| R2 | **`hideTrades` suppressing forming** (the C1 defect, if the brief were followed). | Task 2 | Explicit regression spec (Task 2, scenario 6). Grep: `panelRendersTrades` must not appear in `chartView$`. |
| R3 | **Single-panel behavior drift.** The most common configuration silently changes. | Task 2 | Scenario 1 is the byte-identity guard and is non-negotiable. |
| R4 | **`idx = -1` boundary.** `renderWindow` paints `[]`, `renderedIdx` sticks at `-1`. | Task 2 / 5 | Boundary spec (Task 2 sc. 7, Task 5 sc. 3). Verify `render()`'s incremental `while` loop tolerates it. |
| R5 | **Coordinate-space mismatch in `paneRect()`.** Wrong height source → guard rejects valid pane clicks. | Task 3 | Scenario 5 (in-pane click still selects) is the counter-guard. Read the real `ChartEngine` fields; do not invent. |
| R6 | **Hit-test over-tightening.** Thin/small shapes become ungrabbable. | Task 4 | Scenario 6 (2 px rect). Tolerance stays 6 px, unchanged. |
| R7 | **Memo staleness.** `resolveForming` returns a stale candle after a rewind. | Task 2 | Key includes `cursor`, so a rewind is a miss by construction. Spec: rewind then re-advance. |
| R8 | **Parallel-worktree merge conflict** on `chart-model-mapper.service.ts`. | Wave 1 | T1 touches the module-level function only; T2 is Wave 2 by design (§1). |

---

## 5. Definition of done

1. Tasks 1–5 complete, each with its own task-scoped pathspec commit.
2. Four gates green with **fresh, raw** output from `emulador/`:
   `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`,
   `npx ng test --watch=false`, `npm run lint` (0 problems). `npm run build` at branch
   finalization — watch for NEW chunk types (vitest sentinel); the ~609 kB budget warning
   is known-accepted.
3. `assertNoLookahead` passes across the Task 5 matrix, **and** Step 2 proves it fails on
   the pre-RFC shape.
4. Single-panel identity spec green (Task 2, scenario 1).
5. Invariant greps: no factory selectors; no new dependencies; no `*.spec-util.ts` or
   vitest import from app code.
6. RFC-019 §11 satisfied; dev log updated with every deviation.
7. Whole-branch Opus audit PASS (zero Critical/High/Medium).
8. PR to **`develop`**.

**Follow-ups deliberately not in this plan:** register RFC-019 in
`docs/architecture/ROADMAP.md` (docs pass at branch finalization) and open the F19-2
foreign-symbol candle-sourcing issue (RFC-019 §10).
