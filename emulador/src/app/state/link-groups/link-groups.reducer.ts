import { createFeature, createReducer, on } from '@ngrx/store';
import { LinkGroupsActions } from './link-groups.actions';
import { createInitialLinkGroupsState, LinkGroupsState } from './link-groups.models';
import { WorkspacesActions } from '../workspaces/workspaces.actions';

export const linkGroupsFeature = createFeature({
  name: 'linkGroups',
  reducer: createReducer(
    createInitialLinkGroupsState(),
    on(LinkGroupsActions.createGroup, (state, { group }): LinkGroupsState => {
      if (state.groups[group.id]) return state;
      return { groups: { ...state.groups, [group.id]: group } };
    }),
    on(LinkGroupsActions.removeGroup, (state, { groupId }): LinkGroupsState => {
      if (!state.groups[groupId]) return state;
      const groups = Object.fromEntries(Object.entries(state.groups).filter(([id]) => id !== groupId));
      return { groups };
    }),
    on(LinkGroupsActions.setSyncCrosshair, (state, { groupId, enabled }): LinkGroupsState => {
      const g = state.groups[groupId];
      if (!g || g.syncCrosshair === enabled) return state;
      return { groups: { ...state.groups, [groupId]: { ...g, syncCrosshair: enabled } } };
    }),
    on(LinkGroupsActions.setSyncTimeRange, (state, { groupId, enabled }): LinkGroupsState => {
      const g = state.groups[groupId];
      if (!g || g.syncTimeRange === enabled) return state;
      return { groups: { ...state.groups, [groupId]: { ...g, syncTimeRange: enabled } } };
    }),
    on(LinkGroupsActions.restoreGroups, (_state, { groups }): LinkGroupsState => ({
      groups: Object.fromEntries(groups.map((g) => [g.id, g])),
    })),
    on(WorkspacesActions.workspaceRestored, (_state, { workspace }): LinkGroupsState => ({
      groups: Object.fromEntries((workspace.linkGroups ?? []).map((g) => [g.id, g])),
    })),
  ),
});
