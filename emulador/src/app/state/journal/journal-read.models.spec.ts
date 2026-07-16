import { describe, expect, it } from 'vitest';
import { closed } from '../../testing/fixtures';
import { computeSessionStats } from '../trading/fill-engine';
import type { ClosedTrade } from '../trading/trading.models';
import type { TelemetryEvent } from '../telemetry/telemetry.models';
import type { Lesson } from '../lessons/lessons.models';
import {
  buildBehaviorFacts,
  buildBubbles,
  buildHeatmapCells,
  buildRulePerformanceRows,
  buildScatterPoints,
  buildSessionStatsView,
  buildTimeOfDayRows,
  buildTradeRows,
  JournalRuleRef,
  JournalSessionModel,
} from './journal-read.models';

const INITIAL_BALANCE = 10000;

function rule(p: Partial<JournalRuleRef> = {}): JournalRuleRef {
  return { id: 'r1', title: 'Ruptura de rango', shortcutSlot: 1, sortOrder: 0, ...p };
}

function model(p: Partial<JournalSessionModel> = {}): JournalSessionModel {
  const trades = p.trades ?? [];
  return {
    sessionId: 's1',
    symbol: 'EURUSD',
    name: 'Sesión',
    initialBalance: INITIAL_BALANCE,
    balance: INITIAL_BALANCE,
    trades,
    stats: computeSessionStats(trades, INITIAL_BALANCE),
    telemetry: [],
    rules: [],
    lessonByTradeRef: {},
    datasetRefs: [],
    baseTfSeconds: 60,
    ...p,
  };
}

function telemetry(p: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return { seq: 0, wallClockMs: 0, marketTime: 0, kind: 'ReplayJump', payload: {}, ...p };
}

function lesson(p: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l1',
    authoredAt: 0,
    whatHappened: '',
    repeat: '',
    avoid: '',
    linkedRuleIds: [],
    evidence: [],
    tradeRefs: [],
    sessionRef: 's1',
    ...p,
  };
}

describe('journal-read.models — J-5 session isolation', () => {
  it('two independent session models produce independent, non-leaking outputs', () => {
    const sessionA = model({
      trades: [closed({ id: 'a1', rMultiple: 2, profit: 200, closeTime: 100 })],
    });
    const sessionB = model({
      trades: [
        closed({ id: 'b1', rMultiple: -1, profit: -100, closeTime: 50 }),
        closed({ id: 'b2', rMultiple: 3, profit: 300, closeTime: 150 }),
      ],
    });

    const statsA = buildSessionStatsView(sessionA);
    const statsB = buildSessionStatsView(sessionB);
    expect(statsA.tradesCount).toBe(1);
    expect(statsB.tradesCount).toBe(2);
    expect(statsA.totalR).toBe(2);
    expect(statsB.totalR).toBe(2); // -1 + 3, independent of A

    const rowsA = buildTradeRows(sessionA);
    const rowsB = buildTradeRows(sessionB);
    expect(rowsA.map((r) => r.tradeId)).toEqual(['a1']);
    expect(rowsB.map((r) => r.tradeId)).toEqual(['b1', 'b2']);
  });

  it('is deterministic: same input twice produces deep-equal output', () => {
    const m = model({
      trades: [closed({ id: 't1', declaredRuleId: 'r1' })],
      rules: [rule()],
    });
    expect(buildTradeRows(m)).toEqual(buildTradeRows(m));
    expect(buildRulePerformanceRows(m)).toEqual(buildRulePerformanceRows(m));
  });
});

