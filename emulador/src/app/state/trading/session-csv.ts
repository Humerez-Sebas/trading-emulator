import { ClosedTrade, OrderSide, OrderType, TradeOutcome } from './trading.models';

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

// ============ import (round-trip of the export above) ============

/** Whether a CSV text is a session export (vs. a candle data CSV). */
export function isSessionCsv(text: string): boolean {
  const firstLine = text.slice(0, text.indexOf('\n') + 1 || undefined);
  return firstLine.trim().toLowerCase().startsWith('bar_time,evento');
}

const OUTCOME_BY_EVENT: Record<string, TradeOutcome> = {
  CIERRE_TP: 'tp',
  CIERRE_SL: 'sl',
  CIERRE_MANUAL: 'manual',
  CIERRE_FIN_SESION: 'session-end',
};

/** "YYYY-MM-DD HH:mm" (UTC) -> unix seconds. NaN when malformed. */
function parseUtc(raw: string): number {
  return Math.floor(new Date(raw.trim().replace(' ', 'T') + ':00Z').getTime() / 1000);
}

/** Numeric `key=value` token inside a detalle string, or null. */
function numToken(detalle: string, key: string): number | null {
  const m = new RegExp(`\\b${key}=(-?[\\d.]+)`).exec(detalle);
  return m ? parseFloat(m[1]) : null;
}

function strToken(detalle: string, key: string): string | null {
  const m = new RegExp(`\\b${key}=(\\S+)`).exec(detalle);
  return m ? m[1] : null;
}

interface OpenRow {
  id: string | null;
  side: OrderSide;
  origin: OrderType;
  lots: number;
  tp: number | null;
  entryPrice: number;
  sl: number;
  openTime: number;
}

/**
 * Rebuilds the closed trades of a session from its exported CSV. Rows are
 * paired ORDEN_COLOCADA <-> CIERRE_* by the `id=` token in `detalle`; files
 * exported before V2.2 have no id and fall back to FIFO pairing.
 * Returns [] when the text is not a session CSV.
 */
export function parseSessionCsv(text: string): ClosedTrade[] {
  if (!isSessionCsv(text)) return [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const opens: OpenRow[] = [];
  const trades: ClosedTrade[] = [];

  for (const line of lines.slice(1)) {
    const parts = line.split(',');
    if (parts.length < 4) continue;
    const [barTime, evento, p1, p2] = parts;
    const detalle = parts.slice(4).join(',');
    const time = parseUtc(barTime);
    if (!isFinite(time)) continue;

    if (evento === 'ORDEN_COLOCADA') {
      const head = /^(BUY|SELL)_(MARKET|LIMIT|STOP)/.exec(detalle);
      opens.push({
        id: strToken(detalle, 'id'),
        side: head?.[1] === 'SELL' ? 'sell' : 'buy',
        origin: (head?.[2]?.toLowerCase() ?? 'market') as OrderType,
        lots: numToken(detalle, 'lotes') ?? 0,
        tp: numToken(detalle, 'tp'),
        entryPrice: parseFloat(p1),
        sl: parseFloat(p2),
        openTime: time,
      });
      continue;
    }

    const outcome = OUTCOME_BY_EVENT[evento];
    if (!outcome) continue; // unknown event (e.g. eventos_python.csv rows)
    const id = strToken(detalle, 'id');
    let idx = id !== null ? opens.findIndex((o) => o.id === id) : 0;
    if (idx < 0) idx = 0; // FIFO fallback
    const open = opens.splice(idx, 1)[0];
    if (!open) continue;

    const profit = parseFloat(p2);
    const r = numToken(detalle, 'r') ?? 0;
    trades.push({
      id: open.id ?? `import-${trades.length}`,
      side: open.side,
      origin: open.origin,
      entryPrice: open.entryPrice,
      exitPrice: parseFloat(p1),
      sl: open.sl,
      tp: open.tp,
      lots: open.lots,
      riskPct: 0, // not present in the CSV (informational only)
      riskUsd: r !== 0 ? Math.abs(profit / r) : 0,
      openTime: open.openTime,
      closeTime: time,
      outcome,
      profit,
      rMultiple: r,
      ambiguous: /\bambiguo\b/.test(detalle),
    });
  }
  return trades;
}
