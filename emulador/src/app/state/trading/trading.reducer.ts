import { createFeature, createReducer, on } from '@ngrx/store';
import { WorkspacesActions } from '../workspaces/workspaces.actions';
import { closeSession, closeTrade, processCandle } from './fill-engine';
import { validateOrderGeometry } from './simulation-domain';
import { TradingActions } from './trading.actions';
import {
  defaultTradingData,
  lotsForRisk,
  pickTradingData,
  Position,
  SavedSession,
  TradingState,
} from './trading.models';

const initialState: TradingState = {
  ...defaultTradingData(),
  summaryOpen: false,
  savedSessions: [],
  activeSessionId: null,
};

// Session ids become Supabase row ids (the `sessions.id` column is `uuid`), so
// they MUST be valid UUIDs — a timestamp+random string is rejected with
// Postgres 22P02 "invalid input syntax for type uuid" and the push silently
// fails. (Order/position ids live inside the payload jsonb, but a uuid is fine
// for them too.)
function newId(): string {
  return crypto.randomUUID();
}

function hasActivity(state: TradingState): boolean {
  return state.orders.length > 0 || state.positions.length > 0 || state.history.length > 0;
}

/** "dd/MM" of a unix-seconds timestamp (UTC), for auto session names. */
function shortDate(unixSeconds: number): string {
  if (unixSeconds <= 0) return '—';
  const d = new Date(unixSeconds * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`;
}

/**
 * Trading after a session ended re-opens it ("revive"): otherwise new orders
 * would silently never be evaluated by the fill engine. A scheduled end that
 * is already behind the cursor is cleared so it does not re-end immediately.
 */
function reviveIfEnded(state: TradingState, time: number): Partial<TradingState> {
  if (!state.sessionEnded) return {};
  return {
    sessionEnded: false,
    sessionEnd: state.sessionEnd !== null && time >= state.sessionEnd ? null : state.sessionEnd,
  };
}

/**
 * Archives the active session into `savedSessions` and returns the new list.
 * A session is worth keeping when it has any activity OR a name: wizard
 * sessions are named before any trade happens and must survive a switch.
 * Anonymous AND empty sessions are just noise and get dropped.
 */
function archiveActive(state: TradingState, currentCursor: number): SavedSession[] {
  if (!hasActivity(state) && state.sessionName === null) return state.savedSessions;
  return [
    ...state.savedSessions,
    {
      // Reuse the active session's stable id so the archived session keeps the
      // same id its cloud row has (LWW dedupes by id → no duplicate on pull).
      // Mint a fresh one only when there is no active id yet (legacy/new).
      id: state.activeSessionId ?? newId(),
      // restored sessions keep their original name across archive cycles
      name:
        state.sessionName ??
        `Sesión ${state.savedSessions.length + 1} · ${shortDate(currentCursor)}`,
      createdAt: Date.now(),
      currentTime: currentCursor,
      trading: pickTradingData(state),
    },
  ];
}

export const tradingFeature = createFeature({
  name: 'trading',
  reducer: createReducer(
    initialState,
    on(TradingActions.openMarket, (state, a): TradingState => {
      const lots = lotsForRisk(state.balance, a.riskPct, a.price, a.sl, a.contractSize);
      // I-14 Order Geometry Coherence (RFC-014 Task 4a): an incoherent
      // SL/TP (wrong side or boundary-equal to price) is silently rejected —
      // S2 minimal feedback this phase (no throw, no console; see
      // simulation-domain.ts). State returned UNCHANGED (reference identity),
      // same shape as the existing lots<=0 guard.
      if (lots <= 0 || !validateOrderGeometry(a.side, a.price, a.sl, a.tp)) return state;
      const position: Position = {
        id: newId(),
        side: a.side,
        entryPrice: a.price,
        sl: a.sl,
        tp: a.tp,
        lots,
        riskPct: a.riskPct,
        riskUsd: Math.abs(a.price - a.sl) * lots * a.contractSize,
        openTime: a.time,
        origin: 'market',
      };
      return {
        ...state,
        ...reviveIfEnded(state, a.time),
        positions: [...state.positions, position],
      };
    }),
    on(TradingActions.placeOrder, (state, a): TradingState => {
      const lots = lotsForRisk(state.balance, a.riskPct, a.entryPrice, a.sl, a.contractSize);
      // I-14 Order Geometry Coherence (RFC-014 Task 4a): same rejection as
      // openMarket above, evaluated against the order's entry price.
      if (lots <= 0 || !validateOrderGeometry(a.side, a.entryPrice, a.sl, a.tp)) return state;
      return {
        ...state,
        ...reviveIfEnded(state, a.time),
        orders: [
          ...state.orders,
          {
            id: newId(),
            side: a.side,
            type: a.orderType,
            entryPrice: a.entryPrice,
            sl: a.sl,
            tp: a.tp,
            lots,
            riskPct: a.riskPct,
            riskUsd: Math.abs(a.entryPrice - a.sl) * lots * a.contractSize,
            createdAt: a.time,
          },
        ],
      };
    }),
    // RFC-014 Task 4a (STOP-rule deviation, documented in task-4a-report.md):
    // I-15 SL non-widening validation is INTENTIONALLY NOT wired in here.
    // `trading.reducer.spec.ts:128-134` ("modifyPosition never re-sizes an
    // open position") pins acceptance of an SL move from 3990 to 3950 on a
    // long (entryPrice 4000) — a genuine widen per I-15 (nextSl < currentSl)
    // — via `expect(next.positions[0].sl).toBe(3950)`. Enforcing I-15 here
    // would make that pre-existing, STOP-protected assertion fail. Left
    // byte-identical to pre-Task-4a behavior; escalated rather than resolved
    // unilaterally (PHILOSOPHY §5.7).
    on(
      TradingActions.modifyPosition,
      (state, { id, sl, tp }): TradingState => ({
        ...state,
        positions: state.positions.map((p) =>
          p.id === id ? { ...p, sl: sl ?? p.sl, tp: tp === undefined ? p.tp : tp } : p,
        ),
      }),
    ),
    // RFC-014 Task 4a (STOP-rule deviation, documented in task-4a-report.md):
    // I-14 geometry validation is INTENTIONALLY NOT wired in here.
    // `trading.reducer.spec.ts:120-126` ("keeps the previous lots/riskUsd
    // when the SL lands on the entry (lots 0)") pins acceptance of an SL
    // modification that lands exactly on entryPrice (4000 === 4000, a
    // boundary-invalid I-14 geometry) via `expect(next.orders[0].sl).toBe(4000)`.
    // Enforcing I-14 here would make that pre-existing, STOP-protected
    // assertion fail. Left byte-identical to pre-Task-4a behavior; escalated
    // rather than resolved unilaterally (PHILOSOPHY §5.7).
    on(
      TradingActions.modifyOrder,
      (state, { id, entryPrice, sl, tp, contractSize }): TradingState => ({
        ...state,
        orders: state.orders.map((o) => {
          if (o.id !== id) return o;
          const next = {
            ...o,
            entryPrice: entryPrice ?? o.entryPrice,
            sl: sl ?? o.sl,
            tp: tp === undefined ? o.tp : tp,
          };
          // Pending = nothing is at risk yet: re-size the lots so the risk %
          // stays constant when the entry/SL distance changes. Once filled
          // (a Position) the sizing is locked in and never recalculated.
          if (entryPrice !== undefined || sl !== undefined) {
            const lots = lotsForRisk(
              state.balance,
              o.riskPct,
              next.entryPrice,
              next.sl,
              contractSize,
            );
            if (lots > 0) {
              next.lots = lots;
              next.riskUsd = Math.abs(next.entryPrice - next.sl) * lots * contractSize;
            }
          }
          return next;
        }),
      }),
    ),
    on(
      TradingActions.setTradeBoxHidden,
      (state, { id, hidden }): TradingState => ({
        ...state,
        history: state.history.map((t) => (t.id === id ? { ...t, boxHidden: hidden } : t)),
      }),
    ),
    on(
      TradingActions.deleteTradeBox,
      (state, { id }): TradingState => ({
        ...state,
        history: state.history.map((t) => (t.id === id ? { ...t, boxDeleted: true } : t)),
      }),
    ),
    on(
      TradingActions.cancelOrder,
      (state, { id }): TradingState => ({
        ...state,
        orders: state.orders.filter((o) => o.id !== id),
      }),
    ),
    on(TradingActions.closePosition, (state, { id, price, time, contractSize }): TradingState => {
      const position = state.positions.find((p) => p.id === id);
      if (!position) return state;
      // RFC-014 §2: the reducer owns the trading slice, so it reads its own
      // executionCosts and passes them to the engine explicitly (I-10) — the
      // action payload stays untouched (pre-existing effect specs assert it).
      // `?? undefined`: TradingState's field is required-but-nullable (NgRx
      // feature-state rule), the engine's optional arg is `T | undefined`.
      const trade = closeTrade(
        position,
        price,
        time,
        'manual',
        contractSize,
        false,
        state.executionCosts ?? undefined,
      );
      return {
        ...state,
        positions: state.positions.filter((p) => p.id !== id),
        history: [...state.history, trade],
        balance: state.balance + trade.profit,
      };
    }),
    on(
      TradingActions.processCandle,
      (state, { candle, subCandles, contractSize }): TradingState => {
        // No global time gate here: the engine guards per entity (orders only
        // fill after their createdAt, exits only from the position's openTime
        // on), so reprocessing a candle is idempotent. A global gate blocked
        // all fills after importing a session or stepping the replay back.
        const result = processCandle(
          state,
          candle,
          subCandles,
          contractSize,
          state.executionCosts ?? undefined,
        );
        if (!result.changed) {
          // RFC-014 §3: `changed` only covers fills/exits — a still-open
          // position's mae/mfe excursion accumulators can advance on a
          // candle where nothing fills or exits (the common case, almost
          // every candle). `excursionsMoved` tells us exactly that; adopt
          // the engine's updated `positions` array so the accumulators
          // survive in the real store, without touching anything else. With
          // NO open positions `excursionsMoved` is always false, so the
          // truly-idle path keeps today's single-field short-circuit — no
          // new array reference, no selector churn.
          if (result.excursionsMoved) {
            return { ...state, positions: result.book.positions, lastProcessedTime: candle.time };
          }
          return { ...state, lastProcessedTime: candle.time };
        }
        return { ...state, ...result.book, lastProcessedTime: candle.time };
      },
    ),
    on(TradingActions.endSession, (state, { price, time, contractSize }): TradingState => {
      const book = closeSession(state, price, time, contractSize, state.executionCosts ?? undefined);
      return { ...state, ...book, sessionEnded: true, summaryOpen: true };
    }),
    on(TradingActions.setInitialBalance, (state, { balance }): TradingState => {
      if (!(balance > 0)) return state;
      const realized = state.history.reduce((sum, t) => sum + t.profit, 0);
      return { ...state, initialBalance: balance, balance: balance + realized };
    }),
    on(TradingActions.setRiskPct, (state, { riskPct }): TradingState => {
      if (!(riskPct > 0)) return state;
      return { ...state, riskPct };
    }),
    on(
      TradingActions.setSessionEnd,
      (state, { time }): TradingState => ({ ...state, sessionEnd: time }),
    ),
    on(TradingActions.openSummary, (state): TradingState => ({ ...state, summaryOpen: true })),
    on(TradingActions.closeSummary, (state): TradingState => ({ ...state, summaryOpen: false })),
    // ---- sessions ----
    on(
      TradingActions.newSession,
      (state, { currentCursor }): TradingState => ({
        ...defaultTradingData(state.initialBalance),
        riskPct: state.riskPct,
        summaryOpen: false,
        savedSessions: archiveActive(state, currentCursor),
        // fresh blank session → fresh identity
        activeSessionId: newId(),
      }),
    ),
    on(
      TradingActions.setSessionName,
      (state, { name }): TradingState => ({ ...state, sessionName: name }),
    ),
    on(TradingActions.switchSession, (state, { id, currentCursor }): TradingState => {
      const target = state.savedSessions.find((s) => s.id === id);
      if (!target) return state;
      return {
        // defaults first: sessions saved by older versions may lack fields
        ...defaultTradingData(),
        ...target.trading,
        sessionName: target.name,
        summaryOpen: false,
        // outgoing active is archived under its own id (archiveActive reuses
        // state.activeSessionId); the restored session's id becomes active.
        savedSessions: archiveActive(state, currentCursor).filter((s) => s.id !== id),
        activeSessionId: id,
      };
    }),
    on(
      TradingActions.deleteSession,
      (state, { id }): TradingState => ({
        ...state,
        savedSessions: state.savedSessions.filter((s) => s.id !== id),
      }),
    ),
    on(
      TradingActions.deleteActiveSession,
      (state): TradingState => ({
        // reset the live session to a fresh empty one (NO archive); keep the
        // user's balance/risk prefs + the archived sessions, fresh identity.
        ...defaultTradingData(state.initialBalance),
        riskPct: state.riskPct,
        summaryOpen: false,
        savedSessions: state.savedSessions,
        activeSessionId: newId(),
      }),
    ),
    on(TradingActions.renameSession, (state, { id, name, clientUpdatedAt }): TradingState => {
      const trimmed = name.trim();
      if (!trimmed) return state;
      return {
        ...state,
        savedSessions: state.savedSessions.map((s) =>
          // the name also travels inside trading so it survives re-archiving;
          // stamp clientUpdatedAt so the edit is pushed on the next flush
          s.id === id
            ? {
                ...s,
                name: trimmed,
                trading: { ...s.trading, sessionName: trimmed },
                clientUpdatedAt,
              }
            : s,
        ),
      };
    }),
    on(
      TradingActions.setSessionFolder,
      (state, { id, folderId, clientUpdatedAt }): TradingState => {
        // id null = the active session (no savedSession stamp; markActiveDirty
        // handles the active path); otherwise an archived one — stamp its clock.
        if (id === null) return { ...state, folderId };
        return {
          ...state,
          savedSessions: state.savedSessions.map((s) =>
            s.id === id ? { ...s, trading: { ...s.trading, folderId }, clientUpdatedAt } : s,
          ),
        };
      },
    ),
    on(
      TradingActions.restoreSession,
      (state, { trading }): TradingState => ({
        // full replacement of the persistable slice (defaults-first so a session
        // saved by an older schema still hydrates every field), keeping the
        // transient UI flag and the workspace's archived sessions intact.
        ...defaultTradingData(),
        ...trading,
        summaryOpen: state.summaryOpen,
        savedSessions: state.savedSessions,
        // a `.session.json` import is a new live identity
        activeSessionId: newId(),
      }),
    ),
    on(TradingActions.sessionImported, (state, { trades, currentCursor }): TradingState => {
      const profit = trades.reduce((sum, t) => sum + t.profit, 0);
      const lastClose = trades.reduce((max, t) => Math.max(max, t.closeTime), 0);
      return {
        ...defaultTradingData(state.initialBalance),
        history: trades,
        balance: state.initialBalance + profit,
        sessionEnded: true,
        lastProcessedTime: 0,
        riskPct: state.riskPct,
        sessionName: `Importada · ${shortDate(lastClose)}`,
        summaryOpen: true,
        // outgoing active archived under its own id; the imported session is new
        savedSessions: archiveActive(state, currentCursor),
        activeSessionId: newId(),
      };
    }),
    // asset switch: each asset has its own independent trading session
    on(
      WorkspacesActions.workspaceRestored,
      (_state, { workspace }): TradingState => ({
        // defaults first: workspaces saved by older versions may lack fields
        ...defaultTradingData(),
        ...(workspace.trading ?? {}),
        summaryOpen: false,
        savedSessions: workspace.sessions ?? [],
        // restore the synced active id, or assign a fresh one for a new symbol
        activeSessionId: workspace.activeSessionId ?? newId(),
      }),
    ),
  ),
});
