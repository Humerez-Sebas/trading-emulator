import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Lesson } from './lessons.models';

export const LessonsActions = createActionGroup({
  source: 'Lessons',
  events: {
    Hydrate: emptyProps(),
    Hydrated: props<{ lessons: Lesson[] }>(),
    /**
     * Create a new lesson with fully-stamped fields. The `lesson` payload
     * MUST already contain id, authoredAt, and clientUpdatedAt: these are
     * minted at the dispatch site (Date.now()), never in the reducer
     * (D15.F parity: no clock in reducers — the LWW timestamp arrives as
     * ordinary payload data, exactly like PlaybookRule.createdAt). The
     * `clientUpdatedAt` value stamps when this lesson was authored/created.
     */
    'Create Lesson': props<{ lesson: Lesson }>(),
    /**
     * Update an existing lesson (merge defined fields). Only the fields
     * present in the update are changed; unspecified fields are untouched.
     * Empty patch is a no-op. Unknown lesson id is a no-op (idempotence).
     * `clientUpdatedAt` MUST be provided and is stamped to mark the edit
     * dirty for sync (D15.F: mutations always stamp clientUpdatedAt so the
     * rule is picked up by the next push cycle).
     */
    'Update Lesson': props<{
      id: string;
      whatHappened?: string;
      repeat?: string;
      avoid?: string;
      linkedRuleIds?: string[];
      clientUpdatedAt: number;
    }>(),
    /**
     * D15.F: sync advances ONLY `syncedAt` (RFC-015 T4 pattern, folders
     * parity). Never touch `clientUpdatedAt`. An edit that lands after a
     * push snapshot (but before this action dispatches) keeps the lesson
     * dirty (`clientUpdatedAt > syncedAt`) for the next cycle.
     */
    'Lessons Synced': props<{ stamps: { id: string; syncedAt: number }[] }>(),
  },
});
