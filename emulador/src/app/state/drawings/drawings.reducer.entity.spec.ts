import { describe, expect, it } from 'vitest';
import { drawingsFeature } from './drawings.reducer';
import { DrawingsActions } from './drawings.actions';
import { LinkGroupsActions } from '../link-groups/link-groups.actions';
import { LayoutActions } from '../layout/layout.actions';
import { WorkspacesActions } from '../workspaces/workspaces.actions';
import { Drawing, DrawingsState } from './drawings.models';
import { workspace } from '../../testing/fixtures';

const reducer = drawingsFeature.reducer;

function initial(): DrawingsState {
  return reducer(undefined, { type: '@@init' } as any);
}

function drawing(overrides: Partial<Drawing> = {}): Drawing {
  return {
    id: 'd1',
    symbol: 'EURUSD',
    owner: { type: 'panel', id: 'panel-1' },
    kind: 'line',
    p1: { time: 0, price: 100 },
    p2: { time: 3600, price: 105 },
    zIndex: 0,
    locked: false,
    visible: true,
    ...overrides,
  };
}

describe('drawings reducer: addDrawing', () => {
  it('stores the entity, appends its id to the owning panel key, assigns zIndex from nextZ, selects it for the acting panel, and resets the tool', () => {
    const s = { ...initial(), activeTool: 'line' as const };
    const d = drawing({ id: 'd1', owner: { type: 'panel', id: 'panel-1' } });

    const next = reducer(s, DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: d }));

    expect(next.entities['d1']).toEqual({ ...d, zIndex: 0 });
    expect(next.ownerIndex['panel:panel-1']).toEqual(['d1']);
    expect(next.nextZ).toBe(1);
    expect(next.selection['panel-1']).toBe('d1');
    expect(next.activeTool).toBe('none');
  });

  it('two adds in sequence take zIndex 0 then 1, leaving nextZ at 2', () => {
    const s = initial();
    const first = reducer(
      s,
      DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: drawing({ id: 'd1' }) }),
    );
    const second = reducer(
      first,
      DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: drawing({ id: 'd2' }) }),
    );

    expect(second.entities['d1'].zIndex).toBe(0);
    expect(second.entities['d2'].zIndex).toBe(1);
    expect(second.nextZ).toBe(2);
  });

  it('appends a group-owned drawing under its group key, not a panel key', () => {
    const s = initial();
    const d = drawing({ id: 'd1', owner: { type: 'group', id: 'g1' } });

    const next = reducer(s, DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: d }));

    expect(next.ownerIndex['group:g1']).toEqual(['d1']);
    expect(next.ownerIndex['panel:panel-1']).toBeUndefined();
  });
});

describe('drawings reducer: index maintenance', () => {
  it('deleting one drawing splices only its id; another owner key is untouched by reference', () => {
    let state = initial();
    state = reducer(
      state,
      DrawingsActions.addDrawing({
        panelId: 'panel-1',
        drawing: drawing({ id: 'd1', owner: { type: 'panel', id: 'panel-1' } }),
      }),
    );
    state = reducer(
      state,
      DrawingsActions.addDrawing({
        panelId: 'panel-2',
        drawing: drawing({ id: 'd2', owner: { type: 'panel', id: 'panel-2' } }),
      }),
    );
    const untouchedArray = state.ownerIndex['panel:panel-2'];

    const next = reducer(
      { ...state, selection: { ...state.selection, 'panel-1': 'd1' } },
      DrawingsActions.deleteSelected({ panelId: 'panel-1' }),
    );

    expect(next.ownerIndex['panel:panel-1']).toEqual([]);
    expect(next.ownerIndex['panel:panel-2']).toBe(untouchedArray); // same reference, no allocation
  });
});

describe('drawings reducer: lock guards', () => {
  it('moveDrawing on a locked drawing returns the exact same state object', () => {
    const locked = drawing({ id: 'd1', locked: true });
    const s = { ...initial(), entities: { d1: locked } };

    const next = reducer(
      s,
      DrawingsActions.moveDrawing({
        panelId: 'panel-1',
        id: 'd1',
        p1: { time: 1, price: 1 },
        p2: { time: 2, price: 2 },
      }),
    );

    expect(next).toBe(s);
  });

  it('deleteSelected on a locked drawing returns the exact same state object', () => {
    const locked = drawing({ id: 'd1', locked: true });
    const s = { ...initial(), entities: { d1: locked }, selection: { 'panel-1': 'd1' } };

    const next = reducer(s, DrawingsActions.deleteSelected({ panelId: 'panel-1' }));

    expect(next).toBe(s);
  });
});

