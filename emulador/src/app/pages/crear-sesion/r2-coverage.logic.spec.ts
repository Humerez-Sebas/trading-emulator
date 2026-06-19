import { describe, expect, it } from 'vitest';
import { intersectBounds, isEndValid, isStartValid } from './r2-coverage.logic';

describe('intersectBounds', () => {
  it('intersects per-anchor bounds over the selected TFs (max from, min to)', () => {
    const bounds = { M1: { from: 1000, to: 2000 }, H1: { from: 1200, to: 1800 } } as const;
    expect(intersectBounds(bounds, ['M1', 'H1'])).toEqual({ from: 1200, to: 1800 });
    expect(intersectBounds(bounds, ['M1'])).toEqual({ from: 1000, to: 2000 });
  });
  it('returns null when nothing selected or no bounds present', () => {
    expect(intersectBounds({}, ['M1'])).toBeNull();
    expect(intersectBounds({ M1: { from: 1, to: 2 } }, [])).toBeNull();
  });
});

describe('isStartValid', () => {
  const range = { from: 1200, to: 1800 };

  it('is false when range is null', () => {
    expect(isStartValid(null, 1500)).toBe(false);
  });

  it('is true when start is within range (inclusive bounds)', () => {
    expect(isStartValid(range, 1200)).toBe(true);
    expect(isStartValid(range, 1800)).toBe(true);
    expect(isStartValid(range, 1500)).toBe(true);
  });

  it('is false when start is before range.from', () => {
    expect(isStartValid(range, 1199)).toBe(false);
  });

  it('is false when start is after range.to', () => {
    expect(isStartValid(range, 1801)).toBe(false);
  });
});

describe('isEndValid', () => {
  const range = { from: 1200, to: 1800 };

  it('is true when end is null (no scheduled end)', () => {
    expect(isEndValid(range, 1500, null)).toBe(true);
  });

  it('is false when range is null and end is set', () => {
    expect(isEndValid(null, 1500, 1600)).toBe(false);
  });

  it('is true when end is after start and within range', () => {
    expect(isEndValid(range, 1500, 1600)).toBe(true);
  });

  it('is true when end equals range.to', () => {
    expect(isEndValid(range, 1500, 1800)).toBe(true);
  });

  it('is false when end is before or equal to start', () => {
    expect(isEndValid(range, 1500, 1500)).toBe(false);
    expect(isEndValid(range, 1500, 1400)).toBe(false);
  });

  it('is false when end exceeds range.to', () => {
    expect(isEndValid(range, 1500, 1801)).toBe(false);
  });
});
