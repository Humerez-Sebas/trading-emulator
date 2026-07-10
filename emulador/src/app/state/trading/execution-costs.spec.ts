import { describe, expect, it } from 'vitest';
import { COST_PRESETS, costPresetFor, pointsToPrice, ZERO_COSTS } from './execution-costs';

describe('ZERO_COSTS', () => {
  it('has zero spread, commission and slippage (V-1 anchor value)', () => {
    expect(ZERO_COSTS.spreadPoints).toBe(0);
    expect(ZERO_COSTS.commissionPerLot).toBe(0);
    expect(ZERO_COSTS.slippagePoints).toBe(0);
  });

  it('value object shape: exactly the four documented fields', () => {
    expect(Object.keys(ZERO_COSTS).sort()).toEqual([
      'commissionPerLot',
      'pointSize',
      'slippagePoints',
      'spreadPoints',
    ]);
  });
});

describe('COST_PRESETS', () => {
  it('defines a full ExecutionCosts value object per asset class', () => {
    for (const cls of ['Forex', 'Índices', 'Metales', 'Cripto'] as const) {
      const preset = COST_PRESETS[cls];
      expect(preset.spreadPoints).toBeGreaterThan(0);
      expect(preset.pointSize).toBeGreaterThan(0);
      expect(preset.commissionPerLot).toBeGreaterThanOrEqual(0);
      expect(preset.slippagePoints).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('costPresetFor', () => {
  it('EURUSD (6-letter forex) → Forex preset, 5-digit pointSize', () => {
    const c = costPresetFor('EURUSD');
    expect(c).toEqual({ ...COST_PRESETS.Forex, pointSize: 0.00001 });
  });

  it('GBPJPY (6-letter forex, lowercase input) → Forex preset', () => {
    const c = costPresetFor('gbpjpy');
    expect(c.spreadPoints).toBe(COST_PRESETS.Forex.spreadPoints);
    expect(c.pointSize).toBe(0.00001);
  });

  it('XAUUSD → Metales preset with gold pointSize (0.01)', () => {
    const c = costPresetFor('XAUUSD');
    expect(c).toEqual({ ...COST_PRESETS.Metales, pointSize: 0.01 });
  });

  it('XAGUSD → Metales preset with silver pointSize (0.001), distinct from gold', () => {
    const c = costPresetFor('XAGUSD');
    expect(c.commissionPerLot).toBe(COST_PRESETS.Metales.commissionPerLot);
    expect(c.pointSize).toBe(0.001);
  });

  it('US30 / NAS100 / SP500 (index-shaped symbols) → Índices preset', () => {
    for (const sym of ['US30', 'NAS100', 'SP500']) {
      const c = costPresetFor(sym);
      expect(c).toEqual({ ...COST_PRESETS.Índices, pointSize: 1 });
    }
  });

  it('BTCUSD (crypto-prefixed) → Cripto preset', () => {
    const c = costPresetFor('BTCUSD');
    expect(c.spreadPoints).toBe(COST_PRESETS.Cripto.spreadPoints);
    expect(c.slippagePoints).toBe(COST_PRESETS.Cripto.slippagePoints);
  });

  it('an unrecognized symbol resolves to ZERO_COSTS, not a guessed class', () => {
    expect(costPresetFor('FOO')).toEqual(ZERO_COSTS);
  });

  it('empty symbol resolves to ZERO_COSTS', () => {
    expect(costPresetFor('')).toEqual(ZERO_COSTS);
  });
});

describe('pointsToPrice', () => {
  it('multiplies points by the resolved point size', () => {
    expect(pointsToPrice(10, 0.00001)).toBeCloseTo(0.0001, 10);
    expect(pointsToPrice(30, 0.01)).toBeCloseTo(0.3, 10);
    expect(pointsToPrice(0, 0.01)).toBe(0);
  });

  it('zero pointSize collapses to zero regardless of points (defensive)', () => {
    expect(pointsToPrice(100, 0)).toBe(0);
  });
});
