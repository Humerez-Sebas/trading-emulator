import { createChart, IChartApi, ISeriesApi, CandlestickSeries, CandlestickData, CrosshairMode } from 'lightweight-charts';
import { RenderModel } from './render-model';

export class ChartEngine {
  // TODO: Eliminar esta exposición directa en RFC-004/RFC-005 una vez que DrawingsCapability y TradingCapability estén implementados.
  public get chartApi(): IChartApi { return this.chart; }
  public get seriesApi(): ISeriesApi<"Candlestick"> { return this.mainSeries; }

  private chart: IChartApi;
  private mainSeries: ISeriesApi<"Candlestick">;

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
    this.chart.remove();
  }
}
