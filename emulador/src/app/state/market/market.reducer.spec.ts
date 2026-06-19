import { describe, expect, it } from 'vitest';
import { marketFeature } from './market.reducer';
import { MarketActions } from './market.actions';
import { WorkspacesActions } from '../workspaces/workspaces.actions';
import { series, workspace } from '../../testing/fixtures';

const reducer = marketFeature.reducer;

describe('market reducer: default branch', () => {
  it('initialises with empty series/files and activeTf null', () => {
    const s = reducer(undefined, { type: '@@init' } as any);
    expect(s.series).toEqual({});
    expect(s.files).toEqual({});
    expect(s.activeTf).toBeNull();
  });
});

describe('market reducer: csvLoaded', () => {
  it('stores candles and fileName under the loaded timeframe', () => {
    const candles = series(3);
    const s = reducer(undefined, { type: '@@init' } as any);
    const next = reducer(s, MarketActions.csvLoaded({ tf: 'H1', candles, fileName: 'xau.csv' }));
    expect(next.series['H1']).toEqual(candles);
    expect(next.files['H1']).toBe('xau.csv');
  });

  it('sets activeTf to the first loaded timeframe', () => {
    const s = reducer(undefined, { type: '@@init' } as any);
    const next = reducer(
      s,
      MarketActions.csvLoaded({ tf: 'H1', candles: series(3), fileName: 'a.csv' }),
    );
    expect(next.activeTf).toBe('H1');
  });

  it('does not overwrite activeTf on a second load of a different tf', () => {
    const s = reducer(undefined, { type: '@@init' } as any);
    const after1 = reducer(
      s,
      MarketActions.csvLoaded({ tf: 'H1', candles: series(3), fileName: 'a.csv' }),
    );
    const after2 = reducer(
      after1,
      MarketActions.csvLoaded({ tf: 'H4', candles: series(3), fileName: 'b.csv' }),
    );
    expect(after2.activeTf).toBe('H1');
    expect(after2.series['H4']).toBeDefined();
  });
});

describe('market reducer: changeTimeframe', () => {
  it('switches activeTf when the requested tf has a series', () => {
    const s = reducer(undefined, { type: '@@init' } as any);
    const loaded = reducer(
      s,
      MarketActions.csvLoaded({ tf: 'H1', candles: series(3), fileName: 'a.csv' }),
    );
    const loaded2 = reducer(
      loaded,
      MarketActions.csvLoaded({ tf: 'H4', candles: series(3), fileName: 'b.csv' }),
    );
    const next = reducer(loaded2, MarketActions.changeTimeframe({ tf: 'H4' }));
    expect(next.activeTf).toBe('H4');
  });

  it('is a no-op when the requested tf is not loaded', () => {
    const s = reducer(undefined, { type: '@@init' } as any);
    const loaded = reducer(
      s,
      MarketActions.csvLoaded({ tf: 'H1', candles: series(3), fileName: 'a.csv' }),
    );
    const next = reducer(loaded, MarketActions.changeTimeframe({ tf: 'H4' }));
    expect(next).toBe(loaded);
    expect(next.activeTf).toBe('H1');
  });
});

describe('market reducer: workspaceRestored', () => {
  it('replaces series/files/activeTf wholesale from the workspace', () => {
    const candles = series(2);
    const ws = workspace({ series: { H1: candles }, files: { H1: 'x.csv' }, activeTf: 'H1' });
    const s = reducer(undefined, { type: '@@init' } as any);
    const next = reducer(s, WorkspacesActions.workspaceRestored({ workspace: ws }));
    expect(next.series).toEqual({ H1: candles });
    expect(next.files).toEqual({ H1: 'x.csv' });
    expect(next.activeTf).toBe('H1');
  });

  it('restores the session TF selection (and defaults legacy sessions to null)', () => {
    const s = reducer(undefined, { type: '@@init' } as any);
    const scoped = reducer(
      s,
      WorkspacesActions.workspaceRestored({ workspace: workspace({ selectedTfs: ['M5', 'H1'] }) }),
    );
    expect(scoped.selectedTfs).toEqual(['M5', 'H1']);
    const legacy = reducer(s, WorkspacesActions.workspaceRestored({ workspace: workspace() }));
    expect(legacy.selectedTfs).toBeNull();
  });

  it('clears any active custom timeframe', () => {
    const s = reducer(undefined, { type: '@@init' } as any);
    const custom = reducer(s, MarketActions.changeCustomTimeframe({ minutes: 45 }));
    const restored = reducer(
      custom,
      WorkspacesActions.workspaceRestored({ workspace: workspace() }),
    );
    expect(restored.customTf).toBeNull();
    expect(restored.customSeries).toEqual([]);
  });
});

describe('market reducer: custom timeframe', () => {
  it('initialises with no custom timeframe', () => {
    const s = reducer(undefined, { type: '@@init' } as any);
    expect(s.customTf).toBeNull();
    expect(s.customSeries).toEqual([]);
  });

  it('changeCustomTimeframe sets the minutes and clears any stale custom series', () => {
    const s = reducer(undefined, { type: '@@init' } as any);
    const next = reducer(s, MarketActions.changeCustomTimeframe({ minutes: 90 }));
    expect(next.customTf).toBe(90);
    expect(next.customSeries).toEqual([]);
  });

  it('customTimeframeGenerated stores the candles when the minutes still match', () => {
    const s = reducer(undefined, { type: '@@init' } as any);
    const pending = reducer(s, MarketActions.changeCustomTimeframe({ minutes: 45 }));
    const candles = series(2);
    const next = reducer(pending, MarketActions.customTimeframeGenerated({ minutes: 45, candles }));
    expect(next.customSeries).toEqual(candles);
  });

  it('ignores a stale generated reply for a different timeframe', () => {
    const s = reducer(undefined, { type: '@@init' } as any);
    const pending = reducer(s, MarketActions.changeCustomTimeframe({ minutes: 45 }));
    const next = reducer(
      pending,
      MarketActions.customTimeframeGenerated({ minutes: 90, candles: series(2) }),
    );
    expect(next.customSeries).toEqual([]); // 90 !== active 45 → ignored
  });

  it('switching to a standard timeframe clears the custom one', () => {
    const s = reducer(undefined, { type: '@@init' } as any);
    const loaded = reducer(
      s,
      MarketActions.csvLoaded({ tf: 'H1', candles: series(3), fileName: 'a.csv' }),
    );
    const custom = reducer(loaded, MarketActions.changeCustomTimeframe({ minutes: 45 }));
    const back = reducer(custom, MarketActions.changeTimeframe({ tf: 'H1' }));
    expect(back.customTf).toBeNull();
    expect(back.activeTf).toBe('H1');
  });
});
