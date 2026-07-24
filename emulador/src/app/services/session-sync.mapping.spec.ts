import { describe, expect, it } from 'vitest';
import {
  toPayload,
  fromPayload,
  assertNoCandles,
  assertPayloadSize,
  PAYLOAD_MAX_BYTES,
  isRealSession,
  computeSparkline,
  winRateOf,
  flattenWorkspace,
  reconstructWorkspaces,
  mergeByLww,
} from './session-sync.mapping';
import {
  SESSION_PAYLOAD_VERSION_2,
  type PayloadInput,
  type SessionPayloadV1,
  type FlattenInput,
  type FlattenSession,
  type CloudSessionRow,
  type DrawingCollection,
} from './session-sync.models';
import { parseSessionPayload, singlePanelLayoutFor } from './session-migration';
import type { LinkGroup } from '../state/link-groups/link-groups.models';
import { defaultTradingData, type TradingData } from '../state/trading/trading.models';
import type { Drawing } from '../state/drawings/drawings.models';

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
  const { layout, panels } = singlePanelLayoutFor('EURUSD', 'H1');
  return {
    trading,
    currentTime: 1700050000,
    activeTf: 'H1',
    customTfMinutes: null,
    playbackSpeed: 4,
    drawings: {},
    notes: [],
    selectedTfs: ['M1', 'H1'],
    startRange: 1699000000,
    endRange: 1700200000,
    requiredDatasets: [{ symbol: 'EURUSD', timeframe: 'H1' }],
    layout,
    panels,
    linkGroups: [],
  };
}

