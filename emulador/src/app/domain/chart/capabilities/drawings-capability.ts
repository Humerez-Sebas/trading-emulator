import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { Capability } from '../capability';
import { ChartEventBus } from '../chart-event-bus';
import { RenderModel } from '../render-model';
import { DrawingsPrimitive } from './drawings-primitive';

export class DrawingsCapability implements Capability {
  readonly id = 'drawings';

  private chart: IChartApi | null = null;
  private bus: ChartEventBus | null = null;
  private primitive: DrawingsPrimitive | null = null;
  private isDestroyed = false;

  constructor(private series: ISeriesApi<'Candlestick'>) {}

  init(chart: IChartApi, bus: ChartEventBus): void {
    if (this.isDestroyed) return;
    this.chart = chart;
    this.bus = bus;
    this.primitive = new DrawingsPrimitive();
    this.series.attachPrimitive(this.primitive);
  }

  render(model: Partial<RenderModel>): void {
    if (this.isDestroyed || !this.primitive) return;
    if (model.drawings) {
      const d = model.drawings;
      this.primitive.setSource({
        items: d.items,
        draft: d.draft,
        selectedId: d.selectedId,
        shift: d.shift,
        times: d.times,
        barSpacing: d.barSpacing,
        pointSize: d.pointSize,
        accent: d.colors.accent,
        up: d.colors.up,
        down: d.colors.down,
      });
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

  timeForX(x: number): number | null {
    if (this.isDestroyed || !this.primitive) return null;
    return this.primitive.timeForX(x);
  }

  xForTime(timeUtc: number): number | null {
    if (this.isDestroyed || !this.primitive) return null;
    return this.primitive.xForTime(timeUtc);
  }

  hitTestDrawing(x: number, y: number): string | null {
    if (this.isDestroyed || !this.primitive) return null;
    return this.primitive.hitTestDrawing(x, y);
  }

  hitTestHandle(x: number, y: number): 'p1' | 'p2' | null {
    if (this.isDestroyed || !this.primitive) return null;
    return this.primitive.hitTestHandle(x, y);
  }
}
