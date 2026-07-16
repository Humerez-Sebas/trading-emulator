import { Candle } from '../../models';
import { ClosedTrade, OrderSide, PendingOrder, Position, TradeOutcome } from './trading.models';
import { ExecutionCosts, pointsToPrice } from './execution-costs';
import { DomainFact } from './domain-facts';

/** Mutable book the engine works on; a subset of TradingData. */
export interface TradingBook {
  balance: number;
  orders: PendingOrder[];
  positions: Position[];
  history: ClosedTrade[];
}

export interface ProcessResult {
  book: TradingBook;
  /**
   * True if anything changed (fills or exits happened). Position excursion
   * (mae/mfe, RFC-014 §3) accumulation does NOT set this — `book` always
   * reflects the latest excursion values regardless of this flag; see
   * `updateExcursion`'s doc comment for why the two are decoupled.
   */
  changed: boolean;
  /**
   * True when at least one still-open position's mae/mfe/tMae/tMfe advanced
   * this candle (RFC-014 §3) even though `changed` stayed false (nothing
   * filled or exited). Optional/additive: absent behaves as false, so any
   * caller written before this field existed is unaffected. Exists so a
   * caller that short-circuits on `!changed` — e.g. the trading reducer's
   * idle path — can still tell whether `book.positions` needs adopting,
   * without deep-comparing the book itself. When there are no open positions
   * at all this is always false, so the truly-idle case is unaffected.
   */
  excursionsMoved?: boolean;
  /**
   * Reified domain facts (RFC-014 Task 4b) built during THIS SAME walk: one
   * {@link OrderFilled} per order filled this candle, one
   * {@link PositionClosed} per engine SL/TP exit — pushed in the order the
   * walk produces them (fills from step 1 before exits from step 2, so a
   * same-candle fill+exit yields `[OrderFilled, PositionClosed]` for the
   * same `tradeId`). Deterministic, additive, pure (I-10) — no new engine
   * state, no IO. Always a concrete array, never `undefined`: empty when
   * nothing fills/exits this candle (mirrors `changed`'s fills/exits-only
   * scope, NOT `excursionsMoved` — an excursion-only candle still yields
   * `facts: []`).
   */
  facts: DomainFact[];
}

function profitOf(p: Position, exitPrice: number, contractSize: number): number {
  const dir = p.side === 'buy' ? 1 : -1;
  return (exitPrice - p.entryPrice) * dir * p.lots * contractSize;
}

/**
 * Ask(t) = Bid(t) + spreadPoints·pointSize (RFC-014 D14.D) — the single
 * conversion point every sided predicate/price that needs the Ask side goes
 * through. Absent costs (or zero spread) degrade to `bid` unchanged (V-1).
 */
export function toAsk(bid: number, costs?: ExecutionCosts): number {
  if (!costs || !costs.spreadPoints) return bid;
  return bid + pointsToPrice(costs.spreadPoints, costs.pointSize);
}

/**
 * Deterministic adverse slippage (RFC-014 §2): shifts `price` against the
 * trader in the direction of `action` — a 'buy' action (opening long via a
 * buy stop, or covering a short at its SL) pays MORE; a 'sell' action
 * (opening short via a sell stop, or exiting a long at its SL) receives
 * LESS. Absent costs (or zero slippage) leave `price` unchanged (V-1).
 */
function slip(price: number, action: OrderSide, costs?: ExecutionCosts): number {
  if (!costs || !costs.slippagePoints) return price;
  const delta = pointsToPrice(costs.slippagePoints, costs.pointSize);
  return action === 'buy' ? price + delta : price - delta;
}