describe('toPayload / fromPayload', () => {
  it('stamps the schema version', () => {
    // RFC-011 Task 3 (D9): toPayload now writes ONLY SessionPayloadV2 — this
    // assertion's expected value changed from SESSION_PAYLOAD_VERSION (1) to
    // SESSION_PAYLOAD_VERSION_2 because toPayload's return type itself changed
    // (SessionPayloadV1 -> SessionPayloadV2), not a spontaneous edit.
    expect(toPayload(sampleInput()).schemaVersion).toBe(SESSION_PAYLOAD_VERSION_2);
  });
  it('round-trips losslessly (open positions, riskPct, sessionEnd, cursor, view)', () => {
    const input = sampleInput();
    // fromPayload's new primarySymbol param is required (no default) — see
    // session-sync.mapping.ts; every call site must pass it explicitly.
    const back = fromPayload(toPayload(input), 'EURUSD');
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
    const back = fromPayload(stored, 'EURUSD');
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

describe('isRealSession', () => {
  it('false for an untouched default session', () => {
    expect(isRealSession(defaultTradingData())).toBe(false);
  });
  it('true with a closed trade, a custom name, or sessionEnded archived', () => {
    const withTrade = defaultTradingData();
    withTrade.history = [{ id: 't', profit: 5 } as never];
    expect(isRealSession(withTrade)).toBe(true);
    const named = defaultTradingData();
    named.sessionName = 'Mi plan';
    expect(isRealSession(named)).toBe(true);
  });
});

describe('computeSparkline', () => {
  it('returns [] with no closed trades', () => {
    expect(computeSparkline(defaultTradingData())).toEqual([]);
  });
  it('a single closed trade yields two points starting at the initial balance (renders a line)', () => {
    const t = defaultTradingData(1000);
    t.history = [{ closeTime: 1, profit: 250 } as never];
    expect(computeSparkline(t)).toEqual([1000, 1250]);
  });
  it('builds a downsampled cumulative-equity curve capped at maxPoints', () => {
    const t = defaultTradingData(1000);
    t.history = Array.from({ length: 100 }, (_, i) => ({ closeTime: i + 1, profit: 1 }) as never);
    const sp = computeSparkline(t, 32);
    expect(sp.length).toBeLessThanOrEqual(32);
    expect(sp[0]).toBe(1000); // starts at the initial balance
    expect(sp.at(-1)).toBeGreaterThan(sp[0]); // equity rose
  });
});

describe('winRateOf', () => {
  it('undefined with no closed trades', () => {
    expect(winRateOf(defaultTradingData())).toBeUndefined();
  });
  it('is wins / total', () => {
    const t = defaultTradingData();
    t.history = [{ profit: 5 } as never, { profit: -2 } as never, { profit: 1 } as never];
    expect(winRateOf(t)).toBeCloseTo(2 / 3);
  });
});

// ---------------------------------------------------------------------------
// flattenWorkspace / reconstructWorkspaces — the lossless round-trip core
// ---------------------------------------------------------------------------

function realActiveTrading(): TradingData {
  const t = defaultTradingData(10000);
  t.positions = [
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
  t.history = [
    {
      id: 'c1',
      side: 'sell',
      origin: 'market',
      entryPrice: 1.2,
      exitPrice: 1.15,
      sl: 1.25,
      tp: 1.1,
      lots: 0.2,
      riskPct: 1,
      riskUsd: 80,
      openTime: 1699000000,
      closeTime: 1699050000,
      outcome: 'tp',
      profit: 40,
      rMultiple: 0.5,
      ambiguous: false,
    },
  ];
  t.riskPct = 2.5;
  t.sessionEnd = 1700500000;
  t.balance = 10040;
  return t;
}

function activeDrawings(): Record<string, DrawingCollection> {
  const items: Drawing[] = [
    {
      id: 'd1',
      symbol: 'EURUSD',
      owner: { type: 'panel', id: 'panel-1' },
      kind: 'rect',
      p1: { time: 1699000000, price: 1.1 },
      p2: { time: 1699100000, price: 1.2 },
      zIndex: 0,
      locked: false,
      visible: true,
    },
  ];
  return { EURUSD: { version: 1, items } };
}

function realActiveSession(overrides: Partial<FlattenSession> = {}): FlattenSession {
  const { layout, panels } = singlePanelLayoutFor('EURUSD', 'H1');
  return {
    id: null,
    name: null,
    createdAt: 1_700_000_000_000,
    cursor: 1700050000,
    trading: realActiveTrading(),
    view: {
      cursor: 1700050000,
      activeTf: 'H1',
      customTfMinutes: null,
      playbackSpeed: 4,
      drawings: activeDrawings(),
      notes: [],
      selectedTfs: ['M1', 'H1'],
      startRange: 1699000000,
      endRange: 1700200000,
      layout,
      panels,
      linkGroups: [],
    },
    clientUpdatedAt: 1_700_050_000_000,
    lastOpenedAt: 1_700_050_000_000,
    ...overrides,
  };
}

function archivedSession(
  id: string,
  name: string,
  trading: TradingData,
  cursor: number,
  clientUpdatedAt: number,
): FlattenSession {
  return {
    id,
    name,
    createdAt: 1_690_000_000_000,
    cursor,
    trading,
    clientUpdatedAt,
    lastOpenedAt: null,
  };
}

function realArchivedTrading(profit: number): TradingData {
  const t = defaultTradingData(5000);
  t.history = [
    {
      id: `h-${profit}`,
      side: 'buy',
      origin: 'market',
      entryPrice: 1.0,
      exitPrice: 1.01,
      sl: 0.99,
      tp: 1.02,
      lots: 0.1,
      riskPct: 1,
      riskUsd: 50,
      openTime: 1680000000,
      closeTime: 1680005000,
      outcome: 'tp',
      profit,
      rMultiple: profit / 50,
      ambiguous: false,
    } as never,
  ];
  return t;
}

describe('flattenWorkspace', () => {
  it('round-trips the active session losslessly via reconstructWorkspaces', () => {
    const active = realActiveSession();
    const input: FlattenInput = { symbol: 'EURUSD', active, archived: [] };

    const { rows, activeSessionId } = flattenWorkspace(input);
    expect(activeSessionId).not.toBeNull();

    const stored = JSON.parse(JSON.stringify(rows)) as CloudSessionRow[];
    const workspaces = reconstructWorkspaces(stored);
    const ws = workspaces.get('EURUSD');
    expect(ws).toBeDefined();
    expect(ws!.activeSessionId).toBe(activeSessionId);
    expect(ws!.active.trading).toEqual(active.trading);
    expect(ws!.active.cursor).toBe(active.view!.cursor);
    expect(ws!.active.drawings).toEqual(active.view!.drawings);
    expect(ws!.active.selectedTfs).toEqual(active.view!.selectedTfs);
    expect(ws!.active.startRange).toBe(active.view!.startRange);
    expect(ws!.active.endRange).toBe(active.view!.endRange);
  });

  it('emits active + N archived rows, all stamped with symbol/schemaVersion, no candles', () => {
    const active = realActiveSession();
    const archived = [
      archivedSession('a1', 'Plan A', realArchivedTrading(10), 1680005000, 1_680_005_000_000),
      archivedSession('a2', 'Plan B', realArchivedTrading(-5), 1680100000, 1_680_100_000_000),
    ];
    const input: FlattenInput = { symbol: 'GBPUSD', active, archived };

    const { rows } = flattenWorkspace(input);
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.symbol).toBe('GBPUSD');
      // RFC-011 Task 4 (folded audit fix): buildRow now stamps the row with
      // the EMBEDDED payload's own schemaVersion (toPayload always emits V2,
      // D9) rather than the hardcoded V1 constant, so the cloud
      // `schema_version` column tracks reality.
      expect(row.schemaVersion).toBe(SESSION_PAYLOAD_VERSION_2);
      expect(() => assertNoCandles(row.payload)).not.toThrow();
    }
  });

  it('D3: omits an untouched default active session, activeSessionId is null', () => {
    const untouched = realActiveSession({ trading: defaultTradingData(10000) });
    const archived = [
      archivedSession('a1', 'Plan A', realArchivedTrading(10), 1680005000, 1_680_005_000_000),
    ];
    const input: FlattenInput = { symbol: 'XAUUSD', active: untouched, archived };

    const { rows, activeSessionId } = flattenWorkspace(input);
    expect(activeSessionId).toBeNull();
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('a1');
  });

  it('mints a uuid for an active session with id: null and returns it', () => {
    const active = realActiveSession({ id: null });
    const input: FlattenInput = { symbol: 'EURUSD', active, archived: [] };

    const { rows, activeSessionId } = flattenWorkspace(input);
    expect(activeSessionId).not.toBeNull();
    expect(typeof activeSessionId).toBe('string');
    expect(rows[0].id).toBe(activeSessionId);
  });
});

describe('reconstructWorkspaces', () => {
  it('archived set round-trips: id, name, createdAt, currentTime, trading', () => {
    const active = realActiveSession();
    const archived = [
      archivedSession('a1', 'Plan A', realArchivedTrading(10), 1680005000, 1_680_005_000_000),
      archivedSession('a2', 'Plan B', realArchivedTrading(-5), 1680100000, 1_680_100_000_000),
    ];
    const input: FlattenInput = { symbol: 'EURUSD', active, archived };
    const { rows } = flattenWorkspace(input);

    const workspaces = reconstructWorkspaces(rows);
    const ws = workspaces.get('EURUSD')!;
    expect(ws.sessions.length).toBe(2);

    const byId = new Map(ws.sessions.map((s) => [s.id, s]));
    for (const a of archived) {
      const got = byId.get(a.id!);
      expect(got).toBeDefined();
      expect(got!.name).toBe(a.name);
      expect(got!.createdAt).toBe(a.createdAt);
      expect(got!.currentTime).toBe(a.cursor);
      expect(got!.trading).toEqual(a.trading);
    }
  });

  it('D4: with no knownActiveIds, the newest clientUpdatedAt row becomes active', () => {
    const active = realActiveSession({ clientUpdatedAt: 1_680_000_000_000 }); // oldest
    const archived = [
      archivedSession('a1', 'Plan A', realArchivedTrading(10), 1680005000, 1_680_005_000_000),
      archivedSession(
        'a2',
        'Plan B (newest)',
        realArchivedTrading(-5),
        1680100000,
        1_690_000_000_000,
      ),
    ];
    const input: FlattenInput = { symbol: 'EURUSD', active, archived };
    const { rows } = flattenWorkspace(input);

    const workspaces = reconstructWorkspaces(rows);
    const ws = workspaces.get('EURUSD')!;
    expect(ws.activeSessionId).toBe('a2');
    expect(ws.active.trading).toEqual(archived[1].trading);
    // a1 + the original active row are now in `sessions`
    expect(ws.sessions.map((s) => s.id).sort()).toEqual(
      [rows.find((r) => r.id !== 'a1' && r.id !== 'a2')!.id, 'a1'].sort(),
    );
  });

  it('D4: with knownActiveIds containing an archived id, that row becomes active', () => {
    const active = realActiveSession({ clientUpdatedAt: 1_690_000_000_000 }); // newest, but overridden
    const archived = [
      archivedSession('a1', 'Plan A', realArchivedTrading(10), 1680005000, 1_680_005_000_000),
    ];
    const input: FlattenInput = { symbol: 'EURUSD', active, archived };
    const { rows } = flattenWorkspace(input);

    const workspaces = reconstructWorkspaces(rows, new Set(['a1']));
    const ws = workspaces.get('EURUSD')!;
    expect(ws.activeSessionId).toBe('a1');
    expect(ws.active.trading).toEqual(archived[0].trading);
  });
});

interface MergeItem {
  id: string;
  clientUpdatedAt: number;
  tag: string;
}

function item(id: string, clientUpdatedAt: number, tag: string): MergeItem {
  return { id, clientUpdatedAt, tag };
}

describe('mergeByLww', () => {
  it('cloud-newer overwrites local: merged has cloud version, id not pushed', () => {
    const local = [item('a', 100, 'local')];
    const cloud = [item('a', 200, 'cloud')];
    const result = mergeByLww(local, cloud, new Set(['a']));

    expect(result.merged).toEqual([item('a', 200, 'cloud')]);
    expect(result.toPushIds).not.toContain('a');
    expect(result.toDeleteLocalIds).toEqual([]);
  });

  it('local-newer stays and is pushed', () => {
    const local = [item('a', 200, 'local')];
    const cloud = [item('a', 100, 'cloud')];
    const result = mergeByLww(local, cloud, new Set(['a']));

    expect(result.merged).toEqual([item('a', 200, 'local')]);
    expect(result.toPushIds).toContain('a');
    expect(result.toDeleteLocalIds).toEqual([]);
  });

  it('equal clientUpdatedAt: not pushed, item kept once (local version)', () => {
    const local = [item('a', 100, 'local')];
    const cloud = [item('a', 100, 'cloud')];
    const result = mergeByLww(local, cloud, new Set(['a']));

    expect(result.merged).toEqual([item('a', 100, 'local')]);
    expect(result.toPushIds).not.toContain('a');
    expect(result.merged.length).toBe(1);
  });

  it('cloud-only is added: present in merged, not in toPushIds/toDeleteLocalIds', () => {
    const local: MergeItem[] = [];
    const cloud = [item('b', 100, 'cloud')];
    const result = mergeByLww(local, cloud, new Set());

    expect(result.merged).toEqual([item('b', 100, 'cloud')]);
    expect(result.toPushIds).not.toContain('b');
    expect(result.toDeleteLocalIds).not.toContain('b');
  });

  it('local never-synced (not in syncedIds), absent from cloud: kept and pushed', () => {
    const local = [item('c', 100, 'local')];
    const cloud: MergeItem[] = [];
    const result = mergeByLww(local, cloud, new Set());

    expect(result.merged).toEqual([item('c', 100, 'local')]);
    expect(result.toPushIds).toContain('c');
    expect(result.toDeleteLocalIds).not.toContain('c');
  });

  it('D1: local previously-synced (in syncedIds), absent from cloud: deleted locally, not merged, not pushed', () => {
    const local = [item('d', 100, 'local')];
    const cloud: MergeItem[] = [];
    const result = mergeByLww(local, cloud, new Set(['d']));

    expect(result.toDeleteLocalIds).toContain('d');
    expect(result.merged).not.toContainEqual(item('d', 100, 'local'));
    expect(result.toPushIds).not.toContain('d');
  });

  it('determinism: kept-local items keep local order, then cloud-only items in cloud order; inputs untouched', () => {
    const local = [item('k1', 100, 'local1'), item('k2', 100, 'local2')];
    const cloud = [item('c1', 50, 'cloud1'), item('k2', 100, 'local2'), item('c2', 50, 'cloud2')];
    const localCopy = local.map((x) => ({ ...x }));
    const cloudCopy = cloud.map((x) => ({ ...x }));

    const result = mergeByLww(local, cloud, new Set());

    expect(result.merged).toEqual([
      item('k1', 100, 'local1'),
      item('k2', 100, 'local2'),
      item('c1', 50, 'cloud1'),
      item('c2', 50, 'cloud2'),
    ]);
    expect(local).toEqual(localCopy);
    expect(cloud).toEqual(cloudCopy);
  });
});

// ---------------------------------------------------------------------------
// toPayload / fromPayload — RFC-011 V2 fields
// ---------------------------------------------------------------------------

function sampleV2Input(): PayloadInput {
  const { layout, panels } = singlePanelLayoutFor('EURUSD', 'H1');
  return {
    ...sampleInput(),
    drawings: { EURUSD: { version: 1, items: [] } },
    layout,
    panels,
    linkGroups: [
      { id: 'g1', color: '#f00', syncCrosshair: true, syncTimeRange: false },
    ] as LinkGroup[],
  };
}

describe('toPayload / fromPayload — RFC-011 V2 fields', () => {
  it('toPayload stamps schemaVersion 2 and carries layout/panels/linkGroups verbatim', () => {
    const input = sampleV2Input();
    const payload = toPayload(input);
    expect(payload.schemaVersion).toBe(SESSION_PAYLOAD_VERSION_2);
    expect(payload.layout).toEqual(input.layout);
    expect(payload.panels).toEqual(input.panels);
    expect(payload.linkGroups).toEqual(input.linkGroups);
    expect(payload.drawings).toEqual(input.drawings);
  });

  it('fromPayload restores layout/panels/linkGroups/drawings unchanged', () => {
    const input = sampleV2Input();
    const payload = toPayload(input);
    const restored = fromPayload(payload, 'EURUSD');
    expect(restored.layout).toEqual(input.layout);
    expect(restored.panels).toEqual(input.panels);
    expect(restored.linkGroups).toEqual(input.linkGroups);
    expect(restored.drawings).toEqual(input.drawings);
  });

  it('a full round trip (toPayload -> JSON serialize -> parseSessionPayload -> fromPayload) is lossless', () => {
    const input = sampleV2Input();
    const payload = toPayload(input);
    const wireForm = JSON.parse(JSON.stringify(payload));
    const parsed = parseSessionPayload(wireForm, 'EURUSD');
    const restored = fromPayload(parsed, 'EURUSD');
    expect(restored.layout).toEqual(input.layout);
    expect(restored.panels).toEqual(input.panels);
    expect(restored.linkGroups).toEqual(input.linkGroups);
    expect(restored.drawings).toEqual(input.drawings);
    expect(restored.trading).toEqual(input.trading);
  });

  it('assertNoCandles still passes on a V2 payload (layout/panels/linkGroups contain no candle-shaped fields)', () => {
    expect(() => assertNoCandles(toPayload(sampleV2Input()))).not.toThrow();
  });
});
