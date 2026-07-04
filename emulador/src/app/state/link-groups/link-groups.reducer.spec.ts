import { describe, it, expect } from 'vitest';
import { LinkGroupsActions } from './link-groups.actions';
import { linkGroupsFeature } from './link-groups.reducer';
import { createInitialLinkGroupsState, LinkGroup } from './link-groups.models';

const reducer = linkGroupsFeature.reducer;

const group = (id: string): LinkGroup => ({
  id,
  color: '#ff6b6b',
  syncCrosshair: true,
  syncTimeRange: true,
});

describe('linkGroupsFeature reducer', () => {
  it('starts empty', () => {
    const state = reducer(undefined, { type: '@@init' });
    expect(state).toEqual(createInitialLinkGroupsState());
  });

  it('createGroup adds a group; is a no-op on duplicate id', () => {
    const state = reducer(createInitialLinkGroupsState(), LinkGroupsActions.createGroup({ group: group('g1') }));
    expect(state.groups['g1']).toEqual(group('g1'));
    const again = reducer(state, LinkGroupsActions.createGroup({ group: { ...group('g1'), color: '#000' } }));
    expect(again).toBe(state); // no-op: id already exists
  });

  it('removeGroup deletes it; no-op on unknown id', () => {
    const state = reducer(createInitialLinkGroupsState(), LinkGroupsActions.createGroup({ group: group('g1') }));
    const removed = reducer(state, LinkGroupsActions.removeGroup({ groupId: 'g1' }));
    expect(removed.groups['g1']).toBeUndefined();
    expect(reducer(removed, LinkGroupsActions.removeGroup({ groupId: 'nope' }))).toBe(removed);
  });

  it('setSyncCrosshair / setSyncTimeRange toggle independently; no-op on unknown group', () => {
    let state = reducer(createInitialLinkGroupsState(), LinkGroupsActions.createGroup({ group: group('g1') }));
    state = reducer(state, LinkGroupsActions.setSyncCrosshair({ groupId: 'g1', enabled: false }));
    expect(state.groups['g1']).toEqual({ ...group('g1'), syncCrosshair: false });
    state = reducer(state, LinkGroupsActions.setSyncTimeRange({ groupId: 'g1', enabled: false }));
    expect(state.groups['g1']).toEqual({ ...group('g1'), syncCrosshair: false, syncTimeRange: false });
    expect(reducer(state, LinkGroupsActions.setSyncCrosshair({ groupId: 'nope', enabled: true }))).toBe(state);
  });

  it('accepts and stores the reserved syncPriceScale field without interpreting it', () => {
    const withReserved: LinkGroup = { ...group('g1'), syncPriceScale: true };
    const state = reducer(createInitialLinkGroupsState(), LinkGroupsActions.createGroup({ group: withReserved }));
    expect(state.groups['g1'].syncPriceScale).toBe(true); // stored verbatim, R3: never read elsewhere
  });
});
