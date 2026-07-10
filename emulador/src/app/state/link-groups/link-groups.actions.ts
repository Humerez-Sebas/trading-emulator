import { createActionGroup, props } from '@ngrx/store';
import { LinkGroup } from './link-groups.models';

export const LinkGroupsActions = createActionGroup({
  source: 'LinkGroups',
  events: {
    /** No-op if group.id already exists. */
    'Create Group': props<{ group: LinkGroup }>(),
    /** No-op if unknown; does NOT touch PanelDescriptor.linkGroupId (Task 1 Step 5 handles unlink). */
    'Remove Group': props<{ groupId: string }>(),
    'Set Sync Crosshair': props<{ groupId: string; enabled: boolean }>(),
    'Set Sync Time Range': props<{ groupId: string; enabled: boolean }>(),
    /** Wholesale-replaces the groups map from a restored session (RFC-011). */
    'Restore Groups': props<{ groups: LinkGroup[] }>(),
  },
});
