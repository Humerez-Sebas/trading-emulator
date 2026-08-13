import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChartEngine as ChartEngineType } from './chart-engine';
import type { IChartApi } from 'lightweight-charts';
import type { Capability } from './capability';
import { ChartEventBus } from './chart-event-bus';
import type { RenderModel } from './render-model';

/**
 * RFC-004/RFC-005 — the narrow engine contract that replaced the `chartApi` / `seriesApi`
 * migration-bridge getters.
 *
 * A NEW file, not additions to `chart-engine.spec.ts`: that spec is pre-existing authority
 * (PHILOSOPHY §5.7, the STOP rule) and its stub is tuned for the RFC-010 echo-suppression
 * tests. The `vi.hoisted` + bare-specifier `vi.mock` + import-SUT-inside-`beforeEach`
 * harness is the house convention that file established (its header explains why: `vi.mock`
 * factories hoist above module-level statements, and a module-scope SUT import races
 * vitest's optimizeDeps step under `isolate: false`).
 *
 * WHAT THIS FILE IS FOR. Two things, and they are different:
 *   1. Each new method delegates to the right library call with the right arguments.
 *   2. `shiftVisibleRange` and `applyVisibleRange` have DIFFERENT echo semantics, and that
 *      difference is load-bearing. Collapsing the former into the latter (the obvious
 *      "simplification") is a real behaviour change and must fail here.
 */
const { chartStub, timeScaleStub, seriesStub, getRangeCb, reset, flushEcho } = vi.hoisted(() => {
  let rangeCb: ((r: unknown) => void) | undefined;
  let pendingRangeEcho: (() => void) | undefined;

  const timeScaleStub = {
    subscribeVisibleLogicalRangeChange: (cb: (r: unknown) => void) => {
      rangeCb = cb;
    },
    // Real v5.2 timing: the range-changed delegate fires on the NEXT animation frame, and
    // same-frame calls coalesce into one. Modelled as a single last-write-wins slot, the same
    // way chart-engine.spec.ts models it (traced there against the library source).
    setVisibleLogicalRange: vi.fn((r: unknown) => {
      pendingRangeEcho = () => rangeCb?.(r);
    }),
    timeToCoordinate: vi.fn().mockReturnValue(321),
    scrollToRealTime: vi.fn(),
    width: () => 700,
  };
  const seriesStub = {
    applyOptions: vi.fn(),
    setData: vi.fn(),
    update: vi.fn(),
    coordinateToPrice: vi.fn().mockReturnValue(4588.25),
    priceToCoordinate: vi.fn().mockReturnValue(250),
    priceScale: () => ({ applyOptions: vi.fn() }),
  };
  const chartStub = {
    subscribeClick: vi.fn(),
    subscribeDblClick: vi.fn(),
    subscribeCrosshairMove: vi.fn(),
    timeScale: () => timeScaleStub,
    addSeries: () => seriesStub,
    applyOptions: vi.fn(),
    setCrosshairPosition: vi.fn(),
    clearCrosshairPosition: vi.fn(),
    paneSize: () => ({ width: 700, height: 500 }),
    remove: vi.fn(),
  };

  return {
    chartStub,
    timeScaleStub,
    seriesStub,
    getRangeCb: () => rangeCb,
    reset: () => {
      rangeCb = undefined;
      pendingRangeEcho = undefined;
    },
    /** Runs the pending next-frame range echo, if any. */
    flushEcho: async () => {
      const toRun = pendingRangeEcho;
      pendingRangeEcho = undefined;
      toRun?.();
      await Promise.resolve();
    },
  };
});

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>();
  return { ...actual, createChart: vi.fn(() => chartStub) };
});

/** Records what `init` was handed, so the construction contract can be asserted. */
class ProbeCapability implements Capability {
  readonly id = 'probe';
  static built: ProbeCapability[] = [];
  initArgs: { chart: unknown; bus: unknown } | null = null;
  renderCalls = 0;
  destroyed = false;

