import { createChart, IChartApi, ISeriesApi, CandlestickSeries, CandlestickData, CrosshairMode } from 'lightweight-charts';
import { RenderModel } from './render-model';
import { ChartEventBus } from './chart-event-bus';
import { Capability } from './capability';

export class ChartEngine {
  // TODO: Eliminar esta exposición directa en RFC-004/RFC-005 una vez que DrawingsCapability y TradingCapability estén implementados.
  public get chartApi(): IChartApi { return this.chart; }
  public get seriesApi(): ISeriesApi<"Candlestick"> { return this.mainSeries; }

  private chart: IChartApi;
  private mainSeries: ISeriesApi<"Candlestick">;

  private bus = new ChartEventBus();
  private capabilities = new Map<string, Capability>();
  public get events(): ChartEventBus { return this.bus; }

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
    this.chart.subscribeCrosshairMove((p) => this.bus.emit('CrosshairMoved', p));
    this.chart
      .timeScale()
      .subscribeVisibleLogicalRangeChange((r) => this.bus.emit('VisibleRangeChanged', r));
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
      const gridColor = this.hexToRgba(c.grid, model.config.gridOpacity);
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

  private hexToRgba(hex: string, alpha: number): string {
    const v = hex.replace('#', '');
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  public destroy(): void {
    this.capabilities.forEach((cap) => cap.destroy());
    this.capabilities.clear();
    this.bus.destroy();
    this.chart.remove();
  }
}
