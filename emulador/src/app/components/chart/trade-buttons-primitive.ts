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

/** One close/cancel button, anchored to the entry line of a trade. */
export interface TradeButton {
  id: string;
  target: 'order' | 'position';
  price: number;
}

/** State shared between the chart component and the primitive. */
export interface TradeButtonsSource {
  items: TradeButton[];
  /** Theme color for the button (usually the "down" red). */
  color: string;
}

/** Distance of the button center from the right edge of the pane (CSS px). */
const RIGHT_OFFSET = 18;
/** Button radius in CSS px (hit tolerance is slightly larger). */
const RADIUS = 9;

class TradeButtonsRenderer implements IPrimitivePaneRenderer {
  constructor(
    private buttons: { y: number }[],
    private color: string,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      const x = scope.bitmapSize.width - RIGHT_OFFSET * hr;
      for (const b of this.buttons) {
        const y = b.y * vr;
        const r = RADIUS * hr;
        // solid colored disc with a contrast ring: visible on any background
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.lineWidth = 1.5 * hr;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.stroke();
        // trash-can glyph (lid + handle, tapered body, two slots), white
        ctx.lineWidth = 1.4 * hr;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#FFFFFF';
        ctx.beginPath();
        // lid
        ctx.moveTo(x - 4.2 * hr, y - 3 * vr);
        ctx.lineTo(x + 4.2 * hr, y - 3 * vr);
        // handle
        ctx.moveTo(x - 1.5 * hr, y - 3 * vr);
        ctx.lineTo(x - 1.1 * hr, y - 4.6 * vr);
        ctx.lineTo(x + 1.1 * hr, y - 4.6 * vr);
        ctx.lineTo(x + 1.5 * hr, y - 3 * vr);
        // body (slightly narrower at the bottom)
        ctx.moveTo(x - 3.2 * hr, y - 3 * vr);
        ctx.lineTo(x - 2.6 * hr, y + 4.4 * vr);
        ctx.lineTo(x + 2.6 * hr, y + 4.4 * vr);
        ctx.lineTo(x + 3.2 * hr, y - 3 * vr);
        // slots
        ctx.moveTo(x - 1.1 * hr, y - 0.9 * vr);
        ctx.lineTo(x - 1.1 * hr, y + 2.4 * vr);
        ctx.moveTo(x + 1.1 * hr, y - 0.9 * vr);
        ctx.lineTo(x + 1.1 * hr, y + 2.4 * vr);
        ctx.stroke();
      }
    });
  }
}

class TradeButtonsPaneView implements IPrimitivePaneView {
  private buttons: { y: number }[] = [];

  constructor(private owner: TradeButtonsPrimitive) {}

  update(): void {
    const { series, source } = this.owner;
    if (!series || !source) {
      this.buttons = [];
      return;
    }
    this.buttons = [];
    for (const item of source.items) {
      const y = series.priceToCoordinate(item.price);
      if (y !== null) this.buttons.push({ y });
    }
  }

  renderer(): IPrimitivePaneRenderer {
    return new TradeButtonsRenderer(this.buttons, this.owner.source?.color ?? '#EF5350');
  }
}

/**
 * Canvas primitive that paints a small ×-circle next to the price axis on
 * the entry line of every pending order and open position, so trades can be
 * cancelled/closed directly from the chart.
 */
export class TradeButtonsPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  source: TradeButtonsSource | null = null;

  private view = new TradeButtonsPaneView(this);
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

  setSource(source: TradeButtonsSource): void {
    this.source = source;
    this.requestUpdate?.();
  }

  /**
   * Hit-test in CSS pixels: the button under the point, or null. The pane
   * width comes from the chart's time scale area (the container minus the
   * price axis), which is where the pane canvas ends.
   */
  hitTestDelete(x: number, y: number): TradeButton | null {
    const { chart, series, source } = this;
    if (!chart || !series || !source) return null;
    const paneWidth = chart.timeScale().width();
    const bx = paneWidth - RIGHT_OFFSET;
    const tol = RADIUS + 3;
    if (Math.abs(x - bx) > tol) return null;
    for (const item of source.items) {
      const by = series.priceToCoordinate(item.price);
      if (by !== null && Math.hypot(x - bx, y - by) <= tol) return item;
    }
    return null;
  }
}
