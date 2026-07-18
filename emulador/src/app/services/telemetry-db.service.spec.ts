import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { TELEMETRY_MAX_EVENTS_PER_SESSION, TelemetryDbService } from './telemetry-db.service';

const DB_NAME = 'emulador-telemetry';

/** Delete the DB and return a fresh service instance (mirrors workspace-db.service.spec.ts). */
async function freshDb(): Promise<TelemetryDbService> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // resolve even if blocked in test env
  });
  return new TelemetryDbService();
}

interface AppendInput {
  wallClockMs: number;
  marketTime: number | null;
  kind: string;
  payload: object;
}

function event(overrides: Partial<AppendInput> = {}): AppendInput {
  return {
    wallClockMs: 1000,
    marketTime: 500,
    kind: 'PlaybackToggled',
    payload: { playing: true },
    ...overrides,
  };
}

let svc: TelemetryDbService;

beforeEach(async () => {
  svc = await freshDb();
});

describe('TelemetryDbService — append / flush sequencing', () => {
  it('assigns a monotonic seq per session across a single batch', async () => {
    await svc.append('s1', [event({ kind: 'A' }), event({ kind: 'B' }), event({ kind: 'C' })]);
    await svc.flush();
    const stored = await svc.listForSession('s1');
    expect(stored.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(stored.map((e) => e.kind)).toEqual(['A', 'B', 'C']);
  });

  it('a single flush writes the whole buffered batch exactly once', async () => {
    await svc.append('s1', [event(), event(), event()]);
    await svc.flush();
    await svc.flush(); // second flush hits an empty buffer — must not duplicate
    const stored = await svc.listForSession('s1');
    expect(stored).toHaveLength(3);
  });

  it('append after flush continues the sequence without gaps or resets', async () => {
    await svc.append('s1', [event(), event()]);
    await svc.flush();
    await svc.append('s1', [event(), event()]);
    await svc.flush();
    const stored = await svc.listForSession('s1');
    expect(stored.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
  });

  it('two sessions are sequenced and stored independently', async () => {
    await svc.append('s1', [event(), event()]);
    await svc.append('s2', [event()]);
    await svc.flush();
    const s1 = await svc.listForSession('s1');
    const s2 = await svc.listForSession('s2');
    expect(s1.map((e) => e.seq)).toEqual([0, 1]);
    expect(s2.map((e) => e.seq)).toEqual([0]);
  });

  it("a fresh service instance continues the seq from the store's existing rows", async () => {
    await svc.append('s1', [event(), event()]);
    await svc.flush();
    const svc2 = new TelemetryDbService();
    await svc2.append('s1', [event()]);
    await svc2.flush();
    const stored = await svc2.listForSession('s1');
    expect(stored.map((e) => e.seq)).toEqual([0, 1, 2]);
  });
});

describe('TelemetryDbService — candle-free enforcement (N-5/V-9, reuses assertNoCandles)', () => {
  it('rejects a batch whose payload carries a candle-shaped field, and stores nothing', async () => {
    await expect(
      svc.append('s1', [event({ payload: { candles: [{ time: 1, open: 1 }] } })]),
    ).rejects.toThrow(/candle|series|ohlc/i);
    await svc.flush();
    expect(await svc.listForSession('s1')).toEqual([]);
  });

  it('one poisoned event inside a multi-event batch rejects the whole batch', async () => {
    await expect(
      svc.append('s1', [event({ kind: 'A' }), event({ kind: 'B', payload: { series: [] } })]),
    ).rejects.toThrow();
    await svc.flush();
    expect(await svc.listForSession('s1')).toEqual([]);
  });
});

describe('TelemetryDbService — bounded size per session (R4)', () => {
  // Overrides the production cap so the drop-on-overflow path is exercised
  // without writing tens of thousands of rows in a unit test.
  class TinyCapTelemetryDbService extends TelemetryDbService {
    protected override readonly maxEventsPerSession = 3;
  }

  it('drops the newest events beyond the cap without throwing', async () => {
    const tiny = new TinyCapTelemetryDbService();
    await expect(
      tiny.append('s1', [
        event({ kind: 'A' }),
        event({ kind: 'B' }),
        event({ kind: 'C' }),
        event({ kind: 'D' }),
        event({ kind: 'E' }),
      ]),
    ).resolves.not.toThrow();
    await tiny.flush();
    const stored = await tiny.listForSession('s1');
    expect(stored.map((e) => e.kind)).toEqual(['A', 'B', 'C']);
  });

  it('once a session is at its cap, a later append is a full no-op', async () => {
    const tiny = new TinyCapTelemetryDbService();
    await tiny.append('s1', [event(), event(), event()]);
    await expect(tiny.append('s1', [event({ kind: 'overflow' })])).resolves.not.toThrow();
    await tiny.flush();
    const stored = await tiny.listForSession('s1');
    expect(stored).toHaveLength(3);
    expect(stored.some((e) => e.kind === 'overflow')).toBe(false);
  });

  it('exports the production cap as a named, positive constant', () => {
    expect(TELEMETRY_MAX_EVENTS_PER_SESSION).toBeGreaterThan(0);
  });
});

describe('TelemetryDbService — append-only surface', () => {
  it('exposes no update/delete/remove API', () => {
    const proto = Object.getPrototypeOf(svc) as object;
    const methodNames = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor');
    expect(methodNames.some((n) => /update|delete|remove/i.test(n))).toBe(false);
  });
});
