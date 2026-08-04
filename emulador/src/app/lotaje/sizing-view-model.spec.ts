import { describe, expect, it } from 'vitest';
import {
  contractSizeFor,
  lotsForRisk,
  lotsForRiskDistance,
  riskUsdFor,
} from '../domain/sizing/position-sizing';
import {
  INITIAL_STATE,
  MSG_NON_POSITIVE,
  MSG_SL_EQUALS_ENTRY,
  deriveLots,
  switchMethod,
  type LotajeState,
} from './sizing-view-model';

function state(overrides: Partial<LotajeState> = {}): LotajeState {
  return { ...INITIAL_STATE, ...overrides };
}

describe('deriveLots — cold start (P2)', () => {
  it('starts at 10 000 / 1% / no symbol / Method B / blank stop', () => {
    expect(INITIAL_STATE.balanceText).toBe('10000');
    expect(INITIAL_STATE.riskPctText).toBe('1');
    expect(INITIAL_STATE.symbolText).toBe('');
    expect(INITIAL_STATE.method).toBe('distance');
    expect(INITIAL_STATE.distanceText).toBe('');
  });

  it('a blank stop is an honest state (non-positive), never a fabricated lot figure', () => {
    const d = deriveLots(INITIAL_STATE);
    expect(d.invalidReason).toBe(MSG_NON_POSITIVE);
    expect(d.lots).toBe(0);
  });
});

describe('deriveLots — Method B (distance), the default', () => {
  it('acceptance case: 5000 / 1% / US30 / distance 50 -> 1.00 lots, $50 requested, $50 actual', () => {
    const d = deriveLots(
      state({ balanceText: '5000', riskPctText: '1', symbolText: 'US30', distanceText: '50' }),
    );
    expect(d.invalidReason).toBeNull();
    expect(d.lots).toBe(1);
    expect(d.requestedRiskUsd).toBe(50);
    expect(d.actualRiskUsd).toBe(50);
    expect(d.unitLabel).toBe('pts');
    expect(d.minLotWarning).toBeNull();
  });

  it('parity: lots equals lotsForRiskDistance(...) called directly, never a hand-derived figure', () => {
    const d = deriveLots(
      state({ balanceText: '100', riskPctText: '0.1', symbolText: 'US30', distanceText: '50' }),
    );
    const expected = lotsForRiskDistance(
      riskUsdFor(100, 0.1),
      50,
      contractSizeFor('US30'),
    );
    expect(d.lots).toBe(expected);
  });

  it('distance 0 is the SL-equals-entry honest state', () => {
    const d = deriveLots(
      state({ balanceText: '5000', riskPctText: '1', symbolText: 'US30', distanceText: '0' }),
    );
    expect(d.invalidReason).toBe(MSG_SL_EQUALS_ENTRY);
  });

  it('a negative distance is the non-positive honest state, not a fabricated abs()', () => {
    const d = deriveLots(
      state({ balanceText: '5000', riskPctText: '1', symbolText: 'US30', distanceText: '-5' }),
    );
    expect(d.invalidReason).toBe(MSG_NON_POSITIVE);
  });

  it('non-positive balance is the non-positive honest state', () => {
    const d = deriveLots(
      state({ balanceText: '0', riskPctText: '1', symbolText: 'US30', distanceText: '50' }),
    );
    expect(d.invalidReason).toBe(MSG_NON_POSITIVE);
  });

  it('non-positive riskPct is the non-positive honest state', () => {
    const d = deriveLots(
      state({ balanceText: '5000', riskPctText: '0', symbolText: 'US30', distanceText: '50' }),
    );
    expect(d.invalidReason).toBe(MSG_NON_POSITIVE);
  });

  it('a negative balance times a negative riskPct never produces a real lot figure (money-bug guard)', () => {
    // riskUsdFor(-5000, -1) = 50, a POSITIVE number — lotsForRiskDistance has
    // no balance/riskPct guard of its own, so deriveLots must supply one.
    const d = deriveLots(
      state({ balanceText: '-5000', riskPctText: '-1', symbolText: 'US30', distanceText: '50' }),
    );
    expect(d.invalidReason).toBe(MSG_NON_POSITIVE);
    expect(d.lots).toBe(0);
  });

  it('the minimum-lot floor warning names both figures and the correct cause/direction', () => {
    const d = deriveLots(
      state({ balanceText: '100', riskPctText: '0.1', symbolText: 'US30', distanceText: '50' }),
    );
    expect(d.lots).toBe(0.01);
    expect(d.minLotWarning).toBe(
      'El mínimo de 0.01 lotes arriesga $0.50, por encima de los $0.10 solicitados.',
    );
  });

  it('plain rounding (not the floor) warns with the correct "below" direction', () => {
    const d = deriveLots(
      state({ balanceText: '5000', riskPctText: '1', symbolText: 'EURUSD', distanceText: '0.006' }),
    );
    expect(d.minLotWarning).toBe(
      'El redondeo al paso de 0.01 lotes arriesga $48.00, por debajo de los $50.00 solicitados.',
    );
  });
});

