import { describe, expect, it } from 'vitest';
import { liftLegacyDrawing, ownerPanelFor } from './drawings-migration';
import { WorkspaceLayout, PanelDescriptor } from '../state/layout/layout.models';

describe('liftLegacyDrawing', () => {
  it('preserves id/kind/p1/p2 byte-for-byte and stamps the new owner/locked/visible/symbol/zIndex fields', () => {
    const p1 = { time: 100, price: 1.1 };
    const p2 = { time: 200, price: 1.2 };
    const item = { id: 'd1', kind: 'line' as const, p1, p2 };

    const lifted = liftLegacyDrawing(item, 'EURUSD', 'panel-1', 3);

    expect(lifted.id).toBe('d1');
    expect(lifted.kind).toBe('line');
    expect(lifted.p1).toBe(p1);
    expect(lifted.p2).toBe(p2);
    expect(lifted.symbol).toBe('EURUSD');
    expect(lifted.owner).toEqual({ type: 'panel', id: 'panel-1' });
    expect(lifted.zIndex).toBe(3);
    expect(lifted.locked).toBe(false);
    expect(lifted.visible).toBe(true);
  });
});

describe('ownerPanelFor', () => {
  function layoutWith(panelIds: string[][]): WorkspaceLayout {
    return {
      tabs: [
        {
          id: 'tab-main',
          name: 'Principal',
          template: '1',
          cells: panelIds.map((ids) => ({ panelIds: ids, activePanelId: ids[0] ?? '' })),
        },
      ],
      activeTabId: 'tab-main',
    };
  }

  it('returns the first symbol-matching panel in tab -> cell -> panelIds order, proving order over the naive first panel', () => {
    // two tabs: the FIRST tab's only panel does NOT match; the SECOND tab has
    // two cells, and the match sits in the second cell — proving both tab
    // order and cell order are honored, not just "first panel overall".
    const layout: WorkspaceLayout = {
      tabs: [
        {
          id: 'tab-1',
          name: 'Uno',
          template: '1',
          cells: [{ panelIds: ['p1'], activePanelId: 'p1' }],
        },
        {
          id: 'tab-2',
          name: 'Dos',
          template: '2h',
          cells: [
            { panelIds: ['p2'], activePanelId: 'p2' },
            { panelIds: ['p3'], activePanelId: 'p3' },
          ],
        },
      ],
      activeTabId: 'tab-1',
    };
    const panels: Record<string, PanelDescriptor> = {
      p1: { id: 'p1', symbol: 'GBPUSD', timeframe: 'M1', linkGroupId: null },
      p2: { id: 'p2', symbol: 'GBPUSD', timeframe: 'M1', linkGroupId: null },
      p3: { id: 'p3', symbol: 'EURUSD', timeframe: 'M1', linkGroupId: null },
    };

    expect(ownerPanelFor('EURUSD', layout, panels)).toBe('p3');
  });

  it('falls back to the first panel in layout order when no panel matches the symbol', () => {
    const layout = layoutWith([['p1'], ['p2']]);
    const panels: Record<string, PanelDescriptor> = {
      p1: { id: 'p1', symbol: 'GBPUSD', timeframe: 'M1', linkGroupId: null },
      p2: { id: 'p2', symbol: 'USDJPY', timeframe: 'M1', linkGroupId: null },
    };

    expect(ownerPanelFor('EURUSD', layout, panels)).toBe('p1');
  });

  it('reduces to the single panel id in a single-panel layout', () => {
    const layout = layoutWith([['panel-1']]);
    const panels: Record<string, PanelDescriptor> = {
      'panel-1': { id: 'panel-1', symbol: 'EURUSD', timeframe: 'M1', linkGroupId: null },
    };

    expect(ownerPanelFor('EURUSD', layout, panels)).toBe('panel-1');
  });

  it('returns an empty string when the layout has no panels at all', () => {
    const layout = layoutWith([]);
    expect(ownerPanelFor('EURUSD', layout, {})).toBe('');
  });
});
