/* eslint-disable @angular-eslint/prefer-inject -- constructor inject()-defaults keep this service unit-testable via direct construction (new Service(deps)) without TestBed; see services design note. */
import { inject, Injectable } from '@angular/core';
import { Candle } from '../models';
import { MarketDataRepository } from '../domain/market-data.repository';
import type { AnchorTf } from './session.service';

/**
 * Dynamic Timeframe Generator (Task 10).
 *
 * The system persists ONLY the M1/H1/D1 anchors; every other timeframe — the
 * built-ins (M5, H4, …) and arbitrary custom ones (M45, M90, …) — is generated
 * in memory by aggregating the smallest anchor that divides the request:
 *   - tf % 1440 === 0 → aggregate from D1 (whole days)
 *   - tf % 60   === 0 → aggregate from H1 (whole hours)
 *   - otherwise        → aggregate from M1
 * Choosing the coarsest valid anchor keeps the aggregation cheap while
 * guaranteeing the anchor granularity divides the target evenly.
 */

/** Minutes represented by each stored anchor. */
export const ANCHOR_MINUTES: Record<AnchorTf, number> = { M1: 1, H1: 60, D1: 1440 };

/** The coarsest stored anchor that divides a target timeframe (in minutes). */
export function anchorFor(tfMinutes: number): AnchorTf {
  if (tfMinutes % 1440 === 0) return 'D1';
  if (tfMinutes % 60 === 0) return 'H1';
  return 'M1';
}

/**
 * Aggregates ascending-by-time base candles into `tfMinutes` buckets aligned to
 * epoch (bucket start = floor(time / tfSeconds) * tfSeconds). OHLC per bucket:
 * open = first, high = max, low = min, close = last. Returns a new array; does
 * not mutate the input. Empty input or a non-positive tf yields `[]`.
 */
export function aggregateCandles(base: Candle[], tfMinutes: number): Candle[] {
  if (tfMinutes <= 0 || base.length === 0) return [];
  const bucketSec = tfMinutes * 60;
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let curBucket = Number.NaN;
  for (const c of base) {
    const bucket = Math.floor(c.time / bucketSec) * bucketSec;
    if (bucket !== curBucket) {
      if (cur) out.push(cur);
      cur = { time: bucket, open: c.open, high: c.high, low: c.low, close: c.close };
      curBucket = bucket;
    } else {
      cur!.high = Math.max(cur!.high, c.high);
      cur!.low = Math.min(cur!.low, c.low);
      cur!.close = c.close;
    }
  }
  if (cur) out.push(cur);
  return out;
}

@Injectable({ providedIn: 'root' })
export class TimeframeGenerator {
  // Constructor inject() default so this unit-tests with a stub repository.
  constructor(private readonly repo: MarketDataRepository = inject(MarketDataRepository)) {}

  /**
   * Candles for `symbol` at an arbitrary `tfMinutes`. When the request is a
   * stored anchor (1 / 60 / 1440) the anchor candles are returned as-is;
   * otherwise the coarsest dividing anchor is fetched and aggregated. The
   * Replay Engine / Chart consume the returned array directly.
   */
  async getCandles(symbol: string, tfMinutes: number): Promise<Candle[]> {
    const anchor = anchorFor(tfMinutes);
    const base = await this.repo.getCandles(symbol, anchor);
    if (tfMinutes === ANCHOR_MINUTES[anchor]) return base;
    return aggregateCandles(base, tfMinutes);
  }
}
