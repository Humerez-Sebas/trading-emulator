import { describe, expect, it } from 'vitest';
import { LayoutActions } from './layout.actions';
import { layoutFeature } from './layout.reducer';
import { createInitialLayoutState } from './layout.models';

const reducer = layoutFeature.reducer;

describe('layout reducer: setPanelHideTrades', () => {
  it('toggling sets the flag to true', () => {
    const state = createInitialLayoutState();

    const next = reducer(
      state,
      LayoutActions.setPanelHideTrades({ panelId: 'panel-1', hidden: true }),
    );

    expect(next.panels['panel-1'].hideTrades).toBe(true);
  });

  it('toggling back off CLEARS the field rather than writing `false` explicitly', () => {
    let state = createInitialLayoutState();
    state = reducer(state, LayoutActions.setPanelHideTrades({ panelId: 'panel-1', hidden: true }));
    expect(state.panels['panel-1'].hideTrades).toBe(true);

    const next = reducer(
      state,
      LayoutActions.setPanelHideTrades({ panelId: 'panel-1', hidden: false }),
    );

    expect('hideTrades' in next.panels['panel-1']).toBe(false);
  });

  it('is a no-op (identity return) for an unknown panelId', () => {
    const state = createInitialLayoutState();

    const next = reducer(
      state,
      LayoutActions.setPanelHideTrades({ panelId: 'nope', hidden: true }),
    );

    expect(next).toBe(state);
  });

  it('is a no-op (identity return) when setting the same value again', () => {
    let state = createInitialLayoutState();
    state = reducer(state, LayoutActions.setPanelHideTrades({ panelId: 'panel-1', hidden: true }));

    const next = reducer(
      state,
      LayoutActions.setPanelHideTrades({ panelId: 'panel-1', hidden: true }),
    );

    expect(next).toBe(state);
  });

  it('setting hidden:false on a panel that never toggled (field already absent) is also a no-op', () => {
    const state = createInitialLayoutState();

    const next = reducer(
      state,
      LayoutActions.setPanelHideTrades({ panelId: 'panel-1', hidden: false }),
    );

    expect(next).toBe(state);
  });

  it('the flag is absent (not `false`) on descriptors that never toggled', () => {
    const state = createInitialLayoutState();
    expect('hideTrades' in state.panels['panel-1']).toBe(false);
  });

  it('leaves every other descriptor field untouched', () => {
    const state = createInitialLayoutState();
    const before = state.panels['panel-1'];

    const next = reducer(
      state,
      LayoutActions.setPanelHideTrades({ panelId: 'panel-1', hidden: true }),
    );

    expect(next.panels['panel-1']).toEqual({ ...before, hideTrades: true });
  });
});
