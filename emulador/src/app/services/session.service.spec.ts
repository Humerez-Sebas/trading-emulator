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
  restorePlan,
  SESSION_VERSION,
  SessionService,
  snapshotFromState,
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

describe('snapshotFromState', () => {
  function stateInput(p: Partial<Parameters<typeof snapshotFromState>[0]> = {}) {
    return {
      symbol: 'XAUUSD',
      initialBalance: 10000,
      startRangeSec: 1704067200,
      endRangeSec: 1735689600,
      replayTimeSec: 1_700_000_000,
      activeTf: 'H1' as const,
      customTfMinutes: null,
      playbackSpeed: 1.5,
      trades: [{ id: 't1' }],
      pendingOrders: [{ id: 'o1' }],
      drawings: [{ id: 'd1' }],
      notes: [],
      anchorTimeframes: ['M1', 'H1', 'D1'] as const,
      years: [2024, 2025],
      id: 'fixed-uuid',
      ...p,
    };
  }

  it('converts seconds to milliseconds for the range/cursor fields', () => {
    const snap = snapshotFromState(stateInput());
    expect(snap.startRange).toBe(1704067200000);
    expect(snap.endRange).toBe(1735689600000);
    expect(snap.replayTime).toBe(1_700_000_000_000);
  });

  it('maps a custom interval in minutes, taking priority over activeTf', () => {
    const snap = snapshotFromState(stateInput({ activeTf: 'H1', customTfMinutes: 45 }));
    expect(snap.currentTimeframe).toBe(45);
  });

  it('maps activeTf to minutes when there is no custom interval', () => {
    const snap = snapshotFromState(stateInput({ activeTf: 'D1', customTfMinutes: null }));
    expect(snap.currentTimeframe).toBe(1440);
  });

  it('falls back to 0 minutes when neither activeTf nor customTfMinutes is set', () => {
    const snap = snapshotFromState(stateInput({ activeTf: null, customTfMinutes: null }));
    expect(snap.currentTimeframe).toBe(0);
  });

  it('passes the remaining fields straight through', () => {
    const snap = snapshotFromState(stateInput());
    expect(snap.symbol).toBe('XAUUSD');
    expect(snap.initialBalance).toBe(10000);
    expect(snap.playbackSpeed).toBe(1.5);
    expect(snap.trades).toEqual([{ id: 't1' }]);
    expect(snap.pendingOrders).toEqual([{ id: 'o1' }]);
    expect(snap.drawings).toEqual([{ id: 'd1' }]);
    expect(snap.notes).toEqual([]);
    expect(snap.anchorTimeframes).toEqual(['M1', 'H1', 'D1']);
    expect(snap.years).toEqual([2024, 2025]);
    expect(snap.id).toBe('fixed-uuid');
  });
});

describe('restorePlan', () => {
  it('converts ms back to seconds and surfaces minutes/trading/annotations as-is', () => {
    const file = buildSessionFile({
      symbol: 'XAUUSD',
      initialBalance: 10000,
      startRange: 1704067200000,
      endRange: 1735689600000,
      replayTime: 1_700_000_000_000,
      currentTimeframe: 60,
      playbackSpeed: 1.5,
      trades: [{ id: 't1' }],
      pendingOrders: [{ id: 'o1' }],
      drawings: [{ id: 'd1' }],
      notes: [{ id: 'n1' }],
      anchorTimeframes: ['M1', 'H1', 'D1'],
      years: [2024, 2025],
      id: 'fixed-uuid',
    });

    const plan = restorePlan(file);

    expect(plan.symbol).toBe('XAUUSD');
    expect(plan.thenGoTo).toBe(1_700_000_000);
    expect(plan.startRangeSec).toBe(1704067200);
    expect(plan.endRangeSec).toBe(1735689600);
    expect(plan.currentTimeframeMinutes).toBe(60);
    expect(plan.playbackSpeed).toBe(1.5);
    expect(plan.trades).toEqual([{ id: 't1' }]);
    expect(plan.pendingOrders).toEqual([{ id: 'o1' }]);
    expect(plan.drawings).toEqual([{ id: 'd1' }]);
    expect(plan.notes).toEqual([{ id: 'n1' }]);
    expect(plan.selectedTfs).toEqual(['M1', 'H1', 'D1']);
  });

  it('dedupes selectedTfs from requiredDatasets while preserving M1/H1/D1 order', () => {
    const file = buildSessionFile({
      symbol: 'XAUUSD',
      initialBalance: 10000,
      startRange: 0,
      endRange: 0,
      replayTime: 0,
      currentTimeframe: 60,
      playbackSpeed: 1,
      trades: [],
      pendingOrders: [],
      drawings: [],
      notes: [],
      anchorTimeframes: ['D1', 'M1', 'H1'],
      years: [2024, 2025], // M1 expands to two refs (one per year) -> must dedupe
      id: 'fixed-uuid',
    });

    const plan = restorePlan(file);

    expect(plan.selectedTfs).toEqual(['M1', 'H1', 'D1']);
  });
});