describe('buildSessionStatsView', () => {
  it('carries stats straight from computeSessionStats + balance + excursion means + Σ commission', () => {
    const trades: ClosedTrade[] = [
      closed({
        id: 't1',
        profit: 200,
        rMultiple: 2,
        closeTime: 60,
        mae: 5,
        mfe: 20,
        entryPrice: 100,
        sl: 90,
        commission: 3,
      }),
      closed({
        id: 't2',
        profit: -100,
        rMultiple: -1,
        closeTime: 120,
        mae: 15,
        mfe: 2,
        entryPrice: 100,
        sl: 90,
        commission: 2,
      }),
    ];
    const m = model({ trades, balance: 10100 });
    const view = buildSessionStatsView(m);
    expect(view.balance).toBe(10100);
    expect(view.tradesCount).toBe(2);
    expect(view.totalR).toBe(1);
    expect(view.costsTotal).toBe(5);
    // meanMaeR = mean(5/10, 15/10) = mean(0.5, 1.5) = 1
    expect(view.maeRMean).toBe(1);
    // meanMfeR = mean(20/10, 2/10) = mean(2, 0.2) = 1.1
    expect(view.mfeRMean).toBeCloseTo(1.1, 10);
    expect(view.sharpe).toEqual(m.stats.sharpe);
    expect(view.profitFactor).toEqual(m.stats.profitFactor);
    expect(view.drawdownPct).toEqual(m.stats.maxDrawdownPct);
  });

  it('sharpe null with < 2 trades, matching computeSessionStats', () => {
    const m = model({ trades: [closed({ id: 't1' })] });
    expect(buildSessionStatsView(m).sharpe).toBeNull();
  });

  it('profitFactor is Infinity when there are no losses (no fake finite number)', () => {
    const m = model({ trades: [closed({ id: 't1', profit: 100, rMultiple: 1 })] });
    expect(buildSessionStatsView(m).profitFactor).toBe(Infinity);
  });

  it('costsTotal treats a legacy-absent commission as 0', () => {
    const t = closed({ id: 't1' });
    delete (t as { commission?: number }).commission;
    const m = model({ trades: [t] });
    expect(buildSessionStatsView(m).costsTotal).toBe(0);
  });
});

describe('buildScatterPoints', () => {
  it('one point per trade with both maeR and mfeR resolvable', () => {
    const m = model({
      trades: [
        closed({ id: 't1', entryPrice: 100, sl: 90, mae: 5, mfe: 20, closeTime: 60 }),
        closed({ id: 't2', entryPrice: 100, sl: 90, mae: 15, mfe: 2, closeTime: 30 }),
      ],
    });
    const points = buildScatterPoints(m);
    expect(points).toHaveLength(2);
    // seq is by closeTime ascending: t2 (30) is seq 1, t1 (60) is seq 2
    expect(points.map((p) => p.tradeId)).toEqual(['t2', 't1']);
    expect(points[0].seq).toBe(1);
    expect(points[1].seq).toBe(2);
    expect(points[1].maeR).toBeCloseTo(0.5, 10);
    expect(points[1].mfeR).toBeCloseTo(2, 10);
  });

  it('skips a trade with null MAE_R or MFE_R (legacy-absent mae/mfe) — documented, no fabricated zero', () => {
    const withoutExcursion = closed({ id: 't1', entryPrice: 100, sl: 90 });
    delete (withoutExcursion as { mae?: number }).mae;
    delete (withoutExcursion as { mfe?: number }).mfe;
    const withExcursion = closed({ id: 't2', entryPrice: 100, sl: 90, mae: 5, mfe: 5, closeTime: 200 });
    const m = model({ trades: [withoutExcursion, withExcursion] });
    const points = buildScatterPoints(m);
    expect(points.map((p) => p.tradeId)).toEqual(['t2']);
  });

  it('undeclared trade gets the muted color token and empty rule title', () => {
    const m = model({ trades: [closed({ id: 't1', mae: 1, mfe: 1, entryPrice: 100, sl: 90 })] });
    const [point] = buildScatterPoints(m);
    expect(point.ruleTitle).toBe('');
    expect(point.colorToken).toBe('var(--text-muted)');
  });

  it('declared trade under a slotted rule gets its --rule-{slot} token and title', () => {
    const m = model({
      trades: [
        closed({ id: 't1', declaredRuleId: 'r1', mae: 1, mfe: 1, entryPrice: 100, sl: 90 }),
      ],
      rules: [rule({ id: 'r1', title: 'Ruptura', shortcutSlot: 4 })],
    });
    const [point] = buildScatterPoints(m);
    expect(point.ruleTitle).toBe('Ruptura');
    expect(point.colorToken).toBe('var(--rule-4)');
  });

  it('a slotless active rule gets a deterministic sortOrder-based palette index', () => {
    const m = model({
      trades: [closed({ id: 't1', declaredRuleId: 'r1', mae: 1, mfe: 1, entryPrice: 100, sl: 90 })],
      rules: [rule({ id: 'r1', shortcutSlot: null, sortOrder: 11 })],
    });
    // 11 % 9 = 2, +1 = 3
    expect(buildScatterPoints(m)[0].colorToken).toBe('var(--rule-3)');
  });
});

