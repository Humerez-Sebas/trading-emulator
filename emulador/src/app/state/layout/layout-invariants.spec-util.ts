import { expect } from 'vitest';
import { LayoutState } from './layout.models';
import { layoutInvariantViolation } from './layout-invariants';

/**
 * RFC-009 lifecycle invariant: cells and the panels entity map reference each
 * other exactly — no orphan panelId in any cell, and every registered panel
 * lives in exactly one cell.
 *
 * Test-only wrapper: delegates the actual check to the vitest-free
 * `layoutInvariantViolation` (`./layout-invariants.ts`, safe for production
 * code to import) and turns it into a vitest assertion so specs keep the
 * granular failure message on mismatch.
 */
export function assertLayoutConsistent(state: LayoutState): void {
  expect(layoutInvariantViolation(state)).toBeNull();
}
