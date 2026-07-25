import { describe, expect, it } from 'vitest';
import { drawingsFeature } from './drawings.reducer';
import { DrawingsActions } from './drawings.actions';
import { LinkGroupsActions } from '../link-groups/link-groups.actions';
import { LayoutActions } from '../layout/layout.actions';
import { WorkspacesActions } from '../workspaces/workspaces.actions';
import { Drawing, DrawingCommand, DrawingsState, HISTORY_LIMIT } from './drawings.models';
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

// ---- §5 edge-rulings table (technical spec §5), one it() per row ----

describe('drawings history: edge-rulings table', () => {
  it('row 1: undo add is dropped as stale after another panel moved the drawing; the drawing survives', () => {
    const d1 = drawing({ id: 'd1' });
    const addCmd: DrawingCommand = { kind: 'add', drawingId: 'd1', before: null, after: d1, resultRev: 1 };
    const s: DrawingsState = {
      ...initial(),
      entities: { d1 },
      ownerIndex: { 'panel:panel-1': ['d1'] },
      revisions: { d1: 2 }, // bumped again by another panel's move
      history: { 'panel-1': { undo: [addCmd], redo: [] } },
    };

    const next = reducer(s, DrawingsActions.undo({ panelId: 'panel-1' }));

    expect(next.entities['d1']).toEqual(d1); // survives, untouched
    expect(next.history['panel-1'].undo).toEqual([]); // stale command dropped, stack drained
    expect(next.history['panel-1'].redo).toEqual([]); // nothing applied: nothing to redo
  });

  it('row 2: undo move is dropped as stale when the entity is absent, even though the revision matches', () => {
    const before = drawing({ id: 'd1', p1: { time: 0, price: 100 } });
    const after = { ...before, p1: { time: 5, price: 105 } };
    const moveCmd: DrawingCommand = { kind: 'move', drawingId: 'd1', before, after, resultRev: 2 };
    const s: DrawingsState = {
      ...initial(),
      entities: {}, // deleted elsewhere
      ownerIndex: {},
      revisions: { d1: 2 }, // matches resultRev, yet the entity itself is gone
      history: { 'panel-1': { undo: [moveCmd], redo: [] } },
    };

    const next = reducer(s, DrawingsActions.undo({ panelId: 'panel-1' }));

    expect(next.entities['d1']).toBeUndefined();
    expect(next.history['panel-1'].undo).toEqual([]);
  });

  it('row 3: undo delete applies when the id no longer exists, restoring `before` verbatim; revision continues', () => {
    const before = drawing({ id: 'd1', owner: { type: 'panel', id: 'panel-1' } });
    const deleteCmd: DrawingCommand = { kind: 'delete', drawingId: 'd1', before, after: null, resultRev: 2 };
    const s: DrawingsState = {
      ...initial(),
      entities: {},
      ownerIndex: {},
      revisions: { d1: 2 },
      history: { 'panel-1': { undo: [deleteCmd], redo: [] } },
    };

    const next = reducer(s, DrawingsActions.undo({ panelId: 'panel-1' }));

    expect(next.entities['d1']).toEqual(before); // restored verbatim: same id, owner, geometry
    expect(next.ownerIndex['panel:panel-1']).toEqual(['d1']);
    expect(next.revisions['d1']).toBe(3); // continues upward, does not reset
    expect(next.history['panel-1'].undo).toEqual([]);
    expect(next.history['panel-1'].redo).toEqual([
      { kind: 'add', drawingId: 'd1', before: null, after: before, resultRev: 3 },
    ]);
  });

  it('row 4: undo on a now-locked drawing is blocked and RETAINED; unlocking makes the same undo apply', () => {
    const before = drawing({ id: 'd1' });
    const after = { ...before, p1: { time: 5, price: 5 } };
    const locked = { ...after, locked: true };
    const moveCmd: DrawingCommand = { kind: 'move', drawingId: 'd1', before, after, resultRev: 1 };
    const s: DrawingsState = {
      ...initial(),
      entities: { d1: locked },
      ownerIndex: { 'panel:panel-1': ['d1'] },
      revisions: { d1: 1 },
      history: { 'panel-1': { undo: [moveCmd], redo: [] } },
    };

    const blocked = reducer(s, DrawingsActions.undo({ panelId: 'panel-1' }));
    expect(blocked).toBe(s); // pure identity return: nothing changed
    expect(blocked.history['panel-1'].undo).toEqual([moveCmd]); // command retained, not popped

    const unlocked: DrawingsState = { ...blocked, entities: { d1: { ...locked, locked: false } } };
    const applied = reducer(unlocked, DrawingsActions.undo({ panelId: 'panel-1' }));

    expect(applied.entities['d1']).toEqual(before); // now applies
    expect(applied.history['panel-1'].undo).toEqual([]);
  });

  it('row 5: undo a shared-drawing command applies after the panel left the group (authorship, not visibility)', () => {
    const before = drawing({ id: 'd1', owner: { type: 'group', id: 'g1' } });
    const after = { ...before, p1: { time: 5, price: 5 } };
    const moveCmd: DrawingCommand = { kind: 'move', drawingId: 'd1', before, after, resultRev: 1 };
    const s: DrawingsState = {
      ...initial(),
      entities: { d1: after },
      ownerIndex: { 'group:g1': ['d1'] },
      revisions: { d1: 1 },
      // panel-1 has no selection pointing at the group at all: it left already
      history: { 'panel-1': { undo: [moveCmd], redo: [] } },
    };

    const next = reducer(s, DrawingsActions.undo({ panelId: 'panel-1' }));

    expect(next.entities['d1']).toEqual(before); // applies regardless of current composition
  });

  it('row 6: a fresh command from the panel clears that panel\'s redo stack', () => {
    let state = initial();
    state = reducer(state, DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: drawing({ id: 'd1' }) }));
    state = reducer(state, DrawingsActions.undo({ panelId: 'panel-1' })); // populates redo
    expect(state.history['panel-1'].redo).toHaveLength(1);

    const next = reducer(
      state,
      DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: drawing({ id: 'd2' }) }),
    );

    expect(next.history['panel-1'].redo).toEqual([]);
  });

  it(`row 7: caps the undo stack at HISTORY_LIMIT (${HISTORY_LIMIT}), evicting the oldest on overflow`, () => {
    let state = initial();
    for (let i = 0; i < HISTORY_LIMIT + 1; i++) {
      state = reducer(
        state,
        DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: drawing({ id: `d${i}` }) }),
      );
    }

    expect(state.history['panel-1'].undo).toHaveLength(HISTORY_LIMIT);
    expect(state.history['panel-1'].undo[0].drawingId).toBe('d1'); // d0 (the oldest) was evicted
    expect(state.history['panel-1'].undo[HISTORY_LIMIT - 1].drawingId).toBe(`d${HISTORY_LIMIT}`);
  });

  it('row 8: determinism — replaying the identical dispatch sequence twice from initialState yields deeply equal states', () => {
    const sequence = [
      DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: drawing({ id: 'd1' }) }),
      DrawingsActions.addDrawing({
        panelId: 'panel-2',
        drawing: drawing({ id: 'd2', owner: { type: 'panel', id: 'panel-2' } }),
      }),
      DrawingsActions.moveDrawing({
        panelId: 'panel-1',
        id: 'd1',
        p1: { time: 1, price: 1 },
        p2: { time: 2, price: 2 },
      }),
      DrawingsActions.undo({ panelId: 'panel-1' }),
      DrawingsActions.redo({ panelId: 'panel-1' }),
      DrawingsActions.selectDrawing({ panelId: 'panel-2', id: 'd2' }),
      DrawingsActions.deleteSelected({ panelId: 'panel-2' }),
      DrawingsActions.undo({ panelId: 'panel-2' }),
    ];

    const replay = () => sequence.reduce((s: DrawingsState, action) => reducer(s, action), initial());

    expect(replay()).toEqual(replay());
  });
});

