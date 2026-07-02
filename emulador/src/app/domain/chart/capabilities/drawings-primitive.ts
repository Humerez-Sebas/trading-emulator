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
import { Drawing } from '../render-model';
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
import { timeForX, xForTime } from '../time-coordinates';
import { hexToRgba } from '../color-utils';

/** On-screen drawing (media/CSS px coordinates already resolved). */
interface ScreenShape {
  id: string;
  kind: Drawing['kind'];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  selected: boolean;
  priceA: number;
  priceB: number;
  timeA: number;
  timeB: number;
}

/** State shared between the chart component and the primitive. */
export interface DrawingsSource {
  items: Drawing[];
  draft: Drawing | null;
  selectedId: string | null;
  /** display offset in seconds (time zone) */
  shift: number;
  /** UTC times of the currently rendered bars (anchor for time<->x mapping) */
  times: number[];
  barSpacing: number;
  /** minimum price increment of the symbol (for the ruler's points readout) */
  pointSize: number;
  accent: string;
  up: string;
  down: string;
}

class DrawingsRenderer implements IPrimitivePaneRenderer {
  constructor(
    private shapes: ScreenShape[],
    private colors: { accent: string; up: string; down: string },
    private meta: { barSpacing: number; pointSize: number },
    private priceFmt: (p: number) => string,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;

      const w = ctx.canvas.width;
      for (const s of this.shapes) {
        const x1 = s.x1 * hr,
          y1 = s.y1 * vr,
          x2 = s.x2 * hr,
          y2 = s.y2 * vr;
        // defensive cull: skip shapes whose BOTH endpoints fall off the same
        // side of the pane, so a bad coordinate can never paint across it
        if ((x1 < 0 && x2 < 0) || (x1 > w && x2 > w)) continue;
        ctx.lineWidth = (s.selected ? 2 : 1.4) * hr;
        ctx.strokeStyle = this.colors.accent;

        if (s.kind === 'rect') {
          ctx.fillStyle = hexToRgba(this.colors.accent, 0.16);
          ctx.beginPath();
          ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
          ctx.fill();
          ctx.stroke();
        } else if (s.kind === 'line') {
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        } else if (s.kind === 'fib') {
          this.drawFib(ctx, s, x1, y1, x2, y2, hr, vr);
        } else if (s.kind === 'ruler') {
          this.drawRuler(ctx, s, x1, y1, x2, y2, hr, vr);
        }

        if (s.selected) {
          // handles at the endpoints
          ctx.fillStyle = this.colors.accent;
          for (const [hx, hy] of [
            [x1, y1],
            [x2, y2],
          ]) {
            ctx.beginPath();
            ctx.arc(hx, hy, 4 * hr, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    });
  }

  private drawFib(
    ctx: CanvasRenderingContext2D,
    s: ScreenShape,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    hr: number,
    vr: number,
  ): void {
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    ctx.font = `${11 * vr}px Inter, sans-serif`;
    ctx.textBaseline = 'bottom';

    for (const level of FIB_LEVELS) {
      const y = y1 + (y2 - y1) * level;
      const price = s.priceA + (s.priceB - s.priceA) * level;
      ctx.strokeStyle = level === 0.5 ? this.colors.down : this.colors.accent;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.fillStyle = this.colors.up;
      ctx.fillText(`${(level * 100).toFixed(1)}%  ${this.priceFmt(price)}`, left + 4 * hr, y - 2);
    }
  }

  /**
   * MT5-style measurement: dashed line with a label showing the candle
   * count, price delta in points, and percentage change.
   */
  private drawRuler(
    ctx: CanvasRenderingContext2D,
    s: ScreenShape,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    hr: number,
    vr: number,
  ): void {
    ctx.save();
    ctx.setLineDash([6 * hr, 4 * hr]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    const priceDiff = s.priceB - s.priceA;
    const bars =
      this.meta.barSpacing > 0 ? Math.round((s.timeB - s.timeA) / this.meta.barSpacing) : 0;
    const points =
      this.meta.pointSize > 0 ? Math.round(Math.abs(priceDiff) / this.meta.pointSize) : 0;
    const pct = s.priceA !== 0 ? (priceDiff / s.priceA) * 100 : 0;
    const sign = priceDiff >= 0 ? '+' : '−';
    const text = `${Math.abs(bars)} velas  ${sign}${this.priceFmt(Math.abs(priceDiff))}  ${points} pts  ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;

    ctx.font = `${11 * vr}px Inter, sans-serif`;
    const padX = 6 * hr;
    const padY = 4 * vr;
    const w = ctx.measureText(text).width + padX * 2;
    const h = 16 * vr + padY;
    // label next to the end point, kept inside the canvas horizontally
    let lx = x2 + 8 * hr;
    const ly = y2 - h / 2;
    if (lx + w > ctx.canvas.width) lx = x2 - w - 8 * hr;

    ctx.fillStyle = hexToRgba(this.colors.accent, 0.9);
    ctx.beginPath();
    ctx.rect(lx, ly, w, h);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, lx + padX, ly + h / 2);
    ctx.restore();
  }


}

class DrawingsPaneView implements IPrimitivePaneView {
  private shapes: ScreenShape[] = [];

  constructor(private owner: DrawingsPrimitive) {}

  update(): void {
    const { chart, series, source } = this.owner;
    if (!chart || !series || !source) {
      this.shapes = [];
      return;
    }
    const all = source.draft ? [...source.items, source.draft] : source.items;
    this.shapes = [];
    for (const d of all) {
      const x1 = this.owner.xForTime(d.p1.time);
      const x2 = this.owner.xForTime(d.p2.time);
      const y1 = series.priceToCoordinate(d.p1.price);
      const y2 = series.priceToCoordinate(d.p2.price);
      if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
      this.shapes.push({
        id: d.id,
        kind: d.kind,
        x1,
        y1,
        x2,
        y2,
        selected: d.id === source.selectedId,
        priceA: d.p1.price,
        priceB: d.p2.price,
        timeA: d.p1.time,
        timeB: d.p2.time,
      });
    }
  }

  renderer(): IPrimitivePaneRenderer {
    const src = this.owner.source;
    return new DrawingsRenderer(
      this.shapes,
      {
        accent: src?.accent ?? '#2962FF',
        up: src?.up ?? '#26A69A',
        down: src?.down ?? '#EF5350',
      },
      { barSpacing: src?.barSpacing ?? 0, pointSize: src?.pointSize ?? 0.01 },
      (p) => p.toFixed(2),
    );
  }
}

/**
 * lightweight-charts v5 primitive that paints the user's drawings
 * (rectangles, lines, fibonacci) anchored to (time, price).
 */
export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  source: DrawingsSource | null = null;

  private view = new DrawingsPaneView(this);
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

  setSource(source: DrawingsSource): void {
    this.source = source;
    this.requestUpdate?.();
  }

  /**
   * X coordinate for a UTC time; beyond the last candle it extrapolates by
   * logical index so that drawings can be projected into the future.
   */
  xForTime(timeUtc: number): number | null {
    const { chart, source } = this;
    if (!chart || !source) return null;
    return xForTime(chart, source, timeUtc);
  }

  /** UTC time for an X coordinate, extrapolating into the future space. */
  timeForX(x: number): number | null {
    const { chart, source } = this;
    if (!chart || !source) return null;
    return timeForX(chart, source, x);
  }

  updateAllViews(): void {
    this.view.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.view];
  }

  /**
   * Hit-test in CSS pixels: returns the id of the drawing under the point.
   * (Not named hitTest because ISeriesPrimitive reserves that name.)
   */
  hitTestDrawing(x: number, y: number): string | null {
    const { chart, series, source } = this;
    if (!chart || !series || !source) return null;
    const tol = 6;
    // walk from the top (last drawn) downwards
    for (let i = source.items.length - 1; i >= 0; i--) {
      const d = source.items[i];
      const x1 = this.xForTime(d.p1.time);
      const x2 = this.xForTime(d.p2.time);
      const y1 = series.priceToCoordinate(d.p1.price);
      const y2 = series.priceToCoordinate(d.p2.price);
      if (x1 === null || x2 === null || y1 === null || y2 === null) continue;

      if (d.kind === 'rect' || d.kind === 'fib') {
        const inX = x >= Math.min(x1, x2) - tol && x <= Math.max(x1, x2) + tol;
        const inY = y >= Math.min(y1, y2) - tol && y <= Math.max(y1, y2) + tol;
        if (inX && inY) return d.id;
      } else {
        if (this.distToSegment(x, y, x1, y1, x2, y2) <= tol) return d.id;
      }
    }
    return null;
  }

  /**
   * Hit-test for the resize handles of the SELECTED drawing.
   * Returns which endpoint is under the cursor, or null.
   */
  hitTestHandle(x: number, y: number): 'p1' | 'p2' | null {
    const { series, source } = this;
    if (!series || !source || !source.selectedId) return null;
    const d = source.items.find((it) => it.id === source.selectedId);
    if (!d) return null;
    const tol = 8;
    const x1 = this.xForTime(d.p1.time);
    const x2 = this.xForTime(d.p2.time);
    const y1 = series.priceToCoordinate(d.p1.price);
    const y2 = series.priceToCoordinate(d.p2.price);
    if (x1 !== null && y1 !== null && Math.hypot(x - x1, y - y1) <= tol) return 'p1';
    if (x2 !== null && y2 !== null && Math.hypot(x - x2, y - y2) <= tol) return 'p2';
    return null;
  }

  private distToSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  }
}