describe('drawings reducer: selectDrawing steals selection', () => {
  it('selecting id X in panel B after it was selected in panel A nulls A and sets B, leaving other selections of different ids alone', () => {
    const s = { ...initial(), selection: { 'panel-a': 'x', 'panel-c': 'y' } };

    const next = reducer(s, DrawingsActions.selectDrawing({ panelId: 'panel-b', id: 'x' }));

    expect(next.selection['panel-a']).toBeNull();
    expect(next.selection['panel-b']).toBe('x');
    expect(next.selection['panel-c']).toBe('y'); // untouched: a different drawing
  });

  it('selecting null only clears that panel\'s own slot', () => {
    const s = { ...initial(), selection: { 'panel-a': 'x', 'panel-b': 'y' } };

    const next = reducer(s, DrawingsActions.selectDrawing({ panelId: 'panel-a', id: null }));

    expect(next.selection['panel-a']).toBeNull();
    expect(next.selection['panel-b']).toBe('y');
  });
});

describe('drawings reducer: deleteSelected re-validation', () => {
  it('a selection pointing at an absent id is a no-op returning state by identity', () => {
    const s = { ...initial(), selection: { 'panel-1': 'gone' } };

    const next = reducer(s, DrawingsActions.deleteSelected({ panelId: 'panel-1' }));

    expect(next).toBe(s);
  });

  it('no selection at all for that panel is a no-op returning state by identity', () => {
    const s = initial();

    const next = reducer(s, DrawingsActions.deleteSelected({ panelId: 'panel-1' }));

    expect(next).toBe(s);
  });
});

describe('drawings reducer: ownership immutability', () => {
  const original = drawing({ id: 'd1', owner: { type: 'panel', id: 'panel-1' } });

  it('moveDrawing never touches owner', () => {
    const s = { ...initial(), entities: { d1: original } };
    const next = reducer(
      s,
      DrawingsActions.moveDrawing({
        panelId: 'panel-1',
        id: 'd1',
        p1: { time: 9, price: 9 },
        p2: { time: 10, price: 10 },
      }),
    );
    expect(next.entities['d1'].owner).toEqual(original.owner);
  });

  it('setDrawingLocked never touches owner', () => {
    const s = { ...initial(), entities: { d1: original } };
    const next = reducer(s, DrawingsActions.setDrawingLocked({ id: 'd1', locked: true }));
    expect(next.entities['d1'].owner).toEqual(original.owner);
  });

  it('setDrawingVisible never touches owner', () => {
    const s = { ...initial(), entities: { d1: original } };
    const next = reducer(s, DrawingsActions.setDrawingVisible({ id: 'd1', visible: false }));
    expect(next.entities['d1'].owner).toEqual(original.owner);
  });

  it('selectDrawing never touches owner (it only writes `selection`)', () => {
    const s = { ...initial(), entities: { d1: original } };
    const next = reducer(s, DrawingsActions.selectDrawing({ panelId: 'panel-1', id: 'd1' }));
    expect(next.entities['d1'].owner).toEqual(original.owner);
    expect(next.entities['d1']).toBe(original); // untouched entity, no reallocation
  });
});

describe('drawings reducer: setDrawingLocked / setDrawingVisible', () => {
  it('setDrawingLocked flips the flag with no index or selection change', () => {
    const d = drawing({ id: 'd1' });
    const s = { ...initial(), entities: { d1: d }, selection: { 'panel-1': 'd1' } };
    const next = reducer(s, DrawingsActions.setDrawingLocked({ id: 'd1', locked: true }));
    expect(next.entities['d1'].locked).toBe(true);
    expect(next.selection).toEqual(s.selection);
  });

  it('setDrawingVisible flips the flag with no index or selection change', () => {
    const d = drawing({ id: 'd1' });
    const s = { ...initial(), entities: { d1: d } };
    const next = reducer(s, DrawingsActions.setDrawingVisible({ id: 'd1', visible: false }));
    expect(next.entities['d1'].visible).toBe(false);
  });

  it('an absent id is a no-op returning state by identity, for both actions', () => {
    const s = initial();
    expect(reducer(s, DrawingsActions.setDrawingLocked({ id: 'gone', locked: true }))).toBe(s);
    expect(reducer(s, DrawingsActions.setDrawingVisible({ id: 'gone', visible: false }))).toBe(s);
  });
});

