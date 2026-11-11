import type { ClosedTrade } from '../../state/trading/trading.models';
import type { TelemetryEvent } from '../../state/telemetry/telemetry.models';
import { buildSceneSpec } from './build-scene-spec';
import { computeWaypoints } from './waypoints';

/**
 * RFC-016 MEDIUM-4 audit scenario: long at 1.1000, SL 1.0950, moved to
 * breakeven (1.1000), closed at 1.1080. `ClosedTrade.sl` is the SL AT CLOSE.
 */
const BASE_TF = 60;
const meta = { symbol: 'EURUSD', datasetRefs: ['EURUSD|M1|all'], baseTfSeconds: BASE_TF };

const managed: ClosedTrade = {
  id: 'T',
  side: 'buy',
  origin: 'market',
  entryPrice: 1.1,
  exitPrice: 1.108,
  sl: 1.1, // breakeven at close
  tp: 1.12,
  lots: 1,
  riskPct: 1,
  riskUsd: 100,
  openTime: 10_000,
  closeTime: 20_000,
  outcome: 'manual',
  profit: 80,
  rMultiple: 1.6,
  ambiguous: false,
  grossProfit: 80,
  commission: 0,
  mae: 0.002,
  mfe: 0.009,
  tMae: 11_000,
  tMfe: 15_000,
};

const breakeven: TelemetryEvent = {
  seq: 1,
  wallClockMs: 0,
  marketTime: 13_000,
  kind: 'PositionModified',
  payload: { positionRef: 'T', field: 'sl', from: 1.095, to: 1.1 },
};

function waypoint(trade: ClosedTrade, events: TelemetryEvent[], slot: number) {
  const wp = computeWaypoints(trade, events, BASE_TF).find((w) => w.slot === slot);
  if (!wp) throw new Error(`no slot ${slot}`);
  return wp;
}

describe('managed-trade geometry (MEDIUM-4)', () => {
  it('Entry shows the 0.0050 INITIAL risk at 1R, not the breakeven 0', () => {
    const f = waypoint(managed, [breakeven], 1).facts as {
      riskDistancePrice: number | null;
      riskDistanceR: number | null;
    };
    expect(f.riskDistancePrice).toBeCloseTo(0.005, 10);
    expect(f.riskDistanceR).toBe(1);
  });

  it('MAE/MFE are expressed in R of the initial risk', () => {
    const mae = waypoint(managed, [breakeven], 3).facts as { excursionR: number | null };
    const mfe = waypoint(managed, [breakeven], 4).facts as { excursionR: number | null };
    expect(mae.excursionR).toBeCloseTo(0.4, 10);
    expect(mfe.excursionR).toBeCloseTo(1.8, 10);
  });

  it('merged MAE/MFE on Exit also use the initial risk', () => {
    const t = { ...managed, tMae: managed.closeTime, tMfe: managed.closeTime };
    const f = waypoint(t, [breakeven], 5).facts as {
      mergedMae: { excursionR: number | null };
      mergedMfe: { excursionR: number | null };
    };
    expect(f.mergedMae.excursionR).toBeCloseTo(0.4, 10);
    expect(f.mergedMfe.excursionR).toBeCloseTo(1.8, 10);
  });

  it('each waypoint scene carries the SL/TP in force at that moment', () => {
    const slAt = (slot: number) =>
      buildSceneSpec(managed, waypoint(managed, [breakeven], slot), meta, [breakeven]).orderGeometry
        .sl;
    expect(slAt(1)).toBe(1.095); // Entry
    expect(slAt(3)).toBe(1.095); // MAE @ 11000, before the move
    expect(slAt(2)).toBe(1.1); // Management @ 13000, the move itself
    expect(slAt(4)).toBe(1.1); // MFE @ 15000, after the move
    expect(slAt(5)).toBe(1.1); // Exit
  });

  it('TP geometry is replayed too', () => {
    const tpMove: TelemetryEvent = {
      seq: 2,
      wallClockMs: 0,
      marketTime: 12_000,
      kind: 'PositionModified',
      payload: { positionRef: 'T', field: 'tp', from: 1.15, to: 1.12 },
    };
    const geo = (slot: number) =>
      buildSceneSpec(managed, waypoint(managed, [tpMove], slot), meta, [tpMove]).orderGeometry;
    expect(geo(1).tp).toBe(1.15);
    expect(geo(5).tp).toBe(1.12);
  });

  it('a trade with no management events keeps its own geometry everywhere', () => {
    const plain: ClosedTrade = { ...managed, sl: 1.095 };
    const f = waypoint(plain, [], 1).facts as { riskDistancePrice: number | null };
    expect(f.riskDistancePrice).toBeCloseTo(0.005, 10);
    for (const slot of [1, 3, 4, 5]) {
      expect(buildSceneSpec(plain, waypoint(plain, [], slot), meta, []).orderGeometry.sl).toBe(
        1.095,
      );
    }
  });

  it('a trade with several SL moves shows the right SL at each waypoint', () => {
    const events: TelemetryEvent[] = [
      {
        ...breakeven,
        seq: 1,
        marketTime: 12_000,
        payload: { positionRef: 'T', field: 'sl', from: 1.09, to: 1.095 },
      },
      {
        ...breakeven,
        seq: 2,
        marketTime: 14_000,
        payload: { positionRef: 'T', field: 'sl', from: 1.095, to: 1.1 },
      },
    ];
    const f = waypoint(managed, events, 1).facts as { riskDistancePrice: number };
    expect(f.riskDistancePrice).toBeCloseTo(0.01, 10);
    const slAt = (slot: number) =>
      buildSceneSpec(managed, waypoint(managed, events, slot), meta, events).orderGeometry.sl;
    expect(slAt(1)).toBe(1.09);
    expect(slAt(3)).toBe(1.09); // 11000
    expect(slAt(2)).toBe(1.095); // 12000
    expect(slAt(4)).toBe(1.1); // 15000
    expect(slAt(5)).toBe(1.1);
  });

  it('no SL at entry: risk and excursion R are null, never 0 or a hard-coded 1R', () => {
    const noSl: ClosedTrade = { ...managed, sl: 0 };
    const entry = waypoint(noSl, [], 1).facts as {
      riskDistancePrice: number | null;
      riskDistanceR: number | null;
    };
    expect(entry.riskDistancePrice).toBeNull();
    expect(entry.riskDistanceR).toBeNull();
    const mae = waypoint(noSl, [], 3).facts as { excursionR: number | null };
    expect(mae.excursionR).toBeNull();
  });
});
