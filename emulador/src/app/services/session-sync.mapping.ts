import type { TradingData, ClosedTrade } from '../state/trading/trading.models';
import {
  SESSION_PAYLOAD_VERSION,
  type PayloadInput,
  type SessionPayloadV1,
} from './session-sync.models';

export function toPayload(i: PayloadInput): SessionPayloadV1 {
  return {
    schemaVersion: SESSION_PAYLOAD_VERSION,
    trading: i.trading,
    currentTime: i.currentTime,
    activeTf: i.activeTf,
    customTfMinutes: i.customTfMinutes,
    playbackSpeed: i.playbackSpeed,
    drawings: i.drawings,
    notes: i.notes,
    selectedTfs: i.selectedTfs,
    startRange: i.startRange,
    endRange: i.endRange,
    requiredDatasets: i.requiredDatasets,
  };
}

export function fromPayload(p: SessionPayloadV1) {
  return {
    trading: p.trading,
    cursor: p.currentTime,
    activeTf: p.activeTf,
    customTfMinutes: p.customTfMinutes,
    playbackSpeed: p.playbackSpeed,
    drawings: p.drawings,
    notes: p.notes,
    selectedTfs: p.selectedTfs,
    startRange: p.startRange,
    endRange: p.endRange,
    requiredDatasets: p.requiredDatasets,
  };
}

export const PAYLOAD_WARN_BYTES = 512 * 1024;
export const PAYLOAD_MAX_BYTES = 2 * 1024 * 1024;

const CANDLE_KEYS = new Set(['series', 'candles', 'ohlc', 'parquet']);

/** Defense-in-depth: reject any candle/series/OHLC/parquet field at any depth. */
export function assertNoCandles(payload: unknown): void {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object') return;
    if (seen.has(v as object)) return;
    seen.add(v as object);
    if (!Array.isArray(v)) {
      for (const k of Object.keys(v as Record<string, unknown>)) {
        if (CANDLE_KEYS.has(k.toLowerCase())) {
          throw new Error(`El payload no puede contener velas (campo prohibido: "${k}").`);
        }
        walk((v as Record<string, unknown>)[k]);
      }
    } else {
      for (const item of v) walk(item);
    }
  };
  walk(payload);
}

export function payloadSizeBytes(payload: unknown): number {
  return new Blob([JSON.stringify(payload)]).size;
}

export function assertPayloadSize(payload: unknown): { ok: boolean; bytes: number; warn: boolean } {
  const bytes = payloadSizeBytes(payload);
  if (bytes > PAYLOAD_MAX_BYTES) {
    throw new Error('Esta sesión es demasiado grande para sincronizarse.');
  }
  return { ok: true, bytes, warn: bytes >= PAYLOAD_WARN_BYTES };
}

export function isRealSession(t: TradingData): boolean {
  return (
    t.orders.length > 0 ||
    t.positions.length > 0 ||
    t.history.length > 0 ||
    t.sessionName != null ||
    t.sessionEnded
  );
}

export function computeSparkline(t: TradingData, maxPoints = 32): number[] {
  const closed = [...t.history].sort((a, b) => a.closeTime - b.closeTime);
  if (!closed.length) return [];
  let equity = t.initialBalance;
  const curve = closed.map((c: ClosedTrade) => (equity += c.profit));
  if (curve.length <= maxPoints) return curve.map((v) => Math.round(v));
  const step = (curve.length - 1) / (maxPoints - 1);
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(Math.round(curve[Math.round(i * step)]));
  return out;
}

export function winRateOf(t: TradingData): number | undefined {
  if (!t.history.length) return undefined;
  const wins = t.history.filter((c) => c.profit > 0).length;
  return wins / t.history.length;
}