// ---- Additional coverage required by the brief ----

describe('drawings history: panel scoping', () => {
  it("panel A's undo does not touch panel B's stacks", () => {
    let state = initial();
    state = reducer(
      state,
      DrawingsActions.addDrawing({
        panelId: 'panel-a',
        drawing: drawing({ id: 'da', owner: { type: 'panel', id: 'panel-a' } }),
      }),
    );
    state = reducer(
      state,
      DrawingsActions.addDrawing({
        panelId: 'panel-b',
        drawing: drawing({ id: 'db', owner: { type: 'panel', id: 'panel-b' } }),
      }),
    );
    const panelBHistoryBefore = state.history['panel-b'];

    const next = reducer(state, DrawingsActions.undo({ panelId: 'panel-a' }));

    expect(next.history['panel-b']).toBe(panelBHistoryBefore); // untouched by reference
    expect(next.entities['db']).toBeDefined();
    expect(next.entities['da']).toBeUndefined(); // panel-a's add was undone
  });
});

describe('drawings history: index and selection integrity', () => {
  it('an undo that recreates a deleted drawing restores it into entities and re-appends its id to ownerIndex', () => {
    let state = initial();
    state = reducer(state, DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: drawing({ id: 'd1' }) }));
    state = reducer(state, DrawingsActions.deleteSelected({ panelId: 'panel-1' }));
    expect(state.entities['d1']).toBeUndefined();
    expect(state.ownerIndex['panel:panel-1']).toEqual([]);

    const next = reducer(state, DrawingsActions.undo({ panelId: 'panel-1' }));

    expect(next.entities['d1']).toBeDefined();
    expect(next.ownerIndex['panel:panel-1']).toEqual(['d1']);
  });

  it('an undo that deletes (undoing an add) splices the index and clears selections pointing at it', () => {
    let state = initial();
    state = reducer(state, DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: drawing({ id: 'd1' }) }));
    expect(state.selection['panel-1']).toBe('d1');

    const next = reducer(state, DrawingsActions.undo({ panelId: 'panel-1' }));

    expect(next.entities['d1']).toBeUndefined();
    expect(next.ownerIndex['panel:panel-1']).toEqual([]);
    expect(next.selection['panel-1']).toBeNull();
  });
});