describe('drawings reducer: group-deletion cascade', () => {
  it('removeGroup deletes exactly that group\'s entities, drops the index key, leaves panel-owned entities and other groups untouched, and clears selections pointing at deleted ids', () => {
    const groupDrawing1 = drawing({ id: 'g-d1', owner: { type: 'group', id: 'g1' } });
    const groupDrawing2 = drawing({ id: 'g-d2', owner: { type: 'group', id: 'g1' } });
    const otherGroupDrawing = drawing({ id: 'g2-d1', owner: { type: 'group', id: 'g2' } });
    const panelDrawing = drawing({ id: 'p-d1', owner: { type: 'panel', id: 'panel-1' } });
    const s: DrawingsState = {
      ...initial(),
      entities: {
        'g-d1': groupDrawing1,
        'g-d2': groupDrawing2,
        'g2-d1': otherGroupDrawing,
        'p-d1': panelDrawing,
      },
      ownerIndex: {
        'group:g1': ['g-d1', 'g-d2'],
        'group:g2': ['g2-d1'],
        'panel:panel-1': ['p-d1'],
      },
      selection: { 'panel-a': 'g-d1', 'panel-b': 'p-d1', 'panel-c': 'g2-d1' },
    };

    const next = reducer(s, LinkGroupsActions.removeGroup({ groupId: 'g1' }));

    expect(next.entities['g-d1']).toBeUndefined();
    expect(next.entities['g-d2']).toBeUndefined();
    expect(next.entities['p-d1']).toEqual(panelDrawing);
    expect(next.entities['g2-d1']).toEqual(otherGroupDrawing);
    expect(next.ownerIndex['group:g1']).toBeUndefined();
    expect(next.ownerIndex['group:g2']).toEqual(['g2-d1']);
    expect(next.ownerIndex['panel:panel-1']).toEqual(['p-d1']);
    expect(next.selection['panel-a']).toBeNull(); // pointed at a deleted id
    expect(next.selection['panel-b']).toBe('p-d1'); // untouched
    expect(next.selection['panel-c']).toBe('g2-d1'); // a different group, untouched
  });

  it('a group that owns nothing is a no-op returning state by identity', () => {
    const s = initial();
    const next = reducer(s, LinkGroupsActions.removeGroup({ groupId: 'never-used' }));
    expect(next).toBe(s);
  });
});

describe('drawings reducer: hydration rebuild (restoreDrawings / workspaceRestored)', () => {
  it('restoreDrawings rebuilds entities+index consistently and seeds nextZ = max(zIndex)+1', () => {
    const d1 = drawing({ id: 'd1', zIndex: 2, owner: { type: 'panel', id: 'panel-1' } });
    const d2 = drawing({ id: 'd2', zIndex: 5, owner: { type: 'group', id: 'g1' } });
    const s = { ...initial(), selection: { 'panel-1': 'stale' }, activeTool: 'rect' as const };

    const next = reducer(s, DrawingsActions.restoreDrawings({ drawings: [d1, d2] }));

    expect(next.entities).toEqual({ d1, d2 });
    expect(next.ownerIndex).toEqual({ 'panel:panel-1': ['d1'], 'group:g1': ['d2'] });
    expect(next.nextZ).toBe(6);
    expect(next.selection).toEqual({});
    expect(next.activeTool).toBe('none');
  });

  it('restoreDrawings with an empty set seeds nextZ = 0', () => {
    const s = initial();
    const next = reducer(s, DrawingsActions.restoreDrawings({ drawings: [] }));
    expect(next.entities).toEqual({});
    expect(next.ownerIndex).toEqual({});
    expect(next.nextZ).toBe(0);
  });

  it('workspaceRestored rebuilds through the same path as restoreDrawings', () => {
    const d1 = drawing({ id: 'd1', zIndex: 3, owner: { type: 'panel', id: 'panel-1' } });
    const ws = workspace({ drawings: [d1] });
    const s = { ...initial(), selection: { 'panel-1': 'stale' }, activeTool: 'fib' as const };

    const next = reducer(s, WorkspacesActions.workspaceRestored({ workspace: ws }));

    expect(next.entities).toEqual({ d1 });
    expect(next.ownerIndex).toEqual({ 'panel:panel-1': ['d1'] });
    expect(next.nextZ).toBe(4);
    expect(next.selection).toEqual({});
    expect(next.activeTool).toBe('none');
  });
});

