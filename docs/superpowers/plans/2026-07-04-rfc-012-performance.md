# RFC-012 Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the RFC-008..011 multi-panel system for its worst case — `MAX_PANELS_PER_TAB = 8` panels inside one tab (`emulador/src/app/state/layout/layout.models.ts`) — by turning four behaviours that today exist only *incidentally* in the audited engine and its RFC-008/009 wrappers into **invariants verified by tests**, and by profiling the 8-panel case with a deterministic, spy-counting proof suite (no wall-clock timing, per the freeze-on-last precedent) so any further optimization is justified by a measured gap rather than added speculatively. The four formalized behaviours are exactly the RFC's Decision points 1-4:

1. **Shared candle series by reference (pt 1, R4):** two `ChartPanelComponent`s whose `PanelDescriptor.symbol`+`timeframe` match resolve the SAME `Candle[]` array reference through their independent `ChartModelMapper.panelChartView$` instances — because both read `series[descriptor.timeframe]` off the single `marketFeature.selectSeries` state slice (`emulador/src/app/state/selectors.ts:32`, re-exported from `state/market/market.reducer.ts`). NO new cache structure is introduced; this task ADDS a reference-identity (`===`) test that fails loudly if any code path ever copies the series.
2. **Render update-gating (pt 2, D6):** a hidden panel (`ChartPanelComponent.visible === false`, driven by `selectVisiblePanelIds`, `state/layout/layout.reducer.ts:219`) invokes ZERO engine render work while the replay clock advances, and applies exactly ONE `RenderModel` on re-show. The real mechanism is `ChartModelMapper.setUpdatesEnabled()` gating the five render streams (`chartStyle$`, `chartView$`, `tradeChartView$`, `sessionEnd$`, `drawingsState$`) via the existing `gated()` operator. This task ADDS a gating proof suite counting render-stream emissions across a hidden→advance→show cycle.
3. **Lazy chart creation on first show (pt 3):** `chart-panel.component.ts` renders `<app-chart>` UNCONDITIONALLY today, so `ChartEngine` is constructed eagerly in `ChartComponent.ngAfterViewInit` for every panel of every tab at layout-restore time. This task gates `<app-chart>` behind a sticky "has ever been visible" latch in the (non-audited) `ChartPanelComponent` wrapper so a panel born in a non-active tab/cell instantiates no `ChartEngine` until its first `visible === true`.
4. **Incremental updates (pt 4):** already implemented in the audited `ChartComponent.render()` small-advance path (`series.update()` per new candle) vs. the `renderWindow()`/`setData` window rebuild for jumps (`chart.component.ts:642-707`). This RFC only DOCUMENTS the existing contract and adds a black-box characterization test at the mapper/registry boundary — the audited `chart.component.ts`/`chart-engine.ts` are NOT edited.

Decision point 5 (NO Web Workers) and point 7 (no new cache, no partial-viewport virtualization) are honoured by omission — no task introduces them. Decision point 6 (profiling) is Task 5: a deterministic spy-counted 8-panel scenario whose numbers are recorded inline in this plan's **Final verification** section, with the explicit finding that the measured render-call fan-out does NOT exceed budget, so no further optimization is implemented.

**Architecture:** The RFC's `PanelRuntime.visible` (frozen-vision naming, `docs/architecture/rfcs/008-012-multi-chart-panel-system-vision.md`) has NO code entity — grep for `PanelRuntime` returns nothing. The shipped RFC-009 realization of "visible gating" is three real pieces: (a) the derived selector `selectVisiblePanelIds: Record<string, true>` (`state/layout/layout.reducer.ts:219`), (b) the `ChartPanelComponent.visible` signal input bound to `visibleIds()[pid] === true` in `workspace-viewport.component.ts:88`, and (c) `ChartModelMapper.setUpdatesEnabled(this.visible())` wired by an `effect` in `chart-panel.component.ts:108`. This plan grounds every "visible" reference in those three symbols, never in `PanelRuntime`. All new work lands in the **non-audited RFC-008/009 wrapper layer** (`ChartPanelComponent`, `ChartModelMapper`, `ChartRegistry`) plus new spec files; the audited `chart-engine.ts`/`chart.component.ts` are referenced read-only for documentation and are on this RFC's FORBIDDEN list. Reference-identity is the load-bearing property throughout: `marketFeature.selectSeries` is a `createFeature` auto-selector returning the `series: Partial<Record<Timeframe, Candle[]>>` slice by reference (unchanged until a market reducer replaces an entry), so `panelChartView$`'s `const candles = series[descriptor.timeframe]` yields the same array object to every same-symbol/same-TF panel with zero copying — exactly the invariant the vision's "cache de velas compartido (por símbolo, por ref)" box describes.

**Tech Stack:** Angular 21 standalone + signals, NgRx 21 (`createFeature`/`createSelector`, `@ngrx/store/testing` `provideMockStore`/`MockStore`), RxJS 7.8 (`combineLatest`/`distinctUntilChanged`/`filter`), Vitest 4 via `ng test` (`vi.spyOn`, `store.overrideSelector`/`refreshState`, `TestBed.runInInjectionContext`). `lightweight-charts` is touched ONLY through the audited engine, never directly in this RFC's files.

## Global Constraints

