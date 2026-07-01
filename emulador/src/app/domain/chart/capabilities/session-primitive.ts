import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import { xForTime } from '../../../components/chart/time-coordinates';

export interface SessionSource {
  sessionEnd: number | null;
  shift: number;
  times: number[];
  barSpacing: number;
  color?: string;
}

class SessionRenderer implements IPrimitivePaneRenderer {
  constructor(
    private x: number,
    private color: string
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;

      const xPixel = this.x * hr;
      const y1 = 0 * vr;
      const y2 = ctx.canvas.height;

      ctx.save();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1 * hr;
      ctx.setLineDash([4 * hr, 4 * hr]);

      ctx.beginPath();
      ctx.moveTo(xPixel, y1);
      ctx.lineTo(xPixel, y2);
      ctx.stroke();

      ctx.restore();
    });
  }
}

class SessionPaneView implements IPrimitivePaneView {
  private x: number | null = null;

  constructor(private owner: SessionPrimitive) {}

  update(): void {
    const { chart, source } = this.owner;
    if (!chart || !source || source.sessionEnd === null) {
      this.x = null;
      return;
    }
    this.x = xForTime(chart, source, source.sessionEnd);
  }

  renderer(): IPrimitivePaneRenderer | null {
    if (this.x === null) return null;
    return new SessionRenderer(this.x, this.owner.source?.color ?? '#7b7b7b');
  }
}

export class SessionPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  source: SessionSource | null = null;

  private view = new SessionPaneView(this);
  private requestUpdate: (() => void) | null = null;

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart;
    this.series = param.series as ISeriesApi<'Candlestick'>;
    this.requestUpdate = param.requestUpdate;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  updateAllViews(): void {
    this.view.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.view];
  }

  setSource(source: SessionSource | null): void {
    this.source = source;
    this.requestUpdate?.();
  }
}
