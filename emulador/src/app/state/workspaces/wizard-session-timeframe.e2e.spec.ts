import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Action, combineReducers } from '@ngrx/store';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { firstValueFrom, Subject } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChartModelMapper } from '../../components/chart/chart-model-mapper.service';
import { Candle, Timeframe, TIMEFRAME_SECONDS } from '../../models';
import { singlePanelLayoutFor } from '../../services/session-migration';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { series } from '../../testing/fixtures';
import { workspaceDbStub } from '../../testing/workspace-db.stub';
import { authFeature } from '../auth/auth.reducer';
import { drawingsFeature } from '../drawings/drawings.reducer';
import { layoutFeature } from '../layout/layout.reducer';
import { linkGroupsFeature } from '../link-groups/link-groups.reducer';
import { marketFeature } from '../market/market.reducer';
import { replayFeature } from '../replay/replay.reducer';
import { settingsFeature } from '../settings/settings.reducer';
import { tradingFeature } from '../trading/trading.reducer';
import { WorkspacesActions } from './workspaces.actions';
import { WorkspacesEffects } from './workspaces.effects';
import { emptyWorkspace, Workspace } from './workspaces.models';
import { workspacesFeature } from './workspaces.reducer';

/** The app's root reducer map, exactly as `app.config.ts` registers it. */
const rootReducer = combineReducers({
  [marketFeature.name]: marketFeature.reducer,
  [replayFeature.name]: replayFeature.reducer,
  [settingsFeature.name]: settingsFeature.reducer,
  [drawingsFeature.name]: drawingsFeature.reducer,
  [workspacesFeature.name]: workspacesFeature.reducer,
  [tradingFeature.name]: tradingFeature.reducer,
  [authFeature.name]: authFeature.reducer,
  [layoutFeature.name]: layoutFeature.reducer,
  [linkGroupsFeature.name]: linkGroupsFeature.reducer,
});
type RootState = ReturnType<typeof rootReducer>;

const SYMBOL = 'XAUUSD';
const DAY = 86_400;
/** 2023-11-14T00:00:00Z: on a D1 boundary, so on every anchor's boundary. */
const T0 = 1_699_920_000;
/** The wizard's start date: the replay cursor lands here. */
const START = T0 + 5 * DAY;
const END = T0 + 9 * DAY;

/** Ten days of aligned candles for one anchor, as `loadAnchorCandles` reads them. */
function anchorCandles(tf: Timeframe): Candle[] {
  const step = TIMEFRAME_SECONDS[tf];
  return series((10 * DAY) / step, T0, step);
}

/**
 * Regression: a session created in the wizard WITHOUT the M1 anchor (a trader
 * who only downloaded H1/D1) opened on an empty chart. `doSwitch` restored
 * `emptyWorkspace` (`activeTf: null`), so `layout.reducer` seeded the single
 * panel with its `?? 'M1'` fallback while `market.reducer` activated the first
 * loaded TF; the panel's own `ChartModelMapper` then asked for M1, which
 * `generateCustomSeries(…, 1)` cannot build from H1/D1 → 0 candles, idx −1.
 *
 * Proven end to end through the REAL `WorkspacesEffects.switch$`, the REAL
 * reducers (every emitted action folded in order) and the REAL mapper feed the
 * ChartComponent paints from (`chartView$`). No selector is overridden.
 */
