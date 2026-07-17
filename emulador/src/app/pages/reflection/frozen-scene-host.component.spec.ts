import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candle } from '../../models';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { SceneSpec, SCENE_WINDOW_CANDLES } from '../../domain/reflection/scene-spec';
import type { Position, RenderModel } from '../../domain/chart/render-model';
import {
  baseTfSecondsOfScene,
  timeframeOfScene,
  sceneDatasetAvailable,
  deriveFrozenRenderModel,
  ChartEngineFactory,
} from './frozen-scene-host.component';

/**
 * R1 integration-spike spec (RFC-016 Task 7). Per the brief: "the engine
 * faked at its narrow interface — never a headless-canvas assertion."
 *
 * DEVIATION from the brief's literal "`vi.mock` the engine" phrasing
 * (documented, task-7-report.md): a first attempt at
 * `vi.mock('../../domain/chart/chart-engine', ...)` fails HARD under this
 * repo's Angular vitest builder — `The "vi.mock" and related methods are not
 * supported for relative imports with the Angular unit-test system. Please
 * use Angular TestBed for mocking dependencies.` (the harness's own error).
 * `chart-engine.spec.ts`/`trading-capability.spec.ts` only ever `vi.mock`
 * the BARE package specifier `'lightweight-charts'`, never a local relative
 * module — this is the first spec in the repo that needed to fake a LOCAL
 * class, and the harness's guidance points at the fix: `FrozenSceneHostComponent`
 * now constructs its engine through an injected `ChartEngineFactory` (see the
 * component file) instead of a bare `new ChartEngine(...)`, so this spec
 * substitutes that factory via a plain TestBed provider — no `vi.mock` at all.
 * Real `TradingCapability`/`DrawingsCapability`/`SessionCapability` are still
 * constructed against the FAKE engine's `seriesApi` (their constructors are
 * trivial — they only store the reference); their `.init()` — the only method
 * that touches real `lightweight-charts` functions like `createSeriesMarkers`
 * — is NEVER called, because the fake engine's `registerCapability` never
 * invokes it. `lightweight-charts` itself needs no mock (its module
 * evaluation alone is already proven safe by `chart-engine.spec.ts`, which
 * imports the REAL package via `importOriginal`).
 */

class FakeChartEngine {
  static instances: FakeChartEngine[] = [];
  readonly container: HTMLElement;
  readonly seriesApi = {};
  readonly chartApi = {};
  readonly events = { on: () => () => {}, emit: () => {}, destroy: () => {} };
  interactivityCalls: boolean[] = [];
  registeredCapabilities: { id: string }[] = [];
  renderCalls: Partial<RenderModel>[] = [];
  destroyed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    FakeChartEngine.instances.push(this);
  }
  setInteractivity(enabled: boolean): void {
    this.interactivityCalls.push(enabled);
  }
  registerCapability(cap: { id: string }): void {
    this.registeredCapabilities.push(cap);
  }
  render(model: Partial<RenderModel>): void {
    this.renderCalls.push(model);
  }
  destroy(): void {
    this.destroyed = true;
  }
}

function resetFakeEngines(): void {
  FakeChartEngine.instances.length = 0;
}

class FakeChartEngineFactory extends ChartEngineFactory {
  override create(container: HTMLElement) {
    return new FakeChartEngine(container) as unknown as ReturnType<ChartEngineFactory['create']>;
  }
}

function scene(overrides: Partial<SceneSpec> = {}): SceneSpec {
  const baseTfSeconds = 60;
  const windowSeconds = SCENE_WINDOW_CANDLES * baseTfSeconds;
  const cursorTime = 100_000;
  return {
    symbol: 'EURUSD',
    datasetRefs: ['EURUSD|M1|2024'],
    window: { t0: cursorTime - windowSeconds, t1: cursorTime + windowSeconds },
    cursorTime,
    orderGeometry: { side: 'buy', entryPrice: 1.085, sl: 1.08, tp: 1.09, lots: 1 },
    drawingSet: [],
    telemetryMarkers: {},
    ...overrides,
  };
}

function candlesInWindow(s: SceneSpec, n = 5): Candle[] {
  const out: Candle[] = [];
  const step = 60;
  for (let i = 0; i < n; i++) {
    const time = s.cursorTime - step * Math.floor(n / 2) + i * step;
    out.push({ time, open: 1.08, high: 1.081, low: 1.079, close: 1.0805 });
  }
  return out;
}

