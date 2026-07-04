import { LayoutState } from './layout.models';

/**
 * RFC-009 lifecycle invariant: cells and the panels entity map reference each
 * other exactly — no orphan panelId in any cell, and every registered panel
 * lives in exactly one cell.
 *
 * Production-safe pure checker: NO vitest import here (or transitively). This
 * module is imported by production code (`services/session-migration.ts`) —
 * pulling in `vitest`'s `expect` (as `layout-invariants.spec-util.ts` does)
 * would drag the test framework into the production bundle. Keep this file
 * free of test-only dependencies; `layout-invariants.spec-util.ts` wraps
 * `layoutInvariantViolation` with `expect(...).toBeNull()` for specs.
 */
export function layoutInvariantViolation(state: LayoutState): string | null {
  // Shape guard: this checker also receives payloads read from storage
  // (parseSessionPayload's defensive parse) — structurally malformed input
  // (layout null/{}, non-array tabs/cells/panelIds, null panels) must yield
  // a violation string, never a TypeError.
  const tabs = state?.workspace?.tabs;
  if (
    !Array.isArray(tabs) ||
    tabs.some((t) => !Array.isArray(t?.cells) || t.cells.some((c) => !Array.isArray(c?.panelIds))) ||
    !state.panels ||
    typeof state.panels !== 'object'
  ) {
    return 'malformed layout state';
  }
  const referenced: string[] = tabs.flatMap((t) => t.cells.flatMap((c) => c.panelIds));
  const registered = Object.keys(state.panels);
  // no duplicates: each panel lives in exactly one cell
  if (new Set(referenced).size !== referenced.length) {
    return 'duplicate panelId referenced across cells';
  }
  // both directions
  const sortedReferenced = [...referenced].sort();
  const sortedRegistered = [...registered].sort();
  const referencedMatchesRegistered =
    sortedReferenced.length === sortedRegistered.length &&
    sortedReferenced.every((id, i) => id === sortedRegistered[i]);
  if (!referencedMatchesRegistered) {
    return 'referenced panelIds and registered panels do not match';
  }
  // every non-empty cell has a valid activePanelId; empty cells use ''
  for (const tab of state.workspace.tabs) {
    for (const cell of tab.cells) {
      if (cell.panelIds.length === 0) {
        if (cell.activePanelId !== '') {
          return `empty cell in tab "${tab.id}" has non-empty activePanelId`;
        }
      } else if (!cell.panelIds.includes(cell.activePanelId)) {
        return `activePanelId not among panelIds in a cell of tab "${tab.id}"`;
      }
    }
  }
  return null;
}

/** Convenience boolean wrapper over {@link layoutInvariantViolation}. */
export function isLayoutConsistentPure(state: LayoutState): boolean {
  return layoutInvariantViolation(state) === null;
}
