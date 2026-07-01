import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import { TradeBoxItem } from '../render-model';
import { TimeAnchor, xForTime } from '../../../components/chart/time-coordinates';

/** Vertical hit tolerance (px) for grabbing a box edge (SL/TP). */
const EDGE_GRAB_PX = 4;

/** State shared between the chart component and the primitive. */
export interface TradeBoxesSource extends TimeAnchor {
  items: TradeBoxItem[];
  /** Theme colors for the TP and SL zones. */
  tpColor: string;
  slColor: string;
  /** Base fill alpha (open positions); pending/closed scale from it. */
  fillAlpha: number;
  /** Alpha of the SL/TP edge stroke. */
  borderAlpha: number;
}

/** A trade box resolved to CSS-pixel coordinates. */
interface ScreenBox {
  id: string;
  status: TradeBoxItem['status'];
  x1: number;
  x2: number;
  yEntry: number;
  ySl: number;
  /** null = trade without TP (only the SL zone is drawn). */
  yTp: number | null;
}

/**
 * Per-status fill scale, relative to the user's base fill opacity (which
 * maps to the open state). Ratios keep the V2.4 dark look at its default
 * base of 0.12 (open 0.12, pending 0.07, closed 0.10).
 */
const FILL_SCALE: Record<TradeBoxItem['status'], number> = {
  open: 1,
  pending: 0.58,
  closed: 0.83,
};

/** Fallbacks when the source has not arrived yet. */
const DEFAULT_FILL_ALPHA = 0.12;
const DEFAULT_BORDER_ALPHA = 0.6;

function hexToRgba(hex: string, alpha: number): string {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

class TradeBoxesRenderer implements IPrimitivePaneRenderer {
  constructor(
    private boxes: ScreenBox[],
    private tpColor: string,
    private slColor: string,
    private fillAlpha: number,
    private borderAlpha: number,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const hr = scope.horizontalPixelRatio;
      const vr = scope.verticalPixelRatio;
      for (const b of this.boxes) {
        const x1 = b.x1 * hr;
        const x2 = b.x2 * hr;
        const dashed = b.status === 'pending';
        if (b.yTp !== null) {
          this.zone(ctx, x1, x2, b.yEntry * vr, b.yTp * vr, this.tpColor, b.status, dashed, hr);
        }
        this.zone(ctx, x1, x2, b.yEntry * vr, b.ySl * vr, this.slColor, b.status, dashed, hr);
      }
    });
  }

  /** Fills one TP/SL zone and strokes its far edge (the SL/TP level). */
  private zone(
    ctx: CanvasRenderingContext2D,
    x1: number,
    x2: number,
    yEntry: number,
    yLevel: number,
    color: string,
    status: TradeBoxItem['status'],
    dashed: boolean,
    hr: number,
  ): void {
    const top = Math.min(yEntry, yLevel);
    const h = Math.abs(yLevel - yEntry);
    ctx.fillStyle = hexToRgba(color, Math.min(1, this.fillAlpha * FILL_SCALE[status]));
    ctx.fillRect(x1, top, x2 - x1, h);
    ctx.save();
    if (dashed) ctx.setLineDash([4 * hr, 3 * hr]);
    ctx.lineWidth = 1 * hr;
    ctx.strokeStyle = hexToRgba(color, this.borderAlpha);
    ctx.beginPath();
    ctx.moveTo(x1, yLevel);
    ctx.lineTo(x2, yLevel);
    ctx.stroke();
    ctx.restore();
  }
}

class TradeBoxesPaneView implements IPrimitivePaneView {
  private boxes: ScreenBox[] = [];

  constructor(private owner: TradeBoxesPrimitive) {}

  update(): void {
    this.boxes = this.owner.computeScreenBoxes();
  }

  zOrder(): PrimitivePaneViewZOrder {
    // zones sit behind the candles and the user's drawings
    return 'bottom';
  }

  renderer(): IPrimitivePaneRenderer {
    const src = this.owner.source;
    return new TradeBoxesRenderer(
      this.boxes,
      src?.tpColor ?? '#089981',
      src?.slColor ?? '#F23645',
      src?.fillAlpha ?? DEFAULT_FILL_ALPHA,
      src?.borderAlpha ?? DEFAULT_BORDER_ALPHA,
    );
  }
}

