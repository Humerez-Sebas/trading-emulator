import { describe, expect, it } from 'vitest';
import { closed } from '../../testing/fixtures';
import type { TelemetryEvent } from '../telemetry/telemetry.models';
import {
  buildScatterPoints,
  buildSessionStatsView,
  buildTradeRows,
  type JournalSessionModel,
} from './journal-read.models';

/** RFC-016 MEDIUM-4: long 1.1000, SL 1.0950, breakeven, closed 1.1080. */
const trade = closed({
  id: 'T',
  entryPrice: 1.1,
  exitPrice: 1.108,
  sl: 1.1, // SL AT CLOSE (breakeven)
  tp: 1.12,
  openTime: 10_000,
  closeTime: 20_000,
  mae: 0.002,
  mfe: 0.009,
  rMultiple: 1.6,
});

const breakeven: TelemetryEvent = {
  seq: 1,
  wallClockMs: 0,
  marketTime: 13_000,
  kind: 'PositionModified',
  payload: { positionRef: 'T', field: 'sl', from: 1.095, to: 1.1 },
};

function model(trades = [trade], telemetry: TelemetryEvent[] = [breakeven]): JournalSessionModel {
  return {
    sessionId: 's',
    symbol: 'EURUSD',
    name: 'n',
    initialBalance: 10000,
    balance: 10000,
    trades,
    stats: { maxDrawdownPct: 0, sharpe: 0, totalTrades: trades.length } as never,
    telemetry,
    rules: [],
    lessonByTradeRef: {},
    datasetRefs: [],
    baseTfSeconds: 60,
  };
}

describe('journal MAE/MFE in R use the INITIAL SL (MEDIUM-4)', () => {
  it('the managed trade stays on the scatter with R of the initial risk', () => {
    const pts = buildScatterPoints(model());
    expect(pts).toHaveLength(1);
    expect(pts[0].maeR).toBeCloseTo(0.4, 10);
    expect(pts[0].mfeR).toBeCloseTo(1.8, 10);
  });

  it('trade rows carry MAE/MFE R of the initial risk', () => {
    const [row] = buildTradeRows(model());
    expect(row.maeR).toBeCloseTo(0.4, 10);
    expect(row.mfeR).toBeCloseTo(1.8, 10);
  });

  it('session mean MAE/MFE R use the initial risk', () => {
    const v = buildSessionStatsView(model());
    expect(v.maeRMean).toBeCloseTo(0.4, 10);
    expect(v.mfeRMean).toBeCloseTo(1.8, 10);
  });

  it('with no management events the trade SL is the initial SL (unchanged behaviour)', () => {
    const plain = closed({ id: 'P', entryPrice: 100, sl: 90, mae: 5, mfe: 20 });
    const [pt] = buildScatterPoints(model([plain], []));
    expect(pt.maeR).toBeCloseTo(0.5, 10);
    expect(pt.mfeR).toBeCloseTo(2, 10);
  });

  it('a trade with no SL at entry is skipped on the scatter (no fabricated point)', () => {
    const noSl = closed({ id: 'N', sl: 0, mae: 1, mfe: 1 });
    expect(buildScatterPoints(model([noSl], []))).toEqual([]);
    expect(buildTradeRows(model([noSl], []))[0].maeR).toBeNull();
  });
});
