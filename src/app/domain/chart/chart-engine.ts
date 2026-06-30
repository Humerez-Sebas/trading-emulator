import { createChart, IChartApi, ISeriesApi, CandlestickSeries } from 'lightweight-charts';
import { RenderModel } from './render-model';

export class ChartEngine {
  private chart: IChartApi;
  private mainSeries: ISeriesApi<"Candlestick">;
  
  constructor(container: HTMLElement) {
    this.chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: { background: { color: '#000000' }, textColor: '#ffffff' },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
    });
    
    this.mainSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    
    window.addEventListener('resize', this.onResize);
  }
  
  public render(model: RenderModel): void {
    // 1. Update config
    this.chart.applyOptions({
      layout: {
        background: { color: model.config.colors.background },
        textColor: model.config.colors.text,
      }
    });
    
    // 2. Update data efficiently
    if (model.candles.length > 0) {
      this.mainSeries.setData(model.candles as any);
    }
  }
  
  public destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.chart.remove();
  }
  
  private onResize = () => {
    if (this.chart && this.chart.timeScale()) {
      // Container size should be handled externally or via ResizeObserver, 
      // but for simplicity in RFC 001 we bind to window.
    }
  };
}
