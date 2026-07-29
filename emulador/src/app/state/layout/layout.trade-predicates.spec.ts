import { describe, expect, it } from 'vitest';
import {
  panelMayExecute,
  panelRendersTrades,
  panelTracksPrimarySeries,
  PanelDescriptor,
} from './layout.models';

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

/**
 * RFC-019 (D19.E, plan §0 C1) — direct coverage of the extracted T-1 clause itself,
 * independent of `chart-model-mapper.service.spec.ts`'s indirect exercise of it through
 * `chartView$`. This is the predicate `chartView$`'s cross-TF forming-candle gate reads
 * INSTEAD of `panelRendersTrades` — the whole point being that it must be blind to
 * `hideTrades`, which the two `hideTrades` cases below prove directly.
 */
describe('panelTracksPrimarySeries (RFC-019 D19.E, the isolated T-1 clause)', () => {
  function descriptor(overrides: Partial<PanelDescriptor> = {}): PanelDescriptor {
    return {
      id: 'panel-1',
      symbol: '',
      timeframe: 'M1',
      linkGroupId: null,
      ...overrides,
    };
  }

  it('primarySymbol === null: false', () => {
    expect(panelTracksPrimarySeries(descriptor({ symbol: 'US30' }), null)).toBe(false);
  });

  it("symbol: '' (sentinel) resolves against the primary: true", () => {
    expect(panelTracksPrimarySeries(descriptor({ symbol: '' }), 'US30')).toBe(true);
  });

  it('matching explicit symbol: true, REGARDLESS of hideTrades:true (the C1 guarantee)', () => {
    const d = descriptor({ symbol: 'US30', hideTrades: true });
    expect(panelTracksPrimarySeries(d, 'US30')).toBe(true);
  });

  it('matching explicit symbol, hideTrades:false: also true (hideTrades is simply never consulted)', () => {
    const d = descriptor({ symbol: 'US30', hideTrades: false });
    expect(panelTracksPrimarySeries(d, 'US30')).toBe(true);
  });

  it('mismatched symbol: false, REGARDLESS of hideTrades:false', () => {
    const d = descriptor({ symbol: 'NAS100', hideTrades: false });
    expect(panelTracksPrimarySeries(d, 'US30')).toBe(false);
  });
});
