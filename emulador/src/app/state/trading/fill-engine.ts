import { Candle } from '../../models';
import { ClosedTrade, PendingOrder, Position, TradeOutcome } from './trading.models';

/** Mutable book the engine works on; a subset of TradingData. */
export interface TradingBook {
  balance: number;
  orders: PendingOrder[];
  positions: Position[];
  history: ClosedTrade[];
}

export interface ProcessResult {
  book: TradingBook;
  /** True if anything changed (fills or exits happened). */
  changed: boolean;
}

function profitOf(p: Position, exitPrice: number, contractSize: number): number {
  const dir = p.side === 'buy' ? 1 : -1;
  return (exitPrice - p.entryPrice) * dir * p.lots * contractSize;
}

export function closeTrade(
  p: Position,
  exitPrice: number,
  closeTime: number,
  outcome: TradeOutcome,
  contractSize: number,
  ambiguous = false,
): ClosedTrade {
  const profit = profitOf(p, exitPrice, contractSize);
  return {
    id: p.id,
    side: p.side,
    origin: p.origin,
    entryPrice: p.entryPrice,
    exitPrice,
    sl: p.sl,
    tp: p.tp,
    lots: p.lots,
    riskPct: p.riskPct,
    riskUsd: p.riskUsd,
    openTime: p.openTime,
    closeTime,
    outcome,
    profit,
    rMultiple: p.riskUsd > 0 ? profit / p.riskUsd : 0,
    ambiguous,
  };
}

/**
 * Whether a pending order fills inside this candle (clean fill at entry).
 * Only candles AFTER the placement candle count: this makes reprocessing a
 * candle idempotent (stepping back and forth) and prevents hindsight fills
 * on the candle the user was looking at when placing the order.
 */
function orderFills(o: PendingOrder, c: Candle): boolean {
  if (c.time <= o.createdAt) return false;
  if (o.type === 'limit') {
    return o.side === 'buy' ? c.low <= o.entryPrice : c.high >= o.entryPrice;
  }
  // stop: triggers when price crosses the entry in the breakout direction
  return o.side === 'buy' ? c.high >= o.entryPrice : c.low <= o.entryPrice;
}

function slHit(p: Position, c: Candle): boolean {
  return p.side === 'buy' ? c.low <= p.sl : c.high >= p.sl;
}

function tpHit(p: Position, c: Candle): boolean {
  if (p.tp === null) return false;
  return p.side === 'buy' ? c.high >= p.tp : c.low <= p.tp;
}

interface ExitDecision {
  outcome: 'sl' | 'tp';
  price: number;
  ambiguous: boolean;
}

/**
 * Decides how an open position exits within `candle`, if at all.
 *
 * When both SL and TP are inside the candle the order of touch is resolved
 * by walking the lower-timeframe candles of the same interval (`subCandles`,
 * already sliced and starting at `fromSubIdx` for freshly filled positions).
 * Without a lower series — or if both levels sit inside the same lower
 * candle — the result is pessimistic: SL first, flagged as ambiguous.
 */
function resolveExit(
  p: Position,
  candle: Candle,
  subCandles: Candle[] | null,
  fromSubIdx: number,
): ExitDecision | null {
  const sl = slHit(p, candle);
  const tp = tpHit(p, candle);
  if (!sl && !tp) return null;
  if (sl && !tp) return { outcome: 'sl', price: p.sl, ambiguous: false };
  if (tp && !sl) return { outcome: 'tp', price: p.tp!, ambiguous: false };

  // both inside the candle: disambiguate with the lower series if we can
  if (subCandles && subCandles.length) {
    for (let i = Math.max(0, fromSubIdx); i < subCandles.length; i++) {
      const sub = subCandles[i];
      const s = slHit(p, sub);
      const t = tpHit(p, sub);
      if (s && t) return { outcome: 'sl', price: p.sl, ambiguous: true };
      if (s) return { outcome: 'sl', price: p.sl, ambiguous: false };
      if (t) return { outcome: 'tp', price: p.tp!, ambiguous: false };
    }
  }
  return { outcome: 'sl', price: p.sl, ambiguous: true };
}

/** First lower candle (>= fromIdx) that touches the order's entry price. */
function fillSubIndex(o: PendingOrder, subCandles: Candle[] | null): number {
  if (!subCandles) return 0;
  for (let i = 0; i < subCandles.length; i++) {
    if (orderFills(o, subCandles[i])) return i;
  }
  return 0;
}

/**
 * Pure fill engine: evaluates one freshly revealed candle of the active TF.
 *
 *  1. Pending orders fill when the candle's range touches their entry
 *     (buy limit: low <= entry; stop orders: on cross). Clean fill at entry.
 *  2. Every open position (including those just filled) checks SL/TP against
 *     the candle. Freshly filled positions only look at the lower candles
 *     from their fill point onward.
 *
 * `subCandles` are the lower-TF candles covering [candle.time, next candle),
 * or null when no lower series is loaded in the workspace.
 */