describe('buildBubbles', () => {
  it('duration is in base (M1) candles and every trade gets a bubble (0 events is legitimate)', () => {
    const m = model({
      trades: [closed({ id: 't1', openTime: 0, closeTime: 600 })],
      baseTfSeconds: 60,
    });
    const [bubble] = buildBubbles(m);
    expect(bubble.durationBaseCandles).toBe(10);
    expect(bubble.managementEventCount).toBe(0);
  });

  it('counts OrderModified/PositionModified events referencing the trade within [openTime, closeTime]', () => {
    const trade = closed({ id: 't1', openTime: 100, closeTime: 200 });
    const events: TelemetryEvent[] = [
      telemetry({
        kind: 'OrderModified',
        marketTime: 150,
        payload: { orderRef: 't1', field: 'sl', from: 1, to: 2 },
      }),
      telemetry({
        kind: 'PositionModified',
        marketTime: 180,
        payload: { positionRef: 't1', field: 'tp', from: 1, to: 2 },
      }),
      // out of window: not counted
      telemetry({
        kind: 'OrderModified',
        marketTime: 300,
        payload: { orderRef: 't1', field: 'sl', from: 1, to: 2 },
      }),
      // different trade: not counted
      telemetry({
        kind: 'OrderModified',
        marketTime: 150,
        payload: { orderRef: 'other', field: 'sl', from: 1, to: 2 },
      }),
      // wrong kind: not counted
      telemetry({ kind: 'ReplayJump', marketTime: 150, payload: {} }),
    ];
    const m = model({ trades: [trade], telemetry: events });
    expect(buildBubbles(m)[0].managementEventCount).toBe(2);
  });
});

describe('buildHeatmapCells', () => {
  it('one cell per trade, carrying only seq + rMultiple, in chronological order', () => {
    const m = model({
      trades: [
        closed({ id: 't2', closeTime: 200, rMultiple: -1 }),
        closed({ id: 't1', closeTime: 100, rMultiple: 2 }),
      ],
    });
    expect(buildHeatmapCells(m)).toEqual([
      { tradeId: 't1', seq: 1, rMultiple: 2 },
      { tradeId: 't2', seq: 2, rMultiple: -1 },
    ]);
  });
});

describe('buildRulePerformanceRows', () => {
  it('one row per rule with >=1 declared trade, in rules order, + a final Sin declarar row', () => {
    const m = model({
      trades: [
        closed({ id: 't1', declaredRuleId: 'r2', profit: 100, rMultiple: 1 }),
        closed({ id: 't2', declaredRuleId: 'r1', profit: -50, rMultiple: -0.5 }),
        closed({ id: 't3', profit: 20, rMultiple: 0.2 }), // undeclared
      ],
      rules: [rule({ id: 'r1', title: 'A', sortOrder: 0 }), rule({ id: 'r2', title: 'B', sortOrder: 1 })],
    });
    const rows = buildRulePerformanceRows(m);
    expect(rows.map((r) => r.title)).toEqual(['A', 'B', 'Sin declarar']);
    expect(rows.map((r) => r.ruleId)).toEqual(['r1', 'r2', null]);
    expect(rows[0].trades).toBe(1);
    expect(rows[0].totalR).toBeCloseTo(-0.5, 10);
  });

  it('rule-without-trades: a rule with zero declared trades this session gets no row', () => {
    const m = model({
      trades: [closed({ id: 't1', declaredRuleId: 'r1' })],
      rules: [rule({ id: 'r1' }), rule({ id: 'r2', title: 'Unused' })],
    });
    const rows = buildRulePerformanceRows(m);
    expect(rows.some((r) => r.ruleId === 'r2')).toBe(false);
  });

  it('no Sin declarar row when every trade is declared (undeclared bucket is >=1-trade-gated too)', () => {
    const m = model({
      trades: [closed({ id: 't1', declaredRuleId: 'r1' })],
      rules: [rule({ id: 'r1' })],
    });
    expect(buildRulePerformanceRows(m).some((r) => r.ruleId === null)).toBe(false);
  });

  it('a declaredRuleId unresolvable against model.rules still gets a defensive row titled with the raw id', () => {
    const m = model({ trades: [closed({ id: 't1', declaredRuleId: 'ghost' })], rules: [] });
    const rows = buildRulePerformanceRows(m);
    expect(rows).toEqual([
      { ruleId: 'ghost', title: 'ghost', colorToken: 'var(--text-muted)', trades: 1, winRate: expect.any(Number), totalR: expect.any(Number) },
    ]);
  });
});

