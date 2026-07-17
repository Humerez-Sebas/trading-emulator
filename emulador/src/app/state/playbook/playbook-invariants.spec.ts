import { describe, expect, it } from 'vitest';
import { toPayload, fromPayload } from '../../services/session-sync.mapping';
import { singlePanelLayoutFor } from '../../services/session-migration';
import type { PayloadInput } from '../../services/session-sync.models';
import { defaultTradingData, type ClosedTrade } from '../trading/trading.models';

// ---------------------------------------------------------------------------
// P-invariant coverage map (RFC-015)
// ---------------------------------------------------------------------------
// P-1: PASSIVE — pre-existing placement suite (trading.reducer.spec.ts,
//      fill-engine.spec.ts) passes green without declaredRuleId. Documented
//      in the task report.
// P-2: GREP — zero parsers/matchers over `statement`. Documented in report.
// P-3: COVERED by playbook-db.service.spec.ts ("playbook survives deletion
//      of the OTHER databases"). That test is broader than needed here.
// P-4: EXECUTABLE — payload round-trip below.
// P-5: GREP — zero forbidden vocabulary. Documented in report.
// P-6: COVERED by playbook-db.service.spec.ts ("rejects a candle-poisoned
//      payload", assertNoCandles reused).
// P-7: GREP — zero `.amendments` read sites. Documented in report.
// ---------------------------------------------------------------------------

function payloadInputWithHistory(history: ClosedTrade[]): PayloadInput {
  const trading = defaultTradingData(10000);
  trading.history = history;
  const { layout, panels } = singlePanelLayoutFor('EURUSD', 'H1');
  return {
    trading,
    currentTime: 1700050000,
    activeTf: 'H1',
    customTfMinutes: null,
    playbackSpeed: 1,
    drawings: {},
    notes: [],
    selectedTfs: ['H1'],
    startRange: 1699000000,
    endRange: 1700200000,
    requiredDatasets: [{ symbol: 'EURUSD', timeframe: 'H1' }],
    layout,
    panels,
    linkGroups: [],
  };
}

describe('P-4: declaredRuleId payload round-trip', () => {
  it('preserves declaredRuleId on ClosedTrade through toPayload → fromPayload', () => {
    const trade: ClosedTrade = {
      id: 't1',
      side: 'buy',
      origin: 'market',
      entryPrice: 1.1,
      exitPrice: 1.2,
      sl: 1.0,
      tp: 1.3,
      lots: 0.1,
      riskPct: 1,
      riskUsd: 100,
      openTime: 1700000000,
      closeTime: 1700003600,
      outcome: 'tp',
      profit: 10,
      rMultiple: 1,
      ambiguous: false,
      declaredRuleId: 'rule-1',
    };

    const input = payloadInputWithHistory([trade]);
    const payload = toPayload(input);
    const restored = fromPayload(payload, 'EURUSD');

    expect(restored.trading.history).toHaveLength(1);
    expect(restored.trading.history[0].declaredRuleId).toBe('rule-1');
  });

  it('preserves null declaredRuleId through the round-trip', () => {
    const trade: ClosedTrade = {
      id: 't2',
      side: 'sell',
      origin: 'limit',
      entryPrice: 1.2,
      exitPrice: 1.1,
      sl: 1.3,
      tp: null,
      lots: 0.05,
      riskPct: 1,
      riskUsd: 50,
      openTime: 1700000000,
      closeTime: 1700003600,
      outcome: 'manual',
      profit: 5,
      rMultiple: 0.5,
      ambiguous: false,
      declaredRuleId: null,
    };

    const input = payloadInputWithHistory([trade]);
    const restored = fromPayload(toPayload(input), 'EURUSD');
    expect(restored.trading.history[0].declaredRuleId).toBeNull();
  });

  it('preserves absent declaredRuleId (undefined) through the round-trip', () => {
    const trade: ClosedTrade = {
      id: 't3',
      side: 'buy',
      origin: 'market',
      entryPrice: 1.1,
      exitPrice: 1.05,
      sl: 1.0,
      tp: null,
      lots: 0.1,
      riskPct: 1,
      riskUsd: 100,
      openTime: 1700000000,
      closeTime: 1700003600,
      outcome: 'sl',
      profit: -5,
      rMultiple: -0.5,
      ambiguous: false,
    };

    const input = payloadInputWithHistory([trade]);
    const restored = fromPayload(toPayload(input), 'EURUSD');
    expect(restored.trading.history[0].declaredRuleId).toBeUndefined();
  });
});
