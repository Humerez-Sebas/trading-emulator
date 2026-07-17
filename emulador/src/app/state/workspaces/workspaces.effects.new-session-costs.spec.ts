import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subject } from 'rxjs';
import { take, toArray } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspacesEffects } from './workspaces.effects';
import { WorkspacesActions } from './workspaces.actions';
import { selectCurrentAsset, selectWorkspaceMetaSnapshot } from '../selectors';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { TradingActions } from '../trading/trading.actions';
import { COST_PRESETS } from '../trading/execution-costs';
import { workspaceDbStub } from '../../testing/workspace-db.stub';
import { emptyWorkspace } from './workspaces.models';
import { defaultTradingData } from '../trading/trading.models';
import { createInitialLayoutState } from '../layout/layout.models';

const CURRENT_KEY = 'emulador.currentAsset';

describe('WorkspacesEffects — switchAsset(executionCosts) RFC-014 T6b', () => {
  let actions$: Subject<any>;
  let store: MockStore;
  let db: ReturnType<typeof workspaceDbStub>;
  let effects: WorkspacesEffects;

  const SYMBOL = 'XAUUSD';

  const metaSnap = {
    files: {},
    activeTf: null,
    selectedTfs: undefined,
    currentTime: 0,
    drawings: [],
    trading: defaultTradingData(),
    sessions: [],
    activeSessionId: null,
    layout: createInitialLayoutState().workspace,
    panels: createInitialLayoutState().panels,
    linkGroups: {},
  };

  function setupTestBed() {
    db = workspaceDbStub();
    TestBed.configureTestingModule({
      providers: [
        WorkspacesEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        { provide: WorkspaceDbService, useValue: db },
      ],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(WorkspacesEffects);
    store.overrideSelector(selectCurrentAsset, null);
    store.overrideSelector(selectWorkspaceMetaSnapshot, metaSnap);
    store.refreshState();
  }

  beforeEach(() => {
    actions$ = new Subject();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => {
    localStorage.removeItem(CURRENT_KEY);
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('thenNewSession + executionCosts → newSession carries the resolved preset', async () => {
    setupTestBed();
    db.getWorkspace!.mockResolvedValue(undefined);

    const p = effects.switch$.pipe(take(2), toArray()).toPromise();
    actions$.next(
      WorkspacesActions.switchAsset({
        symbol: SYMBOL,
        thenNewSession: { name: 'X' },
        executionCosts: COST_PRESETS.Metales,
      }),
    );

    const result = await p;
    expect(result).toEqual([
      WorkspacesActions.workspaceRestored({ workspace: emptyWorkspace(SYMBOL) }),
      TradingActions.newSession({ currentCursor: 0, executionCosts: COST_PRESETS.Metales }),
    ]);
  });

  it('thenNewSession WITHOUT executionCosts → newSession carries no cost override (undefined, legacy)', async () => {
    setupTestBed();
    db.getWorkspace!.mockResolvedValue(undefined);

    const p = effects.switch$.pipe(take(2), toArray()).toPromise();
    actions$.next(WorkspacesActions.switchAsset({ symbol: SYMBOL, thenNewSession: { name: 'X' } }));

    const result = await p;
    expect(result).toEqual([
      WorkspacesActions.workspaceRestored({ workspace: emptyWorkspace(SYMBOL) }),
      TradingActions.newSession({ currentCursor: 0 }),
    ]);
  });

  it('executionCosts WITHOUT thenNewSession has no effect (no newSession action emitted)', async () => {
    setupTestBed();
    db.getWorkspace!.mockResolvedValue(undefined);

    const p = effects.switch$.pipe(take(1), toArray()).toPromise();
    actions$.next(
      WorkspacesActions.switchAsset({ symbol: SYMBOL, executionCosts: COST_PRESETS.Forex }),
    );

    const result = await p;
    expect(result).toEqual([
      WorkspacesActions.workspaceRestored({ workspace: emptyWorkspace(SYMBOL) }),
    ]);
  });
});
