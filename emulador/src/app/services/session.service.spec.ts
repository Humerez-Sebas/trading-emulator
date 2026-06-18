import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DatasetRecord } from './market-data-db';
import { WorkspaceDbService } from './workspace-db.service';
import {
  buildRequiredDatasets,
  buildSessionFile,
  EXPORTED_WITH,
  missingDatasets,
  parseSessionText,
  SESSION_VERSION,
  SessionService,
  type SessionSnapshot,
} from './session.service';

const DB_NAME = 'emulador-workspaces';

function snapshot(p: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    symbol: 'XAUUSD',
    initialBalance: 10000,
    startRange: 1704067200000,
    endRange: 1735689600000,
    replayTime: 1705000000000,
    currentTimeframe: 60,
    playbackSpeed: 1.5,
    trades: [{ id: 't1' }],
    pendingOrders: [{ id: 'o1' }],
    drawings: [{ id: 'd1' }],
    notes: [],
    anchorTimeframes: ['M1', 'H1', 'D1'],
    years: [2024, 2025],
    id: 'fixed-uuid',
    ...p,
  };
}

function ds(p: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    id: 'XAUUSD|M1|2024',
    symbol: 'XAUUSD',
    timeframe: 'M1',
    year: '2024',
    size: 1,
    etag: 'e',
    updatedAt: 'x',
    ...p,
  };
}

describe('buildRequiredDatasets', () => {
  it('expands M1 to one ref per (deduped, sorted) year; H1/D1 have no year', () => {
    expect(buildRequiredDatasets('XAUUSD', ['M1', 'H1', 'D1'], [2025, 2024, 2024])).toEqual([
      { symbol: 'XAUUSD', timeframe: 'M1', year: 2024 },
      { symbol: 'XAUUSD', timeframe: 'M1', year: 2025 },
      { symbol: 'XAUUSD', timeframe: 'H1' },
      { symbol: 'XAUUSD', timeframe: 'D1' },
    ]);
  });
});

describe('buildSessionFile', () => {
  it('produces a spec-shaped v1 file with no candle data', () => {
    const file = buildSessionFile(snapshot());
    expect(file.version).toBe(SESSION_VERSION);
    expect(file.exportedWith).toBe(EXPORTED_WITH);
    expect(file.id).toBe('fixed-uuid');
    expect(file.requiredDatasets).toContainEqual({ symbol: 'XAUUSD', timeframe: 'H1' });
    expect(file.context).toEqual({
      symbol: 'XAUUSD',
      initialBalance: 10000,
      startRange: 1704067200000,
      endRange: 1735689600000,
    });
    expect(file.state).toEqual({ replayTime: 1705000000000, currentTimeframe: 60, playbackSpeed: 1.5 });
    expect(file.trading).toEqual({ trades: [{ id: 't1' }], pendingOrders: [{ id: 'o1' }] });
    // no candles anywhere in the serialized file
    expect(JSON.stringify(file)).not.toMatch(/candle|"open"|"high"|"low"|"close"/i);
  });
});

describe('parseSessionText (version gate)', () => {
  it('accepts a current v1 session', () => {
    const file = buildSessionFile(snapshot());
    const res = parseSessionText(JSON.stringify(file));
    expect(res.status).toBe('ok');
  });

  it('rejects a future version (prompt to update)', () => {
    const res = parseSessionText(JSON.stringify({ ...buildSessionFile(snapshot()), version: 2 }));
    expect(res).toEqual({ status: 'future', version: 2 });
  });

  it('rejects an older/zero version (no migration available yet)', () => {
    const res = parseSessionText(JSON.stringify({ ...buildSessionFile(snapshot()), version: 0 }));
    expect(res.status).toBe('invalid');
  });

  it('rejects non-JSON and malformed objects', () => {
    expect(parseSessionText('not json').status).toBe('invalid');
    expect(parseSessionText(JSON.stringify({ version: 1 })).status).toBe('invalid');
  });
});

describe('missingDatasets', () => {
  it('returns refs not present locally; matches M1 by year and H1/D1 by "all"', () => {
    const required = buildRequiredDatasets('XAUUSD', ['M1', 'H1'], [2024, 2025]);
    const local = [
      ds({ id: 'XAUUSD|M1|2024', timeframe: 'M1', year: '2024' }),
      ds({ id: 'XAUUSD|H1|all', timeframe: 'H1', year: 'all' }),
    ];
    expect(missingDatasets(required, local)).toEqual([{ symbol: 'XAUUSD', timeframe: 'M1', year: 2025 }]);
  });
});

describe('SessionService.findMissingDatasets', () => {
  let db: WorkspaceDbService;
  beforeEach(async () => {
    await new Promise<void>((res) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => res();
      req.onerror = () => res();
      req.onblocked = () => res();
    });
    db = new WorkspaceDbService();
  });

  it('reports the session refs absent from the datasets store', async () => {
    await db.putDataset(ds({ id: 'XAUUSD|M1|2024', timeframe: 'M1', year: '2024' }));
    await db.putDataset(ds({ id: 'XAUUSD|D1|all', timeframe: 'D1', year: 'all' }));
    const svc = new SessionService(db);
    const file = buildSessionFile(snapshot({ anchorTimeframes: ['M1', 'H1', 'D1'], years: [2024] }));

    const missing = await svc.findMissingDatasets(file);

    // M1/2024 and D1 present → only H1 is missing
    expect(missing).toEqual([{ symbol: 'XAUUSD', timeframe: 'H1' }]);
  });

  it('returns [] when every required dataset is cached', async () => {
    await db.putDataset(ds({ id: 'XAUUSD|H1|all', timeframe: 'H1', year: 'all' }));
    const svc = new SessionService(db);
    const file = buildSessionFile(snapshot({ anchorTimeframes: ['H1'], years: [] }));
    expect(await svc.findMissingDatasets(file)).toEqual([]);
  });
});