describe('deriveLots — Method A (prices)', () => {
  const prices = (overrides: Partial<LotajeState> = {}) =>
    state({ method: 'prices', ...overrides });

  it('parity: lots equals lotsForRisk(...) called directly, never a hand-derived figure', () => {
    const d = deriveLots(
      prices({ balanceText: '5000', riskPctText: '1', symbolText: 'US30', entryText: '40000', slText: '39950' }),
    );
    const expected = lotsForRisk(5000, 1, 40000, 39950, contractSizeFor('US30'));
    expect(d.lots).toBe(expected);
    expect(d.lots).toBe(1);
  });

  it('entry equal to SL is the SL-equals-entry honest state', () => {
    const d = deriveLots(
      prices({ balanceText: '5000', riskPctText: '1', symbolText: 'US30', entryText: '40000', slText: '40000' }),
    );
    expect(d.invalidReason).toBe(MSG_SL_EQUALS_ENTRY);
  });

  it('a cleared entry is the non-positive honest state, never a 0.00 figure', () => {
    const d = deriveLots(
      prices({ balanceText: '5000', riskPctText: '1', symbolText: 'US30', entryText: '', slText: '39950' }),
    );
    expect(d.invalidReason).toBe(MSG_NON_POSITIVE);
  });

  it('a cleared SL is the non-positive honest state, never a 0.00 figure', () => {
    const d = deriveLots(
      prices({ balanceText: '5000', riskPctText: '1', symbolText: 'US30', entryText: '40000', slText: '' }),
    );
    expect(d.invalidReason).toBe(MSG_NON_POSITIVE);
  });

  it('a finite negative SL still parses to a real lot figure (L6 no-fix)', () => {
    const d = deriveLots(
      prices({ balanceText: '5000', riskPctText: '1', symbolText: 'US30', entryText: '1.1', slText: '-1' }),
    );
    expect(d.invalidReason).toBeNull();
    expect(d.lots).toBeGreaterThan(0);
  });

  it('comma-typed prices parse identically to dot-typed prices (F3)', () => {
    const comma = deriveLots(
      prices({ balanceText: '5000', riskPctText: '1', symbolText: 'XAUUSD', entryText: '2650,50', slText: '2648,00' }),
    );
    const dot = deriveLots(
      prices({ balanceText: '5000', riskPctText: '1', symbolText: 'XAUUSD', entryText: '2650.50', slText: '2648.00' }),
    );
    expect(comma.lots).toBe(dot.lots);
    expect(comma.lots).toBe(0.2);
  });
});

describe('symbol resolution / heuristic marker', () => {
  it('a curated symbol is not marked heuristic', () => {
    const d = deriveLots(state({ symbolText: 'US30' }));
    expect(d.isHeuristic).toBe(false);
  });

  it('an unrecognised symbol falls to the heuristic and IS marked', () => {
    const d = deriveLots(state({ symbolText: 'GBPJPY' }));
    expect(d.isHeuristic).toBe(true);
    expect(d.contractSize).toBe(100000);
    expect(d.pipSize).toBe(0.01); // JPY pair
    expect(d.unitLabel).toBe('pips');
  });

  it('a blank symbol resolves through the heuristic but is NOT marked (there is nothing to mark)', () => {
    const d = deriveLots(state({ symbolText: '' }));
    expect(d.isHeuristic).toBe(false);
    expect(d.contractSize).toBe(1);
  });
});

describe('switchMethod — P4, converts, never resets', () => {
  it('distance -> prices keeps the memorized entry and recomputes SL from entry - distance', () => {
    const s = state({ method: 'distance', entryText: '40000', distanceText: '50' });
    const converted = switchMethod(s);
    expect(converted.method).toBe('prices');
    expect(converted.entryText).toBe('40000'); // untouched
    expect(converted.slText).toBe('39950');
  });

  it('prices -> distance preserves the computed distance', () => {
    const s = state({ method: 'prices', entryText: '40000', slText: '39950' });
    const converted = switchMethod(s);
    expect(converted.method).toBe('distance');
    expect(converted.distanceText).toBe('50');
  });

  it('round-trip distance -> prices -> distance restores the original distance', () => {
    const s = state({ method: 'distance', entryText: '1.1', distanceText: '0.006' });
    const back = switchMethod(switchMethod(s));
    expect(back.method).toBe('distance');
    expect(Number(back.distanceText)).toBeCloseTo(0.006, 8);
  });

  it('switching with nothing typed yet (cold start) loses nothing — fields stay blank, not clobbered', () => {
    const converted = switchMethod(INITIAL_STATE);
    expect(converted.method).toBe('prices');
    expect(converted.entryText).toBe('');
    expect(converted.slText).toBe(''); // cannot derive; left as-is, not forced to "NaN" text
  });

  it('switching to prices with an invalid distance leaves SL unchanged rather than clobbering it', () => {
    const s = state({ method: 'distance', entryText: '100', distanceText: 'abc', slText: '77' });
    const converted = switchMethod(s);
    expect(converted.slText).toBe('77');
  });

  it('switching to distance with an invalid entry/SL leaves distance unchanged rather than clobbering it', () => {
    const s = state({ method: 'prices', entryText: 'abc', slText: '39950', distanceText: '12' });
    const converted = switchMethod(s);
    expect(converted.distanceText).toBe('12');
  });
});