  constructor(readonly series: unknown) {
    ProbeCapability.built.push(this);
  }
  init(chart: IChartApi, bus: ChartEventBus): void {
    this.initArgs = { chart, bus };
  }
  render(_model: Partial<RenderModel>): void {
    void _model;
    this.renderCalls++;
  }
  destroy(): void {
    this.destroyed = true;
  }
}

/** A second class with the SAME id, for the duplicate-registration test. */
class DuplicateProbeCapability extends ProbeCapability {}

describe('ChartEngine — narrow boundary contract (RFC-004/RFC-005)', () => {
  let ChartEngine: typeof ChartEngineType;
  let engine: ChartEngineType;

  beforeEach(async () => {
    reset();
    vi.clearAllMocks();
    ProbeCapability.built = [];
    vi.resetModules();
    ({ ChartEngine } = await import('./chart-engine'));
    engine = new ChartEngine(document.createElement('div'));
  });

  describe('the migration bridge is gone', () => {
    it('exposes no chartApi / seriesApi member under any name that returns a library handle', () => {
      const surface = engine as unknown as Record<string, unknown>;
      expect('chartApi' in surface).toBe(false);
      expect('seriesApi' in surface).toBe(false);
      // Guards against reintroduction under a new name (the C3 criterion): no public member
      // may hand out the chart or the series object itself.
      const proto = Object.getPrototypeOf(engine) as object;
      const names = [
        ...Object.getOwnPropertyNames(proto),
        ...Object.getOwnPropertyNames(engine),
      ].filter((n) => n !== 'constructor');
      const escapeHatches = names.filter((n) => {
        const desc =
          Object.getOwnPropertyDescriptor(proto, n) ??
          Object.getOwnPropertyDescriptor(engine, n);
        if (!desc) return false;
        let value: unknown;
        try {
          value = desc.get ? desc.get.call(engine) : desc.value;
        } catch {
          return false;
        }
        return value === chartStub || value === seriesStub;
      });
      expect(escapeHatches).toEqual([]);
    });
  });

  describe('coordinate queries', () => {
    it('priceForY delegates to the series with the same y and passes the value through', () => {
      expect(engine.priceForY(137)).toBe(4588.25);
      expect(seriesStub.coordinateToPrice).toHaveBeenCalledWith(137);
    });

    it('priceForY passes a null (unresolvable) result through unchanged', () => {
      seriesStub.coordinateToPrice.mockReturnValueOnce(null);
      expect(engine.priceForY(137)).toBeNull();
    });

    it('yForPrice delegates to the series with the same price', () => {
      expect(engine.yForPrice(4588.25)).toBe(250);
      expect(seriesStub.priceToCoordinate).toHaveBeenCalledWith(4588.25);
    });

    it('xForDisplayTime uses the TIME SCALE (timeToCoordinate), not the bar-index mapping', () => {
      expect(engine.xForDisplayTime(1_700_000_000)).toBe(321);
      expect(timeScaleStub.timeToCoordinate).toHaveBeenCalledWith(1_700_000_000);
    });
  });

  describe('data + view commands', () => {
    it('upsertCandle calls series.update once with the candle it was given', () => {
      const candle = { time: 1_700_000_060, open: 1, high: 2, low: 0.5, close: 1.5 };
      engine.upsertCandle(candle);
      expect(seriesStub.update).toHaveBeenCalledTimes(1);
      expect(seriesStub.update).toHaveBeenCalledWith(candle);
    });

    it('upsertCandle does NOT go through setData (the jump path must stay separate)', () => {
      engine.upsertCandle({ time: 1, open: 1, high: 1, low: 1, close: 1 });
      expect(seriesStub.setData).not.toHaveBeenCalled();
    });

    it('scrollToRealTime delegates to the time scale', () => {
      engine.scrollToRealTime();
      expect(timeScaleStub.scrollToRealTime).toHaveBeenCalledTimes(1);
    });

    it('shiftVisibleRange forwards from/to as a logical range', () => {
      engine.shiftVisibleRange(12, 212);
      expect(timeScaleStub.setVisibleLogicalRange).toHaveBeenCalledWith({ from: 12, to: 212 });
    });
  });

  /**
   * The behaviour-preservation core of this refactor. `maybeLoadMore`'s lazy prepend has
   * never suppressed its own range echo, and that echo is how synced panels follow the shift.
   */
  describe('echo semantics: shiftVisibleRange must NOT suppress, applyVisibleRange must', () => {
    it('shiftVisibleRange still emits VisibleRangeChanged on the next frame', async () => {
      const seen: unknown[] = [];
      engine.events.on('VisibleRangeChanged', (r) => seen.push(r));

      engine.shiftVisibleRange(12, 212);
      await flushEcho();

      expect(seen).toEqual([{ from: 12, to: 212 }]);
    });

    it('applyVisibleRange swallows exactly that echo — the contrast that makes the two methods necessary', async () => {
      const seen: unknown[] = [];
      engine.events.on('VisibleRangeChanged', (r) => seen.push(r));

      engine.applyVisibleRange({ from: 12, to: 212 } as unknown as Parameters<
        ChartEngineType['applyVisibleRange']
      >[0]);
      await flushEcho();

      expect(seen).toEqual([]);
    });

    it('a shift does not consume the suppression armed by a later apply', async () => {
      const seen: unknown[] = [];
      engine.events.on('VisibleRangeChanged', (r) => seen.push(r));

      engine.shiftVisibleRange(1, 101);
      await flushEcho(); // emitted
      engine.applyVisibleRange({ from: 2, to: 102 } as unknown as Parameters<
        ChartEngineType['applyVisibleRange']
      >[0]);
      await flushEcho(); // swallowed
      getRangeCb()?.({ from: 3, to: 103 }); // genuine user scroll afterwards

      expect(seen).toEqual([
        { from: 1, to: 101 },
        { from: 3, to: 103 },
      ]);
    });
  });

  describe('registerCapability builds the capability from the engine-owned series', () => {
    it('constructs the class with the engine’s own main series and returns the instance', () => {
      const cap = engine.registerCapability(ProbeCapability);

      expect(ProbeCapability.built).toHaveLength(1);
      expect(cap).toBe(ProbeCapability.built[0]);
      // THE point of the whole refactor: the series reaches the capability without any
      // caller ever holding it.
      expect(cap.series).toBe(seriesStub);
    });

    it('calls init with the chart and the engine bus', () => {
      const cap = engine.registerCapability(ProbeCapability);
      expect(cap.initArgs).toEqual({ chart: chartStub, bus: engine.events });
    });

    it('getCapability resolves the same instance by id, and render fans out to it', () => {
      const cap = engine.registerCapability(ProbeCapability);
      expect(engine.getCapability('probe')).toBe(cap);

      engine.render({});
      expect(cap.renderCalls).toBe(1);
    });

    it('still throws on a duplicate id, with the same message', () => {
      engine.registerCapability(ProbeCapability);
      expect(() => engine.registerCapability(DuplicateProbeCapability)).toThrowError(
        'Capability with ID "probe" is already registered.',
      );
    });

    it('a rejected duplicate leaves the FIRST instance registered and un-destroyed', () => {
      const first = engine.registerCapability(ProbeCapability);
      expect(() => engine.registerCapability(DuplicateProbeCapability)).toThrow();

      expect(engine.getCapability('probe')).toBe(first);
      expect(first.destroyed).toBe(false);
    });

    it('destroy() tears down registered capabilities before removing the chart', () => {
      const cap = engine.registerCapability(ProbeCapability);
      engine.destroy();

      expect(cap.destroyed).toBe(true);
      expect(chartStub.remove).toHaveBeenCalledTimes(1);
      expect(engine.getCapability('probe')).toBeUndefined();
    });
  });
});
