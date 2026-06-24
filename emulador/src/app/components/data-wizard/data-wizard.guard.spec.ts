import { describe, expect, it } from 'vitest';
import { needsR2Onboarding } from './onboarding-decision';

describe('needsR2Onboarding', () => {
  it('is true when no datasets have been ingested yet', () => {
    expect(needsR2Onboarding(0)).toBe(true);
  });

  it('is false once at least one dataset exists', () => {
    expect(needsR2Onboarding(3)).toBe(false);
  });
});