export function processCandle(
  book: TradingBook,
  candle: Candle,
  subCandles: Candle[] | null,
  contractSize: number,
): ProcessResult {
  let changed = false;

  // 1) fills of pending orders
  const remaining: PendingOrder[] = [];
  const positions = [...book.positions];
  /** sub-candle index from which each freshly filled position is evaluated */
  const fillIdx = new Map<string, number>();
  for (const o of book.orders) {
    if (orderFills(o, candle)) {
      positions.push({
        id: o.id,
        side: o.side,
        entryPrice: o.entryPrice,
        sl: o.sl,
        tp: o.tp,
        lots: o.lots,
        riskPct: o.riskPct,
        riskUsd: o.riskUsd,
        openTime: candle.time,
        origin: o.type,
      });
      fillIdx.set(o.id, fillSubIndex(o, subCandles));
      changed = true;
    } else {
      remaining.push(o);
    }
  }

  // 2) exits (SL/TP) of open positions. Candles older than the position are
  // skipped (>= keeps the intra-candle evaluation of freshly filled ones):
  // revisiting past candles after a step-back must not time-travel exits.
  const stillOpen: Position[] = [];
  const closed: ClosedTrade[] = [];
  let balance = book.balance;
  for (const p of positions) {
    if (candle.time < p.openTime) {
      stillOpen.push(p);
      continue;
    }
    const exit = resolveExit(p, candle, subCandles, fillIdx.get(p.id) ?? 0);
    if (exit) {
      const trade = closeTrade(
        p,
        exit.price,
        candle.time,
        exit.outcome,
        contractSize,
        exit.ambiguous,
      );
      closed.push(trade);
      balance += trade.profit;
      changed = true;
    } else {
      stillOpen.push(p);
    }
  }

  if (!changed) return { book, changed: false };
  return {
    book: {
      balance,
      orders: remaining,
      positions: stillOpen,
      history: [...book.history, ...closed],
    },
    changed: true,
  };
}

/**
 * Ends the session: open positions are closed at `price` (last visible
 * close) as 'session-end' and pending orders are discarded.
 */
export function closeSession(
  book: TradingBook,
  price: number,
  time: number,
  contractSize: number,
): TradingBook {
  let balance = book.balance;
  const closed = book.positions.map((p) => {
    const trade = closeTrade(p, price, time, 'session-end', contractSize);
    balance += trade.profit;
    return trade;
  });
  return {
    balance,
    orders: [],
    positions: [],
    history: [...book.history, ...closed],
  };
}

/** Candles with time in [from, to), via binary search (series is sorted). */
export function sliceRange(candles: Candle[], from: number, to: number): Candle[] {
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time < from) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;
  let end = start;
  while (end < candles.length && candles[end].time < to) end++;
  return candles.slice(start, end);
}

// ============ session statistics ============

export interface SessionStats {
  totalTrades: number;
  won: number;
  lost: number;
  /** Trades force-closed when the session ended. */
  expired: number;
  /** won / (won + lost), 0..1. NaN-safe (0 when no decided trades). */
  winRate: number;
  netProfit: number;
  totalR: number;
  /** Gross profit / gross loss. Infinity when there are no losses. */
  profitFactor: number;
  /** Max peak-to-valley drop of the equity curve, in account currency. */
  maxDrawdown: number;
  /** Max drawdown as a fraction of the peak equity (0..1). */
  maxDrawdownPct: number;
  /** Equity after each closed trade, starting at the initial balance. */
  equityCurve: number[];
  ambiguousCount: number;
}

export function computeSessionStats(history: ClosedTrade[], initialBalance: number): SessionStats {
  const trades = [...history].sort((a, b) => a.closeTime - b.closeTime);
  let won = 0;
  let lost = 0;
  let expired = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let totalR = 0;
  let ambiguousCount = 0;

  const equityCurve = [initialBalance];
  let equity = initialBalance;
  let peak = initialBalance;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  for (const t of trades) {
    if (t.outcome === 'session-end') expired++;
    else if (t.profit > 0) won++;
    else lost++;
    if (t.profit >= 0) grossWin += t.profit;
    else grossLoss += -t.profit;
    totalR += t.rMultiple;
    if (t.ambiguous) ambiguousCount++;

    equity += t.profit;
    equityCurve.push(equity);
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPct = peak > 0 ? dd / peak : 0;
    }
  }

  const decided = won + lost;
  return {
    totalTrades: trades.length,
    won,
    lost,
    expired,
    winRate: decided > 0 ? won / decided : 0,
    netProfit: equity - initialBalance,
    totalR,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    maxDrawdown,
    maxDrawdownPct,
    equityCurve,
    ambiguousCount,
  };
}