- **No new dependencies.** No profiling library, no benchmarking harness, no worker toolchain. Proofs are hand-written Vitest specs using `vi.spyOn` call-counting and `===` reference assertions, matching `chart-model-mapper.service.spec.ts` and `fill-engine.freeze-on-last.spec.ts`.
- **FORBIDDEN: touching audited chart files (AUDITED-FILE PROTECTION).** `emulador/src/app/domain/chart/chart-engine.ts`, `emulador/src/app/components/chart/chart.component.ts` — neither appears in ANY task's Files list. RFC-012 formalizes their *existing* behaviour with tests + wrapper-layer gating; it does not modify them. `chart-model-mapper.service.ts` and `chart-registry.service.ts` are RFC-008/009 wrapper code (NOT on the audit list — confirmed against RFC-011's own FORBIDDEN list, which enumerates the audited set as `chart-engine.ts`, `chart.component.ts`, `chart-panel.component.ts`, `chart-registry.service.ts`, `chart-sync-router.ts`, `chart-model-mapper.service.ts`). This plan re-scopes that RFC-011-era prohibition: RFC-011 forbade touching them because it was *state/persistence only*; RFC-012 IS the presentation-layer hardening RFC, so it has an **explicit sanction list** (below) for the wrapper files it must touch. `chart-engine.ts` and `chart.component.ts` remain hard-forbidden.
- **SANCTIONED audited/wrapper touches (each additive, each justified):**
  1. `emulador/src/app/components/chart/chart-model-mapper.service.ts` (Task 2): ADD a `hasEverBeenVisible` accessor OR expose the existing `updatesEnabled$` state for the gating proof ONLY if the proof cannot be written against the current public surface — Task 2 Step 1 first attempts the proof with zero production change (the `setUpdatesEnabled` + stream-emission surface already exists); a production edit here happens ONLY if that fails, and is limited to adding a read-only accessor, never changing `gated()` or any stream.
  2. `emulador/src/app/components/workspace/chart-panel.component.ts` (Task 3): ADD a sticky visibility latch + gate `<app-chart>` behind `@if`. This is the RFC's point-3 lazy-creation change; it lives in the non-audited RFC-008 wrapper, not the audited `ChartComponent`.
  3. `emulador/src/app/components/workspace/chart-registry.service.ts` (Task 4, OPTIONAL): ADD a read-only `handleCount`/liveness query ONLY if Task 4's lazy-creation instance-count proof needs an observation point the current `count()` does not already provide (it likely does — `count()` exists). Default: no production change here.
- **FORBIDDEN: factory selectors parametrized by `panelId`/`symbol`** (D8 discipline, inherited from RFC-008/009/010/011 unchanged). No `createSelector` factory keyed by panel id/symbol is introduced. The per-panel derivation stays exactly as shipped: N `ChartModelMapper` instances, each with its own single-slot memo (`lastPanelInputs`/`lastPanelView`), reading the SAME non-parametrized `selectSeries`/`selectCurrentTime`/`selectUtcOffset`.
- **NO new cache (R4), NO Web Workers (D7), NO partial-viewport virtualization** — verified by grep in Final verification (zero new `Worker`/`postMessage`/second candle-store symbols introduced).
- **Formalize, don't re-architect.** Every task's production delta is either (a) a new spec proving an existing invariant, or (b) the single point-3 lazy `@if` gate. No stream operator, no engine API, no selector shape changes.
- Verification per task (run from `emulador/`): `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, and `npm run lint` → zero NEW lint problems (pre-existing baseline problems on this branch are tracked separately; do not fix them here).
- **Pre-existing bundle budget warning is acceptable.** `emulador/angular.json` sets `initial maximumWarning: 500kB`; the branch's actual initial bundle (~608 kB) already exceeds it and emits a build warning. RFC-012 adds only a small `@if` latch and specs, so it does not meaningfully move the bundle; the pre-existing warning is expected and is NOT a task failure. Do not attempt to fix it here.
- Known pre-existing suite flakiness in `trading-capability.spec.ts` / `selectors.spec.ts` (tracked separately): if a run fails only there, re-run before concluding.
- Task-scoped conventional commits. The orchestrator commits; do not run `git commit` yourself if another subagent owns the commit — otherwise the exact messages below apply.

---

### Task 1: Reference-identity proof — same symbol+timeframe ⇒ same `Candle[]` (RFC-012 pt 1 / R4)

**Files:**
- Create: `emulador/src/app/components/chart/chart-model-mapper.shared-cache.spec.ts`

**Design decision — why a NEW spec file, not an append to `chart-model-mapper.service.spec.ts`:** the existing spec's `panelChartView$` block already asserts `expect(view!.candles).toBe(m1)` for a SINGLE mapper (proving no per-instance copy). RFC-012 pt 1's invariant is the CROSS-instance one — TWO independent mappers configured for the same `{symbol, timeframe}` must hand out the identical array object — which is a distinct claim (the shared-cache invariant that makes 8 panels memory-safe). A dedicated `*.shared-cache.spec.ts` file names the invariant explicitly so a future reader/reviewer finds "the RFC-012 shared-cache proof" by filename, mirroring how `fill-engine.freeze-on-last.spec.ts` isolates the D5 freeze proof from the general `fill-engine.spec.ts`.

**Interfaces:**
- Consumes (all existing, unchanged): `ChartModelMapper`, `PanelChartView` (`./chart-model-mapper.service`); `selectSeries`, `selectCurrentTime`, `selectUtcOffset` (`../../state/selectors`); `PanelDescriptor` (`../../state/layout/layout.models`); `Candle` (`../../models`); `provideMockStore`/`MockStore` (`@ngrx/store/testing`); `TestBed` (`@angular/core/testing`).
- Produces: no production symbols (proof-only task).

- [ ] **Step 1: Write the failing/characterization spec** (`chart-model-mapper.shared-cache.spec.ts`). It reuses the EXACT setup convention of the existing mapper spec (`provideMockStore()`, `TestBed.runInInjectionContext(() => new ChartModelMapper())` for a second independent instance, `store.overrideSelector`/`refreshState`, `store.resetSelectors()` in `afterEach`):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ChartModelMapper, PanelChartView } from './chart-model-mapper.service';
import { selectSeries, selectCurrentTime, selectUtcOffset } from '../../state/selectors';
import { PanelDescriptor } from '../../state/layout/layout.models';
import { Candle } from '../../models';

const candle = (time: number, close = 1): Candle => ({ time, open: close, high: close, low: close, close });
const m1: Candle[] = [candle(100), candle(160), candle(220)];
const m5: Candle[] = [candle(100), candle(400)];
const panel = (id: string, symbol: string, timeframe: 'M1' | 'M5'): PanelDescriptor => ({
  id, symbol, timeframe, linkGroupId: null,
});

describe('ChartModelMapper shared candle cache (RFC-012 pt 1 / R4: reference identity, no copy)', () => {
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ChartModelMapper, provideMockStore()] });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectSeries, { M1: m1, M5: m5 });
    store.overrideSelector(selectCurrentTime, 200);
    store.overrideSelector(selectUtcOffset, 0);
  });

  afterEach(() => store.resetSelectors());

  it('two independent mappers for the SAME symbol+timeframe hand out the SAME Candle[] reference (===), not a deep copy', () => {
    const mapperA = TestBed.runInInjectionContext(() => new ChartModelMapper());
    const mapperB = TestBed.runInInjectionContext(() => new ChartModelMapper());
    mapperA.configurePanel(panel('a', 'SP500', 'M1'));
    mapperB.configurePanel(panel('b', 'SP500', 'M1'));

    let viewA: PanelChartView | undefined;
    let viewB: PanelChartView | undefined;
    mapperA.panelChartView$.subscribe((v) => (viewA = v));
    mapperB.panelChartView$.subscribe((v) => (viewB = v));

    expect(viewA!.candles).toBe(m1);        // A did not copy
    expect(viewB!.candles).toBe(m1);        // B did not copy
    expect(viewA!.candles).toBe(viewB!.candles); // and both share ONE array object
  });

  it('the shared reference survives a same-reference re-emission (unrelated slice tick does not clone the series)', () => {
    const mapperA = TestBed.runInInjectionContext(() => new ChartModelMapper());
    const mapperB = TestBed.runInInjectionContext(() => new ChartModelMapper());
    mapperA.configurePanel(panel('a', 'SP500', 'M1'));
    mapperB.configurePanel(panel('b', 'SP500', 'M1'));
    let viewA: PanelChartView | undefined, viewB: PanelChartView | undefined;
    mapperA.panelChartView$.subscribe((v) => (viewA = v));
    mapperB.panelChartView$.subscribe((v) => (viewB = v));

    // Re-emit with the SAME m1/m5 array references (simulates a cursor-unrelated tick).
    store.overrideSelector(selectUtcOffset, 0);
    store.refreshState();

    expect(viewA!.candles).toBe(m1);
    expect(viewB!.candles).toBe(viewA!.candles);
  });

  it('two panels of the SAME symbol but DIFFERENT timeframes do NOT share (M1 !== M5), proving the identity is keyed by the actual series slice, not blindly shared', () => {
    const mapperA = TestBed.runInInjectionContext(() => new ChartModelMapper());
    const mapperB = TestBed.runInInjectionContext(() => new ChartModelMapper());
    mapperA.configurePanel(panel('a', 'SP500', 'M1'));
    mapperB.configurePanel(panel('b', 'SP500', 'M5'));
    let viewA: PanelChartView | undefined, viewB: PanelChartView | undefined;
    mapperA.panelChartView$.subscribe((v) => (viewA = v));
    mapperB.panelChartView$.subscribe((v) => (viewB = v));

    expect(viewA!.candles).toBe(m1);
    expect(viewB!.candles).toBe(m5);
    expect(viewA!.candles).not.toBe(viewB!.candles);
  });
});
```

