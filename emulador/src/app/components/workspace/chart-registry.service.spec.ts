import { describe, it, expect } from 'vitest';
import { ChartRegistry, PanelChartHandle } from './chart-registry.service';

const handle = (): PanelChartHandle => ({
  setUpdatesEnabled: () => void 0,
  applyCrosshair: () => void 0,
  applyVisibleRange: () => void 0,
});

describe('ChartRegistry (RFC-009)', () => {
  it('registers, resolves, lists and counts handles', () => {
    const reg = new ChartRegistry();
    const h = handle();
    reg.register('p1', h);
    expect(reg.get('p1')).toBe(h);
    expect(reg.ids()).toEqual(['p1']);
    expect(reg.count()).toBe(1);
  });
  it('throws on duplicate registration (one live instance per panelId)', () => {
    const reg = new ChartRegistry();
    reg.register('p1', handle());
    expect(() => reg.register('p1', handle())).toThrowError(/p1/);
  });
  it('deregister removes and is idempotent', () => {
    const reg = new ChartRegistry();
    reg.register('p1', handle());
    reg.deregister('p1');
    reg.deregister('p1');
    expect(reg.get('p1')).toBeNull();
    expect(reg.count()).toBe(0);
  });
});
