import { describe, expect, it } from 'vitest';
import { closed } from '../../testing/fixtures';
import { computeExcursionAggregates, excursionR, formatExcursionR } from './excursion-stats';

describe('excursionR', () => {
  it('returns null when the trade predates mae/mfe (legacy-absent)', () => {
    expect(excursionR(undefined, 4000, 3990)).toBeNull();
  });

  it('returns null when the risk distance is zero (SL == entry, degenerate trade)', () => {
    expect(excursionR(15, 4000, 4000)).toBeNull();
  });

  it('divides the physical excursion by the risk distance |entryPrice - sl|', () => {
    // riskDistance = 10, excursion = 15 -> 1.5R
    expect(excursionR(15, 4000, 3990)).toBeCloseTo(1.5);
  });

  it('uses the absolute risk distance regardless of SL above or below entry (short trade)', () => {
    // sl above entry (short): riskDistance = 10, excursion = 20 -> 2R
    expect(excursionR(20, 4000, 4010)).toBeCloseTo(2);
  });

  it('zero excursion is a legitimate value, not treated as absent', () => {
    expect(excursionR(0, 4000, 3990)).toBe(0);
  });
});

describe('formatExcursionR', () => {
  it('renders "—" for null (legacy-absent or zero-distance)', () => {
    expect(formatExcursionR(null)).toBe('—');
  });

  it('renders a number with 2 decimals', () => {
    expect(formatExcursionR(1.5)).toBe('1.50');
    expect(formatExcursionR(0)).toBe('0.00');
    expect(formatExcursionR(3)).toBe('3.00');
  });
});

describe('computeExcursionAggregates', () => {
  it('empty trade list -> every aggregate is null', () => {
    expect(computeExcursionAggregates([])).toEqual({
      meanMaeR: null,
      maxMaeR: null,
      meanMfeR: null,
      maxMfeR: null,
    });
  });

  it('ignores legacy-absent trades and zero-risk-distance trades', () => {
    const legacy = closed({ id: 't1' }); // no mae/mfe fields at all
    const zeroRisk = closed({ id: 't2', entryPrice: 4000, sl: 4000, mae: 10, mfe: 20 });
    expect(computeExcursionAggregates([legacy, zeroRisk])).toEqual({
      meanMaeR: null,
      maxMaeR: null,
      meanMfeR: null,
      maxMfeR: null,
    });
  });

  it('computes mean and max over the contributing trades only', () => {
    const t1 = closed({ id: 't1', entryPrice: 4000, sl: 3990, mae: 5, mfe: 30 }); // 0.5R / 3R
    const t2 = closed({ id: 't2', entryPrice: 4000, sl: 3990, mae: 15, mfe: 10 }); // 1.5R / 1R
    const t3 = closed({ id: 't3', entryPrice: 4000, sl: 3990 }); // legacy-absent, ignored
    const agg = computeExcursionAggregates([t1, t2, t3]);
    expect(agg.meanMaeR).toBeCloseTo(1); // (0.5 + 1.5) / 2
    expect(agg.maxMaeR).toBeCloseTo(1.5);
    expect(agg.meanMfeR).toBeCloseTo(2); // (3 + 1) / 2
    expect(agg.maxMfeR).toBeCloseTo(3);
  });

  it('a single contributing trade -> mean equals max', () => {
    const t1 = closed({ id: 't1', entryPrice: 4000, sl: 3990, mae: 20, mfe: 40 });
    const agg = computeExcursionAggregates([t1]);
    expect(agg.meanMaeR).toBeCloseTo(2);
    expect(agg.maxMaeR).toBeCloseTo(2);
    expect(agg.meanMfeR).toBeCloseTo(4);
    expect(agg.maxMfeR).toBeCloseTo(4);
  });
});