describe('deriveFrozenRenderModel / baseTfSecondsOfScene / timeframeOfScene / sceneDatasetAvailable (pure)', () => {
  it('baseTfSecondsOfScene recovers the base TF purely from window/cursorTime', () => {
    const s = scene();
    expect(baseTfSecondsOfScene(s)).toBe(60);
  });

  it('timeframeOfScene maps 60s to M1', () => {
    expect(timeframeOfScene(scene())).toBe('M1');
  });

  it('timeframeOfScene returns null for an unrecognized base TF', () => {
    const s = scene({ window: { t0: 100_000 - 777 * SCENE_WINDOW_CANDLES, t1: 100_000 + 777 * SCENE_WINDOW_CANDLES } });
    expect(timeframeOfScene(s)).toBeNull();
  });

  it('sceneDatasetAvailable is true when a matching symbol|tf|year ref exists', () => {
    const s = scene({ datasetRefs: ['EURUSD|M1|2023', 'EURUSD|H1|all'] });
    expect(sceneDatasetAvailable(s, 'M1')).toBe(true);
  });

  it('sceneDatasetAvailable is false when no ref matches the timeframe', () => {
    const s = scene({ datasetRefs: ['EURUSD|H1|all'] });
    expect(sceneDatasetAvailable(s, 'M1')).toBe(false);
  });

  it('sceneDatasetAvailable does not false-positive on another symbol sharing the TF', () => {
    const s = scene({ symbol: 'EURUSD', datasetRefs: ['GBPUSD|M1|2024'] });
    expect(sceneDatasetAvailable(s, 'M1')).toBe(false);
  });

  it('derives candles + config + trading + drawings + session from the scene', () => {
    const s = scene();
    const candles = candlesInWindow(s);
    const model = deriveFrozenRenderModel(s, candles);

    expect(model.candles).toBe(candles);
    expect(model.config?.colors).toBeDefined();

    const position = model.trading?.positions[0] as Position;
    expect(position.side).toBe('buy');
    expect(position.entryPrice).toBe(1.085);
    expect(position.sl).toBe(1.08);
    expect(position.tp).toBe(1.09);
    expect(model.trading?.pendingOrders).toEqual([]);
    expect(model.trading?.boxes).toEqual([]);
    expect(model.trading?.barSpacing).toBe(60);

    expect(model.drawings?.items).toEqual([]);
    expect(model.drawings?.activeTool).toBe('none');
    expect(model.drawings?.selectedId).toBeNull();

    expect(model.session?.sessionEnd).toBe(s.cursorTime);
    expect(model.session?.barSpacing).toBe(60);
  });

  it('reshapes drawingSet entries with >=2 anchor points into Drawing p1/p2', () => {
    const s = scene({
      drawingSet: [
        {
          type: 'line',
          anchorPoints: [
            { time: 1000, price: 1.08 },
            { time: 1100, price: 1.085 },
          ],
          styleToken: 'line-1',
        },
      ],
    });
    const model = deriveFrozenRenderModel(s, []);
    expect(model.drawings?.items).toHaveLength(1);
    expect(model.drawings?.items[0].kind).toBe('line');
    expect(model.drawings?.items[0].p1).toEqual({ time: 1000, price: 1.08 });
    expect(model.drawings?.items[0].p2).toEqual({ time: 1100, price: 1.085 });
  });

  it('defensively skips a drawing entry with fewer than 2 anchor points', () => {
    const s = scene({
      drawingSet: [{ type: 'line', anchorPoints: [{ time: 1000, price: 1.08 }], styleToken: 'x' }],
    });
    const model = deriveFrozenRenderModel(s, []);
    expect(model.drawings?.items).toEqual([]);
  });

  it('is a pure function: same inputs -> deep-equal output', () => {
    const s = scene();
    const candles = candlesInWindow(s);
    expect(deriveFrozenRenderModel(s, candles)).toEqual(deriveFrozenRenderModel(s, candles));
  });
});

