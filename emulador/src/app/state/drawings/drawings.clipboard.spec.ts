import { describe, expect, it } from 'vitest';
import { drawingsFeature } from './drawings.reducer';
import { DrawingsActions } from './drawings.actions';
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

/** A drawing built exactly as the dispatching component would build a pasted one. */
function pasteDrawing(overrides: Partial<Drawing> = {}): Drawing {
  return {
    id: 'pasted-1',
    symbol: 'EURUSD',
    owner: { type: 'panel', id: 'panel-2' },
    kind: 'line',
    p1: { time: 0, price: 100 },
    p2: { time: 3600, price: 105 },
    zIndex: 0, // placeholder — the reducer owns real z-order assignment
    locked: false,
    visible: true,
    ...overrides,
  };
}

// ---- copySelected ----

describe('drawings clipboard: copySelected', () => {
  it('captures geometry and kind ONLY — the entry has no id, owner, locked or visible', () => {
    const source = drawing({
      id: 'd1',
      kind: 'rect',
      p1: { time: 1, price: 2 },
      p2: { time: 3, price: 4 },
      locked: true,
      visible: false,
      owner: { type: 'group', id: 'g1' },
    });
    const s: DrawingsState = {
      ...initial(),
      entities: { d1: source },
      selection: { 'panel-1': 'd1' },
    };

    const next = reducer(s, DrawingsActions.copySelected({ panelId: 'panel-1' }));

    expect(next.clipboard).toEqual({
      kind: 'rect',
      p1: { time: 1, price: 2 },
      p2: { time: 3, price: 4 },
    });
    expect(next.clipboard).not.toHaveProperty('id');
    expect(next.clipboard).not.toHaveProperty('owner');
    expect(next.clipboard).not.toHaveProperty('locked');
    expect(next.clipboard).not.toHaveProperty('visible');
  });

  it('is a no-op (identity return) when the panel has no selection', () => {
    const s = initial();
    const next = reducer(s, DrawingsActions.copySelected({ panelId: 'panel-1' }));
    expect(next).toBe(s);
  });

  it('is a no-op (identity return) when the selection points at an absent entity', () => {
    const s: DrawingsState = { ...initial(), selection: { 'panel-1': 'gone' } };
    const next = reducer(s, DrawingsActions.copySelected({ panelId: 'panel-1' }));
    expect(next).toBe(s);
  });

  it('does not touch history, revisions, entities or selection', () => {
    const source = drawing({ id: 'd1' });
    const s: DrawingsState = {
      ...initial(),
      entities: { d1: source },
      selection: { 'panel-1': 'd1' },
    };
    const next = reducer(s, DrawingsActions.copySelected({ panelId: 'panel-1' }));
    expect(next.history).toBe(s.history);
    expect(next.revisions).toBe(s.revisions);
    expect(next.entities).toBe(s.entities);
    expect(next.selection).toBe(s.selection);
  });

  it('does not require the source drawing to be unlocked — reading is always allowed', () => {
    const locked = drawing({ id: 'd1', locked: true });
    const s: DrawingsState = {
      ...initial(),
      entities: { d1: locked },
      selection: { 'panel-1': 'd1' },
    };
    const next = reducer(s, DrawingsActions.copySelected({ panelId: 'panel-1' }));
    expect(next.clipboard).toEqual({ kind: locked.kind, p1: locked.p1, p2: locked.p2 });
  });
});

// ---- pasteClipboard ----