describe('drawings history: rejected mutations push nothing and bump nothing', () => {
  it('moveDrawing on a locked drawing pushes nothing and bumps nothing', () => {
    const locked = drawing({ id: 'd1', locked: true });
    const s: DrawingsState = { ...initial(), entities: { d1: locked } };

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
    expect(next.history).toEqual({});
    expect(next.revisions).toEqual({});
  });

  it('deleteSelected on a stale selection pushes nothing and bumps nothing', () => {
    const s: DrawingsState = { ...initial(), selection: { 'panel-1': 'gone' } };

    const next = reducer(s, DrawingsActions.deleteSelected({ panelId: 'panel-1' }));

    expect(next).toBe(s);
    expect(next.history).toEqual({});
    expect(next.revisions).toEqual({});
  });
});

describe('drawings history: hydration resets', () => {
  it('restoreDrawings resets history and revisions to {}', () => {
    let state = initial();
    state = reducer(state, DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: drawing({ id: 'd1' }) }));
    expect(Object.keys(state.history)).not.toHaveLength(0);
    expect(Object.keys(state.revisions)).not.toHaveLength(0);

    const next = reducer(state, DrawingsActions.restoreDrawings({ drawings: [] }));

    expect(next.history).toEqual({});
    expect(next.revisions).toEqual({});
  });

  it('workspaceRestored resets history and revisions to {}', () => {
    let state = initial();
    state = reducer(state, DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: drawing({ id: 'd1' }) }));

    const next = reducer(
      state,
      WorkspacesActions.workspaceRestored({ workspace: workspace({ drawings: [] }) }),
    );

    expect(next.history).toEqual({});
    expect(next.revisions).toEqual({});
  });
});

describe('drawings history: panel-close cascade drops history', () => {
  it("purgePanelIds (via removePanel) drops the closed panel's history entry, leaving other panels' untouched", () => {
    let state = initial();
    state = reducer(state, DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: drawing({ id: 'd1' }) }));
    state = reducer(
      state,
      DrawingsActions.addDrawing({
        panelId: 'panel-2',
        drawing: drawing({ id: 'd2', owner: { type: 'panel', id: 'panel-2' } }),
      }),
    );
    expect(state.history['panel-1']).toBeDefined();
    const panelTwoHistory = state.history['panel-2'];

    const next = reducer(state, LayoutActions.removePanel({ panelId: 'panel-1' }));

    expect('panel-1' in next.history).toBe(false);
    expect(next.history['panel-2']).toBe(panelTwoHistory);
  });

  it('purgePanelDrawings drops history for every purged panel', () => {
    let state = initial();
    state = reducer(state, DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: drawing({ id: 'd1' }) }));
    state = reducer(
      state,
      DrawingsActions.addDrawing({
        panelId: 'panel-2',
        drawing: drawing({ id: 'd2', owner: { type: 'panel', id: 'panel-2' } }),
      }),
    );

    const next = reducer(state, DrawingsActions.purgePanelDrawings({ panelIds: ['panel-1', 'panel-2'] }));

    expect('panel-1' in next.history).toBe(false);
    expect('panel-2' in next.history).toBe(false);
  });
});

describe('drawings history: group-deletion cascade pushes no command', () => {
  it("removeGroup deletes the group's drawings without pushing any history command", () => {
    const groupDrawing = drawing({ id: 'g-d1', owner: { type: 'group', id: 'g1' } });
    const s: DrawingsState = {
      ...initial(),
      entities: { 'g-d1': groupDrawing },
      ownerIndex: { 'group:g1': ['g-d1'] },
    };

    const next = reducer(s, LinkGroupsActions.removeGroup({ groupId: 'g1' }));

    expect(next.entities['g-d1']).toBeUndefined();
    expect(next.history).toEqual({});
  });
});

describe('drawings history: empty-stack undo/redo is an identity return', () => {
  it('undo on a panel with no history at all is an identity return', () => {
    const s = initial();
    const next = reducer(s, DrawingsActions.undo({ panelId: 'panel-1' }));
    expect(next).toBe(s);
  });

  it('redo on a panel with an empty redo stack is an identity return', () => {
    const s: DrawingsState = { ...initial(), history: { 'panel-1': { undo: [], redo: [] } } };
    const next = reducer(s, DrawingsActions.redo({ panelId: 'panel-1' }));
    expect(next).toBe(s);
  });
});
