import { describe, expect, it } from 'vitest';
import { Candle } from '../../models';
import { closeSession, closeTrade, processCandle, TradingBook } from './fill-engine';
import { Position } from './trading.models';
import { ExecutionCosts } from './execution-costs';

// ---- RFC-014 Task 3: mark-to-market, MAE/MFE excursions, floating equity ----
// `fill-engine.spec.ts`/`fill-engine.sided.spec.ts` (Tasks 1-2, pre-existing,
// STOP rule) are the V-1/V-2 anchors: they run unmodified with the mae/mfe
// fields simply appearing alongside identical outcomes. This file walks
// scripted candle sequences DIRECTLY through `processCandle` (the same "fold"
// idiom as `fill-engine.base-loop.spec.ts`) to characterize excursion
// accumulation across a whole trade's life.

const CONTRACT = 1; // 1 price unit == $1/lot, keeps arithmetic simple

const SPREAD: ExecutionCosts = {
  spreadPoints: 2,
  commissionPerLot: 0,
  slippagePoints: 0,
  pointSize: 1,
};

function candle(time: number, open: number, high: number, low: number, close: number): Candle {
  return { time, open, high, low, close };
}

function book(partial: Partial<TradingBook>): TradingBook {
  return { balance: 10000, orders: [], positions: [], history: [], ...partial };
}

function longPosition(partial: Partial<Position> = {}): Position {
  return {
    id: 'p1',
    side: 'buy',
    entryPrice: 100,
    sl: 90,
    tp: null,
    lots: 1,
    riskPct: 1,
    riskUsd: 10,
    openTime: 0,
    origin: 'market',
    ...partial,
  };
}

function shortPosition(partial: Partial<Position> = {}): Position {
  return {
    id: 'p1',
    side: 'sell',
    entryPrice: 100,
    sl: 110,
    tp: null,
    lots: 1,
    riskPct: 1,
    riskUsd: 10,
    openTime: 0,
    origin: 'market',
    ...partial,
  };
}

/** Folds `candles` through `processCandle`, threading the returned book forward. */
function fold(initial: TradingBook, candles: Candle[], costs?: ExecutionCosts): TradingBook {
  let b = initial;
  for (const c of candles) {
    b = processCandle(b, c, null, CONTRACT, costs).book;
  }
  return b;
}

// ============ hand-computed walks (RFC §3 formulas, verbatim) ============

describe('long excursion walk — adverso = max(0, E-low), favorable = max(0, high-E)', () => {
  it('accumulates the running max across candles, first-to-reach wins the timestamp', () => {
    const p = longPosition({ entryPrice: 100, sl: 90, tp: 120 });
    const win = [
      candle(60, 100, 105, 97, 100), // adverse=3, favorable=5 → mae=3@60, mfe=5@60
      candle(120, 100, 103, 95, 100), // adverse=5(>3, new max)@120, favorable=3(no move)
      candle(180, 100, 110, 99, 100), // adverse=1(no move), favorable=10(>5, new max)@180
      candle(240, 100, 110, 95, 100), // adverse=5(EQUAL to mae, strict > → no move), favorable=10(EQUAL → no move)
    ];
    const result = fold(book({ positions: [p] }), win);
    expect(result.positions).toHaveLength(1); // never hit SL(90)/TP(120)
    const pos = result.positions[0];
    expect(pos.mae).toBeCloseTo(5);
    expect(pos.tMae).toBe(120); // set by candle 2, NOT re-stamped by the equal candle 4
    expect(pos.mfe).toBeCloseTo(10);
    expect(pos.tMfe).toBe(180); // set by candle 3, NOT re-stamped by the equal candle 4
  });
});

describe('short excursion walk with spread — adverso = max(0, high+s-E), favorable = max(0, E-low-s)', () => {
  it('accumulates the running max using the Ask-derived extremes', () => {
    const p = shortPosition({ entryPrice: 100, sl: 110, tp: 80 });
    const win = [
      candle(60, 100, 103, 97, 100), // adverse=max(0,103+2-100)=5, favorable=max(0,100-97-2)=1
      candle(120, 100, 101, 90, 100), // adverse=max(0,101+2-100)=3(no move), favorable=max(0,100-90-2)=8(>1, new max)
    ];
    const result = fold(book({ positions: [p] }), win, SPREAD);
    expect(result.positions).toHaveLength(1); // never hit SL(110)/TP(80) under the sided predicates
    const pos = result.positions[0];
    expect(pos.mae).toBeCloseTo(5);
    expect(pos.tMae).toBe(60);
    expect(pos.mfe).toBeCloseTo(8);
    expect(pos.tMfe).toBe(120);
  });

  it('zero/absent costs degrade the short formulas to the unsided (s=0) case', () => {
    const p = shortPosition({ entryPrice: 100, sl: 110, tp: 80 });
    const win = [candle(60, 100, 103, 97, 100)]; // adverse=max(0,103-100)=3, favorable=max(0,100-97)=3
    const result = fold(book({ positions: [p] }), win); // no costs argument
    const pos = result.positions[0];
    expect(pos.mae).toBeCloseTo(3);
    expect(pos.mfe).toBeCloseTo(3);
  });
});

