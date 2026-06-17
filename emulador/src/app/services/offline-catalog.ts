import { Candle, Timeframe } from '../models';
import { TfCoverage } from './backend-api.service';

/** Default category for user-uploaded CSV symbols in the offline catalog. */
export const DEFAULT_OFFLINE_CATEGORY = 'Mis CSV';

/**
 * Browser-side analog of a backend symbol: the metadata the offline Markets
 * page and the wizard need to list and re-create sessions from uploaded CSVs.
 * Candle arrays stay in the `series` store; this only holds the light rollup.
 */
export interface OfflineSymbol {
  symbol: string;
  descripcion: string;
  categoria: string;
  digits?: number;
  coverage: TfCoverage[];
  createdAt: number;
  lastModified: number;
}

/** One parsed CSV: a timeframe and its candles (the wizard's working unit). */
export interface ParsedTf {
  tf: Timeframe;
  candles: Candle[];
}

/**
 * Derives per-timeframe coverage (first/last time + count) from parsed candles.
 * Groups by timeframe so several files of the same TF merge into one entry.
 * Pure — no I/O — so both the wizard and the catalog writer can reuse it.
 */
export function coverageFromParsed(files: ParsedTf[]): TfCoverage[] {
  const byTf = new Map<Timeframe, Candle[]>();
  for (const f of files) {
    if (!f.candles.length) continue;
    byTf.set(f.tf, (byTf.get(f.tf) ?? []).concat(f.candles));
  }
  const out: TfCoverage[] = [];
  for (const [tf, candles] of byTf) {
    let desde = candles[0].time;
    let hasta = candles[0].time;
    for (const c of candles) {
      if (c.time < desde) desde = c.time;
      if (c.time > hasta) hasta = c.time;
    }
    out.push({ tf, desde, hasta, velas: candles.length });
  }
  return out;
}
