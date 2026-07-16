import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JournalDataService, JournalSessionNotFoundError } from './journal-data.service';
import { WorkspaceDbService } from './workspace-db.service';
import { TelemetryDbService } from './telemetry-db.service';
import { workspaceDbStub } from '../testing/workspace-db.stub';
import { closed, savedSession, workspaceMeta } from '../testing/fixtures';
import { defaultTradingData, TradingData } from '../state/trading/trading.models';
import {
  selectCurrentAsset,
  selectSavedSessions,
  selectTradingData,
} from '../state/selectors';
import { tradingFeature } from '../state/trading/trading.reducer';
import { selectPlaybookRules } from '../state/playbook/playbook.selectors';
import { selectLessonByTradeRef } from '../state/lessons/lessons.selectors';
import type { PlaybookRule } from '../state/playbook/playbook.models';
import type { Lesson } from '../state/lessons/lessons.models';
import type { TelemetryEvent } from '../state/telemetry/telemetry.models';
import type { DatasetRecord } from '../services/market-data-db';

function playbookRule(p: Partial<PlaybookRule> = {}): PlaybookRule {
  return {
    id: 'r1',
    title: 'Ruptura de rango',
    statement: 'SECRET internal statement, must never leak to the Journal (P-2)',
    createdAt: 0,
    status: 'active',
    shortcutSlot: 1,
    sortOrder: 0,
    amendments: [],
    ...p,
  };
}

function lesson(p: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l1',
    authoredAt: 0,
    whatHappened: '',
    repeat: '',
    avoid: '',
    linkedRuleIds: [],
    evidence: [],
    tradeRefs: [],
    sessionRef: 's1',
    ...p,
  };
}

function dataset(p: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    id: 'XAUUSD|M1|2024',
    symbol: 'XAUUSD',
    timeframe: 'M1',
    year: '2024',
    size: 0,
    etag: '',
    updatedAt: '',
    ...p,
  };
}

