import type { SessionStats } from '../trading/fill-engine';
import type { ClosedTrade } from '../trading/trading.models';
import type { TelemetryEvent } from '../telemetry/telemetry.models';
import type { Lesson } from '../lessons/lessons.models';
import {
  computeExcursionAggregates,
  excursionR,
} from '../../components/session-summary/excursion-stats';

/**
 * PURE read-model builders for the Journal (RFC-016 D16.E, component
 * architecture §1.2). Zero Angular/NgRx imports — every function is
 * `(JournalSessionModel) → view rows`, session-scoped by construction (J-5:
 * a builder never sees more than one session's model, so cross-session
 * aggregation is structurally impossible). Clock-free (no `Date.now()`):
 * every computed value is a pure function of the model's own fields.
 *
 * View models carry ONLY numbers/strings/tokens — never `ClosedTrade`,
 * `Lesson`, or any other domain object (component-architecture §3.2). This
 * keeps the N-1 vocabulary grep trivial over leaf-component inputs and makes
 * the D8 (no factory selectors) audit local to this one file.
 */

// ---- the read-side session snapshot every builder consumes ----

/** A minimal Playbook rule projection: `title` only, NEVER `statement` (P-2). */
export interface JournalRuleRef {
  id: string;
  title: string;
  /** Hotkey slot 1..9; null = none (mirrors `PlaybookRule.shortcutSlot`). */
  shortcutSlot: number | null;
  sortOrder: number;
}

/**
 * Everything the Journal (and, per component-architecture §3.1, the Task-7
 * Reflection Cabin — "one loader, two surfaces") needs about ONE session.
 * Built by `JournalDataService.loadSessionReadModel`; consumed here by pure
 * builders. `rules` intentionally includes retired rules too (a trade may
 * have been declared under a rule since retired — the Journal is a mirror of
 * what physically happened, not filtered by today's Playbook config).
 */
export interface JournalSessionModel {
  sessionId: string;
  symbol: string;
  name: string;
  initialBalance: number;
  /** Ledger balance (`TradingData.balance` — initialBalance + Σ profit). */
  balance: number;
  trades: ClosedTrade[];
  stats: SessionStats;
  telemetry: TelemetryEvent[];
  /** ALL Playbook rules (active + retired), sorted by `sortOrder` — see doc comment. */
  rules: JournalRuleRef[];
  /** tradeId → Lesson, for the `✎` indicator and Task 7's prefill (one loader, two surfaces). */
  lessonByTradeRef: Record<string, Lesson>;
  /** Dataset refs for Task 7's `SceneSpec.datasetRefs` (format: `${symbol}|${timeframe}|${year|'all'}`, `DatasetRecord.id`). */
  datasetRefs: string[];
  /** Base execution timeframe in seconds (M1 = 60) — the fill engine's execution granularity, NOT the display TF. */
  baseTfSeconds: number;
}

// ---- view models ----

export interface SessionStatsView {
  /** May be `Infinity` (no losing trades) — the leaf renders `∞`. */
  profitFactor: number;
  /** 0..1. */
  winRate: number;
  totalR: number;
  balance: number;
  /** 0..1 (max drawdown as a fraction of peak equity). */
  drawdownPct: number;
  /** null when n < 2 or stddev is 0 (n≥2 per-trade Sharpe, D16.C.3). */
  sharpe: number | null;
  maeRMean: number | null;
  mfeRMean: number | null;
  tradesCount: number;
  costsTotal: number;
}

export interface ScatterPointView {
  tradeId: string;
  /** Trade sequence number within the session (1-based, chronological by closeTime). */
  seq: number;
  maeR: number;
  mfeR: number;
  rMultiple: number;
  openTime: number;
  /** Declared rule's title, or '' when undeclared. */
  ruleTitle: string;
  colorToken: string;
}

export interface BubbleView {
  tradeId: string;
  seq: number;
  /** Duration in base (M1) candles. */
  durationBaseCandles: number;
  rMultiple: number;
  /** Raw management-event count (sqrt scale for radius is Task 6's rendering concern). */
  managementEventCount: number;
  ruleTitle: string;
  colorToken: string;
}

export interface HeatmapCellView {
  tradeId: string;
  seq: number;
  rMultiple: number;
}

export interface RulePerformanceRow {
  /** null = the "Sin declarar" row. */
  ruleId: string | null;
  title: string;
  colorToken: string;
  trades: number;
  winRate: number;
  totalR: number;
}

