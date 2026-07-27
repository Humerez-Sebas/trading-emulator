import { describe, expect, it } from 'vitest';
import { panelMayExecute, panelRendersTrades, PanelDescriptor } from './layout.models';

function descriptor(overrides: Partial<PanelDescriptor> = {}): PanelDescriptor {
  return {
    id: 'panel-1',
    symbol: '',
    timeframe: 'M1',
    linkGroupId: null,
    ...overrides,
  };
}

describe('RFC-018 trade-visibility predicates (T-1 / T-2 / T-3)', () => {
  it('primarySymbol === null: both predicates are false', () => {
    const d = descriptor({ symbol: 'US30' });

    expect(panelRendersTrades(d, null)).toBe(false);
    expect(panelMayExecute(d, null)).toBe(false);
  });

  it("symbol: '' (sentinel), primary 'US30': both predicates are true", () => {
    const d = descriptor({ symbol: '' });

    expect(panelRendersTrades(d, 'US30')).toBe(true);
    expect(panelMayExecute(d, 'US30')).toBe(true);
  });

  it("symbol: 'US30', primary 'US30': both predicates are true", () => {
    const d = descriptor({ symbol: 'US30' });

    expect(panelRendersTrades(d, 'US30')).toBe(true);
    expect(panelMayExecute(d, 'US30')).toBe(true);
  });

  it("symbol: 'NAS100', primary 'US30': both predicates are false (T-1 / T-3)", () => {
    const d = descriptor({ symbol: 'NAS100' });

    expect(panelRendersTrades(d, 'US30')).toBe(false);
    expect(panelMayExecute(d, 'US30')).toBe(false);
  });

  it('hideTrades:true on a matching symbol: panelRendersTrades false (T-2), panelMayExecute stays true', () => {
    const d = descriptor({ symbol: 'US30', hideTrades: true });

    expect(panelRendersTrades(d, 'US30')).toBe(false);
    expect(panelMayExecute(d, 'US30')).toBe(true);
  });

  it('T-1 is NOT overridable by T-2: mismatched symbol stays false even with hideTrades:false', () => {
    const d = descriptor({ symbol: 'NAS100', hideTrades: false });

    expect(panelRendersTrades(d, 'US30')).toBe(false);
    expect(panelMayExecute(d, 'US30')).toBe(false);
  });
});