describe('buildTimeOfDayRows', () => {
  it('buckets by UTC hour of openTime, only non-empty buckets, sorted ascending', () => {
    const m = model({
      trades: [
        closed({ id: 't1', openTime: 3600 * 14 + 10 }), // 14:xx UTC
        closed({ id: 't2', openTime: 3600 * 9 + 5 }), // 09:xx UTC
        closed({ id: 't3', openTime: 3600 * 14 + 500 }), // 14:xx UTC
      ],
    });
    const rows = buildTimeOfDayRows(m);
    expect(rows.map((r) => r.hourUtc)).toEqual([9, 14]);
    expect(rows.find((r) => r.hourUtc === 14)!.trades).toBe(2);
  });
});

describe('buildTradeRows', () => {
  it('side C/V mirrors the chart label convention (buy=C, sell=V)', () => {
    const m = model({
      trades: [closed({ id: 't1', side: 'buy' }), closed({ id: 't2', side: 'sell', closeTime: 200 })],
    });
    const rows = buildTradeRows(m);
    expect(rows.find((r) => r.tradeId === 't1')!.side).toBe('C');
    expect(rows.find((r) => r.tradeId === 't2')!.side).toBe('V');
  });

  it('ruleBadge is R{slot} for a slotted declared rule, the title for a slotless one, empty for undeclared', () => {
    const m = model({
      trades: [
        closed({ id: 't1', declaredRuleId: 'r1', closeTime: 10 }),
        closed({ id: 't2', declaredRuleId: 'r2', closeTime: 20 }),
        closed({ id: 't3', closeTime: 30 }),
      ],
      rules: [
        rule({ id: 'r1', shortcutSlot: 3, title: 'Slotted' }),
        rule({ id: 'r2', shortcutSlot: null, title: 'Slotless title' }),
      ],
    });
    const rows = buildTradeRows(m);
    expect(rows.find((r) => r.tradeId === 't1')!.ruleBadge).toBe('R3');
    expect(rows.find((r) => r.tradeId === 't2')!.ruleBadge).toBe('Slotless title');
    expect(rows.find((r) => r.tradeId === 't3')!.ruleBadge).toBe('');
  });

  it('hasReflection is true iff the trade id is a key of lessonByTradeRef', () => {
    const m = model({
      trades: [closed({ id: 't1' }), closed({ id: 't2', closeTime: 200 })],
      lessonByTradeRef: { t1: lesson({ tradeRefs: ['t1'] }) },
    });
    const rows = buildTradeRows(m);
    expect(rows.find((r) => r.tradeId === 't1')!.hasReflection).toBe(true);
    expect(rows.find((r) => r.tradeId === 't2')!.hasReflection).toBe(false);
  });

  it('renders from a single trade (no minimum, unlike visualizations)', () => {
    const m = model({ trades: [closed({ id: 'only' })] });
    expect(buildTradeRows(m)).toHaveLength(1);
  });

  it('maeR/mfeR are null when legacy-absent, matching excursionR', () => {
    const t = closed({ id: 't1' });
    delete (t as { mae?: number }).mae;
    const m = model({ trades: [t] });
    const [row] = buildTradeRows(m);
    expect(row.maeR).toBeNull();
  });
});

describe('buildBehaviorFacts', () => {
  it('counts ReplayJump events and PlaybackToggled(playing:false) events; ignores everything else', () => {
    const events: TelemetryEvent[] = [
      telemetry({ kind: 'ReplayJump' }),
      telemetry({ kind: 'ReplayJump' }),
      telemetry({ kind: 'PlaybackToggled', payload: { playing: false } }),
      telemetry({ kind: 'PlaybackToggled', payload: { playing: true } }), // resume: not a pause
      telemetry({ kind: 'SpeedChanged', payload: { msPerCandle: 10 } }),
    ];
    const m = model({ telemetry: events });
    expect(buildBehaviorFacts(m)).toEqual({ replayJumps: 2, pauses: 1 });
  });

  it('numbers only: empty telemetry yields zero counts, not an absent/undefined shape', () => {
    expect(buildBehaviorFacts(model())).toEqual({ replayJumps: 0, pauses: 0 });
  });
});
