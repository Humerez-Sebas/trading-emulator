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
//
// FIX-LOOP REVISION (RFC-010 Task 3 audit, High finding): the original stub's
// `librarySelfFiresOnProgrammaticCalls` mode fired the range callback SYNCHRONOUSLY inside
// `setVisibleLogicalRange`, which does not match lightweight-charts v5.2's real behaviour —
// traced through node_modules/lightweight-charts/dist/lightweight-charts.development.mjs,
// `setVisibleLogicalRange` only schedules a `requestAnimationFrame`; the range-changed delegate
// actually fires on the NEXT frame, never synchronously. The stub now defers the range echo via
// `queueMicrotask` (standing in for "some later tick", timing-independent of the synchronous
// `applyingSync` flag), and tests that need the echo `await flushEcho()` to observe it. Crosshair
// is unaffected: the library's real `setCrosshairPosition` passes `skipEvent=true` internally, so
// it never invokes `subscribeCrosshairMove` as a side effect of a programmatic call at all — the
// crosshair stub's synchronous self-fire mode is a worst-case simulation kept only to pin
// `applyingSync` as defense-in-depth, not a model of real timing.
const { chartStub, getCrosshairCb, getRangeCb, setSelfFires, reset, flushEcho } = vi.hoisted(() => {
  let crosshairCb: ((p: unknown) => void) | undefined;
  let rangeCb: ((r: unknown) => void) | undefined;
  /**
   * When true, `setCrosshairPosition` synchronously invokes `subscribeCrosshairMove` BEFORE
   * returning — simulating the (undocumented, version-dependent) possibility that
   * `lightweight-charts` itself re-fires the crosshair delegate as a side effect of a
   * PROGRAMMATIC call. Kept for the crosshair regression test as defense-in-depth for
   * `applyingSync`; NOT used to model range timing (see file header).
   */
  let librarySelfFiresOnProgrammaticCalls = false;

  /**
   * Pending same-frame-coalesced range echo, flushed by `flushEcho()` (stands in for the next
   * RAF/tick). Traced against node_modules/lightweight-charts/dist/lightweight-charts.development.mjs
   * (`_invalidateHandler`): the real library MERGES every invalidation raised before the next
   * `requestAnimationFrame` fires into a single mask and schedules at most ONE RAF per draw cycle
   * (`if (!this._private__drawPlanned) { ... requestAnimationFrame(...) }`) — repeated
   * `setVisibleLogicalRange` calls within the same tick do NOT each get their own downstream
   * range-changed callback; only the last-applied value survives to the single coalesced draw.
   * Modeled here as one pending slot (last-write-wins) rather than a queue.
   */
  let pendingRangeEcho: (() => void) | undefined;

  const timeScaleStub = {
    subscribeVisibleLogicalRangeChange: (cb: (r: unknown) => void) => {
      rangeCb = cb;
    },
    setVisibleLogicalRange: vi.fn((r: unknown) => {
      // Real lightweight-charts v5.2 behaviour: the range-changed delegate fires on the NEXT
      // animation frame, never synchronously, and same-frame calls coalesce into that ONE frame
      // (see the doc above) — so this overwrites any not-yet-flushed pending echo instead of
      // queuing an additional one.
      pendingRangeEcho = () => rangeCb?.(r);
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
      pendingRangeEcho = undefined;
    },
    /** Flushes the pending (same-frame-coalesced) range echo, if any. */
    flushEcho: async () => {
      const toRun = pendingRangeEcho;
      pendingRangeEcho = undefined;
      toRun?.();
      // let any microtasks the callback itself queues settle too
      await Promise.resolve();
    },
  };
});

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>();
  return { ...actual, createChart: vi.fn(() => chartStub) };
});

