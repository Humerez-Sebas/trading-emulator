import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { PlaybookRule, PlaybookRuleStatus } from './playbook.models';

export const PlaybookActions = createActionGroup({
  source: 'Playbook',
  events: {
    Hydrate: emptyProps(),
    Hydrated: props<{ rules: PlaybookRule[] }>(),
    'Create Rule': props<{ id: string; title: string; statement: string; createdAt: number }>(),
    'Update Rule': props<{ id: string; title?: string; statement?: string }>(),
    'Set Rule Status': props<{ id: string; status: PlaybookRuleStatus }>(),
    'Assign Slot': props<{ id: string; slot: number | null }>(),
    'Reorder Rule': props<{ id: string; sortOrder: number }>(),
    'Rules Synced': props<{ stamps: { id: string; clientUpdatedAt: number; syncedAt: number }[] }>(),
  },
});