describe('FrozenSceneHostComponent (lifecycle, engine faked at its narrow interface)', () => {
  let repo: { getCandles: ReturnType<typeof vi.fn>; getCoverage: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    resetFakeEngines();
    repo = { getCandles: vi.fn().mockResolvedValue([]), getCoverage: vi.fn().mockResolvedValue(null) };
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  async function mount() {
    const { FrozenSceneHostComponent } = await import('./frozen-scene-host.component');
    TestBed.configureTestingModule({
      imports: [FrozenSceneHostComponent],
      providers: [
        { provide: MarketDataRepository, useValue: repo },
        { provide: ChartEngineFactory, useClass: FakeChartEngineFactory },
      ],
    });
    const fixture = TestBed.createComponent(FrozenSceneHostComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('creates exactly two engine instances (two-layer crossfade host) and disables interactivity on both', async () => {
    await mount();
    expect(FakeChartEngine.instances).toHaveLength(2);
    for (const engine of FakeChartEngine.instances) {
      expect(engine.interactivityCalls).toEqual([false]);
    }
  });

  it('registers exactly TradingCapability, DrawingsCapability, SessionCapability on each layer (no CountdownCapability, no new capability)', async () => {
    await mount();
    for (const engine of FakeChartEngine.instances) {
      const ids = engine.registeredCapabilities.map((c) => c.id).sort();
      expect(ids).toEqual(['drawings', 'session', 'trading']);
    }
  });

  it('scene-loading while candles are in flight; renders into the INACTIVE layer and swaps active on resolution', async () => {
    let resolveCandles!: (c: Candle[]) => void;
    repo.getCandles.mockReturnValue(new Promise((r) => (resolveCandles = r)));

    const fixture = await mount();
    fixture.componentRef.setInput('scene', scene());
    fixture.detectChanges();
    await Promise.resolve();
    expect(fixture.componentInstance.state()).toBe('scene-loading');
    expect(fixture.componentInstance.activeLayer()).toBe('a'); // still the initial layer

    resolveCandles([]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.activeLayer()).toBe('b'); // swapped to the layer that was just rendered
    const [engineA, engineB] = FakeChartEngine.instances;
    expect(engineA.renderCalls).toHaveLength(0);
    expect(engineB.renderCalls).toHaveLength(1);
  });

  it('dataset-missing when no local dataset ref matches the scene TF; still renders geometry (candles=[])', async () => {
    const s = scene({ datasetRefs: ['EURUSD|H1|all'] }); // no M1 ref
    const fixture = await mount();
    fixture.componentRef.setInput('scene', s);
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('dataset-missing');
    expect(repo.getCandles).not.toHaveBeenCalled(); // never even attempted — ref absent
    const rendered = FakeChartEngine.instances.find((e) => e.renderCalls.length > 0);
    expect(rendered?.renderCalls[0].candles).toEqual([]);
    expect((rendered?.renderCalls[0].trading?.positions[0] as Position).entryPrice).toBe(s.orderGeometry.entryPrice);
  });

  it('dataset-missing when the repository read throws (never a blocking error, TKM §5.2)', async () => {
    repo.getCandles.mockRejectedValue(new Error('IndexedDB not initialized'));
    const fixture = await mount();
    fixture.componentRef.setInput('scene', scene());
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('dataset-missing');
  });

  it('ready when candles resolve within the window', async () => {
    const s = scene();
    repo.getCandles.mockResolvedValue(candlesInWindow(s));
    const fixture = await mount();
    fixture.componentRef.setInput('scene', s);
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('a stale in-flight load is discarded when a newer scene supersedes it (race guard)', async () => {
    let resolveFirst!: (c: Candle[]) => void;
    const first = new Promise<Candle[]>((r) => (resolveFirst = r));
    repo.getCandles.mockReturnValueOnce(first);

    const fixture = await mount();
    const sceneA = scene({ cursorTime: 100_000, window: { t0: 100_000 - 3600, t1: 100_000 + 3600 } });
    fixture.componentRef.setInput('scene', sceneA);
    fixture.detectChanges();
    await Promise.resolve();

    const sceneB = scene({ cursorTime: 200_000, window: { t0: 200_000 - 3600, t1: 200_000 + 3600 } });
    repo.getCandles.mockResolvedValue(candlesInWindow(sceneB));
    fixture.componentRef.setInput('scene', sceneB);
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    // the first (stale) load finally resolves AFTER the second already settled
    resolveFirst([]);
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    // exactly ONE render happened (sceneB's) — the stale sceneA resolution was discarded
    const totalRenders = FakeChartEngine.instances.reduce((n, e) => n + e.renderCalls.length, 0);
    expect(totalRenders).toBe(1);
  });

  it('destroys both engines on component destroy', async () => {
    const fixture = await mount();
    fixture.destroy();
    for (const engine of FakeChartEngine.instances) {
      expect(engine.destroyed).toBe(true);
    }
  });
});
