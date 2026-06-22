import { describe, expect, it } from 'vitest';
import {
  toPayload,
  fromPayload,
  assertNoCandles,
  assertPayloadSize,
  PAYLOAD_MAX_BYTES,
} from './session-sync.mapping';
import {
  SESSION_PAYLOAD_VERSION,
  type PayloadInput,
  type SessionPayloadV1,
} from './session-sync.models';
import { defaultTradingData } from '../state/trading/trading.models';

function sampleInput(): PayloadInput {
  const trading = defaultTradingData(10000);
  trading.positions = [
    {
      id: 'p1',
      side: 'buy',
      entryPrice: 1.1,
      sl: 1.0,
      tp: 1.3,
      lots: 0.1,
      riskPct: 1,
      riskUsd: 100,
      openTime: 1700000000,
      origin: 'market',
    },
  ];
  trading.riskPct = 2;
  trading.sessionEnd = 1700100000;
  return {
    trading,
    currentTime: 1700050000,
    activeTf: 'H1',
    customTfMinutes: null,
    playbackSpeed: 4,
    drawings: [],
    notes: [],
    selectedTfs: ['M1', 'H1'],
    startRange: 1699000000,
    endRange: 1700200000,
    requiredDatasets: [{ symbol: 'EURUSD', timeframe: 'H1' }],
  };
}

describe('toPayload / fromPayload', () => {
  it('stamps the schema version', () => {
    expect(toPayload(sampleInput()).schemaVersion).toBe(SESSION_PAYLOAD_VERSION);
  });
  it('round-trips losslessly (open positions, riskPct, sessionEnd, cursor, view)', () => {
    const input = sampleInput();
    const back = fromPayload(toPayload(input));
    expect(back.trading).toEqual(input.trading);
    expect(back.cursor).toBe(input.currentTime);
    expect(back.activeTf).toBe(input.activeTf);
    expect(back.playbackSpeed).toBe(input.playbackSpeed);
    expect(back.selectedTfs).toEqual(input.selectedTfs);
    expect(back.startRange).toBe(input.startRange);
    expect(back.endRange).toBe(input.endRange);
  });
  it('survives a JSON serialization round-trip (storage-faithful)', () => {
    const input = sampleInput();
    const stored = JSON.parse(JSON.stringify(toPayload(input))) as SessionPayloadV1;
    const back = fromPayload(stored);
    expect(back.trading).toEqual(input.trading);
    expect(back.cursor).toBe(input.currentTime);
    expect(back.requiredDatasets).toEqual(input.requiredDatasets);
  });
});

describe('assertNoCandles', () => {
  it('passes a clean payload', () => {
    expect(() => assertNoCandles({ trading: {}, drawings: [] })).not.toThrow();
  });
  it('throws when a series/candles/ohlc field is present (any depth)', () => {
    expect(() => assertNoCandles({ trading: {}, series: [{ time: 1, open: 1 }] })).toThrow(
      /candle|series|ohlc/i,
    );
    expect(() => assertNoCandles({ a: { candles: [] } })).toThrow();
  });
});

describe('assertPayloadSize', () => {
  it('returns warn:false for a small payload', () => {
    const r = assertPayloadSize({ x: 1 });
    expect(r.ok).toBe(true);
    expect(r.warn).toBe(false);
  });
  it('throws when over the 2 MB hard cap', () => {
    const huge = { blob: 'x'.repeat(PAYLOAD_MAX_BYTES + 10) };
    expect(() => assertPayloadSize(huge)).toThrow(/grande|large|size/i);
  });
});