/**
 * Canvas primitive that paints one TP/SL zone box per trade (TradingView
 * position-tool style): live trades grow with the replay, closed trades stay
 * frozen between open and close time as the visual trade record.
 */
export class TradeBoxesPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null;
  series: ISeriesApi<'Candlestick'> | null = null;
  source: TradeBoxesSource | null = null;

  private view = new TradeBoxesPaneView(this);
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

  setSource(source: TradeBoxesSource): void {
    this.source = source;
    this.requestUpdate?.();
  }

  updateAllViews(): void {
    this.view.update();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.view];
  }

  /**
   * Visible boxes in CSS pixels. Hidden boxes are skipped entirely; boxes
   * fully off one side of the pane are culled and the rest clamped so canvas
   * never receives huge rectangles on deep zoom-outs.
   *
   * Culling is by RESOLVED X (not by `getVisibleRange`, whose `to` is the last
   * data bar and excludes the future space between that bar and the replay
   * cursor — a trade opened inside the current coarse bar lives there and was
   * being dropped on M15/M30/H1/…).
   */
  computeScreenBoxes(): ScreenBox[] {
    const { chart, series, source } = this;
    if (!chart || !series || !source) return [];
    const paneWidth = chart.timeScale().width();
    const clamp = (x: number) => Math.max(-10, Math.min(paneWidth + 10, x));
    const out: ScreenBox[] = [];
    const lastRenderedUtc = source.times.length ? source.times[source.times.length - 1] : 0;
    for (const item of source.items) {
      if (item.hidden) continue;
      // live boxes grow up to one bar past the last rendered candle
      const toUtc = item.to ?? lastRenderedUtc + source.barSpacing;
      const x1 = xForTime(chart, source, item.from);
      const x2 = xForTime(chart, source, toUtc);
      const yEntry = series.priceToCoordinate(item.entry);
      const ySl = series.priceToCoordinate(item.sl);
      if (x1 === null || x2 === null || yEntry === null || ySl === null) continue;
      // cull boxes that fall entirely off one side of the pane
      if (Math.max(x1, x2) < -10 || Math.min(x1, x2) > paneWidth + 10) continue;
      const yTp = item.tp !== null ? series.priceToCoordinate(item.tp) : null;
      out.push({
        id: item.id,
        status: item.status,
        x1: clamp(Math.min(x1, x2)),
        x2: clamp(Math.max(x1, x2)),
        yEntry,
        ySl,
        yTp: yTp ?? null,
      });
    }
    return out;
  }

  /**
   * Hit-test (CSS px) of the SL/TP edge of a LIVE box (open/pending): the
   * grabbable handle for modifying the trade. Closed boxes are the immutable
   * trade record and never match.
   */
  hitTestEdge(
    x: number,
    y: number,
  ): { id: string; status: 'open' | 'pending'; field: 'sl' | 'tp' } | null {
    for (const b of this.computeScreenBoxes()) {
      if (b.status === 'closed') continue;
      if (x < b.x1 || x > b.x2) continue;
      if (b.yTp !== null && Math.abs(y - b.yTp) <= EDGE_GRAB_PX) {
        return { id: b.id, status: b.status, field: 'tp' };
      }
      if (Math.abs(y - b.ySl) <= EDGE_GRAB_PX) {
        return { id: b.id, status: b.status, field: 'sl' };
      }
    }
    return null;
  }

  /** Hit-test (CSS px) of a CLOSED box body, for the context menu. */
  hitTestBox(x: number, y: number): { id: string } | null {
    const boxes = this.computeScreenBoxes();
    // walk from the top (last drawn) downwards
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      if (b.status !== 'closed') continue;
      if (x < b.x1 || x > b.x2) continue;
      const ys = [b.yEntry, b.ySl, ...(b.yTp !== null ? [b.yTp] : [])];
      if (y >= Math.min(...ys) && y <= Math.max(...ys)) return { id: b.id };
    }
    return null;
  }
}
