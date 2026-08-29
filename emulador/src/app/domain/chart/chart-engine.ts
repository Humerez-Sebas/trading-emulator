import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  CandlestickData,
  CrosshairMode,
  LogicalRange,
  UTCTimestamp,
  MouseEventParams,
  Time,
} from 'lightweight-charts';
import { Candle, RenderModel } from './render-model';
import { ChartEventBus, ChartEventSource, ChartPointerEvent } from './chart-event-bus';
import { Capability, CapabilityApiMap } from './capability';
import {
  createBuiltInCapability,
  type BuiltInCapabilityId,
} from './capability-registry';
import { hexToRgba } from './color-utils';

export interface ChartApplyHandle {
  /** Sets the crosshair to a given time; `null` clears it. Re-entrancy-guarded (see class doc). */
  applyCrosshair(time: UTCTimestamp | null): void;
  /** Sets the visible logical range; `null` is a no-op (never clears). Re-entrancy-guarded. */
  applyVisibleRange(range: LogicalRange | null): void;
}

function pointerEventOf(param: MouseEventParams<Time>): ChartPointerEvent {
  return {
    time: param.time,
    logical: param.logical,
    point: param.point ? { x: param.point.x, y: param.point.y } : undefined,
  };
}

export class ChartEngine implements ChartApplyHandle {
  private chart: IChartApi;
  private mainSeries: ISeriesApi<'Candlestick'>;

  private hostBus = new ChartEventBus();
  private capabilityBus = new ChartEventBus();
  private capabilities = new Map<string, Capability>();
  public get events(): ChartEventSource {
    return this.hostBus;
  }

  /** D19.A: set by `destroy()`; makes `paneRect()` return `null` post-teardown instead of
   * touching a disposed `IChartApi`. No other member observed this before Task 3 — verified
   * against the real class (chart-engine.ts), not the plan's draft. */
  private destroyed = false;

  /**
   * RFC-010: true only for the synchronous duration of an applyCrosshair/applyVisibleRange call —
   * suppresses re-emission if the underlying library fires its own subscribeX callback
   * SYNCHRONOUSLY as a side effect of a PROGRAMMATIC change.
   *
   * IMPORTANT (verified against lightweight-charts v5.2 source,
   * node_modules/lightweight-charts/dist/lightweight-charts.development.mjs): for
   * `setVisibleLogicalRange`, the library does NOT fire `subscribeVisibleLogicalRangeChange`
   * synchronously — it only schedules a `requestAnimationFrame`, and the range-changed delegate
   * fires during that NEXT-FRAME draw. By the time that callback runs, this flag has ALREADY been
   * reset to `false` in `applyVisibleRange`'s `finally`, so `applyingSync` alone CANNOT catch the
   * range echo. It remains harmless belt-and-suspenders here for any synchronous paths and is the
   * correct (and sufficient) guard for crosshair: `setCrosshairPosition` internally passes
   * `skipEvent=true`, so the library never invokes `subscribeCrosshairMove` at all on programmatic
   * calls (no echo exists to suppress in that case). The load-bearing loop-breaker for the RANGE
   * echo is the one-shot `suppressNextRangeEvent` flag below — see its doc and
   * `applyVisibleRange`/the `subscribeVisibleLogicalRangeChange` handler.
   */
  private applyingSync = false;

  /**
   * RFC-010 (fix loop, Task 3 audit): one-shot, timing-independent suppressor for the NEXT
   * `subscribeVisibleLogicalRangeChange` callback after a programmatic `applyVisibleRange`.
   *
   * Why this exists: lightweight-charts v5.2's `setVisibleLogicalRange` fires its range-changed
   * delegate on the NEXT animation frame (via `requestAnimationFrame`), never synchronously. The
   * synchronous `applyingSync` flag (see above) has already unwound by the time that callback
   * runs, so it cannot suppress the echo. This flag survives ACROSS the RAF instead: it is set to
   * `true` before calling `setVisibleLogicalRange` and is only cleared by the first subsequent
   * `subscribeVisibleLogicalRangeChange` invocation (or by a throwing apply — see
   * `applyVisibleRange`), whichever comes first.
   *
   * Value-independence: the echoed range can differ fractionally from the applied one (v5.2
   * round-trips {from,to} through barSpacing math with clamping and 1e-6 rounding), so this
   * mechanism deliberately does NOT compare the echoed value to the applied value — it treats the
   * first range-changed event after a programmatic apply as that apply's echo BY CONSTRUCTION, and
   * consumes it unconditionally.
   */
  private suppressNextRangeEvent = false;

  constructor(container: HTMLElement) {
    // autoSize uses lightweight-charts' internal ResizeObserver on the container,
    // so the chart tracks panel/dock/splitter resizes — not just window resizes.
    this.chart = createChart(container, {
      autoSize: true,
      layout: { background: { color: '#000000' }, textColor: '#ffffff' },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 8 },
    });

