import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JournalDataService } from './journal-data.service';
import { WorkspaceDbService } from './workspace-db.service';
import { TelemetryDbService } from './telemetry-db.service';
import { workspaceDbStub } from '../testing/workspace-db.stub';
import { closed, workspaceMeta } from '../testing/fixtures';
import { defaultTradingData } from '../state/trading/trading.models';
import { selectCurrentAsset, selectSavedSessions, selectTradingData } from '../state/selectors';
import { tradingFeature } from '../state/trading/trading.reducer';
import { selectPlaybookRules } from '../state/playbook/playbook.selectors';
import { selectLessonByTradeRef } from '../state/lessons/lessons.selectors';

/**
 * RFC-016 MEDIUM-3: the read-model cache is "invalidated on navigation away"
 * (component-architecture §3 item 1). Leaving the `/journal/` area clears it;
 * moving between Journal and Cabin (both under `/journal/`) keeps it.
 */
@Component({ standalone: true, template: '' })
class StubPage {}

describe('JournalDataService cache invalidation on navigation (MEDIUM-3)', () => {
  let store: MockStore;
  let router: Router;
  let service: JournalDataService;
  let listMetas: ReturnType<typeof vi.fn>;

  function setup() {
    listMetas = vi.fn().mockResolvedValue([workspaceMeta({ symbol: 'XAUUSD' })]);
    const dbStub = Object.assign(workspaceDbStub(), { listMetas });
    TestBed.configureTestingModule({
      providers: [
        JournalDataService,
        provideRouter([
          { path: 'journal/:sessionId', component: StubPage },
          { path: 'journal/:sessionId/reflect/:tradeId', component: StubPage },
          { path: 'emulador', component: StubPage },
        ]),
        provideMockStore(),
        { provide: WorkspaceDbService, useValue: dbStub },
        {
          provide: TelemetryDbService,
          useValue: { listForSession: vi.fn().mockResolvedValue([]) },
        },
      ],
    });
    store = TestBed.inject(MockStore);
    store.overrideSelector(selectCurrentAsset, 'XAUUSD');
    store.overrideSelector(selectTradingData, {
      ...defaultTradingData(),
      history: [closed({ id: 't1' })],
    });
    store.overrideSelector(selectSavedSessions, []);
    store.overrideSelector(tradingFeature.selectActiveSessionId, 'a1');
    store.overrideSelector(selectPlaybookRules, []);
    store.overrideSelector(selectLessonByTradeRef, {});
    store.refreshState();
    router = TestBed.inject(Router);
    service = TestBed.inject(JournalDataService);
  }

  afterEach(() => {
    store?.resetSelectors();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('a trade closed after the Journal was opened is present when the Journal is reopened', async () => {
    setup();
    await router.navigateByUrl('/journal/a1');
    const first = await service.loadSessionReadModel('a1');
    expect(first.trades.map((t) => t.id)).toEqual(['t1']);

    await router.navigateByUrl('/emulador'); // leave the Journal area
    store.overrideSelector(selectTradingData, {
      ...defaultTradingData(),
      history: [closed({ id: 't1' }), closed({ id: 't2' })],
    });
    store.refreshState(); // the trader closes a trade in the practice workspace

    await router.navigateByUrl('/journal/a1');
    const reopened = await service.loadSessionReadModel('a1');
    expect(reopened.trades.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('moving between Journal and Cabin keeps the cache (no second read)', async () => {
    setup();
    await router.navigateByUrl('/journal/a1');
    await service.loadSessionReadModel('a1');
    await router.navigateByUrl('/journal/a1/reflect/t1');
    await service.loadSessionReadModel('a1');
    await router.navigateByUrl('/journal/a1');
    await service.loadSessionReadModel('a1');
    expect(listMetas).toHaveBeenCalledTimes(1);
  });

  it('leaving the Journal area clears the cache (re-read on return)', async () => {
    setup();
    await router.navigateByUrl('/journal/a1');
    await service.loadSessionReadModel('a1');
    await router.navigateByUrl('/emulador');
    await router.navigateByUrl('/journal/a1');
    await service.loadSessionReadModel('a1');
    expect(listMetas).toHaveBeenCalledTimes(2);
  });
});
