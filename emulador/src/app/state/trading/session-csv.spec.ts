import { describe, expect, it } from 'vitest';
import { buildSessionCsv } from './session-csv';
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

describe('buildSessionCsv', () => {
  it('emits the bar_time,evento,p1,p2,detalle header', () => {
    const csv = buildSessionCsv([]);
    expect(csv).toBe('bar_time,evento,p1,p2,detalle\n');
  });

  it('emits one ORDEN_COLOCADA row and one CIERRE_* row per trade, ordered chronologically', () => {
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
    const lines = buildSessionCsv(original).trim().split('\n');
    expect(lines).toHaveLength(5); // header + 2 opens + 2 closes

    expect(lines[0]).toBe('bar_time,evento,p1,p2,detalle');
    expect(lines[1]).toBe(
      '2026-01-15 15:00,ORDEN_COLOCADA,4588.00,4578.00,BUY_LIMIT lotes=0.10 tp=4600.00 id=t1',
    );
    expect(lines[2]).toBe('2026-01-15 16:00,CIERRE_TP,4600.00,120.00,r=1.20 id=t1');
    expect(lines[3]).toBe(
      '2026-01-15 18:00,ORDEN_COLOCADA,4700.00,4715.00,SELL_MARKET lotes=0.06 id=t2',
    );
    expect(lines[4]).toBe('2026-01-15 19:00,CIERRE_SL,4715.00,-90.00,r=-1.00 ambiguo id=t2');
  });

  it('maps each outcome to its CIERRE_* event name', () => {
    const outcomes: ClosedTrade['outcome'][] = ['tp', 'sl', 'manual', 'session-end'];
    const events = outcomes.map((outcome) => {
      const csv = buildSessionCsv([trade({ outcome })]);
      return csv.trim().split('\n')[2].split(',')[1];
    });
    expect(events).toEqual(['CIERRE_TP', 'CIERRE_SL', 'CIERRE_MANUAL', 'CIERRE_FIN_SESION']);
  });
});
