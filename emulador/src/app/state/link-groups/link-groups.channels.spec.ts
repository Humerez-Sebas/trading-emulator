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
});

describe('LinkGroup composition channels (syncDrawings)', () => {
  describe('setSyncDrawings reducer handler', () => {
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
  });

  describe('normalizeLinkGroup (D17.I hydration defaults; D18.A legacy tolerance)', () => {
    it('defaults a group missing syncDrawings to false', () => {
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
      });
    });

    it('passes an explicit syncDrawings value through verbatim (does not overwrite it)', () => {
      const g: LinkGroup = group('g1');
      const withFlipped: LinkGroup = { ...g, syncDrawings: false };
      expect(normalizeLinkGroup(withFlipped)).toEqual(withFlipped);
      expect(normalizeLinkGroup(g)).toEqual(g);
    });

    it('carries syncPriceScale through when present (reserved, never interpreted) and leaves it absent when not (R3)', () => {
      const withReserved: LinkGroupWire = {
        id: 'g1',
        color: '#f00',
        syncCrosshair: true,
        syncTimeRange: true,
        syncPriceScale: true,
      };
      const normalized = normalizeLinkGroup(withReserved);
      expect(normalized.syncPriceScale).toBe(true);
      expect(normalized.syncDrawings).toBe(false);

      const withoutReserved: LinkGroupWire = {
        id: 'g2',
        color: '#0f0',
        syncCrosshair: true,
        syncTimeRange: true,
      };
      expect('syncPriceScale' in normalizeLinkGroup(withoutReserved)).toBe(false);
    });

    it('accepts a legacy wire object carrying syncTrades without throwing, and drops the key rather than re-emitting it (D18.A, C3)', () => {
      const legacyWithSyncTrades: LinkGroupWire = {
        id: 'g1',
        color: '#f00',
        syncCrosshair: true,
        syncTimeRange: true,
        syncDrawings: true,
        syncTrades: false,
      };
      let normalized!: LinkGroup;
      expect(() => {
        normalized = normalizeLinkGroup(legacyWithSyncTrades);
      }).not.toThrow();
      expect('syncTrades' in normalized).toBe(false);
    });
  });

  describe('createLinkGroup (creation default factory)', () => {
    it('produces a freshly created group with syncDrawings true and no syncTrades key', () => {
      const g = createLinkGroup('g1', '#2962FF');
      expect(g).toEqual({
        id: 'g1',
        color: '#2962FF',
        syncCrosshair: true,
        syncTimeRange: true,
        syncDrawings: true,
      });
      expect('syncTrades' in g).toBe(false);
    });
  });
});
