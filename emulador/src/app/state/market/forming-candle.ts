import { Candle } from '../../models';
import { firstIndexAtOrAfter, lastIndexAtOrBefore } from '../trading/fill-engine';

/**
 * RFC-019 (D19.F) — aggregates the resolution/replay candles revealed inside one display
 * bucket into a partial "forming" candle. PURE AGGREGATION, NO POLICY: it does not decide
 * whether a forming candle is appropriate — every caller owns that guard (see N19-2/N19-3).
 * Deliberately takes `bucketStart` rather than a duration: threading minutes (or seconds)
 * through re-creates the /60 round-trip that is a latent hazard for sub-minute timeframes.
 */
export function aggregateFormingCandle(
  resSeries: Candle[] | null,
  bucketStart: number,
  cursor: number,
): Candle | null {
  if (!resSeries) return null;
  // Aggregate the bucket's revealed candles [bucketStart, cursor] directly over
  // their indices — no intermediate slice array (avoids GC churn at fast autoplay).
  const lo = firstIndexAtOrAfter(resSeries, bucketStart);
  const hi = lastIndexAtOrBefore(resSeries, cursor);
  if (hi < lo) return null;
  let high = resSeries[lo].high;
  let low = resSeries[lo].low;
  for (let i = lo + 1; i <= hi; i++) {
    if (resSeries[i].high > high) high = resSeries[i].high;
    if (resSeries[i].low < low) low = resSeries[i].low;
  }
  return {
    time: bucketStart,
    open: resSeries[lo].open,
    high,
    low,
    close: resSeries[hi].close,
  };
}