describe('drawings reducer: stale-selection invalidation on sync/link changes', () => {
  it('turning syncDrawings off nulls every selection slot pointing at that group\'s drawings, leaving panel-owned selections untouched', () => {
    const groupDrawing = drawing({ id: 'g-d1', owner: { type: 'group', id: 'g1' } });
    const panelDrawing = drawing({ id: 'p-d1', owner: { type: 'panel', id: 'panel-1' } });
    const s: DrawingsState = {
      ...initial(),
      entities: { 'g-d1': groupDrawing, 'p-d1': panelDrawing },
      ownerIndex: { 'group:g1': ['g-d1'], 'panel:panel-1': ['p-d1'] },
      selection: { 'panel-a': 'g-d1', 'panel-b': 'p-d1' },
    };

    const next = reducer(s, LinkGroupsActions.setSyncDrawings({ groupId: 'g1', enabled: false }));

    expect(next.selection['panel-a']).toBeNull(); // was selecting the now-invisible shared drawing
    expect(next.selection['panel-b']).toBe('p-d1'); // panel-owned selection: untouched
  });

  it('turning syncDrawings ON is a no-op returning state by identity', () => {
    const s: DrawingsState = {
      ...initial(),
      selection: { 'panel-a': 'g-d1' },
    };
    const next = reducer(s, LinkGroupsActions.setSyncDrawings({ groupId: 'g1', enabled: true }));
    expect(next).toBe(s);
  });

  it('turning syncDrawings off for a group with no selections pointing at it is a no-op returning state by identity', () => {
    const groupDrawing = drawing({ id: 'g-d1', owner: { type: 'group', id: 'g1' } });
    const s: DrawingsState = {
      ...initial(),
      entities: { 'g-d1': groupDrawing },
      ownerIndex: { 'group:g1': ['g-d1'] },
      selection: { 'panel-a': null },
    };
    const next = reducer(s, LinkGroupsActions.setSyncDrawings({ groupId: 'g1', enabled: false }));
    expect(next).toBe(s);
  });

  it('unlinking a panel clears only that panel\'s group-owned selection', () => {
    const groupDrawing = drawing({ id: 'g-d1', owner: { type: 'group', id: 'g1' } });
    const panelDrawing = drawing({ id: 'p-d1', owner: { type: 'panel', id: 'panel-2' } });
    const s: DrawingsState = {
      ...initial(),
      entities: { 'g-d1': groupDrawing, 'p-d1': panelDrawing },
      ownerIndex: { 'group:g1': ['g-d1'], 'panel:panel-2': ['p-d1'] },
      selection: { 'panel-1': 'g-d1', 'panel-2': 'p-d1' },
    };

    const next = reducer(
      s,
      LayoutActions.setPanelLinkGroup({ panelId: 'panel-1', linkGroupId: null }),
    );

    expect(next.selection['panel-1']).toBeNull();
    expect(next.selection['panel-2']).toBe('p-d1'); // a different panel's selection: untouched
  });

  it('setPanelLinkGroup for a panel whose selection is NOT group-owned is a no-op returning state by identity', () => {
    const panelDrawing = drawing({ id: 'p-d1', owner: { type: 'panel', id: 'panel-1' } });
    const s: DrawingsState = {
      ...initial(),
      entities: { 'p-d1': panelDrawing },
      ownerIndex: { 'panel:panel-1': ['p-d1'] },
      selection: { 'panel-1': 'p-d1' },
    };
    const next = reducer(
      s,
      LayoutActions.setPanelLinkGroup({ panelId: 'panel-1', linkGroupId: 'g2' }),
    );
    expect(next).toBe(s);
  });

  it('setPanelLinkGroup for a panel with no selection at all is a no-op returning state by identity', () => {
    const s = initial();
    const next = reducer(
      s,
      LayoutActions.setPanelLinkGroup({ panelId: 'panel-1', linkGroupId: 'g1' }),
    );
    expect(next).toBe(s);
  });
});

