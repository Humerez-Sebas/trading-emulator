import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChartEngine as ChartEngineType } from './chart-engine';

// `chart-engine.ts` imports `createChart` as a NAMED import from 'lightweight-charts'; the
// reliable way to stub a named export under Vitest's ESM handling is `vi.mock` with a factory
// (a bare `vi.spyOn` on a `* as lwc` namespace import is not guaranteed to intercept a named
// import bound at module-load time in every bundler/transform combination this repo's Vite
// config might use — `vi.mock` sidesteps that entirely).
//
// DEVIATION from the plan's literal listing (recorded in the Task 3 report): the plan's
// version of this file declared `crosshairCb`/`rangeCb`/`chartStub`/etc. as plain top-level
// `let`/`const`s referenced from the `vi.mock` factory. Under THIS repo's Angular unit-test
// builder, `vi.mock` calls are hoisted above every other module-level statement (same
// mechanism documented in `trading-capability.spec.ts`'s file-level comment), so the factory
// closed over bindings still in their temporal dead zone and threw
// "Cannot access '__vi_import_3__' before initialization". Fixed the same way that file already
// established as house convention: (1) build every stub inside `vi.hoisted(...)`, so they exist
// before the (hoisted) `vi.mock` factory runs, and (2) import the SUT (`ChartEngine`) dynamically
// inside `beforeEach`, after `vi.resetModules()`, so it evaluates after optimizeDeps settles
// instead of racing it at file-load time. Test bodies/assertions are otherwise unchanged from
// the plan.
const {
  chartStub,
  getCrosshairCb,
  getRangeCb,
  setSelfFires,
  reset,
} = vi.hoisted(() => {
  let crosshairCb: ((p: unknown) => void) | undefined;
  let rangeCb: ((r: unknown) => void) | undefined;
  /**
   * When true, `setCrosshairPosition`/`setVisibleLogicalRange` synchronously invoke their
   * matching subscribed callback BEFORE returning — simulating the (undocumented,
   * version-dependent) possibility that `lightweight-charts` itself re-fires
   * `subscribeCrosshairMove`/`subscribeVisibleLogicalRangeChange` as a side effect of a
   * PROGRAMMATIC call, which is exactly the risk `ChartEngine.applyingSync` guards against.
   * Off by default so the "delegates to..." tests stay simple; the two "regression" tests below
   * turn it on to exercise the guard under that worst-case assumption.
   */
  let librarySelfFiresOnProgrammaticCalls = false;

  const timeScaleStub = {
    subscribeVisibleLogicalRangeChange: (cb: (r: unknown) => void) => {
      rangeCb = cb;
    },
    setVisibleLogicalRange: vi.fn((r: unknown) => {
      if (librarySelfFiresOnProgrammaticCalls) rangeCb?.(r);
    }),
  };
  const seriesStub = {
    applyOptions: vi.fn(),
    setData: vi.fn(),
    priceScale: () => ({ applyOptions: vi.fn() }),
  };
  const chartStub = {
    subscribeClick: vi.fn(),
    subscribeDblClick: vi.fn(),
    subscribeCrosshairMove: (cb: (p: unknown) => void) => {
      crosshairCb = cb;
    },
    timeScale: () => timeScaleStub,
    addSeries: () => seriesStub,
    applyOptions: vi.fn(),
    setCrosshairPosition: vi.fn((price: number, time: unknown) => {
      if (librarySelfFiresOnProgrammaticCalls) crosshairCb?.({ time });
    }),
    clearCrosshairPosition: vi.fn(),
    remove: vi.fn(),
  };

  return {
    chartStub,
    getCrosshairCb: () => crosshairCb,
    getRangeCb: () => rangeCb,
    setSelfFires: (v: boolean) => {
      librarySelfFiresOnProgrammaticCalls = v;
    },
    reset: () => {
      crosshairCb = undefined;
      rangeCb = undefined;
      librarySelfFiresOnProgrammaticCalls = false;
    },
  };
});

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>();
  return { ...actual, createChart: vi.fn(() => chartStub) };
});

/** Resets captured callbacks and mock call history before each test; `selfFires` controls the worst-case simulation above. */
function stubChart(selfFires = false) {
  reset();
  setSelfFires(selfFires);
  vi.clearAllMocks();
  return {
    chart: chartStub,
    fireCrosshair: () => getCrosshairCb()?.({}),
    fireRange: () => getRangeCb()?.(null),
  };
}

describe('ChartEngine.applyCrosshair/applyVisibleRange (RFC-010 Task 3)', () => {
  let ChartEngine: typeof ChartEngineType;

  beforeEach(async () => {
    // Import the SUT HERE rather than at module scope — see the file-level comment above
    // (same discipline as trading-capability.spec.ts): avoids racing vitest's optimizeDeps
    // step under a cold `node_modules/.vite` cache, which could let the real
    // `lightweight-charts` win over this mock.
    vi.resetModules();
    ({ ChartEngine } = await import('./chart-engine'));
  });

  it('applyCrosshair delegates to chartApi.setCrosshairPosition / clearCrosshairPosition', () => {
    const { chart } = stubChart();
    const engine = new ChartEngine(document.createElement('div'));
    engine.applyCrosshair(1000 as never);
    expect(chart.setCrosshairPosition).toHaveBeenCalled();
    engine.applyCrosshair(null);
    expect(chart.clearCrosshairPosition).toHaveBeenCalled();
  });

  it('applyVisibleRange delegates to timeScale().setVisibleLogicalRange; null is a no-op', () => {
    const { chart } = stubChart();
    const engine = new ChartEngine(document.createElement('div'));
    engine.applyVisibleRange({ from: 0, to: 10 } as never);
    expect(chart.timeScale().setVisibleLogicalRange).toHaveBeenCalledWith({ from: 0, to: 10 });
    engine.applyVisibleRange(null);
    expect(chart.timeScale().setVisibleLogicalRange).toHaveBeenCalledTimes(1); // still 1: null guarded
  });

  it('regression: even if lightweight-charts self-fires subscribeCrosshairMove DURING a programmatic setCrosshairPosition (worst case), the engine suppresses that emission (feedback-loop guard)', () => {
    stubChart(true); // simulate the library re-firing synchronously inside the programmatic call
    const engine = new ChartEngine(document.createElement('div'));
    const seen: unknown[] = [];
    engine.events.on('CrosshairMoved', (p) => seen.push(p));
    engine.applyCrosshair(1000 as never); // triggers the stub's synchronous self-fire internally
    expect(seen).toEqual([]); // guarded: suppressed because it happened synchronously during our own applyCrosshair
  });

  it('regression: even if lightweight-charts self-fires subscribeVisibleLogicalRangeChange DURING a programmatic setVisibleLogicalRange (worst case), the engine suppresses that emission', () => {
    stubChart(true);
    const engine = new ChartEngine(document.createElement('div'));
    const seen: unknown[] = [];
    engine.events.on('VisibleRangeChanged', (r) => seen.push(r));
    engine.applyVisibleRange({ from: 0, to: 10 } as never); // triggers the stub's synchronous self-fire internally
    expect(seen).toEqual([]);
  });

  it('a genuine user-driven crosshair move (NOT inside an apply call) still emits normally', () => {
    const { fireCrosshair } = stubChart();
    const engine = new ChartEngine(document.createElement('div'));
    const seen: unknown[] = [];
    engine.events.on('CrosshairMoved', (p) => seen.push(p));
    fireCrosshair(); // no apply in progress: this is what a real user drag looks like
    expect(seen).toHaveLength(1);
  });
});
