import { describe, expect, it } from 'vitest';
import { partitionTimeBounds } from './market-data-db';

/**
 * The bounds must mirror how `pipeline/parquet_builder.py` partitions M1:
 * by the UTC calendar year of the candle's epoch. Anything else would either
 * leave a partition's candles behind (duplicates on re-ingest) or delete a
 * neighbour's.
 */
describe('partitionTimeBounds', () => {
  it('spans exactly one UTC calendar year for an m1 year partition', () => {
    expect(partitionTimeBounds('2026')).toEqual({
      from: Date.UTC(2026, 0, 1) / 1000,
      to: Date.UTC(2027, 0, 1) / 1000 - 1,
    });
  });

  it('spans everything for the "all" sentinel (h1/d1 hold the whole history)', () => {
    expect(partitionTimeBounds('all')).toEqual({ from: -Infinity, to: Infinity });
  });

  it('leaves no gap between consecutive years', () => {
    expect(partitionTimeBounds('2025').to + 1).toBe(partitionTimeBounds('2026').from);
  });

  it('falls back to the full range for an unrecognised partition key', () => {
    // Deliberately conservative: over-deleting preserves the re-ingest dedup
    // guarantee, while a too-narrow range would leave duplicate candles behind.
    expect(partitionTimeBounds('no-es-un-anio')).toEqual({ from: -Infinity, to: Infinity });
  });
});
