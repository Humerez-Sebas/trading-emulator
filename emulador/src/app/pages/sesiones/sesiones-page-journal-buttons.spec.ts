import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SesionesPageComponent } from './sesiones-page.component';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import {
  selectCurrentAsset,
  selectCurrentTime,
  selectSavedSessions,
  selectTradingData,
} from '../../state/selectors';
import { authFeature } from '../../state/auth/auth.reducer';
import { tradingFeature } from '../../state/trading/trading.reducer';
import { workspaceDbStub } from '../../testing/workspace-db.stub';
import { workspaceMeta, savedSession } from '../../testing/fixtures';
import { defaultTradingData, TradingData } from '../../state/trading/trading.models';
import { DialogService } from '../../components/ui/dialog.service';
import { SessionSyncService } from '../../services/session-sync.service';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { DataOnboardingService } from '../../services/market-data/data-onboarding.service';
import { ManifestService } from '../../services/market-data/manifest.service';

/**
 * NEW spec file (STOP rule): `sesiones-page.component.spec.ts` is pre-
 * existing and protected — never modified, never touched. This file tests
 * ONLY the two new catalog buttons (RFC-016 §3: "Journal"/"Reflect",
 * navigation-only, zero logic) by actually RENDERING the template
 * (`fixture.detectChanges()`), which the pre-existing spec never does (it
 * injects the component as a plain provider and asserts on its signals).
 */
describe('SesionesPageComponent — Journal/Reflect catalog buttons (RFC-016 §3)', () => {
  let store: MockStore;

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  async function create(
    opts: {
      db?: Partial<ReturnType<typeof workspaceDbStub>>;
      currentAsset?: string | null;
      liveTrading?: TradingData;
      liveSessions?: ReturnType<typeof savedSession>[];
      liveActiveSessionId?: string | null;
    } = {},
  ) {
    const dbStub = workspaceDbStub();
    if (opts.db) Object.assign(dbStub, opts.db);

    TestBed.configureTestingModule({
      imports: [SesionesPageComponent],
      providers: [
        provideRouter([]),
        provideMockStore(),
        { provide: WorkspaceDbService, useValue: dbStub },
        {
          provide: DialogService,
          useValue: { prompt: vi.fn(), confirm: vi.fn(), deleteSession: vi.fn() },
        },
        { provide: MarketDataRepository, useValue: { getCandles: vi.fn() } },
        { provide: DataOnboardingService, useValue: { runJobs: vi.fn() } },
        { provide: ManifestService, useValue: { fetchManifest: vi.fn() } },
        {
          provide: SessionSyncService,
          useValue: {
            listSummaries: vi.fn().mockResolvedValue([]),
            fetchPayload: vi.fn(),
            flushDirty: vi.fn(),
            flushPendingDeletes: vi.fn(),
          },
        },
      ],
    });

    store = TestBed.inject(MockStore);
    store.overrideSelector(selectCurrentAsset, opts.currentAsset ?? null);
    store.overrideSelector(selectCurrentTime, 0);
    store.overrideSelector(selectTradingData, opts.liveTrading ?? defaultTradingData());
    store.overrideSelector(selectSavedSessions, opts.liveSessions ?? []);
    store.overrideSelector(tradingFeature.selectActiveSessionId, opts.liveActiveSessionId ?? null);
    store.overrideSelector(authFeature.selectStatus, 'anonymous');
    store.refreshState();

    const fixture = TestBed.createComponent(SesionesPageComponent);
    fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    return fixture;
  }

  /** The card/row whose text contains `name` — `allCards()` always ALSO
   * produces an "active" card for any meta with a `trading` object (every
   * `workspaceMeta()` fixture has one), so scoping by name avoids picking up
   * that unrelated sibling card's links. */
  function cardContaining(fixture: { nativeElement: HTMLElement }, name: string): HTMLElement {
    const candidates = Array.from(
      fixture.nativeElement.querySelectorAll('.card, .row'),
    ) as HTMLElement[];
    const found = candidates.find((el) => el.textContent?.includes(name));
    if (!found) throw new Error(`No card/row containing "${name}"`);
    return found;
  }

  it('an archived session card gets Journal/Reflect links to /journal/:id and /journal/:id/reflect', async () => {
    const archived = savedSession({
      id: 'arch-1',
      name: 'Vieja',
      trading: { ...defaultTradingData() },
    });
    const meta = workspaceMeta({ symbol: 'XAUUSD', sessions: [archived] });
    const fixture = await create({ db: { listMetas: vi.fn().mockResolvedValue([meta]) } });

    const card = cardContaining(fixture, 'Vieja');
    const links = Array.from(card.querySelectorAll('a')) as HTMLAnchorElement[];
    const journalLink = links.find((a) => a.textContent?.trim() === 'Journal');
    const reflectLink = links.find((a) => a.textContent?.trim() === 'Reflect');
    expect(journalLink?.getAttribute('href')).toBe('/journal/arch-1');
    expect(reflectLink?.getAttribute('href')).toBe('/journal/arch-1/reflect');
  });

  it('the ACTIVE session card (id=null) uses activeSessionId (via syncId) as the Journal/Reflect target', async () => {
    const liveTrading: TradingData = { ...defaultTradingData(), sessionName: 'En curso' };
    const meta = workspaceMeta({ symbol: 'XAUUSD' });
    const fixture = await create({
      currentAsset: 'XAUUSD',
      liveTrading,
      liveActiveSessionId: 'active-id-1',
      db: { listMetas: vi.fn().mockResolvedValue([meta]) },
    });

    const card = cardContaining(fixture, 'En curso');
    const links = Array.from(card.querySelectorAll('a')) as HTMLAnchorElement[];
    const journalLink = links.find((a) => a.textContent?.trim() === 'Journal');
    expect(journalLink?.getAttribute('href')).toBe('/journal/active-id-1');
  });

  it('Journal/Reflect are visible+enabled for a session with ZERO trades (the empty state teaches, §3)', async () => {
    const archived = savedSession({
      id: 'empty-1',
      name: 'Sin trades',
      trading: { ...defaultTradingData(), history: [] },
    });
    const meta = workspaceMeta({ symbol: 'XAUUSD', sessions: [archived] });
    const fixture = await create({ db: { listMetas: vi.fn().mockResolvedValue([meta]) } });

    const card = cardContaining(fixture, 'Sin trades');
    const links = Array.from(card.querySelectorAll('a')) as HTMLAnchorElement[];
    const journalLink = links.find((a) => a.textContent?.trim() === 'Journal');
    expect(journalLink).toBeTruthy();
    expect(journalLink!.hasAttribute('disabled')).toBe(false);
    expect(journalLink!.getAttribute('href')).toBe('/journal/empty-1');
  });

  it('journalId() resolves syncId over id, falling back to id (pure helper)', async () => {
    const fixture = await create();
    const component = fixture.componentInstance;
    expect(component.journalId({ id: 'x', syncId: 'y' } as never)).toBe('y');
    expect(component.journalId({ id: 'x', syncId: null } as never)).toBe('x');
    expect(component.journalId({ id: null, syncId: undefined } as never)).toBe('');
  });
});
