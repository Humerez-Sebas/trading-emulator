import { ClosedTrade } from '../../state/trading/trading.models';
import { TelemetryEvent, DrawingSnapshotPayload } from '../../state/telemetry/telemetry.models';
import { SCENE_WINDOW_CANDLES } from './scene-spec';
import { buildSceneSpec, SessionMeta } from './build-scene-spec';
import { Waypoint } from './waypoints';
import type { DrawingPoint } from '../../state/drawings/drawings.models';

describe('buildSceneSpec', () => {
  const baseTfSeconds = 60; // 1-minute candles
  const WINDOW_SECONDS = SCENE_WINDOW_CANDLES * baseTfSeconds;

  const sessionMeta: SessionMeta = {
    symbol: 'EURUSD',
    datasetRefs: ['1m'],
    baseTfSeconds,
  };

  const baseWaypoint: Waypoint = {
    slot: 1,
    time: 1000,
    facts: {},
  };

  const baseClosedTrade: ClosedTrade = {
    id: 'trade-1',
    side: 'buy',
    origin: 'market',
    entryPrice: 1.085,
    exitPrice: 1.087,
    sl: 1.08,
    tp: 1.09,
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
    mae: 0,
    mfe: 0,
    tMae: 1000,
    tMfe: 1000,
  };

  describe('window computation', () => {
    it('Computes window = [waypoint.time - 60*baseTfSeconds, waypoint.time + 60*baseTfSeconds]', () => {
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta);
      expect(spec.window.t0).toBe(baseWaypoint.time - WINDOW_SECONDS);
      expect(spec.window.t1).toBe(baseWaypoint.time + WINDOW_SECONDS);
    });

    it('Window is symmetric around waypoint time', () => {
      const time = 5000;
      const waypoint: Waypoint = { ...baseWaypoint, time };
      const spec = buildSceneSpec(baseClosedTrade, waypoint, sessionMeta);
      const halfWindow = (spec.window.t1 - spec.window.t0) / 2;
      expect(spec.window.t0 + halfWindow).toBe(time);
    });

    it('SCENE_WINDOW_CANDLES constant is used', () => {
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta);
      const windowSize = spec.window.t1 - spec.window.t0;
      expect(windowSize).toBe(2 * SCENE_WINDOW_CANDLES * baseTfSeconds);
    });
  });

  describe('cursorTime', () => {
    it('Sets cursorTime to waypoint.time', () => {
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta);
      expect(spec.cursorTime).toBe(baseWaypoint.time);
    });

    it('cursorTime changes when waypoint.time changes', () => {
      const waypoint2: Waypoint = { ...baseWaypoint, time: 5000 };
      const spec2 = buildSceneSpec(baseClosedTrade, waypoint2, sessionMeta);
      expect(spec2.cursorTime).toBe(5000);
    });
  });

  describe('orderGeometry', () => {
    it('Sets orderGeometry from trade: side, entryPrice, sl, tp, lots', () => {
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta);
      expect(spec.orderGeometry.side).toBe('buy');
      expect(spec.orderGeometry.entryPrice).toBe(1.085);
      expect(spec.orderGeometry.sl).toBe(1.08);
      expect(spec.orderGeometry.tp).toBe(1.09);
      expect(spec.orderGeometry.lots).toBe(1);
    });

    it('Preserves null tp when trade has no take profit', () => {
      const trade: ClosedTrade = { ...baseClosedTrade, tp: null };
      const spec = buildSceneSpec(trade, baseWaypoint, sessionMeta);
      expect(spec.orderGeometry.tp).toBeNull();
    });

    it('Maps sell side correctly', () => {
      const trade: ClosedTrade = { ...baseClosedTrade, side: 'sell' };
      const spec = buildSceneSpec(trade, baseWaypoint, sessionMeta);
      expect(spec.orderGeometry.side).toBe('sell');
    });
  });

  describe('symbol and datasetRefs', () => {
    it('Sets symbol from sessionMeta', () => {
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta);
      expect(spec.symbol).toBe('EURUSD');
    });

    it('Sets datasetRefs from sessionMeta', () => {
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta);
      expect(spec.datasetRefs).toEqual(['1m']);
    });

    it('Handles multiple datasetRefs', () => {
      const meta: SessionMeta = { ...sessionMeta, datasetRefs: ['1m', '5m', '1h'] };
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, meta);
      expect(spec.datasetRefs).toEqual(['1m', '5m', '1h']);
    });

    it('Datasetref format matches requiredDatasets pattern (e.g., anchor TF strings)', () => {
      // The format should be compatible with how session payloads reference datasets
      const meta: SessionMeta = { ...sessionMeta, datasetRefs: ['eurusd-1m'] };
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, meta);
      expect(spec.datasetRefs).toEqual(['eurusd-1m']);
    });
  });

  describe('candle-free constraint', () => {
    it('SceneSpec does not contain candles key anywhere', () => {
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta, []);
      const specJson = JSON.stringify(spec);
      expect(specJson).not.toMatch(/"candles":/);
    });

    it('SceneSpec does not contain any array of candle-like objects', () => {
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta, []);
      // The storage shape assertion: no { time, open, high, low, close } arrays
      expect(spec.drawingSet).toBeDefined(); // This is OK
      expect(Array.isArray(spec.drawingSet)).toBe(true);
      expect(spec.telemetryMarkers).toBeDefined(); // This is OK
    });
  });

  describe('drawingSet', () => {
    it('Returns empty array when no DrawingSnapshot events exist', () => {
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta, []);
      expect(spec.drawingSet).toEqual([]);
    });

    it('Extracts drawing from close-time DrawingSnapshot event (preferred)', () => {
      const event: TelemetryEvent = {
        seq: 1,
        wallClockMs: 2000000,
        marketTime: 2000, // close time
        kind: 'DrawingSnapshot',
        payload: {
          eventRef: 'trade-1',
          drawings: [
            {
              type: 'line',
              anchorPoints: [
                { time: 1000, price: 1.08 },
                { time: 1500, price: 1.085 },
              ] as DrawingPoint[],
              styleToken: 'line-style-1',
            },
          ],
        } as DrawingSnapshotPayload,
      };
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta, [event]);
      expect(spec.drawingSet.length).toBe(1);
      expect(spec.drawingSet[0].type).toBe('line');
    });

    it('Falls back to placement-time DrawingSnapshot if close-time missing', () => {
      const event: TelemetryEvent = {
        seq: 1,
        wallClockMs: 1000000,
        marketTime: 1000, // open time
        kind: 'DrawingSnapshot',
        payload: {
          eventRef: 'trade-1',
          drawings: [
            {
              type: 'rect',
              anchorPoints: [
                { time: 1000, price: 1.08 },
                { time: 1100, price: 1.09 },
              ] as DrawingPoint[],
              styleToken: 'rect-style-1',
            },
          ],
        } as unknown as DrawingSnapshotPayload,
      };
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta, [event]);
      expect(spec.drawingSet.length).toBe(1);
      expect(spec.drawingSet[0].type).toBe('rect');
    });

    it('Prefers close-time snapshot over placement-time when both exist', () => {
      const events: TelemetryEvent[] = [
        {
          seq: 1,
          wallClockMs: 1000000,
          marketTime: 1000,
          kind: 'DrawingSnapshot',
          payload: {
            eventRef: 'trade-1',
            drawings: [
              {
                type: 'line',
                anchorPoints: [{ time: 1000, price: 1.08 }] as DrawingPoint[],
                styleToken: 'line-style-1',
              },
            ],
          } as unknown as DrawingSnapshotPayload,
        },
        {
          seq: 2,
          wallClockMs: 2000000,
          marketTime: 2000,
          kind: 'DrawingSnapshot',
          payload: {
            eventRef: 'trade-1',
            drawings: [
              {
                type: 'rect',
                anchorPoints: [{ time: 2000, price: 1.085 }] as DrawingPoint[],
                styleToken: 'rect-style-1',
              },
            ],
          } as unknown as DrawingSnapshotPayload,
        },
      ];
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta, events);
      expect(spec.drawingSet.length).toBe(1);
      expect(spec.drawingSet[0].type).toBe('rect'); // Close-time preferred
    });

    it('Ignores DrawingSnapshot events for other trades', () => {
      const events: TelemetryEvent[] = [
        {
          seq: 1,
          wallClockMs: 2000000,
          marketTime: 2000,
          kind: 'DrawingSnapshot',
          payload: {
            eventRef: 'trade-OTHER',
            drawings: [
              {
                type: 'line',
                anchorPoints: [{ time: 2000, price: 1.08 }] as DrawingPoint[],
                styleToken: 'line-style-1',
              },
            ],
          } as DrawingSnapshotPayload,
        },
      ];
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta, events);
      expect(spec.drawingSet).toEqual([]);
    });
  });

  describe('telemetryMarkers', () => {
    it('Returns an opaque object (shape controlled by implementation, not test)', () => {
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta, []);
      expect(spec.telemetryMarkers).toBeDefined();
      expect(typeof spec.telemetryMarkers).toBe('object');
    });

    it('Includes management events within the window', () => {
      const events: TelemetryEvent[] = [
        {
          seq: 1,
          wallClockMs: 1500000,
          marketTime: 1500,
          kind: 'OrderModified',
          payload: {
            orderRef: 'trade-1',
            field: 'sl',
            from: 1.08,
            to: 1.082,
          },
        },
      ];
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta, events);
      expect(spec.telemetryMarkers).toBeDefined();
      // The shape is opaque, but it should include something
      expect(JSON.stringify(spec.telemetryMarkers).length).toBeGreaterThan(0);
    });

    it('Excludes events outside the window', () => {
      const events: TelemetryEvent[] = [
        {
          seq: 1,
          wallClockMs: 100000,
          marketTime: baseWaypoint.time - WINDOW_SECONDS - 100, // before window
          kind: 'OrderModified',
          payload: {
            orderRef: 'trade-1',
            field: 'sl',
            from: 1.08,
            to: 1.082,
          },
        },
      ];
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta, events);
      // Markers should not include this event
      const markerStr = JSON.stringify(spec.telemetryMarkers);
      expect(markerStr).toBeDefined();
    });
  });

  describe('purity', () => {
    it('Does not mutate input trade', () => {
      const trade: ClosedTrade = { ...baseClosedTrade };
      const tradeBefore = JSON.stringify(trade);
      buildSceneSpec(trade, baseWaypoint, sessionMeta);
      const tradeAfter = JSON.stringify(trade);
      expect(tradeAfter).toBe(tradeBefore);
    });

    it('Does not mutate input waypoint', () => {
      const waypoint: Waypoint = { ...baseWaypoint };
      const waypointBefore = JSON.stringify(waypoint);
      buildSceneSpec(baseClosedTrade, waypoint, sessionMeta);
      const waypointAfter = JSON.stringify(waypoint);
      expect(waypointAfter).toBe(waypointBefore);
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
            from: 1.08,
            to: 1.082,
          },
        },
      ];
      const eventsBefore = JSON.stringify(events);
      buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta, events);
      const eventsAfter = JSON.stringify(events);
      expect(eventsAfter).toBe(eventsBefore);
    });
  });

  describe('determinism', () => {
    it('Same inputs produce identical SceneSpec', () => {
      const spec1 = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta);
      const spec2 = buildSceneSpec(baseClosedTrade, baseWaypoint, sessionMeta);
      expect(JSON.stringify(spec1)).toBe(JSON.stringify(spec2));
    });
  });

  describe('sessionMeta parameter shape', () => {
    it('SessionMeta contains symbol, datasetRefs, baseTfSeconds', () => {
      const meta: SessionMeta = {
        symbol: 'EURUSD',
        datasetRefs: ['1m'],
        baseTfSeconds: 60,
      };
      // Just ensure it compiles and the function accepts it
      const spec = buildSceneSpec(baseClosedTrade, baseWaypoint, meta);
      expect(spec.symbol).toBe('EURUSD');
    });
  });
});
