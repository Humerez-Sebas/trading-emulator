import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickSeries,
  CandlestickData,
  CrosshairMode,
  LogicalRange,
  UTCTimestamp,
} from 'lightweight-charts';
import { RenderModel } from './render-model';
import { ChartEventBus } from './chart-event-bus';
import { Capability } from './capability';
import { hexToRgba } from './color-utils';

export interface ChartApplyHandle {
  /** Sets the crosshair to a given time; `null` clears it. Re-entrancy-guarded (see class doc). */
  applyCrosshair(time: UTCTimestamp | null): void;
  /** Sets the visible logical range; `null` is a no-op (never clears). Re-entrancy-guarded. */
  applyVisibleRange(range: LogicalRange | null): void;
}

export class ChartEngine implements ChartApplyHandle {
  // TODO: Eliminar esta exposición directa en RFC-004/RFC-005 una vez que DrawingsCapability y TradingCapability estén implementados.
  public get chartApi(): IChartApi {
    return this.chart;
  }
  public get seriesApi(): ISeriesApi<'Candlestick'> {
    return this.mainSeries;
  }

  private chart: IChartApi;
  private mainSeries: ISeriesApi<'Candlestick'>;

  private bus = new ChartEventBus();
  private capabilities = new Map<string, Capability>();
  public get events(): ChartEventBus {
    return this.bus;
  }

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

    this.chart.subscribeClick((p) => this.bus.emit('ChartClicked', p));
    this.chart.subscribeDblClick((p) => this.bus.emit('ChartClicked', p));
    this.chart.subscribeCrosshairMove((p) => {
      if (!this.applyingSync) this.bus.emit('CrosshairMoved', p);
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
      if (!this.applyingSync) this.bus.emit('VisibleRangeChanged', r);
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

  public registerCapability(cap: Capability): void {
    if (this.capabilities.has(cap.id)) {
      throw new Error(`Capability with ID "${cap.id}" is already registered.`);
    }
    this.capabilities.set(cap.id, cap);
    cap.init(this.chart, this.bus);
  }

  public getCapability<T extends Capability = Capability>(id: string): T | undefined {
    return this.capabilities.get(id) as T | undefined;
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

  public setInteractivity(enabled: boolean): void {
    this.chart.applyOptions({ handleScroll: enabled, handleScale: enabled });
  }

  public resetPriceScale(): void {
    this.mainSeries.priceScale().applyOptions({ autoScale: true });
  }

  public destroy(): void {
    this.capabilities.forEach((cap) => cap.destroy());
    this.capabilities.clear();
    this.bus.destroy();
    this.chart.remove();
  }
}
