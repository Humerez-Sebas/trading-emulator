import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injectable,
  OnDestroy,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { Candle } from '../../models';
import { TIMEFRAME_SECONDS, type Timeframe } from '../../models';
import { derivePointSize } from '../../models';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { ChartEngine } from '../../domain/chart/chart-engine';
import { TradingCapability } from '../../domain/chart/capabilities/trading-capability';
import { DrawingsCapability } from '../../domain/chart/capabilities/drawings-capability';
import { SessionCapability } from '../../domain/chart/capabilities/session-capability';
import type { Drawing, Position, RenderModel } from '../../domain/chart/render-model';
import { SceneSpec, SCENE_WINDOW_CANDLES } from '../../domain/reflection/scene-spec';
import {
  CHART_ACCENT,
  DARK_CHART_COLORS,
  DARK_TRADE_BOX_OPACITY,
  ChartColors,
} from '../../state/settings/settings.models';
import { Store } from '@ngrx/store';
import { selectChartStyle } from '../../state/selectors';

/**
 * R1 integration spike (RFC-016 Task 7): the frozen scene is rendered via the
 * SAME `RenderModel → ChartEngine` path the interactive chart uses (kernel
 * invariants 1-2 — no new Capability, no engine change), but the host itself
 * owns a slim, READ-ONLY, store-free instance. See task-7-report.md's "SPIKE
 * SEAM WRITE-UP" for what this component needed and did NOT need.
 */

/**
 * Recovers the scene's base timeframe, in seconds, from its OWN fields —
 * `buildSceneSpec` (domain/reflection) sets `window = [cursorTime - N*tf,
 * cursorTime + N*tf]` where `N = SCENE_WINDOW_CANDLES`, so the division below
 * exactly inverts that: no extra input needed, no coupling beyond the
 * `SceneSpec` the component already receives.
 */
export function baseTfSecondsOfScene(scene: SceneSpec): number {
  return (scene.window.t1 - scene.cursorTime) / SCENE_WINDOW_CANDLES;
}

/** Maps the scene's implied base TF (seconds) to a `Timeframe` key, or `null`
 * when it doesn't match any known timeframe (defensive — see caller). */
export function timeframeOfScene(scene: SceneSpec): Timeframe | null {
  const secs = baseTfSecondsOfScene(scene);
  for (const tf of Object.keys(TIMEFRAME_SECONDS) as Timeframe[]) {
    if (TIMEFRAME_SECONDS[tf] === secs) return tf;
  }
  return null;
}

/** Whether `scene.datasetRefs` (composite `${symbol}|${timeframe}|${year}`
 * ids, `DatasetRecord.id` format) contains at least one entry for `tf` —
 * i.e. whether this timeframe was cached locally for the scene's symbol. */
export function sceneDatasetAvailable(scene: SceneSpec, tf: Timeframe): boolean {
  const prefix = `${scene.symbol}|${tf}|`;
  return scene.datasetRefs.some((ref) => ref.startsWith(prefix));
}

/**
 * PURE render-model derivation (the testable "pure part" — see the spec's
 * file-level comment): `SceneSpec` + already-loaded `candles` → a partial
 * `RenderModel` the host feeds straight to `engine.render(...)`.
 *
 * - `trading`: ONE synthetic `Position` from `scene.orderGeometry` renders
 *   entry/SL/TP as price lines via the EXISTING `TradingCapability` (RFC-016
 *   §4: "order geometry as price lines via the trading model path" — no new
 *   capability). `boxes`/`markers`/`pendingOrders` empty: nothing else to draw.
 * - `drawings`: `scene.drawingSet` (frozen `DrawingSnapshotEntry[]`) reshaped
 *   into `Drawing[]` (id synthesized, `p1`/`p2` from `anchorPoints[0..1]`);
 *   entries with fewer than 2 anchor points are defensively skipped (every
 *   drawing tool needs exactly two).
 * - `session`: reused as a generic "vertical dashed line at a given time"
 *   primitive — `sessionEnd` is set to `scene.cursorTime`, i.e. the waypoint
 *   marker (RFC §4's "marcador vertical del instante del waypoint"). No new
 *   primitive: `SessionCapability`/`SessionPrimitive` already draw exactly
 *   this shape for an unrelated field; the name is reused, not the semantics.
 */
