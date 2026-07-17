import { describe, it, expect } from 'vitest';
import { LinkGroupsActions } from './link-groups.actions';
import { linkGroupsFeature } from './link-groups.reducer';
import {
  createInitialLinkGroupsState,
  createLinkGroup,
  normalizeLinkGroup,
  LinkGroup,
  LinkGroupWire,
} from './link-groups.models';

const reducer = linkGroupsFeature.reducer;

const group = (id: string): LinkGroup => ({
  id,
  color: '#ff6b6b',
  syncCrosshair: true,
  syncTimeRange: true,
  syncDrawings: true,
  syncTrades: true,
});

describe('LinkGroup composition channels (syncDrawings / syncTrades)', () => {
  describe('setSyncDrawings / setSyncTrades reducer handlers', () => {
    it('setSyncDrawings flips the flag; no-op on unknown group id; no-op when value unchanged', () => {
      let state = reducer(
        createInitialLinkGroupsState(),
        LinkGroupsActions.createGroup({ group: group('g1') }),
      );
      state = reducer(state, LinkGroupsActions.setSyncDrawings({ groupId: 'g1', enabled: false }));
      expect(state.groups['g1']).toEqual({ ...group('g1'), syncDrawings: false });

      const unchanged = reducer(
        state,
        LinkGroupsActions.setSyncDrawings({ groupId: 'g1', enabled: false }),
      );
      expect(unchanged).toBe(state); // no-op: value unchanged (identity)

      const unknown = reducer(
        state,
        LinkGroupsActions.setSyncDrawings({ groupId: 'nope', enabled: true }),
      );
      expect(unknown).toBe(state); // no-op: unknown group id (identity)
    });

    it('setSyncTrades flips the flag independently of setSyncDrawings; no-op on unknown group id; no-op when value unchanged', () => {
      let state = reducer(
        createInitialLinkGroupsState(),
        LinkGroupsActions.createGroup({ group: group('g1') }),
      );
      state = reducer(state, LinkGroupsActions.setSyncTrades({ groupId: 'g1', enabled: false }));
      expect(state.groups['g1']).toEqual({ ...group('g1'), syncTrades: false });
      // syncDrawings untouched by setSyncTrades
      expect(state.groups['g1'].syncDrawings).toBe(true);

      const unchanged = reducer(
        state,
        LinkGroupsActions.setSyncTrades({ groupId: 'g1', enabled: false }),
      );
      expect(unchanged).toBe(state); // no-op: value unchanged (identity)

      const unknown = reducer(
        state,
        LinkGroupsActions.setSyncTrades({ groupId: 'nope', enabled: true }),
      );
      expect(unknown).toBe(state); // no-op: unknown group id (identity)
    });
  });

  describe('normalizeLinkGroup (D17.I hydration defaults)', () => {
    it('defaults a group missing both flags to syncDrawings: false, syncTrades: true', () => {
      const legacy: LinkGroupWire = {
        id: 'g1',
        color: '#f00',
        syncCrosshair: true,
        syncTimeRange: true,
      };
      expect(normalizeLinkGroup(legacy)).toEqual({
        id: 'g1',
        color: '#f00',
        syncCrosshair: true,
        syncTimeRange: true,
        syncDrawings: false,
        syncTrades: true,
      });
    });

    it('passes present flags through verbatim (does not overwrite explicit values)', () => {
      const g: LinkGroup = group('g1');
      const withFlipped: LinkGroup = { ...g, syncDrawings: false, syncTrades: false };
      expect(normalizeLinkGroup(withFlipped)).toEqual(withFlipped);
      expect(normalizeLinkGroup(g)).toEqual(g);
    });

    it('passes syncPriceScale through untouched (reserved, never interpreted)', () => {
      const legacy: LinkGroupWire = {
        id: 'g1',
        color: '#f00',
        syncCrosshair: true,
        syncTimeRange: true,
        syncPriceScale: true,
      };
      const normalized = normalizeLinkGroup(legacy);
      expect(normalized.syncPriceScale).toBe(true);
      expect(normalized.syncDrawings).toBe(false);
      expect(normalized.syncTrades).toBe(true);
    });
  });

  describe('createLinkGroup (creation default factory)', () => {
    it('produces a freshly created group with both composition flags true', () => {
      const g = createLinkGroup('g1', '#2962FF');
      expect(g).toEqual({
        id: 'g1',
        color: '#2962FF',
        syncCrosshair: true,
        syncTimeRange: true,
        syncDrawings: true,
        syncTrades: true,
      });
    });
  });
});