export function closeTrade(
  p: Position,
  exitPrice: number,
  closeTime: number,
  outcome: TradeOutcome,
  contractSize: number,
  ambiguous = false,
  costs?: ExecutionCosts,
): ClosedTrade {
  // Manual/session-end closes receive a market BID price from the caller;
  // covering a short is a buy action, which executes at the derived Ask
  // (D14.D). SL/TP exits already carry the correctly side-denominated level
  // (see resolveExit's slip() call), so no further conversion happens here.
  const executedExit =
    (outcome === 'manual' || outcome === 'session-end') && p.side === 'sell'
      ? toAsk(exitPrice, costs)
      : exitPrice;

  const grossProfit = profitOf(p, executedExit, contractSize);
  const commission = costs ? costs.commissionPerLot * p.lots : 0;
  const profit = grossProfit - commission;

  return {
    id: p.id,
    side: p.side,
    origin: p.origin,
    entryPrice: p.entryPrice,
    exitPrice: executedExit,
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
    grossProfit,
    commission,
    // RFC-014 §3: seal the position's running excursion accumulators as of
    // this close (on an engine SL/TP exit, `p` already carries THIS candle's
    // contribution — see `updateExcursion`'s call site in `processCandle`,
    // which runs before the exit check). A position never walked by a candle
    // (mae/mfe/tMae/tMfe all undefined, e.g. a market order closed manually
    // before any replay advance) seals as a zero excursion at the open
    // instant rather than staying undefined — undefined is reserved for
    // trades persisted before this field existed (see the doc on
    // `ClosedTrade.mae`).
    mae: p.mae ?? 0,
    mfe: p.mfe ?? 0,
    tMae: p.tMae ?? p.openTime,
    tMfe: p.tMfe ?? p.openTime,
    // RFC-015: the identity chain's final link — sealed verbatim from the
    // closing Position (same "absent → null" idiom as the copy point in
    // `processCandle`'s order→position fill above).
    declaredRuleId: p.declaredRuleId ?? null,
  };
}

/**
 * Excursion update (RFC-014 §3): the running max adverse/favorable price
 * distance from entry, evaluated over `candle`'s own high/low — whatever
 * grain the caller is walking (base candles in production, the coarser
 * parent candle in the legacy no-execution-series path; see D14.A). Reuses
 * `toAsk` (D14.D) for the short side's spread-adjusted extremes; the long
 * side is spread-invariant (Bid-denominated). Strict `>` (not `>=`): a later
 * candle that only EQUALS the running max does not move its timestamp — the
 * FIRST candle to reach a given max wins.
 *
 * Deliberately decoupled from `ProcessResult.changed` (fills/exits only,
 * RFC-014 Task 2's pre-existing contract, STOP-protected by
 * `fill-engine.sided.spec.ts`): a position's very first accumulation always
 * "moves" its mae/mfe from undefined to a concrete value, which would flip
 * `changed` to true on candles where no fill or exit occurs. Returning
 * `moved` separately lets the caller decide.
 */
function updateExcursion(
  p: Position,
  candle: Candle,
  costs?: ExecutionCosts,
): { position: Position; moved: boolean } {
  const E = p.entryPrice;
  let adverse: number;
  let favorable: number;
  if (p.side === 'buy') {
    adverse = Math.max(0, E - candle.low);
    favorable = Math.max(0, candle.high - E);
  } else {
    adverse = Math.max(0, toAsk(candle.high, costs) - E);
    favorable = Math.max(0, E - toAsk(candle.low, costs));
  }
  const maeUp = p.mae === undefined || adverse > p.mae;
  const mfeUp = p.mfe === undefined || favorable > p.mfe;
  if (!maeUp && !mfeUp) return { position: p, moved: false };
  return {
    position: {
      ...p,
      mae: maeUp ? adverse : p.mae,
      tMae: maeUp ? candle.time : p.tMae,
      mfe: mfeUp ? favorable : p.mfe,
      tMfe: mfeUp ? candle.time : p.tMfe,
    },
    moved: true,
  };
}

/**
 * Whether a pending order fills inside this candle (clean fill at entry).
 * Only candles AFTER the placement candle count: this makes reprocessing a
 * candle idempotent (stepping back and forth) and prevents hindsight fills
 * on the candle the user was looking at when placing the order.
 *
 * Sided (RFC-014 §2): buys execute at Ask, so a buy limit/stop compares
 * against the Ask-derived candle; sells execute at Bid, unchanged. The
 * recorded entry price stays the order's level either way — the spread is
 * paid implicitly via the trigger, not by shifting the stored price.
 */
function orderFills(o: PendingOrder, c: Candle, costs?: ExecutionCosts): boolean {
  if (c.time <= o.createdAt) return false;
  if (o.type === 'limit') {
    return o.side === 'buy' ? toAsk(c.low, costs) <= o.entryPrice : c.high >= o.entryPrice;
  }
  // stop: triggers when price crosses the entry in the breakout direction
  return o.side === 'buy' ? toAsk(c.high, costs) >= o.entryPrice : c.low <= o.entryPrice;
}