export function deriveFrozenRenderModel(
  scene: SceneSpec,
  candles: Candle[],
  style: { colors: ChartColors; gridVisible: boolean; gridOpacity: number },
): Partial<RenderModel> {
  const times = candles.map((c) => c.time);
  const barSpacing = baseTfSecondsOfScene(scene);

  const position: Position = {
    id: 'reflection-scene-order',
    side: scene.orderGeometry.side,
    entryPrice: scene.orderGeometry.entryPrice,
    sl: scene.orderGeometry.sl,
    tp: scene.orderGeometry.tp,
    lots: scene.orderGeometry.lots,
    openTime: scene.cursorTime,
    origin: 'reflection-scene',
  };

  const drawings: Drawing[] = scene.drawingSet
    .filter((entry) => entry.anchorPoints.length >= 2)
    .map((entry, i) => ({
      id: `evidence-${i}`,
      kind: entry.type,
      p1: entry.anchorPoints[0],
      p2: entry.anchorPoints[1],
    }));

  return {
    candles,
    config: {
      colors: style.colors,
      gridVisible: style.gridVisible,
      gridOpacity: style.gridOpacity,
    },
    trading: {
      positions: [position],
      pendingOrders: [],
      boxes: [],
      markers: [],
      shift: 0,
      times,
      barSpacing,
      colors: style.colors,
      opacity: DARK_TRADE_BOX_OPACITY,
    },
    drawings: {
      items: drawings,
      activeTool: 'none',
      selectedId: null,
      draft: null,
      shift: 0,
      times,
      barSpacing,
      pointSize: derivePointSize(candles),
      colors: {
        accent: CHART_ACCENT,
        up: style.colors.upColor,
        down: style.colors.downColor,
      },
    },
    session: {
      sessionEnd: scene.cursorTime,
      shift: 0,
      times,
      barSpacing,
      color: CHART_ACCENT,
    },
  };
}

type SceneHostState = 'scene-loading' | 'ready' | 'dataset-missing';

/**
 * Thin DI seam around `new ChartEngine(container)` — the SAME idiom already
 * used for `MarketDataRepository` (an abstract-class DI token, not a bare
 * constructor call). NOT a change to `domain/chart/**` (kernel invariant):
 * `chart-engine.ts` itself is untouched, this factory only wraps its
 * constructor call from the OUTSIDE. Exists because Angular's vitest builder
 * rejects `vi.mock` on relative-path local modules ("Please use Angular
 * TestBed for mocking dependencies" — the harness's own error message);
 * `FrozenSceneHostComponent`'s spec substitutes this factory via a plain
 * TestBed provider instead, which is the supported mocking seam.
 */
@Injectable({ providedIn: 'root' })
export class ChartEngineFactory {
  create(container: HTMLElement): ChartEngine {
    return new ChartEngine(container);
  }
}

