import { expect } from 'vitest';
import { LayoutState } from './layout.models';

/**
 * RFC-009 lifecycle invariant: cells and the panels entity map reference each
 * other exactly — no orphan panelId in any cell, and every registered panel
 * lives in exactly one cell.
 */
export function assertLayoutConsistent(state: LayoutState): void {
  const referenced: string[] = state.workspace.tabs.flatMap((t) =>
    t.cells.flatMap((c) => c.panelIds),
  );
  const registered = Object.keys(state.panels);
  // no duplicates: each panel lives in exactly one cell
  expect(new Set(referenced).size).toBe(referenced.length);
  // both directions
  expect([...referenced].sort()).toEqual([...registered].sort());
  // every non-empty cell has a valid activePanelId; empty cells use ''
  for (const tab of state.workspace.tabs) {
    for (const cell of tab.cells) {
      if (cell.panelIds.length === 0) expect(cell.activePanelId).toBe('');
      else expect(cell.panelIds).toContain(cell.activePanelId);
    }
  }
}
