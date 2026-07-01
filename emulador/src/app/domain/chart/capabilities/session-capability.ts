import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { Capability } from '../capability';
import { ChartEventBus } from '../chart-event-bus';
import { RenderModel } from '../render-model';
import { SessionPrimitive } from './session-primitive';

export class SessionCapability implements Capability {
  readonly id = 'session';

  private chart: IChartApi | null = null;
  private bus: ChartEventBus | null = null;
  private primitive: SessionPrimitive | null = null;
  private isDestroyed = false;

  constructor(private series: ISeriesApi<'Candlestick'>) {}

  init(chart: IChartApi, bus: ChartEventBus): void {
    if (this.isDestroyed) return;
    this.chart = chart;
    this.bus = bus;
    this.primitive = new SessionPrimitive();
    this.series.attachPrimitive(this.primitive);
  }

  render(model: Partial<RenderModel>): void {
    if (this.isDestroyed || !this.primitive) return;
    if (model.session !== undefined) {
      const s = model.session;
      if (!s || s.sessionEnd === null) {
        this.primitive.setSource(null);
      } else {
        this.primitive.setSource({
          sessionEnd: s.sessionEnd,
          shift: s.shift,
          times: s.times,
          barSpacing: s.barSpacing,
          color: s.color,
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