describe('JournalDataService', () => {
  let store: MockStore;
  let dispatch: ReturnType<typeof vi.spyOn>;
  let dbStub: ReturnType<typeof workspaceDbStub>;
  let telemetryStub: { listForSession: ReturnType<typeof vi.fn> };
  let service: JournalDataService;

  function create(opts: {
    db?: Partial<ReturnType<typeof workspaceDbStub>>;
    telemetry?: TelemetryEvent[];
    currentAsset?: string | null;
    liveTrading?: TradingData;
    liveSavedSessions?: ReturnType<typeof savedSession>[];
    liveActiveSessionId?: string | null;
    rules?: PlaybookRule[];
    lessonByTradeRef?: Record<string, Lesson>;
  } = {}) {
    dbStub = workspaceDbStub();
    if (opts.db) Object.assign(dbStub, opts.db);
    telemetryStub = { listForSession: vi.fn().mockResolvedValue(opts.telemetry ?? []) };

    TestBed.configureTestingModule({
      providers: [
        JournalDataService,
        provideMockStore(),
        { provide: WorkspaceDbService, useValue: dbStub },
        { provide: TelemetryDbService, useValue: telemetryStub },
      ],
    });

    store = TestBed.inject(MockStore);
    store.overrideSelector(selectCurrentAsset, opts.currentAsset ?? null);
    store.overrideSelector(selectTradingData, opts.liveTrading ?? defaultTradingData());
    store.overrideSelector(selectSavedSessions, opts.liveSavedSessions ?? []);
    store.overrideSelector(tradingFeature.selectActiveSessionId, opts.liveActiveSessionId ?? null);
    store.overrideSelector(selectPlaybookRules, opts.rules ?? []);
    store.overrideSelector(selectLessonByTradeRef, opts.lessonByTradeRef ?? {});
    store.refreshState();

    dispatch = vi.spyOn(store, 'dispatch');
    service = TestBed.inject(JournalDataService);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('resolves the ACTIVE session of the CURRENT asset from live store state', async () => {
    const trading: TradingData = {
      ...defaultTradingData(),
      sessionName: 'Vivo',
      history: [closed({ id: 't1' })],
      balance: 10200,
    };
    create({
      currentAsset: 'XAUUSD',
      liveTrading: trading,
      liveActiveSessionId: 'active-1',
      db: { listMetas: vi.fn().mockResolvedValue([workspaceMeta({ symbol: 'XAUUSD' })]) },
    });

    const model = await service.loadSessionReadModel('active-1');
    expect(model.symbol).toBe('XAUUSD');
    expect(model.name).toBe('Vivo');
    expect(model.balance).toBe(10200);
    expect(model.trades).toHaveLength(1);
    expect(model.stats.totalTrades).toBe(1);
  });

  it('resolves an ARCHIVED session of a NON-current asset from the persisted meta', async () => {
    const archived = savedSession({
      id: 's1',
      name: 'Vieja',
      trading: { ...defaultTradingData(), history: [closed({ id: 't1' })] },
    });
    const meta = workspaceMeta({ symbol: 'EURUSD', sessions: [archived] });
    create({
      currentAsset: 'XAUUSD', // not the live asset
      db: { listMetas: vi.fn().mockResolvedValue([meta]) },
    });

    const model = await service.loadSessionReadModel('s1');
    expect(model.symbol).toBe('EURUSD');
    expect(model.name).toBe('Vieja');
  });

  it('resolves an ARCHIVED session of the CURRENT asset from LIVE selectSavedSessions, not the stale meta', async () => {
    const staleArchived = savedSession({ id: 's1', name: 'Meta desactualizada' });
    const liveArchived = savedSession({ id: 's1', name: 'Vivo actualizado' });
    const meta = workspaceMeta({ symbol: 'XAUUSD', sessions: [staleArchived] });
    create({
      currentAsset: 'XAUUSD',
      liveSavedSessions: [liveArchived],
      db: { listMetas: vi.fn().mockResolvedValue([meta]) },
    });

    const model = await service.loadSessionReadModel('s1');
    expect(model.name).toBe('Vivo actualizado');
  });

  it('rejects with JournalSessionNotFoundError when no local session matches (also the cloud-only case, documented)', async () => {
    create({ db: { listMetas: vi.fn().mockResolvedValue([]) } });
    await expect(service.loadSessionReadModel('ghost')).rejects.toBeInstanceOf(
      JournalSessionNotFoundError,
    );
  });

  it('rules carry ONLY id/title/shortcutSlot/sortOrder — never `statement` (P-2), sorted by sortOrder, retired included', async () => {
    create({
      db: { listMetas: vi.fn().mockResolvedValue([workspaceMeta({ symbol: 'XAUUSD', activeSessionId: 'a1' })]) },
      currentAsset: 'XAUUSD',
      liveActiveSessionId: 'a1',
      rules: [
        playbookRule({ id: 'r2', title: 'B', sortOrder: 5, status: 'retired' }),
        playbookRule({ id: 'r1', title: 'A', sortOrder: 1, status: 'active' }),
      ],
    });
    const model = await service.loadSessionReadModel('a1');
    expect(model.rules.map((r) => r.id)).toEqual(['r1', 'r2']); // sorted by sortOrder
    for (const r of model.rules) {
      expect(Object.keys(r).sort()).toEqual(['id', 'shortcutSlot', 'sortOrder', 'title']);
    }
  });

  it('lessonByTradeRef is filtered to THIS session\'s trade ids — a lesson for a trade outside this session never leaks (J-5)', async () => {
    const trading: TradingData = { ...defaultTradingData(), history: [closed({ id: 'in-session' })] };
    create({
      currentAsset: 'XAUUSD',
      liveTrading: trading,
      liveActiveSessionId: 'a1',
      db: { listMetas: vi.fn().mockResolvedValue([workspaceMeta({ symbol: 'XAUUSD' })]) },
      lessonByTradeRef: {
        'in-session': lesson({ tradeRefs: ['in-session'] }),
        'other-session-trade': lesson({ id: 'l2', sessionRef: 'other', tradeRefs: ['other-session-trade'] }),
      },
    });
    const model = await service.loadSessionReadModel('a1');
    expect(Object.keys(model.lessonByTradeRef)).toEqual(['in-session']);
  });

  it('datasetRefs are this symbol\'s local dataset ids only', async () => {
    create({
      currentAsset: 'XAUUSD',
      liveActiveSessionId: 'a1',
      db: {
        listMetas: vi.fn().mockResolvedValue([workspaceMeta({ symbol: 'XAUUSD' })]),
        listDatasets: vi.fn().mockResolvedValue([
          dataset({ id: 'XAUUSD|M1|2024', symbol: 'XAUUSD' }),
          dataset({ id: 'XAUUSD|H1|all', symbol: 'XAUUSD', timeframe: 'H1', year: 'all' }),
          dataset({ id: 'EURUSD|M1|2024', symbol: 'EURUSD' }),
        ]),
      },
    });
    const model = await service.loadSessionReadModel('a1');
    expect(model.datasetRefs.sort()).toEqual(['XAUUSD|H1|all', 'XAUUSD|M1|2024']);
  });

  it('baseTfSeconds is the M1 execution granularity (60), independent of the session\'s display TF', async () => {
    create({
      currentAsset: 'XAUUSD',
      liveActiveSessionId: 'a1',
      db: { listMetas: vi.fn().mockResolvedValue([workspaceMeta({ symbol: 'XAUUSD' })]) },
    });
    const model = await service.loadSessionReadModel('a1');
    expect(model.baseTfSeconds).toBe(60);
  });

  it('caches by sessionId: a second load for the same id does not re-read the DB or telemetry', async () => {
    const listMetas = vi.fn().mockResolvedValue([workspaceMeta({ symbol: 'XAUUSD' })]);
    create({
      currentAsset: 'XAUUSD',
      liveActiveSessionId: 'a1',
      db: { listMetas },
    });
    await service.loadSessionReadModel('a1');
    await service.loadSessionReadModel('a1');
    expect(listMetas).toHaveBeenCalledTimes(1);
    expect(telemetryStub.listForSession).toHaveBeenCalledTimes(1);
  });

  it('clear() forces the next load to re-read', async () => {
    const listMetas = vi.fn().mockResolvedValue([workspaceMeta({ symbol: 'XAUUSD' })]);
    create({
      currentAsset: 'XAUUSD',
      liveActiveSessionId: 'a1',
      db: { listMetas },
    });
    await service.loadSessionReadModel('a1');
    service.clear();
    await service.loadSessionReadModel('a1');
    expect(listMetas).toHaveBeenCalledTimes(2);
  });

  it('a failed load is NOT cached — a subsequent call re-attempts the read', async () => {
    const listMetas = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([
      workspaceMeta({ symbol: 'XAUUSD' }),
    ]);
    create({ currentAsset: 'XAUUSD', liveActiveSessionId: 'a1', db: { listMetas } });
    await expect(service.loadSessionReadModel('a1')).rejects.toThrow('boom');
    const model = await service.loadSessionReadModel('a1');
    expect(model.symbol).toBe('XAUUSD');
    expect(listMetas).toHaveBeenCalledTimes(2);
  });

  // ---- J-6: read-side purity ----

  it('J-6: never dispatches to the store (pure read-side)', async () => {
    create({
      currentAsset: 'XAUUSD',
      liveActiveSessionId: 'a1',
      db: { listMetas: vi.fn().mockResolvedValue([workspaceMeta({ symbol: 'XAUUSD' })]) },
    });
    await service.loadSessionReadModel('a1');
    await service.loadSessionReadModel('unknown').catch(() => undefined);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
