import { describe, expect, it } from 'vitest';
import { needsR2Onboarding } from './onboarding-decision';

describe('needsR2Onboarding', () => {
  it('is always false for the csv data source (CSV onboarding untouched)', () => {
    expect(needsR2Onboarding('csv', 0)).toBe(false);
    expect(needsR2Onboarding('csv', 5)).toBe(false);
  });

  it('is true for r2 when no datasets have been ingested yet', () => {
    expect(needsR2Onboarding('r2', 0)).toBe(true);
  });

  it('is false for r2 once at least one dataset exists', () => {
    expect(needsR2Onboarding('r2', 1)).toBe(false);
    expect(needsR2Onboarding('r2', 42)).toBe(false);
  });
});
