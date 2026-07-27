import { createFeature, createReducer, on } from '@ngrx/store';
import { LinkGroupsActions } from './link-groups.actions';
import { createInitialLinkGroupsState, LinkGroupsState, normalizeLinkGroup } from './link-groups.models';
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
      const groups = Object.fromEntries(
        Object.entries(state.groups).filter(([id]) => id !== groupId),
      );
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
    on(LinkGroupsActions.setSyncDrawings, (state, { groupId, enabled }): LinkGroupsState => {
      const g = state.groups[groupId];
      if (!g || g.syncDrawings === enabled) return state;
      return { groups: { ...state.groups, [groupId]: { ...g, syncDrawings: enabled } } };
    }),
    on(LinkGroupsActions.setSyncTrades, (state, { groupId, enabled }): LinkGroupsState => {
      const g = state.groups[groupId];
      if (!g || g.syncTrades === enabled) return state;
      return { groups: { ...state.groups, [groupId]: { ...g, syncTrades: enabled } } };
    }),
    on(
      LinkGroupsActions.restoreGroups,
      // A group hydrated from a payload that predates the composition flags
      // normalizes to the migration defaults, not `undefined` — the same
      // rule every hydration path into this feature applies.
      (_state, { groups }): LinkGroupsState => ({
        groups: Object.fromEntries(groups.map((g) => [g.id, normalizeLinkGroup(g)])),
      }),
    ),
    on(
      WorkspacesActions.workspaceRestored,
      (_state, { workspace }): LinkGroupsState => ({
        groups: Object.fromEntries(
          (workspace.linkGroups ?? []).map((g) => [g.id, normalizeLinkGroup(g)]),
        ),
      }),
    ),
  ),
});