describe('snapshotFromState -> buildSessionFile -> parseSessionText -> restorePlan (round-trip)', () => {
  it('round-trips a standard timeframe (H1), preserving units and payloads', () => {
    const file = buildSessionFile(
      snapshotFromState({
        symbol: 'XAUUSD',
        initialBalance: 10000,
        startRangeSec: 1704067200,
        endRangeSec: 1735689600,
        replayTimeSec: 1_700_000_000,
        activeTf: 'H1',
        customTfMinutes: null,
        playbackSpeed: 1.5,
        trades: [{ id: 't1' }],
        pendingOrders: [{ id: 'o1' }],
        drawings: [{ id: 'd1' }],
        notes: [{ id: 'n1' }],
        anchorTimeframes: ['M1', 'H1', 'D1'],
        years: [2024, 2025],
        id: 'fixed-uuid',
      }),
    );

    // the on-disk file stores ms for the cursor/range and minutes for the interval
    expect(file.state.replayTime).toBe(1_700_000_000_000);
    expect(file.state.currentTimeframe).toBe(60);

    const text = JSON.stringify(file);
    const parsed = parseSessionText(text);
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') throw new Error('expected ok');

    const plan = restorePlan(parsed.session);

    expect(plan.symbol).toBe('XAUUSD');
    expect(plan.thenGoTo).toBe(1_700_000_000); // back in seconds
    expect(plan.startRangeSec).toBe(1704067200);
    expect(plan.endRangeSec).toBe(1735689600);
    expect(plan.currentTimeframeMinutes).toBe(60);
    expect(plan.playbackSpeed).toBe(1.5);
    expect(plan.trades).toEqual([{ id: 't1' }]);
    expect(plan.pendingOrders).toEqual([{ id: 'o1' }]);
    expect(plan.drawings).toEqual([{ id: 'd1' }]);
    expect(plan.notes).toEqual([{ id: 'n1' }]);
    expect(plan.selectedTfs).toEqual(['M1', 'H1', 'D1']);
  });

  it('round-trips a custom interval (45 minutes)', () => {
    const file = buildSessionFile(
      snapshotFromState({
        symbol: 'EURUSD',
        initialBalance: 5000,
        startRangeSec: 1704067200,
        endRangeSec: 1735689600,
        replayTimeSec: 1_700_000_000,
        activeTf: null,
        customTfMinutes: 45,
        playbackSpeed: 1,
        trades: [],
        pendingOrders: [],
        drawings: [],
        notes: [],
        anchorTimeframes: ['H1'],
        years: [],
        id: 'fixed-uuid-2',
      }),
    );

    expect(file.state.currentTimeframe).toBe(45);

    const parsed = parseSessionText(JSON.stringify(file));
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') throw new Error('expected ok');

    const plan = restorePlan(parsed.session);
    expect(plan.currentTimeframeMinutes).toBe(45);
    expect(plan.symbol).toBe('EURUSD');
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
