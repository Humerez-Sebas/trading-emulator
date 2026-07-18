import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subscription, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TelemetryEffects } from './telemetry.effects';
import {
  selectCurrentTime,
  selectExecutionSeries,
  selectPlaying,
  selectReplayIndex,
} from '../selectors';
import { tradingFeature } from '../trading/trading.reducer';
import {
  defaultTradingData,
  TradingState,
  Position,
  PendingOrder,
} from '../trading/trading.models';
import { drawingsFeature } from '../drawings/drawings.reducer';
import { TelemetryDbService } from '../../services/telemetry-db.service';

/**
 * Management events (RFC-016 §1, Task 1 Part A): `OrderModified`/
 * `PositionModified`, derived from state-diffing the SAME `tradingPairs$`
 * stream `facts$`/`orderPlacement$` already share (see `diffManagementEvents`
 * in `telemetry-facts.ts`). New spec file — the six pre-existing telemetry
 * specs are untouched (STOP rule).
 */
describe('TelemetryEffects — management events (RFC-016 T1, §1)', () => {
  let actions$: Subject<any>;
  let store: MockStore;
  let effects: TelemetryEffects;
  let telemetryDb: { append: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    actions$ = new Subject();
    telemetryDb = { append: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({
      providers: [
        TelemetryEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        { provide: TelemetryDbService, useValue: telemetryDb },
      ],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(TelemetryEffects);
  });

  afterEach(() => {
    store.resetSelectors();
    vi.restoreAllMocks();
  });

  function subscribeAll(): Subscription {
    const sub = new Subscription();
    sub.add(effects.managementEvents$.subscribe());
    return sub;
  }

  function trading(over: Partial<TradingState> = {}): TradingState {
    return {
      ...defaultTradingData(),
      summaryOpen: false,
      savedSessions: [],
      activeSessionId: 'sess-1',
      ...over,
    };
  }

  function arm(state: TradingState, opts: { currentTime?: number } = {}) {
    store.overrideSelector(tradingFeature.selectTradingState, state);
    store.overrideSelector(tradingFeature.selectActiveSessionId, state.activeSessionId);
    store.overrideSelector(selectExecutionSeries, null);
    store.overrideSelector(selectReplayIndex, 0);
    store.overrideSelector(selectCurrentTime, opts.currentTime ?? 0);
    store.overrideSelector(selectPlaying, false);
    store.overrideSelector(drawingsFeature.selectItems, []);
    store.refreshState();
  }

  const pos = (over: Partial<Position> = {}): Position => ({
    id: 'p1',
    side: 'buy',
    entryPrice: 100,
    sl: 90,
    tp: 120,
    lots: 1,
    riskPct: 1,
    riskUsd: 10,
    openTime: 1000,
    origin: 'market',
    ...over,
  });

  const order = (over: Partial<PendingOrder> = {}): PendingOrder => ({
    id: 'o1',
    side: 'buy',
    type: 'limit',
    entryPrice: 100,
    sl: 90,
    tp: 120,
    lots: 1,
    riskPct: 1,
    riskUsd: 10,
    createdAt: 500,
    ...over,
  });

  type AppendCall = [string, { kind: string; payload: any; marketTime?: number | null }[]];
  const calls = (kind: string): AppendCall[] =>
    (telemetryDb.append.mock.calls as AppendCall[]).filter(([, events]) =>
      events.some((e) => e.kind === kind),
    );

  // ─── OrderModified ──────────────────────────────────────────────────────

  describe('OrderModified', () => {
    it('a sl change emits OrderModified(field: sl, from, to)', async () => {
      arm(trading({ orders: [order({ id: 'o1', sl: 90 })] }));
      const sub = subscribeAll();

      arm(trading({ orders: [order({ id: 'o1', sl: 85 })] }));
      await Promise.resolve();

      expect(calls('OrderModified')).toHaveLength(1);
      expect(telemetryDb.append).toHaveBeenCalledWith('sess-1', [
        expect.objectContaining({
          kind: 'OrderModified',
          payload: { orderRef: 'o1', field: 'sl', from: 90, to: 85 },
        }),
      ]);
      sub.unsubscribe();
    });

    it('a single change touching sl AND tp emits TWO OrderModified events, one per field', async () => {
      arm(trading({ orders: [order({ id: 'o1', sl: 90, tp: 120 })] }));
      const sub = subscribeAll();

      arm(trading({ orders: [order({ id: 'o1', sl: 85, tp: 130 })] }));
      await Promise.resolve();

      expect(calls('OrderModified')).toHaveLength(2);
      const payloads = calls('OrderModified').map(([, events]) => events[0].payload);
      expect(payloads).toEqual(
        expect.arrayContaining([
          { orderRef: 'o1', field: 'sl', from: 90, to: 85 },
          { orderRef: 'o1', field: 'tp', from: 120, to: 130 },
        ]),
      );
      sub.unsubscribe();
    });

    it('an entryPrice change emits OrderModified(field: entry)', async () => {
      arm(trading({ orders: [order({ id: 'o1', entryPrice: 100 })] }));
      const sub = subscribeAll();

      arm(trading({ orders: [order({ id: 'o1', entryPrice: 105 })] }));
      await Promise.resolve();

      expect(calls('OrderModified')).toHaveLength(1);
      expect(calls('OrderModified')[0][1][0].payload).toEqual({
        orderRef: 'o1',
        field: 'entry',
        from: 100,
        to: 105,
      });
      sub.unsubscribe();
    });

    it('tp cleared (number -> null) emits OrderModified(field: tp, to: null)', async () => {
      arm(trading({ orders: [order({ id: 'o1', tp: 120 })] }));
      const sub = subscribeAll();

      arm(trading({ orders: [order({ id: 'o1', tp: null })] }));
      await Promise.resolve();

      expect(calls('OrderModified')[0][1][0].payload).toEqual({
        orderRef: 'o1',
        field: 'tp',
        from: 120,
        to: null,
      });
      sub.unsubscribe();
    });

    it('re-sizing side effects (lots/riskUsd) alone do NOT emit an OrderModified', async () => {
      arm(trading({ orders: [order({ id: 'o1', lots: 1, riskUsd: 10 })] }));
      const sub = subscribeAll();

      arm(trading({ orders: [order({ id: 'o1', lots: 2, riskUsd: 20 })] }));
      await Promise.resolve();

      expect(calls('OrderModified')).toHaveLength(0);
      sub.unsubscribe();
    });

    it('a REJECTED modification (new array, same field values — the modifyOrder .map() idiom on a rejected geometry) emits NOTHING', async () => {
      arm(trading({ orders: [order({ id: 'o1', sl: 90, entryPrice: 100 })] }));
      const sub = subscribeAll();

      // Same sl/tp/entryPrice VALUES, but a brand-new order object — exactly
      // what trading.reducer.ts's modifyOrder produces when
      // validateOrderGeometry rejects the change (returns the entity
      // unchanged for that id, but .map() still allocates a new array).
      arm(trading({ orders: [order({ id: 'o1', sl: 90, entryPrice: 100 })] }));
      await Promise.resolve();

      expect(calls('OrderModified')).toHaveLength(0);
      sub.unsubscribe();
    });
  });

  // ─── PositionModified ───────────────────────────────────────────────────

  describe('PositionModified', () => {
    it('a sl change emits PositionModified(field: sl, from, to)', async () => {
      arm(trading({ positions: [pos({ id: 'p1', sl: 90 })] }));
      const sub = subscribeAll();

      arm(trading({ positions: [pos({ id: 'p1', sl: 95 })] }));
      await Promise.resolve();

      expect(calls('PositionModified')).toHaveLength(1);
      expect(calls('PositionModified')[0][1][0].payload).toEqual({
        positionRef: 'p1',
        field: 'sl',
        from: 90,
        to: 95,
      });
      sub.unsubscribe();
    });

    it('tp set (null -> number) emits PositionModified(field: tp)', async () => {
      arm(trading({ positions: [pos({ id: 'p1', tp: null })] }));
      const sub = subscribeAll();

      arm(trading({ positions: [pos({ id: 'p1', tp: 130 })] }));
      await Promise.resolve();

      expect(calls('PositionModified')[0][1][0].payload).toEqual({
        positionRef: 'p1',
        field: 'tp',
        from: null,
        to: 130,
      });
      sub.unsubscribe();
    });

    it('a REJECTED sl widen (I-15, new object with unchanged sl value) emits nothing for sl, but a genuinely changed tp alongside it still emits (apply-the-valid-part idiom)', async () => {
      arm(trading({ positions: [pos({ id: 'p1', sl: 90, tp: 120 })] }));
      const sub = subscribeAll();

      // sl unchanged (rejected widen), tp genuinely moved — mirrors
      // trading.reducer.ts's modifyPosition "apply-the-valid-part" idiom
      // (always a NEW object via spread, even on sl rejection).
      arm(trading({ positions: [pos({ id: 'p1', sl: 90, tp: 140 })] }));
      await Promise.resolve();

      expect(calls('PositionModified')).toHaveLength(1);
      expect(calls('PositionModified')[0][1][0].payload).toEqual({
        positionRef: 'p1',
        field: 'tp',
        from: 120,
        to: 140,
      });
      sub.unsubscribe();
    });

    it('MAE/MFE accumulator churn alone does NOT emit a PositionModified', async () => {
      arm(trading({ positions: [pos({ id: 'p1', mae: 1, mfe: 2 })] }));
      const sub = subscribeAll();

      arm(trading({ positions: [pos({ id: 'p1', mae: 5, mfe: 8 })] }));
      await Promise.resolve();

      expect(calls('PositionModified')).toHaveLength(0);
      sub.unsubscribe();
    });
  });

  // ─── cross-cutting ──────────────────────────────────────────────────────

  describe('cross-cutting', () => {
    it('a fill (new position id, not present in the previous snapshot) does NOT emit a management event', async () => {
      arm(trading());
      const sub = subscribeAll();

      arm(trading({ positions: [pos({ id: 'p1', origin: 'limit' })] }));
      await Promise.resolve();

      expect(telemetryDb.append).not.toHaveBeenCalled();
      sub.unsubscribe();
    });

    it('a close (position id removed) does NOT emit a management event by itself', async () => {
      arm(trading({ positions: [pos({ id: 'p1' })] }));
      const sub = subscribeAll();

      arm(trading({ positions: [] }));
      await Promise.resolve();

      expect(calls('OrderModified')).toHaveLength(0);
      expect(calls('PositionModified')).toHaveLength(0);
      sub.unsubscribe();
    });

    it('marketTime is the CURRENT replay time (selectCurrentTime), not any per-entity historical timestamp', async () => {
      arm(trading({ positions: [pos({ id: 'p1', sl: 90 })] }), { currentTime: 4242 });
      const sub = subscribeAll();

      arm(trading({ positions: [pos({ id: 'p1', sl: 95 })] }), { currentTime: 4242 });
      await Promise.resolve();

      expect(calls('PositionModified')[0][1][0].marketTime).toBe(4242);
      sub.unsubscribe();
    });

    it('payload carries ONLY {positionRef, field, from, to} — no direction/judgment field (N-1)', async () => {
      arm(trading({ positions: [pos({ id: 'p1', sl: 90 })] }));
      const sub = subscribeAll();

      // tightening for a buy — direction (tighten/widen) must NEVER be stored.
      arm(trading({ positions: [pos({ id: 'p1', sl: 92 })] }));
      await Promise.resolve();

      const payload = calls('PositionModified')[0][1][0].payload;
      expect(Object.keys(payload).sort()).toEqual(['field', 'from', 'positionRef', 'to']);
      sub.unsubscribe();
    });

    it('payload carries ONLY {orderRef, field, from, to} for orders', async () => {
      arm(trading({ orders: [order({ id: 'o1', sl: 90 })] }));
      const sub = subscribeAll();

      arm(trading({ orders: [order({ id: 'o1', sl: 88 })] }));
      await Promise.resolve();

      const payload = calls('OrderModified')[0][1][0].payload;
      expect(Object.keys(payload).sort()).toEqual(['field', 'from', 'orderRef', 'to']);
      sub.unsubscribe();
    });

    it('a session switch emits nothing spurious for the incoming session (baseline resets)', async () => {
      arm(trading({ activeSessionId: 'sess-1', positions: [pos({ id: 'p1', sl: 90 })] }));
      const sub = subscribeAll();

      arm(trading({ activeSessionId: 'sess-2', positions: [pos({ id: 'p1', sl: 200 })] }));
      await Promise.resolve();

      expect(telemetryDb.append).not.toHaveBeenCalled();
      sub.unsubscribe();
    });

    it('does not capture when there is no active session', async () => {
      arm(trading({ activeSessionId: null, positions: [pos({ id: 'p1', sl: 90 })] }));
      const sub = subscribeAll();

      arm(trading({ activeSessionId: null, positions: [pos({ id: 'p1', sl: 95 })] }));
      await Promise.resolve();

      expect(telemetryDb.append).not.toHaveBeenCalled();
      sub.unsubscribe();
    });
  });

  // ─── passivity ──────────────────────────────────────────────────────────

  describe('passivity', () => {
    it('never dispatches an action for a management event', async () => {
      arm(trading({ positions: [pos({ id: 'p1', sl: 90 })] }));
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const sub = subscribeAll();

      arm(trading({ positions: [pos({ id: 'p1', sl: 95 })] }));
      await Promise.resolve();

      expect(dispatchSpy).not.toHaveBeenCalled();
      sub.unsubscribe();
    });
  });
});
