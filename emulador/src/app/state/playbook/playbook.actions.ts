import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { PlaybookRule, PlaybookRuleStatus } from './playbook.models';

export const PlaybookActions = createActionGroup({
  source: 'Playbook',
  events: {
    Hydrate: emptyProps(),
    Hydrated: props<{ rules: PlaybookRule[] }>(),
    'Create Rule': props<{ id: string; title: string; statement: string; createdAt: number }>(),
    /**
     * `clientUpdatedAt` is minted at the dispatch site (`Date.now()`), never
     * inside the reducer (D15.F: no clock in reducers — the LWW clock value
     * arrives as ordinary payload data, exactly like `createRule.createdAt`).
     */
    'Update Rule': props<{
      id: string;
      title?: string;
      statement?: string;
      clientUpdatedAt: number;
    }>(),
    'Set Rule Status': props<{ id: string; status: PlaybookRuleStatus; clientUpdatedAt: number }>(),
    'Assign Slot': props<{ id: string; slot: number | null; clientUpdatedAt: number }>(),
    'Reorder Rule': props<{ id: string; sortOrder: number; clientUpdatedAt: number }>(),
    /**
     * D15.F: sync advances ONLY `syncedAt` (folders parity) — never
     * `clientUpdatedAt`. `syncedAt` is the `clientUpdatedAt` value that was
     * actually pushed/pulled for that row, snapshotted at push/pull time by
     * the caller (`PlaybookEffects`), so an edit that lands mid-flight (after
     * the snapshot, before this action is dispatched) still leaves the rule
     * dirty (`clientUpdatedAt > syncedAt`) and due for the next push cycle.
     */
    'Rules Synced': props<{ stamps: { id: string; syncedAt: number }[] }>(),
    /**
     * RFC-016 P-7 first writer: a lesson amends this rule by adding its
     * lessonId to the rule's `amendments` array. `clientUpdatedAt` MUST be
     * provided and is stamped to mark the rule dirty for sync (D15.F).
     * The amendment must dirty the rule so it syncs to the cloud.
     */
    'Amend Rule': props<{ ruleId: string; lessonId: string; clientUpdatedAt: number }>(),
  },
});