describe('wizard session opens on a timeframe it can paint (empty-chart regression)', () => {
  let actions$: Subject<Action>;
  let store: MockStore;
  let db: ReturnType<typeof workspaceDbStub>;
  let effects: WorkspacesEffects;
  let initial: RootState;

  beforeEach(() => {
    actions$ = new Subject<Action>();
    db = workspaceDbStub();
    initial = rootReducer(undefined, { type: '@@init' });
    TestBed.configureTestingModule({
      providers: [
        WorkspacesEffects,
        ChartModelMapper,
        provideMockActions(() => actions$),
        provideMockStore({ initialState: initial }),
        { provide: WorkspaceDbService, useValue: db },
      ],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(WorkspacesEffects);
  });

  afterEach(() => {
    store.resetSelectors();
    TestBed.resetTestingModule();
    // doSwitch remembers the active asset; don't leak it into other spec files.
    localStorage.removeItem('emulador.currentAsset');
  });

  /**
   * The wizard's confirm (`CrearSesionPageComponent.confirmR2`): runs its
   * `switchAsset` through the real `doSwitch` and folds every emitted action
   * through the real reducers, in emission order.
   */
  async function confirmWizard(selectedTfs: Timeframe[], stored?: Workspace): Promise<RootState> {
    db.getWorkspace!.mockResolvedValue(stored);
    const emitted = firstValueFrom(effects.switch$.pipe(toArray()));
    actions$.next(
      WorkspacesActions.switchAsset({
        symbol: SYMBOL,
        selectedTfs,
        thenLoad: selectedTfs.map((tf) => ({
          tf,
          candles: anchorCandles(tf),
          fileName: `${tf}.csv`,
        })),
        thenNewSession: { name: 'Sesión' },
        thenGoTo: START,
        thenSessionEnd: END,
      }),
    );
    actions$.complete();
    return (await emitted).reduce((state, action) => rootReducer(state, action), initial);
  }

  /** What the focused panel paints: its descriptor and its own mapper's `chartView$`. */
  function paintFocusedPanel(state: RootState) {
    store.setState(state);
    const descriptor = state.layout.panels[state.layout.focusedPanelId!];
    const mapper = TestBed.inject(ChartModelMapper);
    mapper.configurePanel(descriptor);
    let view: { tf: string | null; candles: Candle[]; idx: number } | undefined;
    mapper.chartView$.subscribe((v) => (view = v)).unsubscribe();
    return { descriptor, view: view! };
  }

  it.each([
    { selected: ['H1', 'D1'], opensOn: 'H1' },
    { selected: ['H1'], opensOn: 'H1' },
    { selected: ['D1'], opensOn: 'D1' },
  ] as const)(
    'a new $selected session (no M1 anchor) paints $opensOn candles up to the start date',
    async ({ selected, opensOn }) => {
      const state = await confirmWizard([...selected]);
      const { descriptor, view } = paintFocusedPanel(state);

      expect(descriptor.timeframe).toBe(opensOn);
      // The focused panel is the global-TF proxy: toolbar, replay and fills agree with it.
      expect(state.market.activeTf).toBe(opensOn);
      expect(view.tf).toBe(opensOn);
      expect(view.candles).toBe(state.market.series[opensOn]);
      expect(view.idx).toBeGreaterThanOrEqual(0);
      expect(view.candles[view.idx].time).toBe(START);
    },
  );

  it.each([{ selected: ['M1', 'H1', 'D1'] }, { selected: ['M1'] }] as const)(
    'a new $selected session (with M1) is unchanged: M1 panel, M1 active, painting M1 up to the start date',
    async ({ selected }) => {
      const state = await confirmWizard([...selected]);
      const { descriptor, view } = paintFocusedPanel(state);

      expect(descriptor.timeframe).toBe('M1');
      expect(state.market.activeTf).toBe('M1');
      expect(state.market.customTf).toBeNull();
      expect(state.replay.currentTime).toBe(START);
      expect(state.replay.resolutionMinutes).toBeNull();
      expect(view.tf).toBe('M1');
      expect(view.candles).toBe(state.market.series.M1);
      expect(view.candles[view.idx].time).toBe(START);
    },
  );

  it('heals a symbol whose stored layout is stuck on the M1 fallback (a session created while this bug was live)', async () => {
    const { layout, panels } = singlePanelLayoutFor(SYMBOL, 'M1');
    const stuck: Workspace = {
      ...emptyWorkspace(SYMBOL),
      series: { H1: anchorCandles('H1'), D1: anchorCandles('D1') },
      activeTf: 'H1',
      selectedTfs: ['H1', 'D1'],
      layout,
      panels,
    };

    const state = await confirmWizard(['H1', 'D1'], stuck);
    const { descriptor, view } = paintFocusedPanel(state);

    expect(descriptor.timeframe).toBe('H1');
    expect(state.market.activeTf).toBe('H1');
    expect(view.candles[view.idx].time).toBe(START);
  });

  it('keeps a stored workspace on its timeframe when the new session still selects it', async () => {
    const { layout, panels } = singlePanelLayoutFor(SYMBOL, 'D1');
    const stored: Workspace = {
      ...emptyWorkspace(SYMBOL),
      series: { M1: anchorCandles('M1'), H1: anchorCandles('H1'), D1: anchorCandles('D1') },
      activeTf: 'D1',
      selectedTfs: ['M1', 'H1', 'D1'],
      layout,
      panels,
    };

    const state = await confirmWizard(['M1', 'H1', 'D1'], stored);
    const { descriptor, view } = paintFocusedPanel(state);

    expect(descriptor.timeframe).toBe('D1');
    expect(state.market.activeTf).toBe('D1');
    expect(view.candles[view.idx].time).toBe(START);
  });
});