describe('freshly filled positions accumulate from their fill candle (inclusive)', () => {
  it('a buy limit fill folds the fill candle into mae/mfe on the same processCandle call', () => {
    const order = {
      id: 'o1',
      side: 'buy' as const,
      type: 'limit' as const,
      entryPrice: 100,
      sl: 90,
      tp: 120,
      lots: 1,
      riskPct: 1,
      riskUsd: 10,
      createdAt: 0,
    };
    // fill candle itself dips to 96 and pokes up to 104 before closing at 100
    const result = processCandle(
      book({ orders: [order] }),
      candle(60, 100, 104, 96, 100),
      null,
      CONTRACT,
    );
    expect(result.book.positions).toHaveLength(1);
    const pos = result.book.positions[0];
    expect(pos.openTime).toBe(60);
    expect(pos.mae).toBeCloseTo(4); // max(0, 100-96)
    expect(pos.tMae).toBe(60);
    expect(pos.mfe).toBeCloseTo(4); // max(0, 104-100)
    expect(pos.tMfe).toBe(60);
  });
});

// ============ V-11: outcome === 'sl' ⇒ mae >= |entry - sl| ============
// ============ V-11: outcome === 'tp' ⇒ mfe >= |tp - entry| ============

describe('V-11 — excursion floors hold for every SL/TP exit in a scripted grid', () => {
  interface Scenario {
    name: string;
    initial: TradingBook;
    walk: Candle[];
    costs?: ExecutionCosts;
  }

  function scenarios(): Scenario[] {
    return [
      {
        name: 'long SL, multi-candle walk before the exit candle',
        initial: book({ positions: [longPosition({ entryPrice: 100, sl: 95, tp: null })] }),
        walk: [
          candle(60, 100, 102, 98, 100),
          candle(120, 100, 101, 94, 100), // low=94 <= sl(95) → SL exit here
        ],
      },
      {
        name: 'long TP, multi-candle walk before the exit candle',
        initial: book({ positions: [longPosition({ entryPrice: 100, sl: 80, tp: 110 })] }),
        walk: [
          candle(60, 100, 103, 99, 100),
          candle(120, 100, 112, 99, 100), // high=112 >= tp(110) → TP exit here
        ],
      },
      {
        name: 'short SL with spread, multi-candle walk before the exit candle',
        initial: book({ positions: [shortPosition({ entryPrice: 100, sl: 105, tp: null })] }),
        walk: [
          candle(60, 100, 98, 96, 100),
          candle(120, 100, 104, 96, 100), // toAsk(104)=106 >= sl(105) → SL exit here
        ],
        costs: SPREAD,
      },
      {
        name: 'short TP with spread, multi-candle walk before the exit candle',
        initial: book({ positions: [shortPosition({ entryPrice: 100, sl: 130, tp: 90 })] }),
        walk: [
          candle(60, 100, 103, 96, 100),
          candle(120, 100, 103, 87, 100), // toAsk(87)=89 <= tp(90) → TP exit here
        ],
        costs: SPREAD,
      },
      {
        name: 'SL+TP inside the same candle → pessimistic SL, ambiguous',
        initial: book({ positions: [longPosition({ entryPrice: 100, sl: 95, tp: 110 })] }),
        walk: [candle(60, 100, 112, 93, 105)],
      },
    ];
  }

  it('every SL exit satisfies mae >= |entry - sl|, every TP exit satisfies mfe >= |tp - entry|', () => {
    let checkedSl = 0;
    let checkedTp = 0;
    for (const { initial, walk, costs } of scenarios()) {
      const result = fold(initial, walk, costs);
      expect(result.history).toHaveLength(1);
      const trade = result.history[0];
      if (trade.outcome === 'sl') {
        expect(trade.mae).toBeGreaterThanOrEqual(Math.abs(trade.entryPrice - trade.sl));
        checkedSl++;
      } else if (trade.outcome === 'tp') {
        expect(trade.tp).not.toBeNull();
        expect(trade.mfe).toBeGreaterThanOrEqual(Math.abs(trade.tp! - trade.entryPrice));
        checkedTp++;
      }
    }
    expect(checkedSl).toBeGreaterThan(0);
    expect(checkedTp).toBeGreaterThan(0);
  });

  it('an ambiguous same-candle SL+TP close still seals coherent, non-negative excursions', () => {
    const result = fold(
      book({ positions: [longPosition({ entryPrice: 100, sl: 95, tp: 110 })] }),
      [candle(60, 100, 112, 93, 105)],
    );
    const trade = result.history[0];
    expect(trade.ambiguous).toBe(true);
    expect(trade.outcome).toBe('sl');
    expect(trade.mae).toBeCloseTo(7); // max(0, 100-93)
    expect(trade.mfe).toBeCloseTo(12); // max(0, 112-100), still recorded even though SL "won" pessimistically
    expect(trade.tMae).toBe(60);
    expect(trade.tMfe).toBe(60);
  });
});

