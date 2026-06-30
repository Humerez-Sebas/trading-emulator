import type {
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts';

/** State the chart feeds the countdown tag. */
export interface CountdownSource {
  /** Price the tag anchors to: the forming close in sub-TF mode, else the last close. */
  price: number;
  /** Formatted remaining time, e.g. "06:58". */
  text: string;
  backColor: string;
  textColor: string;
}

/** Pixels below the current-price label where the countdown tag sits. */
const BELOW_OFFSET = 18;

/** Price-axis label for the candle-close countdown, just below the price tag. */
class CountdownAxisView implements ISeriesPrimitiveAxisView {
  constructor(private owner: CountdownPrimitive) {}

  private y(): number | null {
    const { series, source } = this.owner;
    return series && source ? series.priceToCoordinate(source.price) : null;
  }

  coordinate(): number {
    const y = this.y();
    // Off-scale → park it far off so the axis leaves no gap for it.
    return y === null ? -1000 : y + BELOW_OFFSET;
  }
  text(): string {
    return this.owner.source?.text ?? '';
  }
  textColor(): string {
    return this.owner.source?.textColor ?? '#ffffff';
  }
  backColor(): string {
    return this.owner.source?.backColor ?? '#363a45';
  }
  visible(): boolean {
    return !!this.owner.source?.text && this.y() !== null;
  }
  tickVisible(): boolean {
    return false;
  }
}

/**
 * Series primitive that draws a TradingView-style candle-close countdown as a
 * tag on the price axis, just below the current-price label. Uses the native
 * price-axis-view API (no invisible price-line / pointSize-offset hack), so the
 * position is exact and it never paints a line across the chart.
 */
export class CountdownPrimitive implements ISeriesPrimitive<Time> {
  series: ISeriesApi<'Candlestick'> | null = null;
  source: CountdownSource | null = null;

  private view = new CountdownAxisView(this);
  private requestUpdate: (() => void) | null = null;

  attached(param: SeriesAttachedParameter<Time>): void {
    this.series = param.series as ISeriesApi<'Candlestick'>;
    this.requestUpdate = param.requestUpdate;
  }
  detached(): void {
    this.series = null;
    this.requestUpdate = null;
  }

  updateAllViews(): void {
    // The axis view reads `source` lazily; nothing to precompute.
  }

  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this.source ? [this.view] : [];
  }

  /** Update (or clear with `null`) the countdown tag and repaint the axis. */
  setSource(source: CountdownSource | null): void {
    this.source = source;
    this.requestUpdate?.();
  }
}
