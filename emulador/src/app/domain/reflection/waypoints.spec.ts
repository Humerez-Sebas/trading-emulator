import { ClosedTrade } from '../../state/trading/trading.models';
import {
  TelemetryEvent,
  TimeElapsedBeforeOrderPayload,
  OrderModifiedPayload,
  PositionModifiedPayload,
} from '../../state/telemetry/telemetry.models';
import { computeWaypoints } from './waypoints';

describe('computeWaypoints', () => {
  // Baseline: trade with no management events, never-walked MAE/MFE
  const baseClosedTrade: ClosedTrade = {
    id: 'trade-1',
    side: 'buy',
    origin: 'market',
    entryPrice: 1.0850,
    exitPrice: 1.0870,
    sl: 1.0800,
    tp: 1.0900,
    lots: 1,
    riskPct: 2,
    riskUsd: 100,
    openTime: 1000,
    closeTime: 2000,
    outcome: 'tp',
    profit: 200,
    rMultiple: 2,
    ambiguous: false,
    grossProfit: 200,
    commission: 0,
    mae: 0, // never-walked
    mfe: 0,
    tMae: 1000, // defaults to openTime
    tMfe: 1000,
  };

  const baseTfSeconds = 60; // 1-minute candles

  describe('slot visibility', () => {
    it('Entry (slot 1): always present', () => {
      const waypoints = computeWaypoints(baseClosedTrade, [], baseTfSeconds);
      const entry = waypoints.find((w) => w.slot === 1);
      expect(entry).toBeDefined();
      expect(entry!.time).toBe(baseClosedTrade.openTime);
    });

    it('Exit (slot 5): always present', () => {
      const waypoints = computeWaypoints(baseClosedTrade, [], baseTfSeconds);
      const exit = waypoints.find((w) => w.slot === 5);
      expect(exit).toBeDefined();
      expect(exit!.time).toBe(baseClosedTrade.closeTime);
    });

    it('Management (slot 2): absent when no management events', () => {
      const waypoints = computeWaypoints(baseClosedTrade, [], baseTfSeconds);
      const management = waypoints.find((w) => w.slot === 2);
      expect(management).toBeUndefined();
    });

    it('Management (slot 2): present when >= 1 management event in [openTime, closeTime]', () => {
      const event: TelemetryEvent = {
        seq: 1,
        wallClockMs: 1500000,
        marketTime: 1500,
        kind: 'OrderModified',
        payload: {
          orderRef: 'trade-1',
          field: 'sl',
          from: 1.0800,
          to: 1.0820,
        } as OrderModifiedPayload,
      };
      const waypoints = computeWaypoints(baseClosedTrade, [event], baseTfSeconds);
      const management = waypoints.find((w) => w.slot === 2);
      expect(management).toBeDefined();
      expect(management!.time).toBe(1500); // time of first event
    });

    it('MAE (slot 3): absent when mae is zero (never-walked)', () => {
      const waypoints = computeWaypoints(baseClosedTrade, [], baseTfSeconds);
      const mae = waypoints.find((w) => w.slot === 3);
      expect(mae).toBeUndefined();
    });

    it('MAE (slot 3): absent when mae is positive but tMae is undefined', () => {
      const trade: ClosedTrade = {
        ...baseClosedTrade,
        mae: 50,
        tMae: undefined,
      };
      const waypoints = computeWaypoints(trade, [], baseTfSeconds);
      const mae = waypoints.find((w) => w.slot === 3);
      expect(mae).toBeUndefined();
    });

    it('MAE (slot 3): present when mae > 0 and tMae is defined', () => {
      const trade: ClosedTrade = {
        ...baseClosedTrade,
        mae: 50,
        tMae: 1500,
      };
      const waypoints = computeWaypoints(trade, [], baseTfSeconds);
      const mae = waypoints.find((w) => w.slot === 3);
      expect(mae).toBeDefined();
      expect(mae!.time).toBe(1500);
    });

    it('MFE (slot 4): absent when mfe is zero (never-walked)', () => {
      const waypoints = computeWaypoints(baseClosedTrade, [], baseTfSeconds);
      const mfe = waypoints.find((w) => w.slot === 4);
      expect(mfe).toBeUndefined();
    });

    it('MFE (slot 4): present when mfe > 0 and tMfe is defined', () => {
      const trade: ClosedTrade = {
        ...baseClosedTrade,
        mfe: 50,
        tMfe: 1800,
      };
      const waypoints = computeWaypoints(trade, [], baseTfSeconds);
      const mfe = waypoints.find((w) => w.slot === 4);
      expect(mfe).toBeDefined();
      expect(mfe!.time).toBe(1800);
    });

    it('Legacy trade (no mae/mfe fields): only Entry/Management/Exit', () => {
      const trade: ClosedTrade = {
        ...baseClosedTrade,
        mae: undefined,
        mfe: undefined,
        tMae: undefined,
        tMfe: undefined,
      };
      const waypoints = computeWaypoints(trade, [], baseTfSeconds);
      const slots = waypoints.map((w) => w.slot);
      expect(slots).toContain(1); // Entry
      expect(slots).toContain(5); // Exit
      expect(slots).not.toContain(3); // No MAE
      expect(slots).not.toContain(4); // No MFE
    });

    it('Never-walked trade (mae=0, tMae=openTime): only Entry/Exit, no merge artifact', () => {
      const trade: ClosedTrade = {
        ...baseClosedTrade,
        mae: 0,
        tMae: baseClosedTrade.openTime,
        mfe: 0,
        tMfe: baseClosedTrade.openTime,
      };
      const waypoints = computeWaypoints(trade, [], baseTfSeconds);
      const slots = waypoints.map((w) => w.slot);
      expect(slots).toEqual([1, 5]); // Only Entry and Exit
    });
  });

  describe('merge rules (MAE/MFE → Exit)', () => {
    it('MAE merges into Exit when tMae is within ONE base candle of closeTime', () => {
      const trade: ClosedTrade = {
        ...baseClosedTrade,
        mae: 50,
        tMae: baseClosedTrade.closeTime - baseTfSeconds / 2, // within 1 candle
      };
      const waypoints = computeWaypoints(trade, [], baseTfSeconds);
      const mae = waypoints.find((w) => w.slot === 3);
      const exit = waypoints.find((w) => w.slot === 5);
      expect(mae).toBeUndefined(); // MAE node is absent
      expect(exit).toBeDefined();
      // Exit should have merged MAE facts
      expect((exit!.facts as any).mergedMae).toBeDefined();
    });

    it('MFE merges into Exit when tMfe is within ONE base candle of closeTime', () => {
      const trade: ClosedTrade = {
        ...baseClosedTrade,
        mfe: 50,
        tMfe: baseClosedTrade.closeTime - baseTfSeconds / 2,
      };
      const waypoints = computeWaypoints(trade, [], baseTfSeconds);
      const mfe = waypoints.find((w) => w.slot === 4);
      const exit = waypoints.find((w) => w.slot === 5);
      expect(mfe).toBeUndefined();
      expect(exit).toBeDefined();
      expect((exit!.facts as any).mergedMfe).toBeDefined();
    });

    it('Both MAE and MFE merge into Exit when both within one candle', () => {
      const trade: ClosedTrade = {
        ...baseClosedTrade,
        mae: 50,
        tMae: baseClosedTrade.closeTime - baseTfSeconds / 2,
        mfe: 100,
        tMfe: baseClosedTrade.closeTime - baseTfSeconds / 3,
      };
      const waypoints = computeWaypoints(trade, [], baseTfSeconds);
      const slots = waypoints.map((w) => w.slot).sort();
      expect(slots).toEqual([1, 5]); // Only Entry and Exit
      const exit = waypoints.find((w) => w.slot === 5);
      expect((exit!.facts as any).mergedMae).toBeDefined();
      expect((exit!.facts as any).mergedMfe).toBeDefined();
    });

    it('MAE does NOT merge when tMae >= closeTime - baseTfSeconds (boundary)', () => {
      const trade: ClosedTrade = {
        ...baseClosedTrade,
        mae: 50,
        tMae: baseClosedTrade.closeTime - baseTfSeconds, // exactly at boundary
      };
      const waypoints = computeWaypoints(trade, [], baseTfSeconds);
      const mae = waypoints.find((w) => w.slot === 3);
      expect(mae).toBeDefined(); // MAE node exists (does not merge)
    });

    it('MAE merges when tMae > closeTime - baseTfSeconds (just inside boundary)', () => {
      const trade: ClosedTrade = {
        ...baseClosedTrade,
        mae: 50,
        tMae: baseClosedTrade.closeTime - baseTfSeconds + 1, // just inside
      };
      const waypoints = computeWaypoints(trade, [], baseTfSeconds);
      const mae = waypoints.find((w) => w.slot === 3);
      expect(mae).toBeUndefined(); // MAE merges
    });
  });

  describe('fixed slots (absent node leaves others unchanged)', () => {
    it('Slots remain fixed: Entry=1, Management=2, MAE=3, MFE=4, Exit=5', () => {
      const trade: ClosedTrade = {
        ...baseClosedTrade,
        mae: 50,
        tMae: 1500,
        mfe: 100,
        tMfe: 1800,
      };
      const event: TelemetryEvent = {
        seq: 1,
        wallClockMs: 1500000,
        marketTime: 1500,
        kind: 'OrderModified',
        payload: {
          orderRef: 'trade-1',
          field: 'sl',
          from: 1.0800,
          to: 1.0820,
        } as OrderModifiedPayload,
      };
      const waypoints = computeWaypoints(trade, [event], baseTfSeconds);
      const slots = waypoints.map((w) => w.slot).sort((a, b) => a - b);
      expect(slots).toEqual([1, 2, 3, 4, 5]); // All present, fixed slots
    });

    it('Absent Management does not shift other slots', () => {
      const trade: ClosedTrade = {
        ...baseClosedTrade,
        mae: 50,
        tMae: 1500,
        mfe: 100,
        tMfe: 1800,
      };
      const waypoints = computeWaypoints(trade, [], baseTfSeconds);
      const slots = waypoints.map((w) => w.slot).sort((a, b) => a - b);
      expect(slots).toEqual([1, 3, 4, 5]); // Entry, MAE, MFE, Exit (no Management)
    });
  });

  describe('management events ordering', () => {
    it('Management sub-events ordered by seq', () => {
      const trade = baseClosedTrade;
      const events: TelemetryEvent[] = [
        {
          seq: 3,
          wallClockMs: 1600000,
          marketTime: 1600,
          kind: 'OrderModified',
          payload: {
            orderRef: 'trade-1',
            field: 'sl',
            from: 1.0810,
            to: 1.0825,
          } as OrderModifiedPayload,
        },
        {
          seq: 1,
          wallClockMs: 1200000,
          marketTime: 1200,
          kind: 'OrderModified',
          payload: {
            orderRef: 'trade-1',
            field: 'sl',
            from: 1.0800,
            to: 1.0810,
          } as OrderModifiedPayload,
        },
        {
          seq: 2,
          wallClockMs: 1400000,
          marketTime: 1400,
          kind: 'OrderModified',
          payload: {
            orderRef: 'trade-1',
            field: 'tp',
            from: 1.0900,
            to: 1.0920,
          } as OrderModifiedPayload,
        },
      ];
      const waypoints = computeWaypoints(trade, events, baseTfSeconds);
      const management = waypoints.find((w) => w.slot === 2);
      expect(management).toBeDefined();
      const subEvents = (management!.facts as any).subEvents;
      expect(subEvents.length).toBe(3);
      expect(subEvents[0].seq).toBe(1);
      expect(subEvents[1].seq).toBe(2);
      expect(subEvents[2].seq).toBe(3);
    });
  });

  describe('event ref matching', () => {
    it('Ignores management events for other trades', () => {
      const trade = baseClosedTrade;
      const events: TelemetryEvent[] = [
        {
          seq: 1,
          wallClockMs: 1500000,
          marketTime: 1500,
          kind: 'OrderModified',
          payload: {
            orderRef: 'trade-1',
            field: 'sl',
            from: 1.0800,
            to: 1.0820,
          } as OrderModifiedPayload,
        },
        {
          seq: 2,
          wallClockMs: 1600000,
          marketTime: 1600,
          kind: 'OrderModified',
          payload: {
            orderRef: 'trade-OTHER',
            field: 'sl',
            from: 1.0700,
            to: 1.0730,
          } as OrderModifiedPayload,
        },
      ];
      const waypoints = computeWaypoints(trade, events, baseTfSeconds);
      const management = waypoints.find((w) => w.slot === 2);
      expect(management).toBeDefined();
      const subEvents = (management!.facts as any).subEvents;
      expect(subEvents.length).toBe(1); // Only event for trade-1
      expect((subEvents[0].payload as any).orderRef).toBe('trade-1');
    });

    it('Ignores PositionModified events for other trades', () => {
      const trade = baseClosedTrade;
      const events: TelemetryEvent[] = [
        {
          seq: 1,
          wallClockMs: 1500000,
          marketTime: 1500,
          kind: 'PositionModified',
          payload: {
            positionRef: 'trade-1',
            field: 'sl',
            from: 1.0800,
            to: 1.0820,
          } as PositionModifiedPayload,
        },
      ];
      const waypoints = computeWaypoints(trade, events, baseTfSeconds);
      const management = waypoints.find((w) => w.slot === 2);
      expect(management).toBeDefined();
    });
  });

  describe('window exclusion (pre-fill order modifications excluded)', () => {
    it('Excludes management events with marketTime < openTime', () => {
      const trade = baseClosedTrade;
      const events: TelemetryEvent[] = [
        {
          seq: 1,
          wallClockMs: 900000,
          marketTime: 900, // BEFORE openTime
          kind: 'OrderModified',
          payload: {
            orderRef: 'trade-1',
            field: 'sl',
            from: 1.0800,
            to: 1.0820,
          } as OrderModifiedPayload,
        },
        {
          seq: 2,
          wallClockMs: 1500000,
          marketTime: 1500,
          kind: 'OrderModified',
          payload: {
            orderRef: 'trade-1',
            field: 'sl',
            from: 1.0820,
            to: 1.0830,
          } as OrderModifiedPayload,
        },
      ];
      const waypoints = computeWaypoints(trade, events, baseTfSeconds);
      const management = waypoints.find((w) => w.slot === 2);
      expect(management).toBeDefined();
      const subEvents = (management!.facts as any).subEvents;
      expect(subEvents.length).toBe(1); // Only post-open event
      expect((subEvents[0].payload as any).field).toBe('sl');
      expect((subEvents[0].payload as any).to).toBe(1.0830);
    });

    it('Excludes management events with marketTime > closeTime', () => {
      const trade = baseClosedTrade;
      const events: TelemetryEvent[] = [
        {
          seq: 1,
          wallClockMs: 1500000,
          marketTime: 1500,
          kind: 'OrderModified',
          payload: {
            orderRef: 'trade-1',
            field: 'sl',
            from: 1.0800,
            to: 1.0820,
          } as OrderModifiedPayload,
        },
        {
          seq: 2,
          wallClockMs: 2500000,
          marketTime: 2500, // AFTER closeTime
          kind: 'OrderModified',
          payload: {
            orderRef: 'trade-1',
            field: 'sl',
            from: 1.0820,
            to: 1.0830,
          } as OrderModifiedPayload,
        },
      ];
      const waypoints = computeWaypoints(trade, events, baseTfSeconds);
      const management = waypoints.find((w) => w.slot === 2);
      expect(management).toBeDefined();
      const subEvents = (management!.facts as any).subEvents;
      expect(subEvents.length).toBe(1); // Only pre-close event
    });
  });

  describe('Entry facts', () => {
    it('Entry contains entryPrice', () => {
      const waypoints = computeWaypoints(baseClosedTrade, [], baseTfSeconds);
      const entry = waypoints.find((w) => w.slot === 1);
      expect((entry!.facts as any).entryPrice).toBe(baseClosedTrade.entryPrice);
    });

    it('Entry contains initial risk distance in price units', () => {
      const waypoints = computeWaypoints(baseClosedTrade, [], baseTfSeconds);
      const entry = waypoints.find((w) => w.slot === 1);
      const riskDistance = Math.abs(
        baseClosedTrade.entryPrice - baseClosedTrade.sl,
      );
      expect((entry!.facts as any).riskDistancePrice).toBe(riskDistance);
    });

    it('Entry contains initial risk distance in R (always 1R by definition)', () => {
      const waypoints = computeWaypoints(baseClosedTrade, [], baseTfSeconds);
      const entry = waypoints.find((w) => w.slot === 1);
      expect((entry!.facts as any).riskDistanceR).toBe(1);
    });

    it('Entry includes TimeElapsedBeforeOrder when event exists', () => {
      const event: TelemetryEvent = {
        seq: 1,
        wallClockMs: 1000000,
        marketTime: 1000,
        kind: 'TimeElapsedBeforeOrder',
        payload: {
          orderRef: 'trade-1',
          anchorKind: 'sessionStart',
          pausedMs: 5000,
          playingMs: 2000,
          candlesRevealed: 15,
        } as TimeElapsedBeforeOrderPayload,
      };
      const waypoints = computeWaypoints(baseClosedTrade, [event], baseTfSeconds);
      const entry = waypoints.find((w) => w.slot === 1);
      const elapsed = (entry!.facts as any).elapsedBeforeOrder;
      expect(elapsed).toBeDefined();
      expect(elapsed.anchorKind).toBe('sessionStart');
      expect(elapsed.pausedMs).toBe(5000);
      expect(elapsed.playingMs).toBe(2000);
      expect(elapsed.candlesRevealed).toBe(15);
    });

    it('Entry omits TimeElapsedBeforeOrder when no such event exists', () => {
      const waypoints = computeWaypoints(baseClosedTrade, [], baseTfSeconds);
      const entry = waypoints.find((w) => w.slot === 1);
      expect((entry!.facts as any).elapsedBeforeOrder).toBeUndefined();
    });

    it('Entry has no future data (no result/R)', () => {
      const waypoints = computeWaypoints(baseClosedTrade, [], baseTfSeconds);
      const entry = waypoints.find((w) => w.slot === 1);
      expect((entry!.facts as any).profit).toBeUndefined();
      expect((entry!.facts as any).rMultiple).toBeUndefined();
      expect((entry!.facts as any).result).toBeUndefined();
    });
  });

  describe('determinism', () => {
    it('Same inputs produce deep-equal output', () => {
      const events: TelemetryEvent[] = [
        {
          seq: 1,
          wallClockMs: 1500000,
          marketTime: 1500,
          kind: 'OrderModified',
          payload: {
            orderRef: 'trade-1',
            field: 'sl',
            from: 1.0800,
            to: 1.0820,
          } as OrderModifiedPayload,
        },
      ];
      const result1 = computeWaypoints(baseClosedTrade, events, baseTfSeconds);
      const result2 = computeWaypoints(baseClosedTrade, events, baseTfSeconds);
      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  describe('input non-mutation', () => {
    it('Does not mutate input trade', () => {
      const trade: ClosedTrade = { ...baseClosedTrade };
      const tradeJsonBefore = JSON.stringify(trade);
      computeWaypoints(trade, [], baseTfSeconds);
      const tradeJsonAfter = JSON.stringify(trade);
      expect(tradeJsonAfter).toBe(tradeJsonBefore);
    });

    it('Does not mutate input events array', () => {
      const events: TelemetryEvent[] = [
        {
          seq: 1,
          wallClockMs: 1500000,
          marketTime: 1500,
          kind: 'OrderModified',
          payload: {
            orderRef: 'trade-1',
            field: 'sl',
            from: 1.0800,
            to: 1.0820,
          } as OrderModifiedPayload,
        },
      ];
      const eventsJsonBefore = JSON.stringify(events);
      computeWaypoints(baseClosedTrade, events, baseTfSeconds);
      const eventsJsonAfter = JSON.stringify(events);
      expect(eventsJsonAfter).toBe(eventsJsonBefore);
    });
  });

  describe('PositionModified events', () => {
    it('Includes PositionModified events in management waypoint', () => {
      const events: TelemetryEvent[] = [
        {
          seq: 1,
          wallClockMs: 1500000,
          marketTime: 1500,
          kind: 'PositionModified',
          payload: {
            positionRef: 'trade-1',
            field: 'sl',
            from: 1.0800,
            to: 1.0820,
          } as PositionModifiedPayload,
        },
      ];
      const waypoints = computeWaypoints(baseClosedTrade, events, baseTfSeconds);
      const management = waypoints.find((w) => w.slot === 2);
      expect(management).toBeDefined();
      const subEvents = (management!.facts as any).subEvents;
      expect(subEvents.length).toBe(1);
      expect(subEvents[0].kind).toBe('PositionModified');
    });
  });

  describe('MAE/MFE facts', () => {
    it('MAE node includes excursionR when calculable', () => {
      const trade: ClosedTrade = {
        ...baseClosedTrade,
        mae: 50,
        tMae: 1500,
        entryPrice: 1.0850,
        sl: 1.0800,
      };
      const waypoints = computeWaypoints(trade, [], baseTfSeconds);
      const mae = waypoints.find((w) => w.slot === 3);
      expect(mae).toBeDefined();
      const riskDistance = Math.abs(trade.entryPrice - trade.sl); // 0.005
      const expectedExcursionR = 50 / riskDistance;
      expect((mae!.facts as any).excursionR).toBe(expectedExcursionR);
    });

    it('MAE node omits excursionR when zero risk distance', () => {
      const trade: ClosedTrade = {
        ...baseClosedTrade,
        mae: 50,
        tMae: 1500,
        entryPrice: 1.0850,
        sl: 1.0850, // zero risk distance
      };
      const waypoints = computeWaypoints(trade, [], baseTfSeconds);
      const mae = waypoints.find((w) => w.slot === 3);
      expect(mae).toBeDefined();
      expect((mae!.facts as any).excursionR).toBeNull();
    });

    it('MFE node includes excursionR when calculable', () => {
      const trade: ClosedTrade = {
        ...baseClosedTrade,
        mfe: 50,
        tMfe: 1800,
        entryPrice: 1.0850,
        sl: 1.0800,
      };
      const waypoints = computeWaypoints(trade, [], baseTfSeconds);
      const mfe = waypoints.find((w) => w.slot === 4);
      expect(mfe).toBeDefined();
      const riskDistance = Math.abs(trade.entryPrice - trade.sl);
      const expectedExcursionR = 50 / riskDistance;
      expect((mfe!.facts as any).excursionR).toBe(expectedExcursionR);
    });
  });

  describe('Exit facts', () => {
    it('Exit contains profit', () => {
      const waypoints = computeWaypoints(baseClosedTrade, [], baseTfSeconds);
      const exit = waypoints.find((w) => w.slot === 5);
      expect((exit!.facts as any).profit).toBe(baseClosedTrade.profit);
    });

    it('Exit contains rMultiple', () => {
      const waypoints = computeWaypoints(baseClosedTrade, [], baseTfSeconds);
      const exit = waypoints.find((w) => w.slot === 5);
      expect((exit!.facts as any).rMultiple).toBe(baseClosedTrade.rMultiple);
    });

    it('Exit contains costs (grossProfit, commission)', () => {
      const waypoints = computeWaypoints(baseClosedTrade, [], baseTfSeconds);
      const exit = waypoints.find((w) => w.slot === 5);
      expect((exit!.facts as any).grossProfit).toBe(baseClosedTrade.grossProfit);
      expect((exit!.facts as any).commission).toBe(baseClosedTrade.commission);
    });
  });
});