    // No priceFormat on purpose: lightweight-charts auto-detects precision from
    // the data, matching pre-extraction behaviour. Per-instrument precision is a
    // future RenderModel concern, not RFC-001 scope.
    this.mainSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    this.chart.subscribeClick((p) => this.hostBus.emit('ChartClicked', pointerEventOf(p)));
    this.chart.subscribeDblClick((p) => this.hostBus.emit('ChartClicked', pointerEventOf(p)));
    this.chart.subscribeCrosshairMove((p) => {
      if (!this.applyingSync) this.hostBus.emit('CrosshairMoved', pointerEventOf(p));
    });
    this.chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      // One-shot echo suppression (load-bearing — see `suppressNextRangeEvent`'s doc): the first
      // range-changed event after a programmatic `applyVisibleRange` is that apply's echo BY
      // CONSTRUCTION, even if the library adjusted/clamped the value, so it is consumed
      // unconditionally and WITHOUT comparing `r` to the applied range.
      if (this.suppressNextRangeEvent) {
        this.suppressNextRangeEvent = false;
        return;
      }
      if (!this.applyingSync) this.hostBus.emit('VisibleRangeChanged', r);
    });
  }

  /**
   * Applies a programmatic crosshair position. No `suppressNextRangeEvent`-style one-shot flag is
   * needed here: lightweight-charts' `setCrosshairPosition` internally passes `skipEvent=true`, so
   * the library never invokes `subscribeCrosshairMove` as a side effect of a programmatic call —
   * there is no echo to suppress. `applyingSync` remains as defensive belt-and-suspenders only.
   */
  public applyCrosshair(time: UTCTimestamp | null): void {
    this.applyingSync = true;
    try {
      if (time === null) this.chart.clearCrosshairPosition();
      else this.chart.setCrosshairPosition(0, time, this.mainSeries);
    } finally {
      this.applyingSync = false;
    }
  }

  /**
   * Applies a programmatic visible logical range. Unlike crosshair, this DOES need the one-shot
   * `suppressNextRangeEvent` guard: lightweight-charts v5.2 fires
   * `subscribeVisibleLogicalRangeChange` on the NEXT animation frame (not synchronously), so
   * `applyingSync` has already reset by the time the echo arrives. `suppressNextRangeEvent` is set
   * BEFORE calling `setVisibleLogicalRange` and is deliberately NOT reset in `finally` — it must
   * survive past this call's return, across the RAF, until the echo callback consumes it. If
   * `setVisibleLogicalRange` throws, no echo will ever arrive for this call, so the pending flag is
   * cleared in the `catch` to avoid permanently muting the NEXT genuine (user-driven) range event.
   */
  public applyVisibleRange(range: LogicalRange | null): void {
    if (!range) return; // mirrors the engine's own maybeLoadMore-adjacent null guards
    this.applyingSync = true;
    try {
      this.suppressNextRangeEvent = true;
      this.chart.timeScale().setVisibleLogicalRange(range);
    } catch (err) {
      // No echo will arrive for a throwing apply — clear the pending one-shot flag so it doesn't
      // incorrectly swallow the next genuine user-driven range event.
      this.suppressNextRangeEvent = false;
      throw err;
    } finally {
      this.applyingSync = false;
    }
  }

  /**
   * Builds and registers one closed, domain-owned capability ID. The registry owns concrete
   * composition and receives the engine's main series; callers cannot supply executable code
   * that captures that handle.
   *
   * Ordering note (behavior-preserving): the duplicate-id `Error` is still thrown with the
   * same message, with construction still happening BEFORE the check. Every built-in
   * constructor is side-effect free, so a rejected duplicate registration remains inert.
   */
  public registerCapability(id: BuiltInCapabilityId): void {
    const cap = createBuiltInCapability(id, this.mainSeries);
    if (this.capabilities.has(cap.id)) {
      throw new Error(`Capability with ID "${cap.id}" is already registered.`);
    }
    this.capabilities.set(cap.id, cap);
    cap.init(this.chart, this.capabilityBus);
  }

  public getCapability<K extends keyof CapabilityApiMap>(id: K): CapabilityApiMap[K] | undefined {
    return this.capabilities.get(id)?.publicApi as CapabilityApiMap[K] | undefined;
  }

  public render(model: Partial<RenderModel>): void {
    // 1. Update config
    if (model.config) {
      const c = model.config.colors;
      const gridColor = hexToRgba(c.grid, model.config.gridOpacity);
      const gridLine = { color: gridColor, visible: model.config.gridVisible };

      this.chart.applyOptions({
        layout: {
          background: { color: c.background },
          textColor: c.text,
        },
        grid: { vertLines: gridLine, horzLines: gridLine },
        crosshair: {
          vertLine: { color: c.crosshair, width: 1, style: 3 },
          horzLine: { color: c.crosshair, width: 1, style: 3 },
        },
      });

      this.mainSeries.applyOptions({
        upColor: c.upColor,
        downColor: c.downColor,
        wickUpColor: c.wickUp,
        wickDownColor: c.wickDown,
        borderVisible: true,
        borderUpColor: c.borderUpColor,
        borderDownColor: c.borderDownColor,
      });
    }

    // 2. Update data efficiently
    if (model.candles !== undefined) {
      this.mainSeries.setData(model.candles as unknown as CandlestickData[]);
    }

    // Capabilities (RFC-003): el engine actualiza su serie y delega el resto del
    // modelo a los plugins registrados.
    this.capabilities.forEach((cap) => cap.render(model));
  }

  /**
   * O(1) incremental paint of ONE bar (upsert by time), for normal replay advance and for
   * the live "forming" bucket. Distinct from `render({ candles })`, which does a full
   * `setData` of the whole window: the caller chooses per frame, and that choice is
   * load-bearing (a large forward jump must NOT go bar-by-bar — see
   * `ChartComponent.render`).
   *
   * RFC-004/RFC-005: replaces the raw `seriesApi.update(...)` the bridge used to allow.
   * Takes the DOMAIN `Candle` (display time already applied by the caller, plain seconds);
   * the `CandlestickData` cast stays inside the engine, exactly as in `render`.
   */
  public upsertCandle(candle: Candle): void {
    this.mainSeries.update(candle as unknown as CandlestickData);
  }

  /**
   * Price at a pane y coordinate (container CSS px), or `null` when the series cannot
   * resolve it. Read-only geometry query — no behavior, so it does not touch kernel
   * invariant 2 (see `paneRect`'s note, which established this reasoning).
   */
  public priceForY(y: number): number | null {
    return this.mainSeries.coordinateToPrice(y) as number | null;
  }

  /** Pane y coordinate for a price, or `null` when it is not resolvable. Inverse of `priceForY`. */
  public yForPrice(price: number): number | null {
    return this.mainSeries.priceToCoordinate(price) as number | null;
  }

  /**
   * Pane x coordinate for a DISPLAY time (unix seconds already shifted by the caller's
   * display zone), via the time scale.
   *
   * Deliberately NOT the same mapping as `DrawingsCapability.xForTime`, which resolves by
   * BAR INDEX and is gap-immune (see `time-coordinates.ts`). This one is the library's
   * `timeToCoordinate`, and the single consumer (`ChartComponent.applySnap`) has always used
   * that mapping. Preserving it is a behavior-preservation requirement, not an oversight.
   */
  public xForDisplayTime(displayTime: number): number | null {
    return this.chart.timeScale().timeToCoordinate(displayTime as UTCTimestamp) as number | null;
  }

  /** Scrolls the time scale to the newest bar. */
  public scrollToRealTime(): void {
    this.chart.timeScale().scrollToRealTime();
  }

  /**
   * Sets the visible logical range WITHOUT echo suppression, for the lazy-prepend "hold the
   * view still" shift.
   *
   * Why this is not `applyVisibleRange`: that method arms the one-shot
   * `suppressNextRangeEvent` flag, so the resulting `VisibleRangeChanged` bus event is
   * swallowed. The lazy-prepend call site has never suppressed it, and the emission is
   * OBSERVABLE — `ChartSyncBus` consumers (other panels in the link group) follow the
   * shifted range through that event. Routing the prepend through `applyVisibleRange` would
   * silently stop synced panels from following a prepend. Two call sites with two different
   * echo semantics therefore need two methods.
   */
  public shiftVisibleRange(from: number, to: number): void {
    this.chart.timeScale().setVisibleLogicalRange({ from, to } as unknown as LogicalRange);
  }

  public setInteractivity(enabled: boolean): void {
    this.chart.applyOptions({ handleScroll: enabled, handleScale: enabled });
  }

  public resetPriceScale(): void {
    this.mainSeries.priceScale().applyOptions({ autoScale: true });
  }

  /**
   * D19.A: read-only geometry accessor for the plot pane, in container CSS px —
   * EXCLUDES the right price scale and the bottom time axis. `null` once destroyed.
   *
   * Does NOT violate kernel invariant 2 ("core closed; new behavior = new
   * Capability"): this adds no engine BEHAVIOR, it answers a question about
   * geometry the engine already owns via `chart`. `ChartComponent`'s DOM
   * handlers need it to stop interpreting axis-chrome clicks as pane clicks
   * (the coordinate-space bug D19.A fixes) — that consuming logic lives on
   * the Angular side, not here.
   *
   * Width source matches the established repo pattern (`trade-boxes-primitive.ts`,
   * `trade-buttons-primitive.ts`): `chart.timeScale().width()`. Height comes from
   * `chart.paneSize().height`, which lightweight-charts documents as "the chart
   * pane (the plot surface which excludes time and price scales)" — its `.width`
   * is the same pane-widget size `timeScale().width()` reports, so the two calls
   * describe one consistent rect, not two different ones.
   */
  public paneRect(): { width: number; height: number } | null {
    if (this.destroyed) return null;
    return {
      width: this.chart.timeScale().width(),
      height: this.chart.paneSize().height,
    };
  }

  public destroy(): void {
    this.capabilities.forEach((cap) => cap.destroy());
    this.capabilities.clear();
    this.capabilityBus.destroy();
    this.hostBus.destroy();
    this.chart.remove();
    this.destroyed = true;
  }
}
