import { describe, expect, it } from 'vitest';
import { workspacesFeature } from './workspaces.reducer';
import { WorkspacesActions } from './workspaces.actions';
import { workspace } from '../../testing/fixtures';

const reducer = workspacesFeature.reducer;

function initial() {
  return reducer(undefined, { type: '@@init' } as any);
}

describe('workspaces reducer: assetsLoaded', () => {
  it('sets assets and current', () => {
    const assets = [
      { symbol: 'XAUUSD', lastModified: 1 },
      { symbol: 'EURUSD', lastModified: 2 },
    ];
    const next = reducer(initial(), WorkspacesActions.assetsLoaded({ assets, current: 'XAUUSD' }));
    expect(next.assets).toEqual(assets);
    expect(next.current).toBe('XAUUSD');
  });

  it('sets current to null when none stored', () => {
    const next = reducer(initial(), WorkspacesActions.assetsLoaded({ assets: [], current: null }));
    expect(next.current).toBeNull();
  });
});

describe('workspaces reducer: workspaceRestored', () => {
  it('sets current to the restored workspace symbol', () => {
    const ws = workspace({ symbol: 'XAUUSD' });
    const next = reducer(initial(), WorkspacesActions.workspaceRestored({ workspace: ws }));
    expect(next.current).toBe('XAUUSD');
  });

  it('upserts the restored symbol into assets (dedupes — same symbol replaced, not duplicated)', () => {
    const s = {
      ...initial(),
      assets: [{ symbol: 'XAUUSD', lastModified: 1 }],
    };
    const ws = workspace({ symbol: 'XAUUSD' });
    const next = reducer(s, WorkspacesActions.workspaceRestored({ workspace: ws }));
    expect(next.assets.filter((a) => a.symbol === 'XAUUSD')).toHaveLength(1);
  });

  it('adds a new symbol to assets when it was not present', () => {
    const s = {
      ...initial(),
      assets: [{ symbol: 'EURUSD', lastModified: 1 }],
    };
    const ws = workspace({ symbol: 'XAUUSD' });
    const next = reducer(s, WorkspacesActions.workspaceRestored({ workspace: ws }));
    expect(next.assets.map((a) => a.symbol)).toContain('XAUUSD');
    expect(next.assets.map((a) => a.symbol)).toContain('EURUSD');
  });

  it('sorts assets alphabetically', () => {
    const s = {
      ...initial(),
      assets: [
        { symbol: 'XAUUSD', lastModified: 1 },
        { symbol: 'EURUSD', lastModified: 2 },
      ],
    };
    const ws = workspace({ symbol: 'NAS100' });
    const next = reducer(s, WorkspacesActions.workspaceRestored({ workspace: ws }));
    const symbols = next.assets.map((a) => a.symbol);
    expect(symbols).toEqual([...symbols].sort());
  });

  it('updates lastModified for the upserted asset (via expect.objectContaining)', () => {
    const s = {
      ...initial(),
      assets: [{ symbol: 'XAUUSD', lastModified: 1 }],
    };
    const ws = workspace({ symbol: 'XAUUSD' });
    const before = Date.now();
    const next = reducer(s, WorkspacesActions.workspaceRestored({ workspace: ws }));
    const after = Date.now();
    const entry = next.assets.find((a) => a.symbol === 'XAUUSD')!;
    expect(entry.lastModified).toBeGreaterThanOrEqual(before);
    expect(entry.lastModified).toBeLessThanOrEqual(after);
  });
});
