import type { ClosedTrade } from '../../state/trading/trading.models';
import type { TelemetryEvent } from '../../state/telemetry/telemetry.models';
import {
  initialRiskDistance,
  initialStopLoss,
  initialTakeProfit,
  stopLossAt,
  takeProfitAt,
} from './trade-geometry';

/**
 * RFC-016 MEDIUM-4: `ClosedTrade.sl/tp` are the values AT CLOSE (fill-engine
 * copies `p.sl`), so a managed trade must be reconstructed from its
 * `PositionModified` telemetry. `OrderModified` is a PENDING-order edit made
 * before the fill: the position already opened with its result, so it never
 * changes the SL/TP a live position had.
 */
const trade: ClosedTrade = {
  id: 'T',
  side: 'buy',
  origin: 'market',
  entryPrice: 1.1,
  exitPrice: 1.108,
  sl: 1.1, // breakeven AT CLOSE
  tp: 1.12,
  lots: 1,
  riskPct: 1,
  riskUsd: 100,
  openTime: 1000,
  closeTime: 5000,
  outcome: 'sl',
  profit: 80,
  rMultiple: 1.6,
  ambiguous: false,
  grossProfit: 80,
  commission: 0,
};

let seq = 0;
function posMod(
  field: 'sl' | 'tp',
  from: number | null,
  to: number | null,
  marketTime: number,
  ref = 'T',
): TelemetryEvent {
  return {
    seq: ++seq,
    wallClockMs: 0,
    marketTime,
    kind: 'PositionModified',
    payload: { positionRef: ref, field, from, to },
  };
}

describe('trade-geometry (initial vs at-that-moment SL/TP)', () => {
  it('no management events: initial and at-any-time geometry are the trade values', () => {
    expect(initialStopLoss(trade, [])).toBe(1.1);
    expect(initialTakeProfit(trade, [])).toBe(1.12);
    expect(stopLossAt(trade, [], 3000)).toBe(1.1);
    expect(takeProfitAt(trade, [], 3000)).toBe(1.12);
    expect(initialRiskDistance(trade, [])).toBeNull(); // degenerate: SL == entry, no risk to measure
  });

  it('breakeven scenario: initial SL is the FROM of the first sl move, not the final SL', () => {
    const events = [posMod('sl', 1.095, 1.1, 2000)];
    expect(initialStopLoss(trade, events)).toBe(1.095);
    expect(initialRiskDistance(trade, events)).toBeCloseTo(0.005, 10);
    expect(stopLossAt(trade, events, 1999)).toBe(1.095);
    expect(stopLossAt(trade, events, 2000)).toBe(1.1);
    expect(stopLossAt(trade, events, trade.closeTime)).toBe(trade.sl);
  });

  it('several SL moves: initial is the earliest FROM; at-t replays them in seq order', () => {
    const events = [
      posMod('sl', 1.09, 1.095, 2000),
      posMod('sl', 1.095, 1.098, 3000),
      posMod('sl', 1.098, 1.1, 4000),
    ];
    expect(initialStopLoss(trade, events)).toBe(1.09);
    expect(stopLossAt(trade, events, 1500)).toBe(1.09);
    expect(stopLossAt(trade, events, 2500)).toBe(1.095);
    expect(stopLossAt(trade, events, 3500)).toBe(1.098);
    expect(stopLossAt(trade, events, 4500)).toBe(1.1);
  });

  it('events given out of order are replayed by seq, not array order', () => {
    const a = posMod('sl', 1.09, 1.095, 2000);
    const b = posMod('sl', 1.095, 1.1, 3000);
    expect(initialStopLoss(trade, [b, a])).toBe(1.09);
    expect(stopLossAt(trade, [b, a], 4000)).toBe(1.1);
  });

  it('TP moves replay independently of SL moves (including clearing the TP)', () => {
    const events = [posMod('sl', 1.095, 1.1, 2000), posMod('tp', 1.15, 1.12, 2500)];
    expect(initialTakeProfit(trade, events)).toBe(1.15);
    expect(takeProfitAt(trade, events, 2100)).toBe(1.15);
    expect(takeProfitAt(trade, events, 2600)).toBe(1.12);
    const cleared = [posMod('tp', 1.15, null, 2500)];
    expect(takeProfitAt(trade, cleared, 3000)).toBeNull();
  });

  it('ignores other trades, pending-order edits and events with no market time', () => {
    const events: TelemetryEvent[] = [
      posMod('sl', 1.05, 1.06, 2000, 'OTHER'),
      {
        seq: ++seq,
        wallClockMs: 0,
        marketTime: 500,
        kind: 'OrderModified',
        payload: { orderRef: 'T', field: 'sl', from: 1.0, to: 1.095 },
      },
      { ...posMod('sl', 1.0, 1.01, 0), marketTime: null },
    ];
    expect(initialStopLoss(trade, events)).toBe(1.1);
    expect(stopLossAt(trade, events, 3000)).toBe(1.1);
  });

  it('no SL at entry (0 / non-finite): initialRiskDistance is null, never 0 or 1R', () => {
    expect(initialRiskDistance({ ...trade, sl: 0 }, [])).toBeNull();
    expect(initialRiskDistance({ ...trade, sl: Number.NaN }, [])).toBeNull();
    expect(initialRiskDistance(trade, [posMod('sl', 0, 1.1, 2000)])).toBeNull();
  });
});
