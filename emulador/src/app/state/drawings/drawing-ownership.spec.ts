import { describe, expect, it } from 'vitest';
import { ownerKeyOf, resolveDrawingTarget } from './drawing-ownership';
import { PanelDescriptor } from '../layout/layout.models';
import { LinkGroup } from '../link-groups/link-groups.models';

function panel(overrides: Partial<PanelDescriptor> = {}): PanelDescriptor {
  return { id: 'panel-1', symbol: 'EURUSD', timeframe: 'M1', linkGroupId: null, ...overrides };
}

function group(overrides: Partial<LinkGroup> = {}): LinkGroup {
  return {
    id: 'g1',
    color: '#f00',
    syncCrosshair: true,
    syncTimeRange: true,
    syncDrawings: true,
    ...overrides,
  };
}

describe('ownerKeyOf', () => {
  it('formats a panel owner as panel:<id>', () => {
    expect(ownerKeyOf({ type: 'panel', id: 'p1' })).toBe('panel:p1');
  });

  it('formats a group owner as group:<id>', () => {
    expect(ownerKeyOf({ type: 'group', id: 'g1' })).toBe('group:g1');
  });
});

describe('resolveDrawingTarget', () => {
  it('linked panel + group exists + syncDrawings true → targets the group', () => {
    const p = panel({ linkGroupId: 'g1' });
    const groups = { g1: group({ syncDrawings: true }) };
    expect(resolveDrawingTarget(p, groups)).toEqual({ type: 'group', id: 'g1' });
  });

  it('linked panel + group exists + syncDrawings false → falls back to the panel', () => {
    const p = panel({ linkGroupId: 'g1' });
    const groups = { g1: group({ syncDrawings: false }) };
    expect(resolveDrawingTarget(p, groups)).toEqual({ type: 'panel', id: 'panel-1' });
  });

  it('unlinked panel (linkGroupId: null) → targets the panel', () => {
    const p = panel({ linkGroupId: null });
    expect(resolveDrawingTarget(p, {})).toEqual({ type: 'panel', id: 'panel-1' });
  });

  it('dangling linkGroupId (group absent from the record) → falls back to the panel, never throws', () => {
    const p = panel({ linkGroupId: 'gone' });
    expect(() => resolveDrawingTarget(p, {})).not.toThrow();
    expect(resolveDrawingTarget(p, {})).toEqual({ type: 'panel', id: 'panel-1' });
  });
});