export interface TimeOfDayRow {
  /** 0-23, UTC hour of `openTime`. */
  hourUtc: number;
  trades: number;
  winRate: number;
  totalR: number;
}

export interface TradeRowView {
  tradeId: string;
  seq: number;
  /** UTC seconds; the leaf formats `HH:mm` UTC. */
  openTime: number;
  /** 'C' = buy (Compra), 'V' = sell (Venta) — parity with the chart's trade-box labels. */
  side: 'C' | 'V';
  profit: number;
  rMultiple: number;
  maeR: number | null;
  mfeR: number | null;
  ruleId: string | null;
  /** `R{slot}` when the declared rule has a shortcut slot, else its title, else '' (undeclared). */
  ruleBadge: string;
  colorToken: string;
  hasReflection: boolean;
}

export interface BehaviorFactsView {
  /** Count of `ReplayJump` telemetry events. Covers BOTH `+1` (`advanceDisplay`)
   * landings and explicit `jumpForward`/`jumpBack` — `TelemetryEffects` (Task 1)
   * captures all three under the SAME 'ReplayJump' kind (`JUMP_FAMILY`), so the
   * telemetry stream does not structurally distinguish a `+1` press from a
   * multi-candle jump. Documented deviation from the design spec's literal
   * "+1, pausas, ReplayJump" three-count wording (task-5-report.md). */
  replayJumps: number;
  /** Count of `PlaybackToggled` events where `payload.playing === false`. */
  pauses: number;
}

// ---- shared helpers (internal) ----

const RULE_PALETTE_SIZE = 9;
const UNDECLARED_COLOR_TOKEN = 'var(--text-muted)';
const UNDECLARED_LABEL = 'Sin declarar';

/** `slot` when the rule has a shortcut slot, else a deterministic `sortOrder % 9` index (documented, RFC-016 D16.E/component-architecture §1.2). */
function ruleColorToken(rule: JournalRuleRef): string {
  const slot =
    rule.shortcutSlot !== null ? rule.shortcutSlot : (rule.sortOrder % RULE_PALETTE_SIZE) + 1;
  return `var(--rule-${slot})`;
}

/** ruleId → CSS color token, computed ONCE per call (D8: no per-point/per-row selector). */
function buildRuleColorMap(rules: readonly JournalRuleRef[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const rule of rules) map.set(rule.id, ruleColorToken(rule));
  return map;
}

function colorFor(ruleId: string | null | undefined, colorMap: Map<string, string>): string {
  if (!ruleId) return UNDECLARED_COLOR_TOKEN;
  return colorMap.get(ruleId) ?? UNDECLARED_COLOR_TOKEN;
}

interface SeqTrade {
  trade: ClosedTrade;
  seq: number;
}

/** Trades in chronological (closeTime) order, numbered 1-based — the ONE canonical
 * trade-sequence-in-session ordering shared by every builder that needs `seq`
 * (scatter tooltip "#N", bubble, heatmap X axis, trades table "#"). */
function sortedTradesWithSeq(trades: readonly ClosedTrade[]): SeqTrade[] {
  return [...trades]
    .sort((a, b) => a.closeTime - b.closeTime)
    .map((trade, i) => ({ trade, seq: i + 1 }));
}

/** Win rate over `trades`: won / (won + lost), excluding session-end (expired) trades — mirrors `computeSessionStats`. */
function winRateOf(trades: readonly ClosedTrade[]): number {
  const decided = trades.filter((t) => t.outcome !== 'session-end');
  if (!decided.length) return 0;
  const won = decided.filter((t) => t.profit > 0).length;
  return won / decided.length;
}

function totalROf(trades: readonly ClosedTrade[]): number {
  return trades.reduce((sum, t) => sum + t.rMultiple, 0);
}

/** Management events (`OrderModified`/`PositionModified`) referencing `trade`, within `[openTime, closeTime]`. */
function countManagementEvents(trade: ClosedTrade, telemetry: readonly TelemetryEvent[]): number {
  let count = 0;
  for (const e of telemetry) {
    if (e.kind !== 'OrderModified' && e.kind !== 'PositionModified') continue;
    if (e.marketTime === null || e.marketTime < trade.openTime || e.marketTime > trade.closeTime)
      continue;
    const payload = e.payload as { orderRef?: string; positionRef?: string };
    if (payload.orderRef === trade.id || payload.positionRef === trade.id) count++;
  }
  return count;
}

