import { describe, expect, it } from 'vitest';
import { drawingsFeature } from './drawings.reducer';
import { DrawingsActions } from './drawings.actions';
import { WorkspacesActions } from '../workspaces/workspaces.actions';
import { Drawing } from './drawings.models';
import { workspace } from '../../testing/fixtures';

const reducer = drawingsFeature.reducer;

function initial() {
  return reducer(undefined, { type: '@@init' } as any);
}

function drawing(id = 'd1'): Drawing {
  return {
    id,
    symbol: 'EURUSD',
    owner: { type: 'panel', id: 'panel-1' },
    kind: 'line',
    p1: { time: 0, price: 100 },
    p2: { time: 3600, price: 105 },
    zIndex: 0,
    locked: false,
    visible: true,
  };
}

describe('drawings reducer: pickTool', () => {
  // The old flat-slice reducer also cleared the global `selectedId` here.
  // `pickTool` carries no `panelId` in the entity model (the tool palette is
  // global, selection is per-panel), so there is no per-panel slot for this
  // action to clear anymore; it only ever touches `activeTool`.
  it('sets activeTool', () => {
    const s = { ...initial(), activeTool: 'none' as const };
    const next = reducer(s, DrawingsActions.pickTool({ tool: 'rect' }));
    expect(next.activeTool).toBe('rect');
  });
});

describe('drawings reducer: addDrawing', () => {
  it('stores the drawing, sets activeTool to none, selects the new id for the acting panel', () => {
    const s = { ...initial(), activeTool: 'line' as const };
    const d = drawing('d1');
    const next = reducer(s, DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: d }));
    expect(next.entities['d1']).toEqual(d);
    expect(next.ownerIndex['panel:panel-1']).toEqual(['d1']);
    expect(next.activeTool).toBe('none');
    expect(next.selection['panel-1']).toBe('d1');
  });
});

describe('drawings reducer: moveDrawing', () => {
  it('updates p1/p2 of the matching id only', () => {
    const d1 = drawing('d1');
    const d2 = drawing('d2');
    const s = { ...initial(), entities: { d1, d2 } };
    const newP1 = { time: 100, price: 200 };
    const newP2 = { time: 200, price: 300 };
    const next = reducer(
      s,
      DrawingsActions.moveDrawing({ panelId: 'panel-1', id: 'd1', p1: newP1, p2: newP2 }),
    );
    expect(next.entities['d1'].p1).toEqual(newP1);
    expect(next.entities['d1'].p2).toEqual(newP2);
    expect(next.entities['d2']).toEqual(d2);
  });
});

describe('drawings reducer: selectDrawing', () => {
  it('sets the acting panel selection to the provided id', () => {
    const s = initial();
    const next = reducer(s, DrawingsActions.selectDrawing({ panelId: 'panel-1', id: 'd1' }));
    expect(next.selection['panel-1']).toBe('d1');
  });

  it('sets the acting panel selection to null', () => {
    const s = { ...initial(), selection: { 'panel-1': 'd1' } };
    const next = reducer(s, DrawingsActions.selectDrawing({ panelId: 'panel-1', id: null }));
    expect(next.selection['panel-1']).toBeNull();
  });
});

describe('drawings reducer: deleteSelected', () => {
  it("removes the acting panel's selected drawing and clears its selection", () => {
    const d1 = drawing('d1');
    const d2 = drawing('d2');
    const s = {
      ...initial(),
      entities: { d1, d2 },
      ownerIndex: { 'panel:panel-1': ['d1', 'd2'] },
      selection: { 'panel-1': 'd1' },
    };
    const next = reducer(s, DrawingsActions.deleteSelected({ panelId: 'panel-1' }));
    expect(next.entities['d1']).toBeUndefined();
    expect(next.entities['d2']).toEqual(d2);
    expect(next.selection['panel-1']).toBeNull();
  });
});

describe('drawings reducer: clearing all drawings', () => {
  // The old flat-slice reducer had a dedicated `clearDrawings` action. It is
  // retired: wiping the whole store is exactly what `restoreDrawings` with an
  // empty set already expresses, so the "clear all" gesture (toolbar-tools's
  // clearAll()) now dispatches that instead of adding a second API for the
  // same guarantee.
  it('restoreDrawings with an empty set empties entities/ownerIndex and every panel selection', () => {
    const s = {
      ...initial(),
      entities: { d1: drawing('d1'), d2: drawing('d2') },
      ownerIndex: { 'panel:panel-1': ['d1', 'd2'] },
      selection: { 'panel-1': 'd1' },
    };
    const next = reducer(s, DrawingsActions.restoreDrawings({ drawings: [] }));
    expect(next.entities).toEqual({});
    expect(next.ownerIndex).toEqual({});
    expect(next.selection).toEqual({});
  });
});

describe('drawings reducer: restoreDrawings', () => {
  it('replaces entities/ownerIndex with the provided drawings and resets tool/selection', () => {
    const restored = [drawing('r1'), drawing('r2')];
    const s = {
      ...initial(),
      entities: { old: drawing('old') },
      activeTool: 'rect' as const,
      selection: { 'panel-1': 'old' },
    };
    const next = reducer(s, DrawingsActions.restoreDrawings({ drawings: restored }));
    expect(Object.values(next.entities)).toEqual(restored);
    expect(next.activeTool).toBe('none');
    expect(next.selection).toEqual({});
  });

  it('replaces with an empty set when no drawings are provided', () => {
    const s = { ...initial(), entities: { old: drawing('old') }, selection: { 'panel-1': 'old' } };
    const next = reducer(s, DrawingsActions.restoreDrawings({ drawings: [] }));
    expect(next.entities).toEqual({});
    expect(next.selection).toEqual({});
  });
});

describe('drawings reducer: workspaceRestored', () => {
  it('loads workspace.drawings and resets tool/selection', () => {
    const drawings = [drawing('d1'), drawing('d2')];
    const ws = workspace({ drawings });
    const s = {
      ...initial(),
      entities: { old: drawing('old') },
      activeTool: 'rect' as const,
      selection: { 'panel-1': 'old' },
    };
    const next = reducer(s, WorkspacesActions.workspaceRestored({ workspace: ws }));
    expect(Object.values(next.entities)).toEqual(drawings);
    expect(next.activeTool).toBe('none');
    expect(next.selection).toEqual({});
  });
});

// `restoreDrawingsForSymbol` (the per-symbol hydration action) is retired:
// the store no longer swaps a per-symbol slice, so there is nothing left for
// a symbol-narrowed restore to narrow. The equivalent guarantee — "the right
// drawings end up attached to the right symbol after a restore" — is covered
// by `drawings.reducer.entity.spec.ts`'s hydration-rebuild cases and by the
// composition mapper's symbol-filter test, both against the surviving
// `restoreDrawings`/`workspaceRestored` API.