// ============ sealing on every close path ============

describe('sealing — every close path carries the position\'s accumulated excursions', () => {
  it('closeSession seals whatever accumulated across the walk, at the closing price/time given', () => {
    const walked = fold(book({ positions: [longPosition({ entryPrice: 100, sl: 80, tp: null })] }), [
      candle(60, 100, 106, 94, 100), // adverse=6, favorable=6 → mae=6@60, mfe=6@60
      candle(120, 100, 109, 97, 100), // adverse=3 (no move), favorable=9 (>6, new max) → mfe=9@120
    ]);
    expect(walked.positions).toHaveLength(1);
    const walkedPos = walked.positions[0];
    const r = closeSession(walked, 103, 200, CONTRACT);
    expect(r.positions).toHaveLength(0);
    expect(r.history).toHaveLength(1);
    const trade = r.history[0];
    expect(trade.outcome).toBe('session-end');
    expect(trade.mae).toBeCloseTo(walkedPos.mae!);
    expect(trade.mfe).toBeCloseTo(walkedPos.mfe!);
    expect(trade.tMae).toBe(walkedPos.tMae);
    expect(trade.tMfe).toBe(walkedPos.tMfe);
  });

  it('closeTrade (manual-close path) seals a position\'s pre-accumulated fields verbatim', () => {
    const p = longPosition({
      entryPrice: 100,
      sl: 80,
      tp: null,
      mae: 12.5,
      mfe: 7.25,
      tMae: 300,
      tMfe: 360,
    });
    const trade = closeTrade(p, 104, 400, 'manual', CONTRACT);
    expect(trade.mae).toBe(12.5);
    expect(trade.mfe).toBe(7.25);
    expect(trade.tMae).toBe(300);
    expect(trade.tMfe).toBe(360);
  });

  it('a position never walked by any candle seals as a zero excursion at the open instant', () => {
    const p = longPosition({ entryPrice: 100, sl: 80, tp: null, openTime: 500 });
    expect(p.mae).toBeUndefined();
    const trade = closeTrade(p, 104, 500, 'manual', CONTRACT);
    expect(trade.mae).toBe(0);
    expect(trade.mfe).toBe(0);
    expect(trade.tMae).toBe(500);
    expect(trade.tMfe).toBe(500);
  });
});

// ============ changed decoupling (engine-purity guard) ============

describe('excursion accumulation is decoupled from `changed` (fills/exits only)', () => {
  it('a position that neither fills nor exits leaves `changed` false even though mae/mfe move', () => {
    const p = shortPosition({ entryPrice: 100, sl: 4095 + 1000, tp: null }); // SL far away, never hit
    const r = processCandle(book({ positions: [p] }), candle(100, 100, 108, 90, 100), null, CONTRACT);
    expect(r.changed).toBe(false);
    expect(r.book.positions[0].mae).toBeGreaterThan(0); // still accumulated under the hood
  });

  it('re-processing the same candle over the resulting book is idempotent for excursions too', () => {
    const p = longPosition({ entryPrice: 100, sl: 80, tp: null });
    const c = candle(100, 100, 106, 96, 100);
    const once = processCandle(book({ positions: [p] }), c, null, CONTRACT).book;
    const twice = processCandle(once, c, null, CONTRACT).book;
    expect(twice).toEqual(once);
  });
});