describe('drawings reducer: panel-close cascade (removePanel / purgePanelDrawings)', () => {
  it('removePanel deletes exactly that panel\'s owned entities, drops its index key and selection slot, leaves group-owned entities and other panels untouched', () => {
    const ownDrawing = drawing({ id: 'p1-d1', owner: { type: 'panel', id: 'panel-1' } });
    const otherPanelDrawing = drawing({ id: 'p2-d1', owner: { type: 'panel', id: 'panel-2' } });
    const groupDrawing = drawing({ id: 'g-d1', owner: { type: 'group', id: 'g1' } });
    const s: DrawingsState = {
      ...initial(),
      entities: { 'p1-d1': ownDrawing, 'p2-d1': otherPanelDrawing, 'g-d1': groupDrawing },
      ownerIndex: {
        'panel:panel-1': ['p1-d1'],
        'panel:panel-2': ['p2-d1'],
        'group:g1': ['g-d1'],
      },
      selection: { 'panel-1': 'p1-d1', 'panel-2': 'p2-d1', 'panel-3': 'g-d1' },
    };

    const next = reducer(s, LayoutActions.removePanel({ panelId: 'panel-1' }));

    expect(next.entities['p1-d1']).toBeUndefined();
    expect(next.entities['p2-d1']).toEqual(otherPanelDrawing);
    expect(next.entities['g-d1']).toEqual(groupDrawing); // group-owned: NEVER touched
    expect(next.ownerIndex['panel:panel-1']).toBeUndefined();
    expect(next.ownerIndex['panel:panel-2']).toEqual(['p2-d1']);
    expect(next.ownerIndex['group:g1']).toEqual(['g-d1']);
    expect('panel-1' in next.selection).toBe(false); // the closed panel's own slot is dropped
    expect(next.selection['panel-2']).toBe('p2-d1'); // untouched
    expect(next.selection['panel-3']).toBe('g-d1'); // group-owned selection survives the panel's death
  });

  it('removing a panel that owns nothing (and has no selection slot) is a no-op returning state by identity', () => {
    const s = initial();
    const next = reducer(s, LayoutActions.removePanel({ panelId: 'ghost' }));
    expect(next).toBe(s);
  });

  it('purgePanelDrawings with several ids purges all of them in one shot, leaving group-owned entities alone', () => {
    const d1 = drawing({ id: 'p1-d1', owner: { type: 'panel', id: 'panel-1' } });
    const d2 = drawing({ id: 'p2-d1', owner: { type: 'panel', id: 'panel-2' } });
    const groupDrawing = drawing({ id: 'g-d1', owner: { type: 'group', id: 'g1' } });
    const s: DrawingsState = {
      ...initial(),
      entities: { 'p1-d1': d1, 'p2-d1': d2, 'g-d1': groupDrawing },
      ownerIndex: {
        'panel:panel-1': ['p1-d1'],
        'panel:panel-2': ['p2-d1'],
        'group:g1': ['g-d1'],
      },
      selection: { 'panel-1': 'p1-d1', 'panel-2': 'p2-d1', 'panel-3': 'g-d1' },
    };

    const next = reducer(
      s,
      DrawingsActions.purgePanelDrawings({ panelIds: ['panel-1', 'panel-2'] }),
    );

    expect(next.entities['p1-d1']).toBeUndefined();
    expect(next.entities['p2-d1']).toBeUndefined();
    expect(next.entities['g-d1']).toEqual(groupDrawing);
    expect(next.ownerIndex['panel:panel-1']).toBeUndefined();
    expect(next.ownerIndex['panel:panel-2']).toBeUndefined();
    expect(next.ownerIndex['group:g1']).toEqual(['g-d1']);
    expect('panel-1' in next.selection).toBe(false);
    expect('panel-2' in next.selection).toBe(false);
    expect(next.selection['panel-3']).toBe('g-d1');
  });

  it('purgePanelDrawings with ids that own nothing is a no-op returning state by identity', () => {
    const s = initial();
    const next = reducer(s, DrawingsActions.purgePanelDrawings({ panelIds: ['ghost-1', 'ghost-2'] }));
    expect(next).toBe(s);
  });
});
