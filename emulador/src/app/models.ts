/** OHLC candle. `time` in unix seconds (UTC), as expected by lightweight-charts. */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** All MetaTrader 5 timeframes. */
export type Timeframe =
  | 'M1'
  | 'M2'
  | 'M3'
  | 'M4'
  | 'M5'
  | 'M6'
  | 'M10'
  | 'M12'
  | 'M15'
  | 'M20'
  | 'M30'
  | 'H1'
  | 'H2'
  | 'H3'
  | 'H4'
  | 'H6'
  | 'H8'
  | 'H12'
  | 'D1'
  | 'W1'
  | 'MN1';

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M2: 120,
  M3: 180,
  M4: 240,
  M5: 300,
  M6: 360,
  M10: 600,
  M12: 720,
  M15: 900,
  M20: 1200,
  M30: 1800,
  H1: 3600,
  H2: 7200,
  H3: 10800,
  H4: 14400,
  H6: 21600,
  H8: 28800,
  H12: 43200,
  D1: 86400,
  W1: 604800,
  MN1: 2592000, // ~30 days; monthly spacing varies (28-31)
};

export const TIMEFRAME_ORDER: Timeframe[] = [
  'M1',
  'M2',
  'M3',
  'M4',
  'M5',
  'M6',
  'M10',
  'M12',
  'M15',
  'M20',
  'M30',
  'H1',
  'H2',
  'H3',
  'H4',
  'H6',
  'H8',
  'H12',
  'D1',
  'W1',
  'MN1',
];

/**
 * Infers the timeframe from the typical spacing between candles.
 * Uses the closest match with tolerance because W1/MN1 spacing varies
 * (months have 28-31 days) and brokers may have occasional gaps.
 */
export function detectTimeframe(candles: Candle[]): Timeframe | null {
  if (candles.length < 3) return null;
  const gaps: number[] = [];
  for (let i = 1; i < Math.min(candles.length, 50); i++) {
    gaps.push(candles[i].time - candles[i - 1].time);
  }
  gaps.sort((a, b) => a - b);
  const typical = gaps[Math.floor(gaps.length / 2)]; // median: robust to weekends

  let best: Timeframe | null = null;
  let bestDiff = Infinity;
  for (const [tf, secs] of Object.entries(TIMEFRAME_SECONDS) as [Timeframe, number][]) {
    const relDiff = Math.abs(typical - secs) / secs;
    if (relDiff < bestDiff) {
      bestDiff = relDiff;
      best = tf;
    }
  }
  return bestDiff <= 0.15 ? best : null;
}

/**
 * Derives the minimum price increment from the data: the largest power of
 * ten that all sampled closes are a multiple of (gold: 0.01, EURUSD: 0.00001).
 */
export function derivePointSize(candles: Candle[]): number {
  const sample = candles.slice(0, 30).map((c) => c.close);
  for (const p of [1, 0.1, 0.01, 0.001, 0.0001, 0.00001]) {
    if (sample.every((v) => Math.abs(v / p - Math.round(v / p)) < 1e-4)) return p;
  }
  return 0.00001;
}

/**
 * Derives the asset symbol from a CSV file name like "xauusd_h1.csv".
 * Falls back to the base name (without extension) uppercased.
 */
export function symbolFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  const m = /^([A-Za-z0-9]+?)[._-]/.exec(base);
  return (m ? m[1] : base).toUpperCase();
}
