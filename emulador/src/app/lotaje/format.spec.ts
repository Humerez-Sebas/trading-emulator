import { describe, expect, it } from 'vitest';
import { DASH, formatLots, formatMoney } from './format';

describe('formatMoney', () => {
  it('formats a positive number with a leading $ and two decimals', () => {
    expect(formatMoney(50)).toBe('$50.00');
    expect(formatMoney(0.5)).toBe('$0.50');
  });

  it('formats NaN as the honest dash, never "$NaN"', () => {
    expect(formatMoney(NaN)).toBe(DASH);
  });
});

describe('formatLots', () => {
  it('formats a lot figure with two decimals', () => {
    expect(formatLots(1)).toBe('1.00');
    expect(formatLots(0.01)).toBe('0.01');
  });

  it('formats NaN as the honest dash', () => {
    expect(formatLots(NaN)).toBe(DASH);
  });
});
