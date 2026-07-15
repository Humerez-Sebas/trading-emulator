import { createSelector } from '@ngrx/store';
import { playbookFeature } from './playbook.reducer';
import { PlaybookRule } from './playbook.models';

export const selectPlaybookRules = playbookFeature.selectRules;
export const selectPlaybookLoaded = playbookFeature.selectLoaded;

/** Active rules in Dock order. */
export const selectActiveRules = createSelector(selectPlaybookRules, (rules) =>
  (rules ?? []).filter((r) => r.status === 'active').sort((a, b) => a.sortOrder - b.sortOrder),
);

/** slot (1..9) → active rule. ONE memoized map; no per-slot factory selectors (D8). */
export const selectRuleBySlot = createSelector(selectActiveRules, (rules) => {
  const bySlot: Record<number, PlaybookRule> = {};
  for (const r of rules) if (r.shortcutSlot !== null) bySlot[r.shortcutSlot] = r;
  return bySlot;
});

/** ruleId → shortcutSlot (null = no slot). Chart mapper label tag composition. */
export const selectRuleSlotMap = createSelector(selectActiveRules, (rules) => {
  const map: Record<string, number | null> = {};
  for (const r of rules) map[r.id] = r.shortcutSlot;
  return map;
});