/** Long SL/TP are Bid (sell action, spread-invariant); short SL/TP are Ask (buy-to-cover). */
function slHit(p: Position, c: Candle, costs?: ExecutionCosts): boolean {
  return p.side === 'buy' ? c.low <= p.sl : toAsk(c.high, costs) >= p.sl;
}

function tpHit(p: Position, c: Candle, costs?: ExecutionCosts): boolean {
  if (p.tp === null) return false;
  return p.side === 'buy' ? c.high >= p.tp : toAsk(c.low, costs) <= p.tp;
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
  costs?: ExecutionCosts,
): ExitDecision | null {
  const sl = slHit(p, candle, costs);
  const tp = tpHit(p, candle, costs);
  if (!sl && !tp) return null;

  // SL exits are stop-type (deterministic adverse slippage); TP exits stay
  // clean at the exact level (RFC-014 §2). The closing action is the
  // OPPOSITE of the position's side (closing a long = sell, a short = buy).
  const closingAction: OrderSide = p.side === 'buy' ? 'sell' : 'buy';
  const slPrice = slip(p.sl, closingAction, costs);

  // Walk the sub-candles from the fill index onward when available
  if (subCandles && subCandles.length) {
    for (let i = Math.max(0, fromSubIdx); i < subCandles.length; i++) {
      const sub = subCandles[i];
      const s = slHit(p, sub, costs);
      const t = tpHit(p, sub, costs);
      if (s && t) return { outcome: 'sl', price: slPrice, ambiguous: true };
      if (s) return { outcome: 'sl', price: slPrice, ambiguous: false };
      if (t) return { outcome: 'tp', price: p.tp!, ambiguous: false };
    }
    // If no sub-candles from the fill index onward hit SL or TP, the trade remains open
    // (the parent candle's touch occurred before the fill index)
    return null;
  }

  // Fallback when no sub-candles are available
  if (fromSubIdx > 0) {
    // Freshly filled in this candle but no sub-candles to disambiguate sequence: treat as ambiguous SL
    return { outcome: 'sl', price: slPrice, ambiguous: true };
  }

  if (sl && !tp) return { outcome: 'sl', price: slPrice, ambiguous: false };
  if (tp && !sl) return { outcome: 'tp', price: p.tp!, ambiguous: false };
  return { outcome: 'sl', price: slPrice, ambiguous: true };
}

