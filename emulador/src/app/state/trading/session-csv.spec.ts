import { describe, expect, it } from 'vitest';
import { buildSessionCsv, isSessionCsv, parseSessionCsv } from './session-csv';
import { ClosedTrade } from './trading.models';

function trade(partial: Partial<ClosedTrade>): ClosedTrade {
  return {
    id: 't1',
    side: 'buy',
    origin: 'limit',
    entryPrice: 4588,
    exitPrice: 4600,
    sl: 4578,
    tp: 4600,
    lots: 0.1,
    riskPct: 1,
    riskUsd: 100,
    openTime: 1768489200, // 2026-01-15 15:00 UTC
    closeTime: 1768492800,
    outcome: 'tp',
    profit: 120,
    rMultiple: 1.2,
    ambiguous: false,
    ...partial,
  };
}

describe('isSessionCsv', () => {
  it('detects session exports and rejects candle CSVs', () => {
    expect(isSessionCsv('bar_time,evento,p1,p2,detalle\n')).toBe(true);
    expect(isSessionCsv('time,open,high,low,close\n')).toBe(false);
  });
});

describe('buildSessionCsv -> parseSessionCsv round-trip', () => {
  it('preserves the trade fields', () => {
    const original = [
      trade({}),
      trade({
        id: 't2',
        side: 'sell',
        origin: 'market',
        entryPrice: 4700,
        exitPrice: 4715,
        sl: 4715,
        tp: null,
        lots: 0.06,
        outcome: 'sl',
        profit: -90,
        rMultiple: -1,
        ambiguous: true,
        openTime: 1768500000,
        closeTime: 1768503600,
      }),
    ];
    const parsed = parseSessionCsv(buildSessionCsv(original));
    expect(parsed).toHaveLength(2);
    const [a, b] = parsed;
    expect(a.side).toBe('buy');
    expect(a.origin).toBe('limit');
    expect(a.entryPrice).toBeCloseTo(4588);
    expect(a.exitPrice).toBeCloseTo(4600);
    expect(a.sl).toBeCloseTo(4578);
    expect(a.tp).toBeCloseTo(4600);
    expect(a.lots).toBeCloseTo(0.1);
    expect(a.outcome).toBe('tp');
    expect(a.profit).toBeCloseTo(120);
    expect(a.rMultiple).toBeCloseTo(1.2);
    expect(a.riskUsd).toBeCloseTo(100);
    expect(a.ambiguous).toBe(false);
    // times survive the "YYYY-MM-DD HH:mm" round-trip (minute precision)
    expect(Math.abs(a.openTime - 1768489200)).toBeLessThan(60);

    expect(b.side).toBe('sell');
    expect(b.origin).toBe('market');
    expect(b.tp).toBeNull();
    expect(b.outcome).toBe('sl');
    expect(b.profit).toBeCloseTo(-90);
    expect(b.ambiguous).toBe(true);
  });

  it('pairs overlapping trades correctly via the id token', () => {
    // t1 opens first but closes LAST: FIFO would mismatch, ids must not
    const original = [
      trade({ id: 'aaa', openTime: 1768489200, closeTime: 1768500000, profit: 120 }),
      trade({
        id: 'bbb',
        openTime: 1768492800,
        closeTime: 1768496400,
        outcome: 'sl',
        profit: -60,
      }),
    ];
    const parsed = parseSessionCsv(buildSessionCsv(original));
    const byId = new Map(parsed.map((t) => [t.id, t]));
    expect(byId.get('aaa')?.outcome).toBe('tp');
    expect(byId.get('aaa')?.profit).toBeCloseTo(120);
    expect(byId.get('bbb')?.outcome).toBe('sl');
    expect(byId.get('bbb')?.profit).toBeCloseTo(-60);
  });

  it('falls back to FIFO pairing for legacy CSVs without id', () => {
    const csv = [
      'bar_time,evento,p1,p2,detalle',
      '2026-01-15 15:00,ORDEN_COLOCADA,4588.00,4578.00,BUY_LIMIT lotes=0.10 tp=4600.00',
      '2026-01-15 16:00,CIERRE_TP,4600.00,120.00,r=1.20',
    ].join('\n');
    const parsed = parseSessionCsv(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].outcome).toBe('tp');
    expect(parsed[0].lots).toBeCloseTo(0.1);
  });

  it('ignores unknown events (eventos_python.csv style rows)', () => {
    const csv = [
      'bar_time,evento,p1,p2,detalle',
      '2026-01-02 03:00,NUEVO_TECHO,4354.32,0.02,',
      '2026-01-02 04:00,QUIEBRE,4354.32,0.00,O=4348.11',
    ].join('\n');
    expect(parseSessionCsv(csv)).toHaveLength(0);
  });
});