// ---- builders ----

/** Performance grid (design spec §1.2): 10 numeric facts, formatted by the leaf. */
export function buildSessionStatsView(model: JournalSessionModel): SessionStatsView {
  const excursions = computeExcursionAggregates(model.trades);
  const costsTotal = model.trades.reduce((sum, t) => sum + (t.commission ?? 0), 0);
  return {
    profitFactor: model.stats.profitFactor,
    winRate: model.stats.winRate,
    totalR: model.stats.totalR,
    balance: model.balance,
    drawdownPct: model.stats.maxDrawdownPct,
    sharpe: model.stats.sharpe,
    maeRMean: excursions.meanMaeR,
    mfeRMean: excursions.meanMfeR,
    tradesCount: model.stats.totalTrades,
    costsTotal,
  };
}

/**
 * Scatter MAE vs MFE (design spec §1.3). Skips a trade when EITHER its
 * MAE_R or MFE_R is null (legacy-absent mae/mfe, or a degenerate zero risk
 * distance — `excursionR`'s null cases): a point needs both coordinates,
 * and a physical excursion fact that doesn't exist is not fabricated as 0
 * (documented deviation from "every trade gets a point").
 */
export function buildScatterPoints(model: JournalSessionModel): ScatterPointView[] {
  const titleOf = new Map(model.rules.map((r) => [r.id, r.title]));
  const colorOf = buildRuleColorMap(model.rules);
  const out: ScatterPointView[] = [];
  for (const { trade, seq } of sortedTradesWithSeq(model.trades)) {
    const maeR = excursionR(trade.mae, trade.entryPrice, trade.sl);
    const mfeR = excursionR(trade.mfe, trade.entryPrice, trade.sl);
    if (maeR === null || mfeR === null) continue;
    out.push({
      tradeId: trade.id,
      seq,
      maeR,
      mfeR,
      rMultiple: trade.rMultiple,
      openTime: trade.openTime,
      ruleTitle: trade.declaredRuleId ? (titleOf.get(trade.declaredRuleId) ?? '') : '',
      colorToken: colorFor(trade.declaredRuleId, colorOf),
    });
  }
  return out;
}

/** Bubble Duration vs R (design spec §1.4). Every trade gets a bubble (radius=0 is a legitimate "no management events" fact, not skipped). */
export function buildBubbles(model: JournalSessionModel): BubbleView[] {
  const titleOf = new Map(model.rules.map((r) => [r.id, r.title]));
  const colorOf = buildRuleColorMap(model.rules);
  return sortedTradesWithSeq(model.trades).map(({ trade, seq }) => ({
    tradeId: trade.id,
    seq,
    durationBaseCandles:
      model.baseTfSeconds > 0 ? (trade.closeTime - trade.openTime) / model.baseTfSeconds : 0,
    rMultiple: trade.rMultiple,
    managementEventCount: countManagementEvents(trade, model.telemetry),
    ruleTitle: trade.declaredRuleId ? (titleOf.get(trade.declaredRuleId) ?? '') : '',
    colorToken: colorFor(trade.declaredRuleId, colorOf),
  }));
}

/** Heatmap calendar of trades (design spec §1.4). Color/intensity banding from `rMultiple` is Task 6's rendering concern (view rows carry only the raw number). */
export function buildHeatmapCells(model: JournalSessionModel): HeatmapCellView[] {
  return sortedTradesWithSeq(model.trades).map(({ trade, seq }) => ({
    tradeId: trade.id,
    seq,
    rMultiple: trade.rMultiple,
  }));
}

/**
 * Rule Performance (design spec §1.5, P-1). One row per rule (declared or
 * retired) with >=1 declared trade this session, in `model.rules` order
 * (sortOrder), followed by a FINAL "Sin declarar" row — shown ONLY when at
 * least one undeclared trade exists (the same ">=1 trade" gate applies to
 * the undeclared bucket as to every rule: first-class, not special-cased to
 * always render — documented, task-5-report.md). A `declaredRuleId` that
 * does not resolve to any known rule (defensive: data drift) still gets a
 * row, titled with the raw id.
 */