/** First lower candle (>= fromIdx) that touches the order's entry price. */
function fillSubIndex(o: PendingOrder, subCandles: Candle[] | null, costs?: ExecutionCosts): number {
  if (!subCandles) return 0;
  for (let i = 0; i < subCandles.length; i++) {
    if (orderFills(o, subCandles[i], costs)) return i;
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
  costs?: ExecutionCosts,
): ProcessResult {
  let changed = false;
  let excursionsMoved = false;
  // RFC-014 Task 4b: reified facts, pushed in walk order (fills below, then
  // exits further down) — see `ProcessResult.facts`'s doc comment.
  const facts: DomainFact[] = [];

  // 1) fills of pending orders
  const remaining: PendingOrder[] = [];
  const positions = [...book.positions];
  /** sub-candle index from which each freshly filled position is evaluated */
  const fillIdx = new Map<string, number>();
  for (const o of book.orders) {
    if (orderFills(o, candle, costs)) {
      // Stop entries slip against the trader (RFC-014 §2); limit entries stay
      // a clean fill at the exact level. The recorded entry never shifts by
      // spread — that cost is paid implicitly via the sided trigger above.
      const entryPrice = o.type === 'stop' ? slip(o.entryPrice, o.side, costs) : o.entryPrice;
      positions.push({
        id: o.id,
        side: o.side,
        entryPrice,
        sl: o.sl,
        tp: o.tp,
        lots: o.lots,
        riskPct: o.riskPct,
        riskUsd: o.riskUsd,
        openTime: candle.time,
        origin: o.type,
        declaredRuleId: o.declaredRuleId ?? null,
      });
      fillIdx.set(o.id, fillSubIndex(o, subCandles, costs));
      changed = true;
      facts.push({
        kind: 'OrderFilled',
        tradeId: o.id,
        executedPrice: entryPrice,
        marketTime: candle.time,
      });
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
  for (const p0 of positions) {
    if (candle.time < p0.openTime) {
      stillOpen.push(p0);
      continue;
    }
    // RFC-014 §3: excursions accumulate for EVERY candle the position is
    // open for, INCLUDING the one it exits on (an SL exit's own candle is
    // what typically sets its MAE) — evaluated before the exit check so this
    // candle's extremes are already folded into `p` by the time it closes.
    // `updateExcursion`'s `moved` flag is intentionally NOT wired into
    // `changed` (see its doc comment) — it feeds `excursionsMoved` instead,
    // so a caller gating on `!changed` can still detect it.
    const excursionUpdate = updateExcursion(p0, candle, costs);
    const p = excursionUpdate.position;
    if (excursionUpdate.moved) excursionsMoved = true;
    const exit = resolveExit(p, candle, subCandles, fillIdx.get(p.id) ?? 0, costs);
    if (exit) {
      const trade = closeTrade(
        p,
        exit.price,
        candle.time,
        exit.outcome,
        contractSize,
        exit.ambiguous,
        costs,
      );
      closed.push(trade);
      balance += trade.profit;
      changed = true;
      facts.push({
        kind: 'PositionClosed',
        tradeId: trade.id,
        outcome: trade.outcome,
        ambiguous: trade.ambiguous,
        executedPrice: trade.exitPrice,
        marketTime: trade.closeTime,
      });
    } else {
      stillOpen.push(p);
    }
  }

  // Always return a freshly built book (no `!changed` short-circuit to the
  // original `book` reference): excursion accumulation must survive candles
  // where no fill/exit occurs, and `changed` no longer implies "nothing in
  // `stillOpen` differs from `positions`" now that excursions update inside
  // this same loop. `changed` itself keeps its exact pre-existing meaning
  // (fills or exits only) — callers that gate on it (STOP-protected specs)
  // are unaffected.
  return {
    book: {
      balance,
      orders: remaining,
      positions: stillOpen,
      history: [...book.history, ...closed],
    },
    changed,
    excursionsMoved,
    facts,
  };
}

/**
 * Ends the session: open positions are closed at `price` (last visible
 * close) as 'session-end' and pending orders are discarded. `price` is a
 * market BID price (the last visible close); shorts convert to Ask inside
 * `closeTrade` when `costs` is present.
 */
export function closeSession(
  book: TradingBook,
  price: number,
  time: number,
  contractSize: number,
  costs?: ExecutionCosts,
): TradingBook {
  let balance = book.balance;
  const closed = book.positions.map((p) => {
    const trade = closeTrade(p, price, time, 'session-end', contractSize, false, costs);
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

/** Index of the last candle with time <= t, or -1. Binary search (sorted series). */
export function lastIndexAtOrBefore(candles: Candle[], t: number): number {
  let lo = 0,
    hi = candles.length - 1,
    ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Index of the first candle with time >= t, or `candles.length`. Binary search. */
export function firstIndexAtOrAfter(candles: Candle[], t: number): number {
  let lo = 0,
    hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
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
  /** Sharpe ratio (per-trade, without annualization). mean(R) / sampleStdDev(R), null when n < 2 or stddev === 0 (RFC-016 D16.C.3). */
  sharpe: number | null;
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

  // Collect all R values for Sharpe calculation
  const rValues: number[] = [];

  for (const t of trades) {
    if (t.outcome === 'session-end') expired++;
    else if (t.profit > 0) won++;
    else lost++;
    if (t.profit >= 0) grossWin += t.profit;
    else grossLoss += -t.profit;
    totalR += t.rMultiple;
    rValues.push(t.rMultiple);
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

  // Compute Sharpe ratio: mean(R) / sampleStdDev(R)
  // Null when n < 2 or stddev === 0
  const sharpe = computeSharpe(rValues);

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
    sharpe,
  };
}

/**
 * Compute Sharpe ratio (per-trade, no annualization). mean(R) / sampleStdDev(R).
 * Returns null when n < 2 or stddev === 0.
 */
function computeSharpe(rValues: readonly number[]): number | null {
  if (rValues.length < 2) return null;

  const mean = rValues.reduce((sum, r) => sum + r, 0) / rValues.length;
  const variance =
    rValues.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (rValues.length - 1);
  const stddev = Math.sqrt(variance);

  if (stddev === 0) return null;
  return mean / stddev;
}
