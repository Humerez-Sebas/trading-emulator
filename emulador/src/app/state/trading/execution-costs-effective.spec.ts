import { describe, expect, it } from 'vitest';
import { COST_PRESETS, effectiveCosts } from './execution-costs';

const NO_OVERRIDE = { spreadPoints: null, commissionPerLot: null, slippagePoints: null };

describe('effectiveCosts (RFC-014 G1: new-session preset + override)', () => {
  it('with no override, returns the preset unchanged', () => {
    const preset = COST_PRESETS.Forex;
    expect(effectiveCosts(preset, NO_OVERRIDE)).toEqual(preset);
  });

  it('a valid override on all three fields replaces the preset values, keeping pointSize', () => {
    const preset = COST_PRESETS.Índices;
    const result = effectiveCosts(preset, {
      spreadPoints: 5,
      commissionPerLot: 3.5,
      slippagePoints: 0,
    });
    expect(result).toEqual({
      spreadPoints: 5,
      commissionPerLot: 3.5,
      slippagePoints: 0,
      pointSize: preset.pointSize,
    });
  });

  it('a partial override only replaces the overridden field', () => {
    const preset = COST_PRESETS.Metales;
    const result = effectiveCosts(preset, { ...NO_OVERRIDE, spreadPoints: 12 });
    expect(result).toEqual({ ...preset, spreadPoints: 12 });
  });

  it('pointSize is never user-editable: always the preset value regardless of override', () => {
    const preset = COST_PRESETS.Cripto;
    const result = effectiveCosts(preset, { ...NO_OVERRIDE, spreadPoints: 1 });
    expect(result.pointSize).toBe(preset.pointSize);
  });

  it('a negative override falls back to the preset value (sensible constraint: >= 0)', () => {
    const preset = COST_PRESETS.Forex;
    const result = effectiveCosts(preset, { ...NO_OVERRIDE, commissionPerLot: -1 });
    expect(result.commissionPerLot).toBe(preset.commissionPerLot);
  });

  it('a non-finite override (NaN/Infinity) falls back to the preset value', () => {
    const preset = COST_PRESETS.Forex;
    expect(effectiveCosts(preset, { ...NO_OVERRIDE, spreadPoints: NaN }).spreadPoints).toBe(
      preset.spreadPoints,
    );
    expect(
      effectiveCosts(preset, { ...NO_OVERRIDE, slippagePoints: Infinity }).slippagePoints,
    ).toBe(preset.slippagePoints);
  });

  it('zero is a valid override (not confused with "no override")', () => {
    const preset = COST_PRESETS.Forex;
    const result = effectiveCosts(preset, { ...NO_OVERRIDE, commissionPerLot: 0 });
    expect(result.commissionPerLot).toBe(0);
  });
});