export function buildRulePerformanceRows(model: JournalSessionModel): RulePerformanceRow[] {
  const colorOf = buildRuleColorMap(model.rules);
  const buckets = new Map<string, ClosedTrade[]>();
  const undeclared: ClosedTrade[] = [];
  for (const trade of model.trades) {
    const key = trade.declaredRuleId;
    if (!key) {
      undeclared.push(trade);
      continue;
    }
    const list = buckets.get(key);
    if (list) list.push(trade);
    else buckets.set(key, [trade]);
  }

  const rows: RulePerformanceRow[] = [];
  const seen = new Set<string>();
  for (const rule of model.rules) {
    const trades = buckets.get(rule.id);
    if (!trades || !trades.length) continue; // rule-without-trades: no row (§1.5)
    seen.add(rule.id);
    rows.push({
      ruleId: rule.id,
      title: rule.title,
      colorToken: colorOf.get(rule.id) ?? UNDECLARED_COLOR_TOKEN,
      trades: trades.length,
      winRate: winRateOf(trades),
      totalR: totalROf(trades),
    });
  }
  // Declared under a ruleId not present in model.rules (defensive fallback).
  for (const [ruleId, trades] of buckets) {
    if (seen.has(ruleId)) continue;
    rows.push({
      ruleId,
      title: ruleId,
      colorToken: UNDECLARED_COLOR_TOKEN,
      trades: trades.length,
      winRate: winRateOf(trades),
      totalR: totalROf(trades),
    });
  }
  if (undeclared.length) {
    rows.push({
      ruleId: null,
      title: UNDECLARED_LABEL,
      colorToken: UNDECLARED_COLOR_TOKEN,
      trades: undeclared.length,
      winRate: winRateOf(undeclared),
      totalR: totalROf(undeclared),
    });
  }
  return rows;
}

/** Time of Day (design spec §1.6): 1h UTC buckets over `openTime`, only non-empty buckets, sorted by hour. */
export function buildTimeOfDayRows(model: JournalSessionModel): TimeOfDayRow[] {
  const buckets = new Map<number, ClosedTrade[]>();
  for (const trade of model.trades) {
    const hour = new Date(trade.openTime * 1000).getUTCHours();
    const list = buckets.get(hour);
    if (list) list.push(trade);
    else buckets.set(hour, [trade]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hourUtc, trades]) => ({
      hourUtc,
      trades: trades.length,
      winRate: winRateOf(trades),
      totalR: totalROf(trades),
    }));
}

function ruleBadgeFor(ruleId: string | null | undefined, rule: JournalRuleRef | undefined): string {
  if (!ruleId) return '';
  if (!rule) return ruleId; // defensive: unresolvable declared rule, show the raw id rather than blank
  return rule.shortcutSlot !== null ? `R${rule.shortcutSlot}` : rule.title;
}

/** Trades table (design spec §1.7). Renders from 1 trade (tables, unlike visualizations, have no minimum). */
export function buildTradeRows(model: JournalSessionModel): TradeRowView[] {
  const ruleById = new Map(model.rules.map((r) => [r.id, r]));
  const colorOf = buildRuleColorMap(model.rules);
  return sortedTradesWithSeq(model.trades).map(({ trade, seq }) => {
    const rule = trade.declaredRuleId ? ruleById.get(trade.declaredRuleId) : undefined;
    return {
      tradeId: trade.id,
      seq,
      openTime: trade.openTime,
      side: trade.side === 'buy' ? 'C' : 'V',
      profit: trade.profit,
      rMultiple: trade.rMultiple,
      maeR: excursionR(trade.mae, trade.entryPrice, trade.sl),
      mfeR: excursionR(trade.mfe, trade.entryPrice, trade.sl),
      ruleId: trade.declaredRuleId ?? null,
      ruleBadge: ruleBadgeFor(trade.declaredRuleId, rule),
      colorToken: colorFor(trade.declaredRuleId, colorOf),
      hasReflection: trade.id in model.lessonByTradeRef,
    };
  });
}

/**
 * Behavior facts row (design spec §1.4): physical navigation counts, NUMBERS
 * ONLY, never adjectives (N-1). See {@link BehaviorFactsView.replayJumps}'s
 * doc comment for why this is two counts, not the design spec's literal
 * three ("+1, pausas, ReplayJump").
 */
export function buildBehaviorFacts(model: JournalSessionModel): BehaviorFactsView {
  let replayJumps = 0;
  let pauses = 0;
  for (const e of model.telemetry) {
    if (e.kind === 'ReplayJump') replayJumps++;
    else if (
      e.kind === 'PlaybackToggled' &&
      (e.payload as { playing?: boolean }).playing === false
    ) {
      pauses++;
    }
  }
  return { replayJumps, pauses };
}
