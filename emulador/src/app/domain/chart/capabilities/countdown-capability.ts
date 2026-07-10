import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { Capability } from '../capability';
import { ChartEventBus } from '../chart-event-bus';
import { RenderModel } from '../render-model';
import { CountdownPrimitive } from './countdown-primitive';

export class CountdownCapability implements Capability {
  readonly id = 'countdown';

  private chart: IChartApi | null = null;
  private bus: ChartEventBus | null = null;
  private primitive: CountdownPrimitive | null = null;
  private isDestroyed = false;

  constructor(private series: ISeriesApi<'Candlestick'>) {}

  init(chart: IChartApi, bus: ChartEventBus): void {
    if (this.isDestroyed || this.primitive) return;
    this.chart = chart;
    this.bus = bus;
    this.primitive = new CountdownPrimitive();
    this.series.attachPrimitive(this.primitive);
  }

  render(model: Partial<RenderModel>): void {
    if (this.isDestroyed || !this.primitive) return;
    if (model.countdown !== undefined) {
      const c = model.countdown;
      if (!c || c.price === null || c.text === null || c.text === '') {
        this.primitive.setSource(null);
      } else {
        this.primitive.setSource({
          price: c.price,
          text: c.text,
          backColor: c.backColor ?? '#363a45',
          textColor: c.textColor ?? '#ffffff',
        });
      }
    }
  }

  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    if (this.primitive) {
      this.series.detachPrimitive(this.primitive);
      this.primitive = null;
    }
    this.chart = null;
    this.bus = null;
  }
}
