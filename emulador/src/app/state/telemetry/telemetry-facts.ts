import { lastIndexAtOrBefore } from '../trading/fill-engine';
import type { ClosedTrade, PendingOrder, Position } from '../trading/trading.models';
import type { Candle } from '../../models';
import type {
  OrderFilledPayload,
  OrderModifiedPayload,
  PositionClosedPayload,
  PositionModifiedPayload,
} from './telemetry.models';

/**
 * Pure post-reducer state-diffing for the Task-4b reified facts
 * (`OrderFilled`/`PositionClosed`) and for order-placement correlation.
 *
 * RUN DECISION D14.F (binding, see task-5-brief.md): `ProcessResult.facts`
 * exists at the engine level but has no state surfacing (type-impossible —
 * `TradingState`/`FillContext` carry no `facts` field). The observer derives
 * both facts from PAIRWISE DIFFS of `positions[]`/`history[]` across
 * consecutive trading-state snapshots instead of reading a reified fact
 * object. No framework imports (I-10 idiom, matches `simulation-domain.ts`/
 * `domain-facts.ts`) — every function here takes explicit snapshots and
 * returns data, making it testable without TestBed or a MockStore.
 */

/** The trading-state slice `TelemetryEffects` diffs across consecutive states. */
export interface TradingSnapshot {
  sessionId: string | null;
  orders: readonly PendingOrder[];
  positions: readonly Position[];
  history: readonly ClosedTrade[];
}

function idSet(entities: readonly { id: string }[]): Set<string> {
  return new Set(entities.map((e) => e.id));
}

/**
 * `fillBaseIndex` (RFC-014 §4): resolved from the execution series via
 * `lastIndexAtOrBefore`, omitted (not just `undefined` — the KEY itself is
 * absent) when there is no base series loaded, or when `marketTime` is
 * before the base series' first candle (`lastIndexAtOrBefore` returns -1).
 */
export function resolveFillBaseIndex(
  base: readonly Candle[] | null | undefined,
  marketTime: number,
): number | undefined {
  if (!base || base.length === 0) return undefined;
  const idx = lastIndexAtOrBefore(base as Candle[], marketTime);
  return idx >= 0 ? idx : undefined;
}

/** Builds an `OrderFilled` payload, conditionally including `fillBaseIndex` (never an explicit `undefined` key). */
export function buildOrderFilledPayload(
  tradeId: string,
  executedPrice: number,
  marketTime: number,
  base: readonly Candle[] | null | undefined,
): OrderFilledPayload {
  const fillBaseIndex = resolveFillBaseIndex(base, marketTime);
  return fillBaseIndex === undefined
    ? { tradeId, executedPrice, marketTime }
    : { tradeId, fillBaseIndex, executedPrice, marketTime };
}

export function buildPositionClosedPayload(trade: ClosedTrade): PositionClosedPayload {
  return {
    tradeId: trade.id,
    outcome: trade.outcome,
    ambiguous: trade.ambiguous,
    executedPrice: trade.exitPrice,
    marketTime: trade.closeTime,
  };
}

/** One reified fact ready to hand to `TelemetryEffects.capture()`. */
export type DomainFactEmission =
  | { kind: 'OrderFilled'; marketTime: number; payload: OrderFilledPayload }
  | { kind: 'PositionClosed'; marketTime: number; payload: PositionClosedPayload };

/**
 * Diffs `prev` -> `curr` (assumed same session — callers must check
 * `prev.sessionId === curr.sessionId` themselves; a session switch must
 * reset the baseline, never be diffed) and returns every fact that
 * transition implies, in emission order.
 *
 * - A new id in `positions[]` (not present in `prev.positions`) with
 *   `origin` `'limit'`/`'stop'` -> `OrderFilled`. `origin: 'market'` never
 *   emits (engine parity: only pending-order fills are fills).
 * - A new id in `history[]` (not present in `prev.history`) -> `PositionClosed`
 *   always. If that id was ALSO never in `prev.positions` (same-candle
 *   fill-then-close, engine-internal — it never passed through an
 *   intermediate `positions[]` snapshot) and its `origin` is `'limit'`/
 *   `'stop'`, an `OrderFilled` is synthesized from the `ClosedTrade`'s own
 *   `entryPrice`/`openTime` and emitted FIRST, immediately before the
 *   `PositionClosed` for the same trade.
 */
export function diffDomainFacts(
  prev: Pick<TradingSnapshot, 'positions' | 'history'>,
  curr: Pick<TradingSnapshot, 'positions' | 'history'>,
  base: readonly Candle[] | null | undefined,
): DomainFactEmission[] {
  const emissions: DomainFactEmission[] = [];
  const prevPositionIds = idSet(prev.positions);
  const prevHistoryIds = idSet(prev.history);

  for (const position of curr.positions) {
    if (prevPositionIds.has(position.id)) continue;
    if (position.origin !== 'limit' && position.origin !== 'stop') continue; // market: no OrderFilled
    emissions.push({
      kind: 'OrderFilled',
      marketTime: position.openTime,
      payload: buildOrderFilledPayload(position.id, position.entryPrice, position.openTime, base),
    });
  }

  for (const trade of curr.history) {
    if (prevHistoryIds.has(trade.id)) continue;
    const wasOpenBefore = prevPositionIds.has(trade.id);
    if (!wasOpenBefore && (trade.origin === 'limit' || trade.origin === 'stop')) {
      emissions.push({
        kind: 'OrderFilled',
        marketTime: trade.openTime,
        payload: buildOrderFilledPayload(trade.id, trade.entryPrice, trade.openTime, base),
      });
    }
    emissions.push({
      kind: 'PositionClosed',
      marketTime: trade.closeTime,
      payload: buildPositionClosedPayload(trade),
    });
  }

  return emissions;
}