describe('drawings clipboard: pasteClipboard', () => {
  it('mints a NEW identity distinct from the source, a fresh zIndex from nextZ, and the destination symbol', () => {
    const source = drawing({ id: 'source-1', symbol: 'EURUSD', zIndex: 7 });
    const clip = { kind: source.kind, p1: source.p1, p2: source.p2 };
    const s: DrawingsState = {
      ...initial(),
      entities: { 'source-1': source },
      ownerIndex: { 'panel:panel-1': ['source-1'] },
      nextZ: 12,
      clipboard: clip,
    };
    const toPaste = pasteDrawing({
      symbol: 'GBPUSD',
      owner: { type: 'panel', id: 'panel-2' },
      kind: clip.kind,
      p1: clip.p1,
      p2: clip.p2,
    });

    const next = reducer(
      s,
      DrawingsActions.pasteClipboard({ panelId: 'panel-2', drawing: toPaste }),
    );

    expect(next.entities['pasted-1']).toBeDefined();
    expect(next.entities['pasted-1'].id).not.toBe(source.id);
    expect(next.entities['pasted-1'].zIndex).toBe(12); // stamped from nextZ, not the placeholder 0
    expect(next.entities['pasted-1'].symbol).toBe('GBPUSD');
    expect(next.nextZ).toBe(13);
    expect(next.entities['source-1']).toEqual(source); // the source is untouched
  });

  it('paste of a locked SHARED drawing yields an UNLOCKED drawing under the destination GROUP (linked with syncDrawings)', () => {
    const sharedLocked = drawing({
      id: 'shared-1',
      owner: { type: 'group', id: 'g1' },
      locked: true,
    });
    const clip = { kind: sharedLocked.kind, p1: sharedLocked.p1, p2: sharedLocked.p2 };
    const s: DrawingsState = {
      ...initial(),
      entities: { 'shared-1': sharedLocked },
      ownerIndex: { 'group:g1': ['shared-1'] },
      clipboard: clip,
    };
    // resolveDrawingTarget resolution is the dispatching component's job (§6); simulated
    // here with the already-resolved group owner, exactly as the destination panel (linked
    // with syncDrawings) would produce it.
    const toPaste = pasteDrawing({ owner: { type: 'group', id: 'g1' } });

    const next = reducer(
      s,
      DrawingsActions.pasteClipboard({ panelId: 'panel-2', drawing: toPaste }),
    );

    expect(next.entities['pasted-1'].locked).toBe(false);
    expect(next.entities['pasted-1'].owner).toEqual({ type: 'group', id: 'g1' });
    expect(next.ownerIndex['group:g1']).toContain('pasted-1');
    expect(next.entities['shared-1'].locked).toBe(true); // the source is untouched
  });

  it('paste of a locked SHARED drawing yields an UNLOCKED drawing under the destination PANEL (unlinked)', () => {
    const sharedLocked = drawing({
      id: 'shared-1',
      owner: { type: 'group', id: 'g1' },
      locked: true,
    });
    const clip = { kind: sharedLocked.kind, p1: sharedLocked.p1, p2: sharedLocked.p2 };
    const s: DrawingsState = {
      ...initial(),
      entities: { 'shared-1': sharedLocked },
      ownerIndex: { 'group:g1': ['shared-1'] },
      clipboard: clip,
    };
    // the destination panel is unlinked, so resolveDrawingTarget would resolve to the panel.
    const toPaste = pasteDrawing({ owner: { type: 'panel', id: 'panel-2' } });

    const next = reducer(
      s,
      DrawingsActions.pasteClipboard({ panelId: 'panel-2', drawing: toPaste }),
    );

    expect(next.entities['pasted-1'].locked).toBe(false);
    expect(next.entities['pasted-1'].owner).toEqual({ type: 'panel', id: 'panel-2' });
    expect(next.ownerIndex['panel:panel-2']).toContain('pasted-1');
  });

  it('participates in undo: lands as an add command; undoing removes the pasted drawing, leaving the source untouched', () => {
    const source = drawing({ id: 'source-1' });
    const clip = { kind: source.kind, p1: source.p1, p2: source.p2 };
    const s: DrawingsState = {
      ...initial(),
      entities: { 'source-1': source },
      ownerIndex: { 'panel:panel-1': ['source-1'] },
      clipboard: clip,
    };
    const toPaste = pasteDrawing({ owner: { type: 'panel', id: 'panel-2' } });

    const afterPaste = reducer(
      s,
      DrawingsActions.pasteClipboard({ panelId: 'panel-2', drawing: toPaste }),
    );
    expect(afterPaste.history['panel-2'].undo).toHaveLength(1);
    expect(afterPaste.history['panel-2'].undo[0]).toMatchObject({
      kind: 'add',
      drawingId: 'pasted-1',
      before: null,
    });
    expect(afterPaste.revisions['pasted-1']).toBe(1);

    const afterUndo = reducer(afterPaste, DrawingsActions.undo({ panelId: 'panel-2' }));

    expect(afterUndo.entities['pasted-1']).toBeUndefined();
    expect(afterUndo.entities['source-1']).toEqual(source); // untouched by the undo
  });

  it('selects the new drawing in the pasting panel', () => {
    const clip = { kind: 'line' as const, p1: { time: 0, price: 1 }, p2: { time: 1, price: 2 } };
    const s: DrawingsState = { ...initial(), clipboard: clip };
    const toPaste = pasteDrawing({ owner: { type: 'panel', id: 'panel-2' } });

    const next = reducer(
      s,
      DrawingsActions.pasteClipboard({ panelId: 'panel-2', drawing: toPaste }),
    );

    expect(next.selection['panel-2']).toBe('pasted-1');
  });

  it('is a no-op (identity return) with an empty clipboard', () => {
    const s = initial(); // clipboard: null
    const toPaste = pasteDrawing();

    const next = reducer(
      s,
      DrawingsActions.pasteClipboard({ panelId: 'panel-1', drawing: toPaste }),
    );

    expect(next).toBe(s);
  });
});

// ---- hydration resets ----

describe('drawings clipboard: hydration resets', () => {
  it('restoreDrawings clears the clipboard', () => {
    let state = initial();
    state = reducer(
      state,
      DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: drawing({ id: 'd1' }) }),
    );
    state = reducer(state, DrawingsActions.copySelected({ panelId: 'panel-1' }));
    expect(state.clipboard).not.toBeNull();

    const next = reducer(state, DrawingsActions.restoreDrawings({ drawings: [] }));

    expect(next.clipboard).toBeNull();
  });

  it('workspaceRestored clears the clipboard', () => {
    let state = initial();
    state = reducer(
      state,
      DrawingsActions.addDrawing({ panelId: 'panel-1', drawing: drawing({ id: 'd1' }) }),
    );
    state = reducer(state, DrawingsActions.copySelected({ panelId: 'panel-1' }));
    expect(state.clipboard).not.toBeNull();

    const next = reducer(
      state,
      WorkspacesActions.workspaceRestored({ workspace: workspace({ drawings: [] }) }),
    );

    expect(next.clipboard).toBeNull();
  });
});