@Component({
  selector: 'app-frozen-scene-host',
  standalone: true,
  template: `
    <div class="frozen-scene-host" [attr.aria-busy]="state() === 'scene-loading'">
      <div #layerA class="layer" [class.is-active]="activeLayer() === 'a'"></div>
      <div #layerB class="layer" [class.is-active]="activeLayer() === 'b'"></div>
      @if (state() === 'scene-loading') {
        <div class="skeleton" aria-hidden="true"></div>
      }
      @if (state() === 'dataset-missing') {
        <p class="dataset-missing-note" role="status">
          Dataset no disponible localmente; mostrando geometría del trade.
        </p>
      }
    </div>
  `,
  styles: `
    .frozen-scene-host {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      background: var(--bg);
      border-radius: var(--density-radius, var(--radius-sm));
      overflow: hidden;
    }
    .layer {
      position: absolute;
      inset: 0;
      opacity: 0;
      transition: opacity 180ms cubic-bezier(0.2, 0, 0, 1);
    }
    .layer.is-active {
      opacity: 1;
      z-index: 1;
    }
    .skeleton {
      position: absolute;
      inset: 0;
      z-index: 2;
      background: linear-gradient(
        90deg,
        var(--surface) 25%,
        var(--surface-2) 37%,
        var(--surface) 63%
      );
      background-size: 400% 100%;
      animation: scene-skeleton-shimmer 1.4s ease infinite;
    }
    @keyframes scene-skeleton-shimmer {
      0% {
        background-position: 100% 50%;
      }
      100% {
        background-position: 0 50%;
      }
    }
    .dataset-missing-note {
      position: absolute;
      left: var(--space-2);
      bottom: var(--space-2);
      z-index: 2;
      margin: 0;
      padding: var(--space-1) var(--space-2);
      font-size: var(--text-2xs);
      color: var(--text-muted);
      background: var(--surface-3);
      border-radius: var(--radius-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FrozenSceneHostComponent implements AfterViewInit, OnDestroy {
  scene = input<SceneSpec | null>(null);

  private repo = inject(MarketDataRepository);
  private engineFactory = inject(ChartEngineFactory);
  private store = inject(Store);
  chartStyle = this.store.selectSignal(selectChartStyle);

  private layerAEl = viewChild<ElementRef<HTMLDivElement>>('layerA');
  private layerBEl = viewChild<ElementRef<HTMLDivElement>>('layerB');

  private engineA: ChartEngine | null = null;
  private engineB: ChartEngine | null = null;
  private viewReady = signal(false);
  /** Race-guard: a newer `applyScene` call invalidates any in-flight older one. */
  private renderToken = 0;

  activeLayer = signal<'a' | 'b'>('a');
  state = signal<SceneHostState>('scene-loading');

  constructor() {
    effect(() => {
      const scene = this.scene();
      this.chartStyle(); // Register reactive dependency on style changes
      if (!this.viewReady()) return;
      void this.applyScene(scene);
    });
  }

  ngAfterViewInit(): void {
    this.engineA = this.createEngine(this.layerAEl()!.nativeElement);
    this.engineB = this.createEngine(this.layerBEl()!.nativeElement);
    this.viewReady.set(true);
  }

  /** Registers ONLY the three capabilities the frozen scene needs (no
   * `CountdownCapability` — nothing counts down in a frozen scene). No new
   * capability is registered anywhere in this file (kernel invariant 2).
   * `setInteractivity(false)` is an EXISTING engine method (chart.component
   * also calls it during interactive placement) — reused here for the
   * WHOLE lifetime of a read-only scene, disabling scroll/scale so the
   * "no trading interactions" requirement holds even though `TradingCapability`
   * still paints its (inert — no click wiring below) trade-close button. */
  private createEngine(container: HTMLElement): ChartEngine {
    const engine = this.engineFactory.create(container);
    engine.setInteractivity(false);
    engine.registerCapability(new TradingCapability(engine.seriesApi));
    engine.registerCapability(new DrawingsCapability(engine.seriesApi));
    engine.registerCapability(new SessionCapability(engine.seriesApi));
    return engine;
  }

  private async applyScene(scene: SceneSpec | null): Promise<void> {
    const token = ++this.renderToken;
    if (!scene) {
      this.state.set('scene-loading');
      return;
    }
    this.state.set('scene-loading');
    const { candles, missing } = await this.loadCandles(scene);
    if (token !== this.renderToken) return; // superseded by a newer scene

    const style = this.chartStyle();
    const colors = style?.colors ?? DARK_CHART_COLORS;
    const gridVisible = style?.gridVisible ?? false;
    const gridOpacity = style?.gridOpacity ?? 1;
    const model = deriveFrozenRenderModel(scene, candles, { colors, gridVisible, gridOpacity });
    const nextLayer: 'a' | 'b' = this.activeLayer() === 'a' ? 'b' : 'a';
    const engine = nextLayer === 'a' ? this.engineA : this.engineB;
    engine?.render(model);
    this.activeLayer.set(nextLayer);
    this.state.set(missing ? 'dataset-missing' : 'ready');
  }

  /** Resolves the scene's timeframe from its own window (see
   * `timeframeOfScene`), checks local availability, then reads + slices
   * candles to `[window.t0, window.t1]` — candles NEVER enter the SceneSpec
   * itself (N-5); the host resolves refs → candles at render time. Any
   * failure (repository not initialized, no candles in range, timeframe
   * undeterminable) degrades gracefully to "dataset-missing", never a
   * blocking error (TKM §5.2). */
  private async loadCandles(scene: SceneSpec): Promise<{ candles: Candle[]; missing: boolean }> {
    const tf = timeframeOfScene(scene);
    if (!tf || !sceneDatasetAvailable(scene, tf)) return { candles: [], missing: true };
    try {
      const all = await this.repo.getCandles(scene.symbol, tf);
      const windowed = all.filter((c) => c.time >= scene.window.t0 && c.time <= scene.window.t1);
      return { candles: windowed, missing: windowed.length === 0 };
    } catch {
      return { candles: [], missing: true };
    }
  }

  ngOnDestroy(): void {
    this.engineA?.destroy();
    this.engineB?.destroy();
  }
}
