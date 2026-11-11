import { Candle, Timeframe } from '../models';

/**
 * Storage abstraction for candle data.
 *
 * Using an abstract class (not a bare `interface`) so Angular's DI can use it
 * as an injection token via `@Inject(MarketDataRepository)` or as a `deps`
 * entry in a factory provider — interfaces are erased at runtime.
 */
export abstract class MarketDataRepository {
  /**
   * Returns all candles for the given symbol and timeframe, sorted ascending
   * by `time` (unix seconds UTC).
   */
  abstract getCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]>;

  /**
   * Candles with `t0 <= time <= t1` (unix seconds UTC, inclusive) for the
   * symbol+tf, ascending by `time`. Bounded: reads only the key range, never
   * the whole series.
   */
  abstract getCandlesInRange(
    symbol: string,
    timeframe: Timeframe,
    t0: number,
    t1: number,
  ): Promise<Candle[]>;

  /**
   * Earliest and latest candle `time` (unix seconds UTC) for the symbol+tf, or
   * `null` when there are none. Cheap: reads only the two edge rows.
   */
  abstract getCoverage(
    symbol: string,
    timeframe: Timeframe,
  ): Promise<{ from: number; to: number } | null>;
}