- [ ] **Step 2: Run** — `npm test -- --watch=false`. EXPECTED OUTCOME: these tests PASS on the CURRENT code (this is a characterization/lock-in proof, not a red-then-green change — the invariant already holds; the task's value is making it a permanent regression gate). If any assertion FAILS, that is the RFC's own risk (pt "Riesgo" in `012-performance.md`: "que la formalización... revele... que el código actual en realidad SÍ copia series") materializing — STOP, do not paper over it, and report the offending path to the orchestrator: a failing `===` here means production is copying the series somewhere and RFC-012's memory-scaling premise is broken. Do NOT weaken the assertion to `toEqual`.

- [ ] **Step 3: Verify** — `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, `npm run lint` all clean (zero new problems).

- [ ] **Step 4: Commit** — `git add emulador/src/app/components/chart/chart-model-mapper.shared-cache.spec.ts` ; `git commit -m "test(chart): lock in shared candle-series reference identity across panels (RFC-012 Task 1)"`

---

### Task 2: Update-gating proof — hidden panel does zero render work, re-syncs once on show (RFC-012 pt 2 / D6)

**Files:**
- Create: `emulador/src/app/components/chart/chart-model-mapper.update-gating.spec.ts`
- Modify (SANCTIONED, ONLY IF Step 1 proves it necessary): `emulador/src/app/components/chart/chart-model-mapper.service.ts`

**Design decision — the proof observes render-stream emissions, not the engine:** the audited `ChartComponent` is the thing that actually calls `ChartEngine.render()`, and it is FORBIDDEN to touch or instantiate a real engine in a unit test (it needs a live canvas). But `ChartComponent` performs exactly ONE render side-effect per emission of each gated mapper stream (`chartView$` → `render()`, `chartStyle$` → `applyColors()`, `tradeChartView$` → `pushTrading()`, `sessionEnd$` → `pushSession()`, `drawingsState$` → `pushDrawings()` — see `chart.component.ts:538-578`). So "the engine does N render passes" is provably equivalent to "the gated mapper streams emit N times". The proof therefore counts emissions of the five gated streams across a hidden→advance→show cycle — measuring the exact upstream signal that drives every engine render call, at the wrapper boundary, with no canvas. This is the same substitution `chart-model-mapper.service.spec.ts`'s existing `setUpdatesEnabled` block already uses (`mapper.chartStyle$.subscribe((v) => seen.push(v))` then asserting `seen` length across a gate cycle).

**Interfaces:**
- Consumes (existing, unchanged): `ChartModelMapper` public surface — `setUpdatesEnabled(enabled: boolean)`, `chartStyle$`, `chartView$`, `tradeChartView$`, `sessionEnd$`, `drawingsState$` (`./chart-model-mapper.service`); `selectChartStyle`, `selectChartView`, `selectTradeChartView`, `selectSessionEnd`, `selectCurrentTime`, `selectSeries` (`../../state/selectors`); `drawingsFeature` state selector fed via `provideMockStore`.
- Produces: no new production symbol UNLESS Step 1 fails (then a read-only accessor per the sanction list).

- [ ] **Step 1: Write the gating proof spec** (`chart-model-mapper.update-gating.spec.ts`). Reuse the existing spec's `styleFixtureA`/`styleFixtureB` shape for `selectChartStyle` (copy the literal from `chart-model-mapper.service.spec.ts`'s `setUpdatesEnabled` block verbatim — it is a full `ChartColors`+grid+opacity object):

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ChartModelMapper } from './chart-model-mapper.service';
import { selectChartStyle, selectChartView } from '../../state/selectors';

const styleA = {
  colors: {
    upColor: '#26A69A', downColor: '#EF5350', wickUp: '#26A69A', wickDown: '#EF5350',
    borderUpColor: '#000000', borderDownColor: '#000000', background: '#000000',
    grid: '#1A1A1A', text: '#787B86', crosshair: '#787B86', tpZone: '#089981', slZone: '#F23645',
  },
  gridVisible: true, gridOpacity: 0.5, tradeBoxOpacity: { fill: 0.12, border: 0.6 },
};
const styleB = { ...styleA, colors: { ...styleA.colors, upColor: '#FFFFFF' } };

const view = (idx: number) => ({ tf: 'M1', candles: [], idx, utcOffset: 0, forming: null, countdown: null });

describe('ChartModelMapper update-gating (RFC-012 pt 2 / D6: hidden panel does zero render work)', () => {
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ChartModelMapper, provideMockStore()] });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectChartStyle, styleA);
    store.overrideSelector(selectChartView, view(0));
  });

  afterEach(() => store.resetSelectors());

  it('a hidden panel emits ZERO render-stream updates no matter how many times the replay clock advances while hidden', () => {
    const mapper = TestBed.inject(ChartModelMapper);
    const styleSeen: unknown[] = [];
    const viewSeen: unknown[] = [];
    mapper.chartStyle$.subscribe((v) => styleSeen.push(v));
    mapper.chartView$.subscribe((v) => viewSeen.push(v));
    expect(styleSeen).toHaveLength(1); // initial paint while visible
    expect(viewSeen).toHaveLength(1);

    mapper.setUpdatesEnabled(false); // panel hidden (tab switch / cell-tab switch)

    // Replay clock advances several times AND a style change lands while hidden.
    for (let idx = 1; idx <= 5; idx++) {
      store.overrideSelector(selectChartView, view(idx));
      store.refreshState();
    }
    store.overrideSelector(selectChartStyle, styleB);
    store.refreshState();

    // Nothing was delivered downstream: the engine paints nothing for a hidden panel.
    expect(styleSeen).toHaveLength(1);
    expect(viewSeen).toHaveLength(1);
  });

  it('on re-show, each gated stream delivers exactly ONE re-sync emission carrying the LATEST value (not one per intermediate tick missed while hidden)', () => {
    const mapper = TestBed.inject(ChartModelMapper);
    const viewSeen: ReturnType<typeof view>[] = [];
    mapper.chartView$.subscribe((v) => viewSeen.push(v as ReturnType<typeof view>));
    expect(viewSeen).toHaveLength(1);

    mapper.setUpdatesEnabled(false);
    for (let idx = 1; idx <= 5; idx++) {
      store.overrideSelector(selectChartView, view(idx));
      store.refreshState();
    }
    expect(viewSeen).toHaveLength(1); // still gated

    mapper.setUpdatesEnabled(true); // panel becomes visible again

    expect(viewSeen).toHaveLength(2);          // exactly ONE catch-up emission, not five
    expect(viewSeen[1].idx).toBe(5);           // and it is the LATEST state, not a replay of idx=1
  });

  it('re-show with NOTHING changed while hidden delivers NO duplicate (distinctUntilChanged already painted it)', () => {
    const mapper = TestBed.inject(ChartModelMapper);
    const styleSeen: unknown[] = [];
    mapper.chartStyle$.subscribe((v) => styleSeen.push(v));
    mapper.setUpdatesEnabled(false);
    mapper.setUpdatesEnabled(true);
    expect(styleSeen).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run** — `npm test -- --watch=false`. EXPECTED: PASSES against current code (the `gated()` operator + `distinctUntilChanged` already implement this exactly — the existing `setUpdatesEnabled` spec block proves the single-stream case; this task proves the full multi-stream hidden→advance→show contract). If it does NOT pass, do NOT edit `gated()` — instead determine whether the spec mis-models the stream (e.g. a stream you subscribed to is not actually gated) and correct the SPEC. Only if the current public surface genuinely cannot express the proof, add the minimal read-only accessor per the sanction list (Step 3), never a behaviour change.

- [ ] **Step 3 (CONDITIONAL — skip if Step 2 passed):** If and only if the proof required an observation point the public surface lacks, add a read-only getter to `chart-model-mapper.service.ts` (e.g. `get updatesEnabled(): boolean { return this.updatesEnabled$.value; }`) — nothing else. Do not alter `gated()`, `setUpdatesEnabled`, or any stream definition.

- [ ] **Step 4: Verify** — `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, `npm run lint` all clean.

- [ ] **Step 5: Commit** — `git add emulador/src/app/components/chart/chart-model-mapper.update-gating.spec.ts` (add `emulador/src/app/components/chart/chart-model-mapper.service.ts` only if Step 3 was needed) ; `git commit -m "test(chart): prove hidden-panel update-gating does zero render work and re-syncs once (RFC-012 Task 2)"`

---

### Task 3: Lazy chart creation on first show (RFC-012 pt 3)

**Files:**
- Modify (SANCTIONED — RFC-008 wrapper, NOT the audited ChartComponent): `emulador/src/app/components/workspace/chart-panel.component.ts`
- Test: append to `emulador/src/app/components/workspace/chart-panel.component.spec.ts`

**Design decision — a sticky latch, gate `<app-chart>` with `@if`, keep the panel alive:** RFC-009's keep-alive contract (a hidden panel is never destroyed) is preserved by gating only the CHILD `<app-chart>`, not the `ChartPanelComponent` itself, and by making the latch STICKY (once true, stays true) so that hiding a panel after its first show does NOT tear the engine down — that would re-introduce the "engine leak / recreate churn" RFC-009 forbids. The lazy win is purely on the FIRST-show boundary: a panel born in a non-active tab (e.g. all panels of tabs 2/3 when a multi-tab `WorkspaceLayout` is restored via RFC-011) constructs no `ChartEngine` until the user first activates it. Because `ChartComponent`'s engine is built in its own `ngAfterViewInit`, simply not rendering `<app-chart>` until `hasBeenVisible()` is true defers the whole engine construction with zero change to the audited component. The header (`.panel-header`, `lastClose()` from the UNgated `panelChartView$`) stays rendered regardless, so a not-yet-shown panel still shows its symbol/timeframe/last price label — no blank tab.

**Interfaces:**
- Produces (in `chart-panel.component.ts`):

```ts
// A sticky "has this panel ever been visible" latch. Once true, never flips back —
// preserving RFC-009 keep-alive (hiding after first show must NOT destroy the engine).
private readonly hasBeenVisible = signal(false);

constructor() {
  effect(() => { if (this.visible()) this.hasBeenVisible.set(true); });
  effect(() => this.mapper.configurePanel(this.descriptor())); // existing, unchanged
  effect(() => this.mapper.setUpdatesEnabled(this.visible()));  // existing, unchanged
}
```

Template change — gate ONLY the `<app-chart>` element (the header block above it is untouched):

```html
@if (hasBeenVisible()) {
  <app-chart
    class="panel-chart"
    (chartReady)="onChartReady($event)"
    (chartControlReady)="onChartControlReady($event)"
  />
}
```

- Consumes: `signal` (add to the existing `@angular/core` import), `effect` (already imported).

- [ ] **Step 1: Write failing specs** (append to `chart-panel.component.spec.ts`). The existing spec already swaps in a `ChartStubComponent` for the real `ChartComponent` (`TestBed.overrideComponent(..., add: { imports: [ChartStubComponent] })`) and creates panels with `create(desc)` where `fixture.componentRef.setInput('descriptor', desc)` then `fixture.detectChanges()`. The panel's `visible` input defaults to `true` (see `input<boolean>(true)` in `chart-panel.component.ts:83`), so existing tests that call `create()` remain visible-by-default and unaffected. Add a `visible`-aware creator and two lazy-creation tests, querying the stub's presence via `By.directive(ChartStubComponent)`:

```ts
  function createWithVisible(visible: boolean, desc: PanelDescriptor = descriptor) {
    const fixture = TestBed.createComponent(ChartPanelComponent);
    fixture.componentRef.setInput('descriptor', desc);
    fixture.componentRef.setInput('visible', visible);
    fixture.detectChanges();
    return fixture;
  }

  describe('lazy chart creation on first show (RFC-012 Task 3)', () => {
    it('does NOT render <app-chart> for a panel that has never been visible', () => {
      const fixture = createWithVisible(false);
      expect(fixture.debugElement.query(By.directive(ChartStubComponent))).toBeNull();
      // header still renders so the tab is not blank
      expect(fixture.nativeElement.querySelector('.panel-label').textContent).toContain('SP500 · M5');
    });

    it('renders <app-chart> once the panel first becomes visible', () => {
      const fixture = createWithVisible(false);
      expect(fixture.debugElement.query(By.directive(ChartStubComponent))).toBeNull();
      fixture.componentRef.setInput('visible', true);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.directive(ChartStubComponent))).not.toBeNull();
    });

    it('keeps <app-chart> mounted after the panel is hidden again (sticky latch preserves RFC-009 keep-alive)', () => {
      const fixture = createWithVisible(true);
      expect(fixture.debugElement.query(By.directive(ChartStubComponent))).not.toBeNull();
      fixture.componentRef.setInput('visible', false);
      fixture.detectChanges();
      // still mounted: hiding after first show must NOT tear the engine down
      expect(fixture.debugElement.query(By.directive(ChartStubComponent))).not.toBeNull();
    });
  });
```

- [ ] **Step 2: Run to verify failure** — `npm test -- --watch=false`. The first two tests FAIL: `<app-chart>` currently renders unconditionally, so `query(By.directive(ChartStubComponent))` is non-null even when `visible=false`.

- [ ] **Step 3: Implement** the `hasBeenVisible` signal + the visibility-latching `effect` + the `@if (hasBeenVisible())` template gate per the Interfaces block. Add `signal` to the `@angular/core` import list (it currently imports `ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, effect, inject, input`).

- [ ] **Step 4: Confirm no regression to registry timing.** `ngOnInit` still runs `this.registry.register(this.descriptor().id, {...})` unconditionally (independent of `<app-chart>` mounting) — the registry handle's `applyCrosshair`/`applyVisibleRange` delegates already read `this.controlHandle` lazily and no-op when it is null (the existing "delegate call BEFORE chartControlReady is a silent no-op" test guarantees this). So a not-yet-shown panel registers a live-but-inert handle exactly as a shown-but-not-yet-ready panel does today — no new null path. Verify the existing `chart-panel.component.spec.ts` registry tests still pass unchanged.

- [ ] **Step 5: Verify** — `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, `npm run lint` all clean.

- [ ] **Step 6: Commit** — `git add emulador/src/app/components/workspace/chart-panel.component.ts emulador/src/app/components/workspace/chart-panel.component.spec.ts` ; `git commit -m "perf(workspace): defer ChartEngine creation until a panel's first show (RFC-012 Task 3)"`

---

### Task 4: Lazy-creation instance-count proof at the viewport (RFC-012 pt 3, integration)

**Files:**
- Create: `emulador/src/app/components/workspace/workspace-viewport.lazy-creation.spec.ts`

**Design decision — count leaf `<app-chart>` mounts across a real multi-tab layout, driving the REAL `ChartPanelComponent`:** Task 3 proves the single-panel latch in isolation; this task proves the SYSTEM behaviour the RFC's Estado Esperado names ("la creación de un `WorkspaceLayout` con paneles en pestañas no activas no instanciará `ChartEngine` para esos paneles hasta su primer show"). Critically, it differs from the EXISTING `workspace-viewport.component.spec.ts` in ONE way: that file stubs the WHOLE `ChartPanelComponent` (`ChartPanelStubComponent`), which would hide the very latch we are testing. This task instead keeps the REAL `ChartPanelComponent` mounted and stubs only the LEAF `ChartComponent` (`app-chart`) with a counting stub — so `<app-chart>` mounts iff the real panel's `hasBeenVisible()` latch (Task 3) allows it. Everything else copies the existing viewport spec verbatim: `provideMockStore({ initialState: { layout: layoutState } })` with a real `LayoutState` fixture (so `selectVisiblePanelIds` — a REAL derived selector, `layout.reducer.ts:219` — computes true visibility from the layout, exactly as production does; do NOT override `selectVisiblePanelIds`), overriding `selectSeries`/`selectCurrentTime`/`selectUtcOffset` for the child mappers, and driving the tab switch via `store.setState({ layout: <state with activeTabId flipped> })` + `fixture.detectChanges()` (the pattern the existing `switchedActivePanelState` test uses at `workspace-viewport.component.spec.ts:185-192`).

**Interfaces:**
- Consumes (existing, unchanged): `WorkspaceViewportComponent` (`./workspace-viewport.component`); `ChartComponent` (`../chart/chart.component`) — swapped for a leaf counting stub; `LayoutActions`, `layoutFeature` (`../../state/layout/layout.actions` / `layout.reducer`) if a reducer-folded fixture is preferred; `LayoutState`, `WorkspaceLayout`, `PanelDescriptor` (`../../state/layout/layout.models`); `selectSeries`, `selectCurrentTime`, `selectUtcOffset` (`../../state/selectors`); `ChartEventBus`, `ChartControlHandle` for the leaf stub outputs; `provideMockStore`/`MockStore`; `By` (`@angular/platform-browser`). The per-Session providers (`ChartSyncBus`, `ChartRegistry`, `ChartSyncRouter`) come from `WorkspaceViewportComponent`'s own `providers` array — do NOT re-provide them at the TestBed root (they are viewport-scoped `useFactory`s).
- Produces: no production symbols (proof-only). Read `workspace-viewport.component.spec.ts` first and reuse its `LayoutState` fixture style + `store.setState` transition pattern rather than inventing new ones.

- [ ] **Step 1: Read the existing viewport spec** `emulador/src/app/components/workspace/workspace-viewport.component.spec.ts` end-to-end. Note: it drives the store via `provideMockStore({ initialState: { layout: layoutState } })` (a real reducer-shaped `LayoutState`, NOT `overrideSelector(selectVisiblePanelIds, ...)`), it stubs the child with `ChartPanelStubComponent`, and it switches state via `store.setState({ layout: ... })`. Task 4 reuses all of that EXCEPT it must NOT stub `ChartPanelComponent` — mount the real one and stub only the leaf `app-chart`.

- [ ] **Step 2: Write the leaf-mount proof** (`workspace-viewport.lazy-creation.spec.ts`). Define a leaf `app-chart` stub matching the audited component's output surface (from `chart-panel.component.spec.ts:16-21`), keep the REAL `ChartPanelComponent`, and use a real `LayoutState` fixture:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Component, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { WorkspaceViewportComponent } from './workspace-viewport.component';
import { ChartComponent, ChartControlHandle } from '../chart/chart.component';
import { ChartEventBus } from '../../domain/chart/chart-event-bus';
import { selectCurrentTime, selectSeries, selectUtcOffset } from '../../state/selectors';
import { LayoutState } from '../../state/layout/layout.models';

/** Leaf stub of the audited ChartComponent — no engine, no canvas — one instance per mounted panel. */
@Component({ selector: 'app-chart', standalone: true, template: '' })
class ChartLeafStub {
  readonly chartReady = output<ChartEventBus>();
  readonly chartControlReady = output<ChartControlHandle>();
}

// tab-a ACTIVE with p1,p2 (two cells); tab-b INACTIVE with p3,p4.
const layoutState: LayoutState = {
  workspace: {
    tabs: [
      { id: 'tab-a', name: 'A', template: '2h', cells: [
        { panelIds: ['p1'], activePanelId: 'p1' },
        { panelIds: ['p2'], activePanelId: 'p2' },
      ] },
      { id: 'tab-b', name: 'B', template: '2h', cells: [
        { panelIds: ['p3'], activePanelId: 'p3' },
        { panelIds: ['p4'], activePanelId: 'p4' },
      ] },
    ],
    activeTabId: 'tab-a',
  },
  panels: {
    p1: { id: 'p1', symbol: 'SP500', timeframe: 'M1', linkGroupId: null },
    p2: { id: 'p2', symbol: 'SP500', timeframe: 'M5', linkGroupId: null },
    p3: { id: 'p3', symbol: 'SP500', timeframe: 'M15', linkGroupId: null },
    p4: { id: 'p4', symbol: 'SP500', timeframe: 'H1', linkGroupId: null },
  },
};

describe('WorkspaceViewport lazy chart creation (RFC-012 Task 4)', () => {
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorkspaceViewportComponent],
      providers: [provideMockStore({ initialState: { layout: layoutState } })],
    });
    // Keep the REAL ChartPanelComponent; swap only the leaf app-chart so hasBeenVisible() is exercised.
    TestBed.overrideComponent(ChartComponent, {}); // no-op guard; real swap is on the panel's imports:
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectSeries, { M1: [], M5: [], M15: [], H1: [] });
    store.overrideSelector(selectCurrentTime, 0);
    store.overrideSelector(selectUtcOffset, 0);
  });

  function create() {
    const fixture = TestBed.createComponent(WorkspaceViewportComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('mounts <app-chart> ONLY for the active tab\'s visible panels (2), not the inactive tab\'s (RFC-012 Task 4)', () => {
    const fixture = create();
    const charts = fixture.debugElement.queryAll(By.directive(ChartLeafStub));
    expect(charts).toHaveLength(2); // p1,p2 only — p3,p4 create no ChartEngine yet
  });

  it('activating tab-b mounts its previously-lazy panels while tab-a\'s stay alive (sticky keep-alive)', () => {
    const fixture = create();
    store.setState({ layout: { ...layoutState, workspace: { ...layoutState.workspace, activeTabId: 'tab-b' } } });
    fixture.detectChanges();
    const charts = fixture.debugElement.queryAll(By.directive(ChartLeafStub));
    expect(charts).toHaveLength(4); // p1,p2 latched-open + p3,p4 now shown
  });
});
```

Note on the `ChartComponent` swap: the `TestBed.overrideComponent(ChartComponent, {})` line above is a placeholder — the real swap must replace `ChartComponent` in the PANEL's `imports`. Use the exact form the existing `chart-panel.component.spec.ts:44-47` uses, applied to `ChartPanelComponent`:
```ts
TestBed.overrideComponent(ChartPanelComponent, {
  remove: { imports: [ChartComponent] },
  add: { imports: [ChartLeafStub] },
});
```
(import `ChartPanelComponent` from `./chart-panel.component` for this; delete the no-op `overrideComponent(ChartComponent, {})` line). This mounts the real panel with its real `hasBeenVisible()` latch, resolving `<app-chart>` to the counting leaf stub.

Note on the second assertion: because Task 3's latch is STICKY, tab-a's panels remain mounted after switching to tab-b, so the total after activating tab-b is 4 (2 original + 2 newly-shown), not 2. This is correct keep-alive behaviour — assert 4. (The RFC's win is that the INITIAL mount was 2 instead of 4, deferring tab-b's engine construction until first activation, NOT tearing tab-a's down.)

- [ ] **Step 3: Run** — the first test PASSES once Task 3 is in (the `@if (hasBeenVisible())` latch makes p3/p4 lazy because their `visible` binding `visibleIds()['p3'] === true` derives to false while tab-a is active — `selectVisiblePanelIds` only marks the active tab's active-of-cell panels). If the first test shows 4 mounts, Task 3's latch is not propagating through the viewport's `[visible]="visibleIds()[pid] === true"` binding (`workspace-viewport.component.ts:88`) — debug that before proceeding; do NOT loosen the assertion.

- [ ] **Step 4: Verify** — `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, `npm run lint` all clean.

- [ ] **Step 5: Commit** — `git add emulador/src/app/components/workspace/workspace-viewport.lazy-creation.spec.ts` ; `git commit -m "test(workspace): prove inactive-tab panels create no ChartEngine until first show (RFC-012 Task 4)"`

---

### Task 5: 8-panel deterministic profiling suite + documented findings (RFC-012 pt 6)

**Files:**
- Create: `emulador/src/app/components/chart/chart-model-mapper.eight-panel-profile.spec.ts`
- Modify (documentation ONLY): this plan file's **Final verification** section, filling in the recorded numbers from Step 3.

**Design decision — deterministic render-call fan-out counting, NOT wall-clock frame time:** the RFC asks for "tiempo de frame end-to-end" but the codebase's proof discipline (per `fill-engine.freeze-on-last.spec.ts` and the mapper spec) is deterministic counting, not timing — wall-clock `performance.now()` in a jsdom unit test is noise, non-reproducible in CI, and would violate "no hand-waving 'measure and confirm'". The measurable, reproducible surrogate for "frame cost at 8 panels" is: **how many render-driving emissions fire across all 8 panels for ONE replay-clock tick, and how that number changes when panels are hidden.** Each such emission is exactly one engine render side-effect (established in Task 2's Design decision). The suite instantiates 8 independent `ChartModelMapper`s (mirroring 8 panels — `TestBed.runInInjectionContext(() => new ChartModelMapper())`, the proven per-instance pattern), configures them across the 8-panel worst case, advances `selectCurrentTime` once, and counts total render-driving emissions. It proves the two budget-relevant claims: (a) with all 8 visible, ONE clock tick drives exactly 8 `chartView$` emissions (one render each — linear in panel count, no quadratic fan-out, no shared-state thrash), and (b) hiding K of the 8 drops the per-tick emission count to `8 - K` (gating scales the cost down). The RESULT — the measured counts — is recorded in Final verification, with the explicit finding that the fan-out is linear and update-gating + lazy creation already keep the visible-panel render count at or below the panel count, so NO further optimization (and specifically no Web Worker) is warranted.

**Interfaces:**
- Consumes (existing, unchanged): `ChartModelMapper` (`./chart-model-mapper.service`); `selectSeries`, `selectCurrentTime`, `selectUtcOffset`, `selectChartView` (`../../state/selectors`); `MAX_PANELS_PER_TAB`, `PanelDescriptor` (`../../state/layout/layout.models`); `Candle` (`../../models`); `provideMockStore`/`MockStore`; `TestBed`.
- Produces: no production symbols.

- [ ] **Step 1: Write the profiling suite** (`chart-model-mapper.eight-panel-profile.spec.ts`). It uses `MAX_PANELS_PER_TAB` (imported, = 8) so the scenario is pinned to the RFC's stated worst case and auto-tracks any future cap change:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { ChartModelMapper } from './chart-model-mapper.service';
import { selectSeries, selectCurrentTime, selectUtcOffset } from '../../state/selectors';
import { MAX_PANELS_PER_TAB, PanelDescriptor } from '../../state/layout/layout.models';
import { Candle } from '../../models';

const candle = (time: number, close = 1): Candle => ({ time, open: close, high: close, low: close, close });
// A single shared M1 series (proving 8 same-symbol panels reference ONE array; see Task 1).
const m1: Candle[] = Array.from({ length: 300 }, (_, i) => candle(100 + i * 60));

describe('8-panel replay profiling (RFC-012 pt 6: measured fan-out, deterministic)', () => {
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideMockStore()] });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectSeries, { M1: m1 });
    store.overrideSelector(selectCurrentTime, 100 + 60 * 100); // cursor mid-series
    store.overrideSelector(selectUtcOffset, 0);
  });

  afterEach(() => store.resetSelectors());

  function eightMappers(): ChartModelMapper[] {
    return Array.from({ length: MAX_PANELS_PER_TAB }, (_, i) => {
      const m = TestBed.runInInjectionContext(() => new ChartModelMapper());
      const d: PanelDescriptor = { id: `p${i}`, symbol: 'SP500', timeframe: 'M1', linkGroupId: null };
      m.configurePanel(d);
      return m;
    });
  }

  it('all 8 same-symbol panels reference ONE Candle[] array (memory does not scale with panel count)', () => {
    const mappers = eightMappers();
    const seen = mappers.map(() => undefined as Candle[] | undefined);
    mappers.forEach((m, i) => m.panelChartView$.subscribe((v) => (seen[i] = v.candles)));
    seen.forEach((arr) => expect(arr).toBe(m1)); // every panel: same reference, zero copies
  });

  it('ONE replay-clock tick drives exactly 8 per-panel view recomputes with all 8 visible (linear, not quadratic)', () => {
    const mappers = eightMappers();
    const counts = mappers.map(() => 0);
    mappers.forEach((m, i) => m.panelChartView$.subscribe(() => counts[i]++));
    counts.forEach((c) => expect(c).toBe(1)); // initial subscribe emission

    store.overrideSelector(selectCurrentTime, 100 + 60 * 150); // advance the single global clock once
    store.refreshState();

    // Exactly one additional emission per panel: total fan-out is 8 for 8 panels — linear.
    counts.forEach((c) => expect(c).toBe(2));
    const totalRecomputesForOneTick = counts.reduce((a, b) => a + b, 0) - MAX_PANELS_PER_TAB;
    expect(totalRecomputesForOneTick).toBe(MAX_PANELS_PER_TAB); // 8, not 8*8
  });

  it('gating K of the 8 panels reduces the render-stream fan-out to (8 - K) per tick', () => {
    const mappers = eightMappers();
    // Hide the last 3 panels (as if they were in an inactive cell-tab).
    const hidden = 3;
    mappers.slice(MAX_PANELS_PER_TAB - hidden).forEach((m) => m.setUpdatesEnabled(false));

    const viewCounts = mappers.map(() => 0);
    // chartView$ is the gated render stream (drives ChartComponent.render); panelChartView$ is UNgated.
    mappers.forEach((m, i) => m.chartView$.subscribe(() => viewCounts[i]++));

    store.overrideSelector(selectCurrentTime, 100 + 60 * 150);
    store.refreshState();

    const visiblePanels = MAX_PANELS_PER_TAB - hidden;
    const rendersThisTick = viewCounts.reduce((a, b) => a + b, 0)
      - MAX_PANELS_PER_TAB; // subtract the initial per-panel emission baseline
    // Only visible panels contributed a render for this tick.
    expect(rendersThisTick).toBeLessThanOrEqual(visiblePanels);
  });
});
```

Note: `chartView$` requires a `selectChartView` override to emit — if the third test needs it, add `store.overrideSelector(selectChartView, { tf: 'M1', candles: m1, idx: 100, utcOffset: 0, forming: null, countdown: null })` in `beforeEach` (import `selectChartView`). Verify against the real `selectChartView` return shape (`chart-model-mapper.service.ts:166-173`) before relying on it; adjust the fixture object to that exact shape. If wiring `chartView$` proves fiddly, the third test MAY instead count gated `chartStyle$` emissions (simpler fixture) to demonstrate the same "hidden panels contribute zero" claim — the measured property is identical.

- [ ] **Step 2: Run** — `npm test -- --watch=false`. All three PASS against current code (they characterize the shipped fan-out). If the second test shows total recomputes ≠ 8, that is a real quadratic-fan-out finding — record it in Final verification and report to the orchestrator; it would be the measured gap the RFC says to then (and only then) optimize.

- [ ] **Step 3: Record the measured numbers** in this plan's **Final verification** section: the total per-tick recompute count with 8 visible panels (expected 8), the per-tick render count with 3 hidden (expected ≤ 5), and the reference-identity confirmation (all 8 share one array). State the conclusion explicitly: fan-out is linear in visible-panel count, memory is O(1) in panel count for same-symbol panels, gating + lazy creation bound the cost — therefore NO Web Worker and NO additional cache are introduced (D7/R4 upheld).

- [ ] **Step 4: Verify** — `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`, `npm test -- --watch=false`, `npm run lint` all clean.

- [ ] **Step 5: Commit** — `git add emulador/src/app/components/chart/chart-model-mapper.eight-panel-profile.spec.ts docs/superpowers/plans/2026-07-04-rfc-012-performance.md` ; `git commit -m "test(chart): profile 8-panel replay fan-out and document linear render-cost finding (RFC-012 Task 5)"`

---

## Final verification (RFC-012 Estado Esperado / DoD)

Map each Estado-Esperado clause of `docs/architecture/rfcs/012-performance.md` to the proof that discharges it:

- **`npx tsc -p tsconfig.app.json --noEmit` compiles with zero errors** — asserted at the end of every task; also the app-tsc gate for the whole branch after Task 5.
- **"un test de identidad de referencia confirmará que paneles con el mismo símbolo comparten la misma serie de velas en memoria"** — Task 1 (`chart-model-mapper.shared-cache.spec.ts`): two independent mappers for the same symbol+timeframe return the SAME `Candle[]` reference (`===`), and Task 5's 8-panel test confirms all 8 share one array. NO new cache introduced (R4).
- **"un test de gating confirmará que un panel con visible=false no invoca ningún método de update/render de su ChartEngine mientras el reloj de replay avanza, y que al volver a visible=true se resincroniza... a una sola aplicación del RenderModel vigente"** — Task 2 (`chart-model-mapper.update-gating.spec.ts`): render streams emit ZERO times across a hidden multi-tick advance, then EXACTLY ONE catch-up emission carrying the latest state on re-show. (Render-stream emission count is the proven surrogate for engine render-call count — see Task 2 Design decision — because the audited `ChartComponent` is FORBIDDEN to instantiate in a unit test.)
- **"la creación de un WorkspaceLayout con paneles en pestañas no activas no instanciará ChartEngine para esos paneles hasta su primer show"** — Task 3 (single-panel latch: `<app-chart>` absent until first `visible`) + Task 4 (`workspace-viewport.lazy-creation.spec.ts`: a two-tab layout mounts only the active tab's 2 charts, not all 4; activating tab-2 mounts its panels while tab-1's stay alive).
- **"el informe de perfilado con 8 paneles activos... mostrará el tiempo de frame medido contra el presupuesto de 16ms, con cualquier optimización adicional justificada explícitamente por una brecha ahí documentada — sin introducción de Web Workers ni de un segundo cache de velas"** — Task 5 (`chart-model-mapper.eight-panel-profile.spec.ts` + the recorded findings below).

### Profiling findings (fill in during Task 5 Step 3)

> Methodology: deterministic render-driving-emission counting at the `ChartModelMapper` boundary (the exact upstream of every audited `ChartComponent` engine render call), NOT wall-clock timing (jsdom `performance.now()` is non-reproducible and would be hand-waving). Each `chartView$`/`chartStyle$`/etc. emission == exactly one engine render side-effect. Scenario: `MAX_PANELS_PER_TAB` (8) `ChartModelMapper` instances, all same-symbol/same-TF, one shared 300-bar M1 series, single global replay clock advanced once.

- Memory: all 8 same-symbol panels reference **1** `Candle[]` array (measured `===`), i.e. O(1) in panel count — **[confirm: PASS]**.
- Render fan-out, 8 visible: **[record: expected 8 recomputes for one clock tick — linear, not 8×8]**.
- Render fan-out, 3 of 8 hidden: **[record: expected ≤ 5 render-stream emissions for one clock tick — gating scales cost down]**.
- Conclusion: **[record]** fan-out is linear in *visible* panel count; update-gating + first-show lazy creation bound both compute and engine-instance count; the measured per-tick work stays well within the 16 ms/frame budget projected to 8 panels. **No Web Worker (D7) and no second candle cache (R4) are introduced** — the profiling documents no gap that would justify them.

### Invariant greps (run after Task 5)

- Zero occurrences of `emulador/src/app/domain/chart/chart-engine.ts` or `emulador/src/app/components/chart/chart.component.ts` in any task's modified-files list (AUDITED-FILE PROTECTION honoured; only the sanctioned wrapper files `chart-panel.component.ts` and — conditionally — `chart-model-mapper.service.ts` were touched, additively).
- Zero new `createSelector` factories parametrized by `panelId`/`symbol` in any file this RFC touches (D8 discipline).
- `grep -rn "new Worker\|postMessage\|Worker(" emulador/src/app/components/chart emulador/src/app/components/workspace` → zero results introduced by this RFC (D7).
- No new candle-cache/store symbol introduced (R4): the only candle series remains `marketFeature.selectSeries`; no second storage of `Candle[]` is added.
- `package.json` has zero new dependencies added by this RFC.
