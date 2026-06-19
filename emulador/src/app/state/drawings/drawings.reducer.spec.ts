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
    kind: 'line',
    p1: { time: 0, price: 100 },
    p2: { time: 3600, price: 105 },
  };
}

describe('drawings reducer: pickTool', () => {
  it('sets activeTool and clears selectedId', () => {
    const s = { ...initial(), selectedId: 'd1', activeTool: 'none' as const };
    const next = reducer(s, DrawingsActions.pickTool({ tool: 'rect' }));
    expect(next.activeTool).toBe('rect');
    expect(next.selectedId).toBeNull();
  });
});

describe('drawings reducer: addDrawing', () => {
  it('appends the drawing, sets activeTool to none, selects the new id', () => {
    const s = { ...initial(), activeTool: 'line' as const };
    const d = drawing('d1');
    const next = reducer(s, DrawingsActions.addDrawing({ drawing: d }));
    expect(next.items).toHaveLength(1);
    expect(next.items[0]).toEqual(d);
    expect(next.activeTool).toBe('none');
    expect(next.selectedId).toBe('d1');
  });
});

describe('drawings reducer: moveDrawing', () => {
  it('updates p1/p2 of the matching id only', () => {
    const d1 = drawing('d1');
    const d2 = drawing('d2');
    const s = { ...initial(), items: [d1, d2] };
    const newP1 = { time: 100, price: 200 };
    const newP2 = { time: 200, price: 300 };
    const next = reducer(s, DrawingsActions.moveDrawing({ id: 'd1', p1: newP1, p2: newP2 }));
    expect(next.items[0].p1).toEqual(newP1);
    expect(next.items[0].p2).toEqual(newP2);
    expect(next.items[1]).toEqual(d2);
  });
});

describe('drawings reducer: selectDrawing', () => {
  it('sets selectedId to the provided id', () => {
    const s = initial();
    const next = reducer(s, DrawingsActions.selectDrawing({ id: 'd1' }));
    expect(next.selectedId).toBe('d1');
  });

  it('sets selectedId to null', () => {
    const s = { ...initial(), selectedId: 'd1' };
    const next = reducer(s, DrawingsActions.selectDrawing({ id: null }));
    expect(next.selectedId).toBeNull();
  });
});

describe('drawings reducer: deleteSelected', () => {
  it('removes the selected drawing and clears selectedId', () => {
    const d1 = drawing('d1');
    const d2 = drawing('d2');
    const s = { ...initial(), items: [d1, d2], selectedId: 'd1' };
    const next = reducer(s, DrawingsActions.deleteSelected());
    expect(next.items).toHaveLength(1);
    expect(next.items[0].id).toBe('d2');
    expect(next.selectedId).toBeNull();
  });
});

describe('drawings reducer: clearDrawings', () => {
  it('empties items and clears selectedId', () => {
    const s = { ...initial(), items: [drawing('d1'), drawing('d2')], selectedId: 'd1' };
    const next = reducer(s, DrawingsActions.clearDrawings());
    expect(next.items).toHaveLength(0);
    expect(next.selectedId).toBeNull();
  });
});

describe('drawings reducer: restoreDrawings', () => {
  it('replaces items with the provided drawings and resets tool/selection', () => {
    const restored = [drawing('r1'), drawing('r2')];
    const s = {
      ...initial(),
      items: [drawing('old')],
      activeTool: 'rect' as const,
      selectedId: 'old',
    };
    const next = reducer(s, DrawingsActions.restoreDrawings({ drawings: restored }));
    expect(next.items).toEqual(restored);
    expect(next.activeTool).toBe('none');
    expect(next.selectedId).toBeNull();
  });

  it('replaces with an empty list when no drawings are provided', () => {
    const s = { ...initial(), items: [drawing('old')], selectedId: 'old' };
    const next = reducer(s, DrawingsActions.restoreDrawings({ drawings: [] }));
    expect(next.items).toEqual([]);
    expect(next.selectedId).toBeNull();
  });
});

describe('drawings reducer: workspaceRestored', () => {
  it('loads workspace.drawings and resets tool/selection', () => {
    const drawings = [drawing('d1'), drawing('d2')];
    const ws = workspace({ drawings });
    const s = {
      ...initial(),
      items: [drawing('old')],
      activeTool: 'rect' as const,
      selectedId: 'old',
    };
    const next = reducer(s, WorkspacesActions.workspaceRestored({ workspace: ws }));
    expect(next.items).toEqual(drawings);
    expect(next.activeTool).toBe('none');
    expect(next.selectedId).toBeNull();
  });
});