/** Resets captured callbacks and mock call history before each test; `selfFires` controls the worst-case crosshair simulation above. */
function stubChart(selfFires = false) {
  reset();
  setSelfFires(selfFires);
  vi.clearAllMocks();
  return {
    chart: chartStub,
    fireCrosshair: () => getCrosshairCb()?.({}),
    /** Fires a genuinely user-originated range event directly (bypassing setVisibleLogicalRange's deferred-echo queue) — models a real user drag/scroll on the timescale, i.e. NOT preceded by an apply. */
    fireRange: (payload: unknown = null) => getRangeCb()?.(payload),
    flushEcho,
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
    // Note: in the REAL library this scenario cannot occur at all — setCrosshairPosition passes
    // skipEvent=true internally, so subscribeCrosshairMove is never invoked as a side effect of a
    // programmatic call. This test pins applyingSync as defense-in-depth for a hypothetical the
    // library does not actually exhibit.
  });

  it('a genuine user-driven crosshair move (NOT inside an apply call) still emits normally', () => {
    const { fireCrosshair } = stubChart();
    const engine = new ChartEngine(document.createElement('div'));
    const seen: unknown[] = [];
    engine.events.on('CrosshairMoved', (p) => seen.push(p));
    fireCrosshair(); // no apply in progress: this is what a real user drag looks like
    expect(seen).toHaveLength(1);
  });

  describe('applyVisibleRange echo suppression under DEFERRED (next-frame) echo timing', () => {
    it('(a) programmatic apply -> chart API called with the range -> after the deferred echo fires -> NO bus emission', async () => {
      const { chart, flushEcho } = stubChart();
      const engine = new ChartEngine(document.createElement('div'));
      const seen: unknown[] = [];
      engine.events.on('VisibleRangeChanged', (r) => seen.push(r));

      engine.applyVisibleRange({ from: 0, to: 10 } as never);
      expect(chart.timeScale().setVisibleLogicalRange).toHaveBeenCalledWith({ from: 0, to: 10 });
      expect(seen).toEqual([]); // nothing yet: echo hasn't arrived (deferred)

      await flushEcho(); // the "next frame" arrives; the stub fires rangeCb now, well after applyingSync unwound

      expect(seen).toEqual([]); // still nothing: one-shot suppression consumed the echo
    });

    it('(b) a deferred echo whose value was ADJUSTED by the library (different {from,to} than applied) still causes NO bus emission — one-shot suppression is value-independent', () => {
      const { flushEcho } = stubChart();
      void flushEcho; // not used in this test: the echo is fired directly below to control its payload
      const engine = new ChartEngine(document.createElement('div'));
      const seen: unknown[] = [];
      engine.events.on('VisibleRangeChanged', (r) => seen.push(r));

      engine.applyVisibleRange({ from: 0, to: 10 } as never);
      // Simulate the library's internal barSpacing/clamping/rounding round-trip producing a
      // fractionally different value than what was applied, fired directly through the captured
      // range callback rather than replaying the (unadjusted) queued echo.
      getRangeCb()?.({ from: 0.000001, to: 9.999998 });

      expect(seen).toEqual([]); // suppressed regardless of value mismatch
    });

    it('(c) a genuinely user-originated range event (NO preceding apply) still emits on the bus', () => {
      const { fireRange } = stubChart();
      const engine = new ChartEngine(document.createElement('div'));
      const seen: unknown[] = [];
      engine.events.on('VisibleRangeChanged', (r) => seen.push(r));

      fireRange({ from: 5, to: 15 }); // no apply in progress: a real user scroll/zoom

      expect(seen).toEqual([{ from: 5, to: 15 }]);
    });

    it('(d) after one suppressed echo, a SECOND user-originated event also emits (the one-shot flag cleared)', async () => {
      const { fireRange, flushEcho } = stubChart();
      const engine = new ChartEngine(document.createElement('div'));
      const seen: unknown[] = [];
      engine.events.on('VisibleRangeChanged', (r) => seen.push(r));

      engine.applyVisibleRange({ from: 0, to: 10 } as never);
      await flushEcho(); // consumes the one-shot suppression
      expect(seen).toEqual([]);

      fireRange({ from: 20, to: 30 }); // genuine user event after the echo was consumed

      expect(seen).toEqual([{ from: 20, to: 30 }]);
    });

    it('(e) exception thrown by setVisibleLogicalRange clears the pending one-shot flag so subsequent user-originated events still emit (no permanent mute)', () => {
      const { chart, fireRange } = stubChart();
      const engine = new ChartEngine(document.createElement('div'));
      const seen: unknown[] = [];
      engine.events.on('VisibleRangeChanged', (r) => seen.push(r));

      (chart.timeScale().setVisibleLogicalRange as ReturnType<typeof vi.fn>).mockImplementationOnce(
        () => {
          throw new Error('boom');
        },
      );

      expect(() => engine.applyVisibleRange({ from: 0, to: 10 } as never)).toThrow('boom');

      // No echo will ever arrive for the throwing call. If the one-shot flag were left armed, the
      // NEXT genuine user-originated event would be incorrectly swallowed by it.
      fireRange({ from: 1, to: 2 });

      expect(seen).toEqual([{ from: 1, to: 2 }]);
    });

    // RFC-010 Task 5 (folded from the Task 3 fix-loop re-audit's residual-risk list, since a real
    // RAF is not available at the router/viewport spec level — these three exercise ChartEngine's
    // one-shot suppression directly against the deferred-echo stub already established above).

    it('(i) RFC-010 Task 5: two rapid applyVisibleRange calls followed by ONE coalesced echo (as lightweight-charts does for same-frame invalidations) still cause NO leaked bus emission', async () => {
      const { chart, flushEcho } = stubChart();
      const engine = new ChartEngine(document.createElement('div'));
      const seen: unknown[] = [];
      engine.events.on('VisibleRangeChanged', (r) => seen.push(r));

      // Two rapid programmatic applies within the same frame — the stub queues one pending echo
      // per call, but the one-shot flag is armed (not counted) once per apply, so the SECOND
      // apply re-arms it even though the first echo hasn't fired yet.
      engine.applyVisibleRange({ from: 0, to: 10 } as never);
      engine.applyVisibleRange({ from: 5, to: 15 } as never);
      expect(chart.timeScale().setVisibleLogicalRange).toHaveBeenCalledTimes(2);

      // The library coalesces same-frame invalidations into a single next-frame callback in
      // practice; model that here as ONE flushed echo carrying the latest applied value.
      await flushEcho();

      expect(seen).toEqual([]); // no bus emission leaked from either apply's echo
    });

    it('(ii) RFC-010 Task 5: a genuine user range event racing the echo window (fired BETWEEN an apply and its deferred echo) converges — bounded emissions, no sustained oscillation', async () => {
      const { flushEcho } = stubChart();
      const engine = new ChartEngine(document.createElement('div'));
      const seen: unknown[] = [];
      engine.events.on('VisibleRangeChanged', (r) => seen.push(r));

      engine.applyVisibleRange({ from: 0, to: 10 } as never); // programmatic apply arms the one-shot suppressor
      // A genuine user drag/zoom races in BEFORE the apply's own echo arrives. The one-shot flag
      // cannot distinguish "the apply's own echo" from "an unrelated event that happens to arrive
      // first" — by design it consumes whichever range-changed callback fires FIRST after the
      // apply. Here that is the racing user event, so it is (incorrectly, but boundedly) swallowed:
      getRangeCb()?.({ from: 2, to: 12 }); // the racing user event, arrives first — consumes the one-shot flag
      expect(seen).toEqual([]); // swallowed: indistinguishable from the apply's own echo at this layer

      // The apply's OWN queued echo then arrives (this stub's deferred queue, standing in for the
      // real RAF) — the one-shot flag was already spent by the race above, so this echo is no
      // longer suppressed and leaks through once:
      await flushEcho();
      expect(seen).toEqual([{ from: 0, to: 10 }]); // one bounded leak, not a cascade — see convergence below

      // Bounded, not unbounded: exactly one extra emission resulted from the race, never more.
      expect(seen.length).toBe(1);

      // Convergence: the NEXT genuine user event (after the race has settled and the one-shot
      // flag is spent) emits normally — the exchange did not leave the engine permanently stuck
      // suppressing, nor did it enter a sustained oscillation (no further swallows, no repeats).
      getRangeCb()?.({ from: 20, to: 30 });
      expect(seen).toEqual([
        { from: 0, to: 10 },
        { from: 20, to: 30 },
      ]);
    });

    it('(iii) RFC-010 Task 5: a no-value-change apply that the library does not echo at all consumes the NEXT user event (documented Low); the event AFTER that emits again (self-healing)', () => {
      const engine = new ChartEngine(document.createElement('div'));
      const seen: unknown[] = [];
      engine.events.on('VisibleRangeChanged', (r) => seen.push(r));

      // Applying a range that is already the current one: the real library may not fire ANY
      // range-changed callback at all (nothing actually changed), so the armed one-shot flag is
      // never consumed by an echo — it stays armed until the next callback of any origin.
      engine.applyVisibleRange({ from: 0, to: 10 } as never);
      // No echo arrives (simulating the library's no-op case). The armed flag is still pending.

      getRangeCb()?.({ from: 0, to: 10 } as never); // the NEXT event — a genuine user nudge — is swallowed instead
      expect(seen).toEqual([]); // documented Low: this one genuine event is incorrectly consumed

      getRangeCb()?.({ from: 30, to: 40 }); // self-healing: the event AFTER that is unaffected
      expect(seen).toEqual([{ from: 30, to: 40 }]);
    });
  });
});
