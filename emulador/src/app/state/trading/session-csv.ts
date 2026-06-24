import { ClosedTrade, TradeOutcome } from './trading.models';

/** "YYYY-MM-DD HH:mm" in UTC, same format as eventos_python.csv. */
function fmtTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    ` ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
  );
}

const CLOSE_EVENT: Record<TradeOutcome, string> = {
  tp: 'CIERRE_TP',
  sl: 'CIERRE_SL',
  manual: 'CIERRE_MANUAL',
  'session-end': 'CIERRE_FIN_SESION',
};

/**
 * Session history as CSV with the same shape as the root project's
 * `eventos_python.csv` (`bar_time,evento,p1,p2,detalle`): one ORDEN_COLOCADA
 * row per entry and one CIERRE_* row per exit, ordered chronologically.
 */
export function buildSessionCsv(history: ClosedTrade[]): string {
  interface Row {
    time: number;
    seq: number;
    cols: string[];
  }
  const rows: Row[] = [];
  const sorted = [...history].sort((a, b) => a.openTime - b.openTime);
  sorted.forEach((t, i) => {
    const side = t.side === 'buy' ? 'BUY' : 'SELL';
    rows.push({
      time: t.openTime,
      seq: i,
      cols: [
        fmtTime(t.openTime),
        'ORDEN_COLOCADA',
        t.entryPrice.toFixed(2),
        t.sl.toFixed(2),
        `${side}_${t.origin.toUpperCase()} lotes=${t.lots.toFixed(2)}` +
          (t.tp !== null ? ` tp=${t.tp.toFixed(2)}` : '') +
          // the id pairs this row with its CIERRE_* row on re-import
          ` id=${t.id}`,
      ],
    });
    rows.push({
      time: t.closeTime,
      seq: i,
      cols: [
        fmtTime(t.closeTime),
        CLOSE_EVENT[t.outcome],
        t.exitPrice.toFixed(2),
        t.profit.toFixed(2),
        `r=${t.rMultiple.toFixed(2)}` + (t.ambiguous ? ' ambiguo' : '') + ` id=${t.id}`,
      ],
    });
  });
  rows.sort((a, b) => a.time - b.time || a.seq - b.seq);
  const lines = ['bar_time,evento,p1,p2,detalle', ...rows.map((r) => r.cols.join(','))];
  return lines.join('\n') + '\n';
}
