import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChartEngine as ChartEngineType } from './chart-engine';

/**
 * RFC-019 Task 3 — `ChartEngine.paneRect()` (D19.A).
 *
 * Isolated in its own file rather than added to `chart-engine.spec.ts`: that file
 * carries load-bearing RFC-010 echo-suppression coverage with an already-elaborate
 * `vi.hoisted` stub: keeping this test's stub minimal and separate avoids touching a
 * pre-existing, sensitive spec file (STOP rule) and any risk of cross-contaminating
 * its RAF-echo timing assertions under vitest's `isolate:false` pool.
 *
 * Same mocking discipline as `chart-engine.spec.ts` / `trading-capability.spec.ts`
 * (docs/engineering/testing.md): `lightweight-charts` is a Vite-optimized dep, so the
 * mock is built inside `vi.hoisted` (fully initialized before the hoisted `vi.mock`
 * factory runs) and the SUT is imported dynamically in `beforeEach` AFTER
 * `vi.resetModules()`, so it evaluates after optimizeDeps settles instead of racing it
 * under a cold `node_modules/.vite` cache.
 */
const { chartStub, setPaneSize, reset } = vi.hoisted(() => {
  let paneWidth = 830;
  let paneHeight = 540;

  const timeScaleStub = {
    subscribeVisibleLogicalRangeChange: vi.fn(),
    setVisibleLogicalRange: vi.fn(),
    width: () => paneWidth,
  };
  const seriesStub = {
    applyOptions: vi.fn(),
    setData: vi.fn(),
    priceScale: () => ({ applyOptions: vi.fn() }),
  };
  const chartStub = {
    subscribeClick: vi.fn(),
    subscribeDblClick: vi.fn(),
    subscribeCrosshairMove: vi.fn(),
    timeScale: () => timeScaleStub,
    addSeries: () => seriesStub,
    applyOptions: vi.fn(),
    paneSize: vi.fn(() => ({ width: paneWidth, height: paneHeight })),
    remove: vi.fn(),
  };

  return {
    chartStub,
    setPaneSize: (w: number, h: number) => {
      paneWidth = w;
      paneHeight = h;
    },
    reset: () => {
      paneWidth = 830;
      paneHeight = 540;
    },
  };
});

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>();
  return { ...actual, createChart: vi.fn(() => chartStub) };
});

describe('ChartEngine.paneRect() (RFC-019 Task 3, D19.A)', () => {
  let ChartEngine: typeof ChartEngineType;

  beforeEach(async () => {
    reset();
    vi.clearAllMocks();
    // Import the SUT here, not at module scope — see file header.
    vi.resetModules();
    ({ ChartEngine } = await import('./chart-engine'));
  });

  it('excludes the right price scale: paneRect().width is narrower than the container', () => {
    const container = document.createElement('div');
    // jsdom performs no real layout; clientWidth is stubbed to model the
    // container wrapping the pane PLUS the ~70px price-scale strip.
    Object.defineProperty(container, 'clientWidth', { value: 900, configurable: true });
    setPaneSize(830, 540); // pane width < container width, by exactly the axis strip

    const engine = new ChartEngine(container);
    const rect = engine.paneRect();

    expect(rect).not.toBeNull();
    expect(rect!.width).toBeLessThan(container.clientWidth);
    expect(rect!.width).toBe(830);
    expect(rect!.height).toBe(540);
  });

  it('returns null once the engine is destroyed', () => {
    const engine = new ChartEngine(document.createElement('div'));
    expect(engine.paneRect()).not.toBeNull();

    engine.destroy();

    expect(engine.paneRect()).toBeNull();
  });

  it('does not touch the (disposed) chart API after destroy — width()/paneSize() are not called again', () => {
    const engine = new ChartEngine(document.createElement('div'));
    engine.destroy();
    vi.clearAllMocks();

    engine.paneRect();

    expect(chartStub.paneSize).not.toHaveBeenCalled();
  });
});