/**
 * Resolves the `orderRef` (= the entity id the reducer just minted) for a
 * `placeOrder`/`openMarket` transition — `prev`/`curr` are assumed same-
 * session, exactly like {@link diffDomainFacts}. Returns `undefined` when
 * nothing was actually added (a rejected placement per I-14/`lotsForRisk`
 * leaves `state` reference-unchanged, so the caller's pairwise stream never
 * even reaches here in production — see `TelemetryEffects` doc comment —
 * but this function stays defensive/pure regardless).
 *
 * Deliberately checks `orders[]` (a `placeOrder`) before `positions[]` (an
 * `openMarket`, `origin === 'market'` only — a fill adding a `'limit'`/
 * `'stop'` position must NOT be mistaken for a placement here).
 */
export function resolveOrderRef(
  prev: Pick<TradingSnapshot, 'orders' | 'positions'>,
  curr: Pick<TradingSnapshot, 'orders' | 'positions'>,
): string | undefined {
  const prevOrderIds = idSet(prev.orders);
  const newOrder = curr.orders.find((o) => !prevOrderIds.has(o.id));
  if (newOrder) return newOrder.id;

  const prevPositionIds = idSet(prev.positions);
  const newMarketPosition = curr.positions.find(
    (p) => !prevPositionIds.has(p.id) && p.origin === 'market',
  );
  return newMarketPosition?.id;
}

/** One management event ready to hand to `TelemetryEffects.capture()` (RFC-016 §1). */
export type ManagementEventEmission =
  | { kind: 'OrderModified'; payload: OrderModifiedPayload }
  | { kind: 'PositionModified'; payload: PositionModifiedPayload };

/**
 * Diffs `prev` -> `curr` (same session-scoping contract as
 * {@link diffDomainFacts} — callers must check `prev.sessionId ===
 * curr.sessionId` themselves; a session switch resets the baseline, never
 * gets diffed) and returns a `OrderModified`/`PositionModified` event for
 * every `sl`/`tp`(/`entryPrice` for orders) field that changed VALUE, by
 * id, for entities present in BOTH snapshots.
 *
 * Comparing by VALUE (not array/object identity) is what makes this
 * automatically exclude:
 * - **Rejected modifications** (RFC-016 §1, I-14/I-15 guards in
 *   `trading.reducer.ts`): both `modifyOrder` (returns the entity
 *   UNCHANGED for a rejected id) and `modifyPosition` (returns a NEW
 *   object via spread, but with the SAME `sl` value, when the I-15 widen
 *   guard rejects — "apply-the-valid-part": a genuinely-changed `tp`
 *   alongside a rejected `sl` still emits its own event) leave the
 *   compared field's VALUE unchanged either way.
 * - **Fills/placements/closes**: an id present in only one snapshot is
 *   never compared at all (the loops only visit ids present in `curr`
 *   AND looked up in `prev`).
 * - **MAE/MFE accumulator churn**: only `sl`/`tp`/`entryPrice` are ever
 *   read; the running excursion fields are not.
 *
 * Order changes are checked `sl` then `tp` then `entry` (matching the
 * field union's declaration order); position changes `sl` then `tp` — a
 * single `modifyOrder({sl, tp})`/`modifyPosition({sl, tp})` call that
 * moves both fields emits TWO events, in that order.
 */
export function diffManagementEvents(
  prev: Pick<TradingSnapshot, 'orders' | 'positions'>,
  curr: Pick<TradingSnapshot, 'orders' | 'positions'>,
): ManagementEventEmission[] {
  const emissions: ManagementEventEmission[] = [];

  const prevOrders = new Map(prev.orders.map((o) => [o.id, o] as const));
  for (const order of curr.orders) {
    const before = prevOrders.get(order.id);
    if (!before) continue; // placement, not a modification
    if (before.sl !== order.sl) {
      emissions.push({
        kind: 'OrderModified',
        payload: { orderRef: order.id, field: 'sl', from: before.sl, to: order.sl },
      });
    }
    if (before.tp !== order.tp) {
      emissions.push({
        kind: 'OrderModified',
        payload: { orderRef: order.id, field: 'tp', from: before.tp, to: order.tp },
      });
    }
    if (before.entryPrice !== order.entryPrice) {
      emissions.push({
        kind: 'OrderModified',
        payload: {
          orderRef: order.id,
          field: 'entry',
          from: before.entryPrice,
          to: order.entryPrice,
        },
      });
    }
  }

  const prevPositions = new Map(prev.positions.map((p) => [p.id, p] as const));
  for (const position of curr.positions) {
    const before = prevPositions.get(position.id);
    if (!before) continue; // fill, not a modification
    if (before.sl !== position.sl) {
      emissions.push({
        kind: 'PositionModified',
        payload: { positionRef: position.id, field: 'sl', from: before.sl, to: position.sl },
      });
    }
    if (before.tp !== position.tp) {
      emissions.push({
        kind: 'PositionModified',
        payload: { positionRef: position.id, field: 'tp', from: before.tp, to: position.tp },
      });
    }
  }

  return emissions;
}
