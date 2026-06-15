# Test plan — raise coverage to ≥80% (lines + statements)

Coverage globs (from `angular.json`, enforced by `npm run test:coverage`):
`src/app/state/**/*.ts`, `src/app/services/**/*.ts`, `src/app/auth/**/*.ts`, `src/app/pages/**/*.ts`.
`components/**` is NOT measured. Baseline: 34.7% statements / 36.3% lines.

Existing passing specs (36 tests, study for house style):
`state/trading/fill-engine.spec.ts`, `state/trading/trading.reducer.spec.ts`,
`state/trading/session-csv.spec.ts`, `app.spec.ts`.

This plan is split into three AREAS so three implementers can work in parallel
without colliding. Shared fixtures (section 1) MUST land first (or be created by
whoever starts earliest); all areas import from them.

---

## Coverage budget — where the lines are (measured files only)

| file | LOC | area | priority |
|---|---|---|---|
| state/selectors.ts | 435 | 1 | BIG WIN |
| state/trading/fill-engine.ts | 325 | (already covered) | — |
| state/trading/trading.reducer.ts | 297 | 1 | mostly covered; extend |
| pages/crear-sesion/...ts | 281 | 3 | BIG WIN |
| services/workspace-db.service.ts | 210 | 3 | BIG WIN (needs fake-indexeddb) |
| state/workspaces/workspaces.effects.ts | 203 | 2 | BIG WIN |
| pages/sesiones/...ts | 191 | 3 | BIG WIN |
| state/trading/trading.models.ts | 183 | 1 | partly covered |
| state/trading/session-csv.ts | 173 | (already covered) | — |
| state/settings/settings.reducer.ts | 165 | 1 | BIG WIN |
| state/settings/settings.models.ts | 159 | 1 | mostly constants (free) |
| services/backend-api.service.ts | 109 | 3 | medium |
| state/auth/auth.effects.ts | 100 | 2 | medium |
| state/trading/trading.effects.ts | 97 | 2 | medium |
| pages/mercados/...ts | 79 | 3 | small |
| services/csv-loader.service.ts | 75 | 3 | small |
| pages/emulador/...ts | 73 | 3 | small (createComponent smoke) |
| state/drawings/drawings.reducer.ts | 66 | 1 | small |
| state/replay/replay.effects.ts | 65 | 2 | small |
| state/auth/auth.reducer.ts | 64 | 1 | small |
| auth/auth.interceptor.ts | 56 | 2 | medium (regression-prone) |
| pages/auth/auth-page.component.ts | 51 | 3 | small |
| state/market/market.reducer.ts | 49 | 1 | small |
| state/replay/replay.reducer.ts | 44 | 1 | small |
| state/workspaces/workspaces.reducer.ts | 39 | 1 | small |
| auth/auth.guard.ts | 26 | 2 | small |

The two unavoidable BIG WINS that gate 80%: **workspace-db.service.ts** (210
LOC, raw IndexedDB — needs `fake-indexeddb`) and **selectors.ts** (435 LOC).
Skipping either makes 80% essentially unreachable.

---

# 1. Patterns & fixtures

## 1.1 devDependencies to add

```
npm i -D fake-indexeddb
```

Required ONLY for `workspace-db.service.spec.ts` (jsdom has no IndexedDB).
Nothing else needs new deps. `@angular/core/testing`, `@ngrx/store/testing`
(`provideMockStore`), `@ngrx/effects/testing` (`provideMockActions`) and
`@angular/common/http/testing` ship with the existing Angular/NgRx versions.

> NgRx 21 still ships `provideMockStore`/`provideMockActions`. Use them.

## 1.2 Shared fixtures file — `src/app/testing/fixtures.ts`

Create this ONE file (new `src/app/testing/` dir). Exact signatures below so the
three areas import identical helpers and do not redefine builders.

```ts
import { Candle, Timeframe } from '../models';
import {
  ClosedTrade, PendingOrder, Position, SavedSession,
  TradingData, TradingState, defaultTradingData,
} from '../state/trading/trading.models';
import { Workspace, WorkspaceMeta } from '../state/workspaces/workspaces.models';
import { BackendSymbol, TfCoverage } from '../services/backend-api.service';

// ---- candles ----
export function candle(
  time: number, open = 100, high = 101, low = 99, close = 100,
): Candle { return { time, open, high, low, close }; }

/** `n` candles starting at `start`, spaced `step` seconds (default 3600 = H1). */
export function series(n: number, start = 0, step = 3600, price = 100): Candle[] {
  return Array.from({ length: n }, (_, i) =>
    candle(start + i * step, price, price + 1, price - 1, price));
}

// ---- trading entities (mirror the existing reducer.spec builders) ----
export function order(p: Partial<PendingOrder> = {}): PendingOrder {
  return { id: 'o1', side: 'buy', type: 'limit', entryPrice: 4000, sl: 3990,
    tp: 4020, lots: 0.1, riskPct: 1, riskUsd: 100, createdAt: 0, ...p };
}
export function position(p: Partial<Position> = {}): Position {
  return { id: 'p1', side: 'buy', entryPrice: 4000, sl: 3990, tp: 4020,
    lots: 0.1, riskPct: 1, riskUsd: 100, openTime: 0, origin: 'market', ...p };
}
export function closed(p: Partial<ClosedTrade> = {}): ClosedTrade {
  return { id: 't1', side: 'buy', origin: 'market', entryPrice: 4000,
    exitPrice: 4020, sl: 3990, tp: 4020, lots: 0.1, riskPct: 1, riskUsd: 100,
    openTime: 0, closeTime: 60, outcome: 'tp', profit: 200, rMultiple: 2,
    ambiguous: false, ...p };
}
export function tradingState(p: Partial<TradingState> = {}): TradingState {
  return { ...defaultTradingData(), summaryOpen: false, savedSessions: [], ...p };
}
export function savedSession(p: Partial<SavedSession> = {}): SavedSession {
  return { id: 's1', name: 'Sesión', createdAt: 1, currentTime: 0,
    trading: defaultTradingData(), ...p };
}

// ---- workspaces ----
export function workspace(p: Partial<Workspace> = {}): Workspace {
  return { symbol: 'XAUUSD', series: {}, files: {}, activeTf: null,
    currentTime: 0, drawings: [], trading: defaultTradingData(),
    sessions: [], lastModified: 1, ...p };
}
export function workspaceMeta(p: Partial<WorkspaceMeta> = {}): WorkspaceMeta {
  const { series: _s, ...meta } = workspace(p as Partial<Workspace>);
  return meta as WorkspaceMeta;
}

// ---- backend symbols (mercados / crear-sesion) ----
export function tfCoverage(p: Partial<TfCoverage> = {}): TfCoverage {
  return { tf: 'H1', desde: 1_700_000_000, hasta: 1_710_000_000, velas: 1000, ...p };
}
export function backendSymbol(p: Partial<BackendSymbol> = {}): BackendSymbol {
  return { name: 'XAUUSD', descripcion: 'Oro', categoria: 'Metales',
    digits: 2, cobertura: [tfCoverage()], ...p };
}
```

## 1.3 Stubbed `WorkspaceDbService` — `src/app/testing/workspace-db.stub.ts`

Used by AREA 2 (workspaces.effects) and AREA 3 (crear-sesion, sesiones pages).
A plain class whose methods are `vi.fn()` returning resolved promises; tests
override per-case with `mockResolvedValue` / `mockRejectedValue`.

```ts
import { vi } from 'vitest';
import { WorkspaceDbService } from '../services/workspace-db.service';

export function workspaceDbStub(): Partial<Record<keyof WorkspaceDbService, ReturnType<typeof vi.fn>>> {
  return {
    list: vi.fn().mockResolvedValue([]),
    listMetas: vi.fn().mockResolvedValue([]),
    getWorkspace: vi.fn().mockResolvedValue(undefined),
    getMeta: vi.fn().mockResolvedValue(undefined),
    getSeriesInfo: vi.fn().mockResolvedValue(null),
    putMeta: vi.fn().mockResolvedValue(undefined),
    putSeries: vi.fn().mockResolvedValue(undefined),
    appendSeriesChunk: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}
```
Provide with `{ provide: WorkspaceDbService, useValue: workspaceDbStub() }`.

## 1.4 Pattern skeletons

### A. Reducer (existing house style — direct `feature.reducer` calls)
```ts
import { describe, expect, it } from 'vitest';
import { settingsFeature } from './settings.reducer';
import { SettingsActions } from './settings.actions';
const reducer = settingsFeature.reducer;
it('does X', () => {
  const next = reducer(initial, SettingsActions.changeTheme({ theme: 'light' }));
  expect(next.theme).toBe('light');
});
```
For the *initial* state of a feature with a captured initial state, pass an
explicit state object; for parameterless reducers call
`reducer(undefined, { type: '@@init' } as any)` to hit the default branch.

### B. Selectors — use `.projector()` (DECISION: projector, never a real store)
`createSelector` exposes `.projector(...inputResults)` which runs only the
combiner. Feature selectors (`marketFeature.selectActiveTf`, etc.) are plain
state-slice selectors: call them with the slice object directly.
```ts
import { selectVisibleIndex } from './selectors';
it('binary-searches the last candle <= cursor', () => {
  expect(selectVisibleIndex.projector(series(5, 0, 3600), 3 * 3600)).toBe(3);
});
```
Re-exported feature selectors (e.g. `selectActiveTf = marketFeature.selectActiveTf`)
are tested by invoking with a minimal `MarketState` object — they are 1-liners,
cover them only incidentally via composed selectors where cheap.

### C. Effects — `provideMockActions` + Subject source, plus `provideMockStore`
DECISION: plain `Subject<Action>` as the actions source + `firstValueFrom` /
array collection — NOT marbles (vitest 4 + rxjs interplay is simplest this way).
Effects using `withLatestFrom(store.select(sel))` need `provideMockStore` with
`overrideSelector`. Effects that call async DB methods (workspaces) get the
`workspaceDbStub`.
```ts
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subject } from 'rxjs';
import { toArray, take } from 'rxjs/operators';

let actions$: Subject<any>;
beforeEach(() => {
  actions$ = new Subject();
  TestBed.configureTestingModule({
    providers: [
      ReplayEffects,
      provideMockActions(() => actions$),
      provideMockStore(),
    ],
  });
  store = TestBed.inject(MockStore);
  store.overrideSelector(selectActiveCandles, series(3, 0, 3600));
  store.overrideSelector(selectVisibleIndex, 0);
});
it('advances to the next candle time', async () => {
  const eff = TestBed.inject(ReplayEffects);
  const p = firstValueFrom(eff.advance$.pipe(take(1)));
  actions$.next(ReplayActions.advanceCandle());
  expect(await p).toEqual(ReplayActions.goToTime({ time: 3600 }));
});
```
For effects that emit MULTIPLE actions (`mergeMap([...])`), collect with
`.pipe(take(n), toArray())`. For `{ dispatch: false }` effects subscribe and
assert the side effect (router/dispatch spy) fired.

> NOTE for `WorkspacesEffects.init$` / `switch$`: they wrap an async method in
> `from(...).pipe(mergeMap(actions => actions))`, so subscribing yields the
> emitted actions one by one — collect with `take(N), toArray()`. The N is
> deterministic per case (see AREA 2).

### D. Interceptor / Guard — functional, run in injection context
```ts
TestBed.configureTestingModule({
  providers: [
    provideHttpClient(withInterceptors([authInterceptor])),
    provideHttpClientTesting(),
    provideMockStore(),
    { provide: Router, useValue: { navigateByUrl: vi.fn(), createUrlTree: vi.fn() } },
  ],
});
// guard: TestBed.runInInjectionContext(() => authGuard(route, state))
// interceptor: drive a real HttpClient request; assert via HttpTestingController
```
The interceptor is best tested end-to-end through `HttpClient` + the testing
backend so the `next` chain and `withCredentials` clone are exercised.

### E. Services with HttpClient — `HttpTestingController`
```ts
TestBed.configureTestingModule({
  providers: [provideHttpClient(), provideHttpClientTesting()],
});
const http = TestBed.inject(HttpTestingController);
api.login('u', 'p').subscribe(...);
const req = http.expectOne('http://localhost:8000/auth/login');
expect(req.request.body).toEqual({ username: 'u', password: 'p' });
req.flush({ id: 1, username: 'u' });
http.verify();
```
For `downloadChunked` (async loop) flush two chunks: first with `siguiente`
non-null, second with `siguiente: null`; assert `onChunk` called twice and the
2nd request carried `desde`.

### F. Page component classes — TestBed + provideMockStore + service stubs
DECISION: instantiate via `TestBed.createComponent` (or `TestBed.inject` of the
class through a providers array) with `provideMockStore`, stub services, and a
`vi.spyOn(store, 'dispatch')`. Assert dispatched actions and signal outputs;
avoid asserting on DOM where the logic lives in the class (most of it does).
`createComponent` is fine for the thin shells (emulador) as a smoke test.
```ts
const store = TestBed.inject(MockStore);
const dispatch = vi.spyOn(store, 'dispatch');
// ... call component method ...
expect(dispatch).toHaveBeenCalledWith(TradingActions.deleteSession({ id: 's1' }));
```

## 1.5 localStorage / globals discipline
`settings.reducer.ts` reads `localStorage` at MODULE LOAD (`loadInitialState()`
runs when `tradingFeature`/`settingsFeature` is imported). jsdom provides
`localStorage`. For the rehydration tests (regression #3) you must set the key
BEFORE importing the reducer — use `vi.resetModules()` + dynamic `import()`
inside the test, or test `validSidePanel`/`loadInitialState` behavior by seeding
`localStorage` then `await import('./settings.reducer')`. Always
`localStorage.clear()` in `afterEach`. Same for `emulador.currentAsset` in the
workspaces effect tests. `window.prompt`/`window.confirm`/`setTimeout` in the
sesiones page must be stubbed with `vi.spyOn(window, 'prompt')` etc.

---

# 2. AREA 1 — reducers + selectors + models

Files: `state/market`, `state/replay`, `state/settings`, `state/drawings`,
`state/workspaces/workspaces.reducer.ts`, `state/trading/trading.models.ts`,
`state/trading/trading.reducer.ts` (EXTEND existing spec), `state/auth/auth.reducer.ts`,
**`state/selectors.ts` (BIG WIN)**.

### `market.reducer.spec.ts` (new)
- `csvLoaded`: stores candles+fileName under the tf; first load sets `activeTf`
  to that tf; a second load of a different tf keeps the original `activeTf`.
- `changeTimeframe`: switches `activeTf` only if that tf has a series; no-op
  (returns same state) when the tf is not loaded.
- `workspaceRestored`: replaces series/files/activeTf wholesale from the
  workspace (use `workspace({ series: {H1: series(2)}, activeTf: 'H1' })`).
- default branch: `reducer(undefined, {type:'@@init'})` → empty `series`/`files`,
  `activeTf: null`.

### `replay.reducer.spec.ts` (new)
- `goToTime` sets `currentTime`; `play`→playing true; `pause`/`endOfData`→false;
  `changeSpeed` sets `msPerCandle`.
- `workspaceRestored` sets `currentTime` from workspace and forces `playing:false`.

### `settings.reducer.spec.ts` (new) — BIG WIN, regression #3
- **REGRESSION #3**: a persisted `sidePanel.tab === 'sessions'` (legacy) must
  rehydrate to `'trade'`; `'settings'` and `'trade'` survive; missing `open`
  defaults `true`. Drive via `loadInitialState` (seed `localStorage` key
  `emulador.settings`, `vi.resetModules()` + dynamic import) — see §1.5.
- `loadInitialState` fallbacks: no stored value → `defaultState`; corrupt JSON →
  catch returns defaults; `theme` !== 'light' → 'dark'; out-of-range
  `gridOpacity` clamped 0..1; non-number `utcOffset` → default −4;
  `tradeBoxOpacity` clamped via `validTradeBoxOpacity` (fill/border ranges).
- `changeTheme`: dark→light flips background/grid/text to the new base WHEN the
  canvas is untouched (matches prev base); leaves custom colors alone when the
  user changed them; box opacities follow theme default unless moved.
- `changeChartColors` merges partial; `restoreColors` resets to theme defaults.
- `changeGrid`: partial visible/opacity, opacity clamped 0..1, undefined keeps
  prev.
- `changeTradeBoxOpacity`: clampFill / clampBorder bounds; undefined keeps prev.
- `setSidePanelTab`: clicking the ACTIVE tab while open collapses (`open:false`);
  any other tab opens it (`open:true`, new tab).
- `toggleFloatingToolbar`, `setTradeBoxesVisible`, `changeUtcOffset` happy paths.
- `persistSettings`: writes JSON to localStorage; swallows a throwing
  `setItem` (spy `localStorage.setItem` to throw → no exception).

### `drawings.reducer.spec.ts` (new)
- `pickTool` sets `activeTool`, clears `selectedId`.
- `addDrawing` appends, sets `activeTool:'none'`, selects the new id.
- `moveDrawing` updates p1/p2 of the matching id only.
- `selectDrawing` sets id (incl. null). `deleteSelected` removes selected +
  clears. `clearDrawings` empties + clears.
- `workspaceRestored` loads `workspace.drawings`, resets tool/selection.

### `workspaces.reducer.spec.ts` (new)
- `assetsLoaded` sets assets+current.
- `workspaceRestored`: sets `current` to the symbol and `upsert`s into assets —
  assert dedupe (same symbol replaced, not duplicated) and the alphabetical
  sort. (`lastModified` is `Date.now()`; assert via `expect.objectContaining`
  or that the symbol appears once.)

### `auth.reducer.spec.ts` (new)
- `sessionResolved`: user present → 'authenticated'; user null + offline →
  'offline'; user null + !offline → 'anonymous'.
- `login`/`register` set `pending:true`, clear error.
- `authSuccess` → user set, status authenticated, pending false, error null.
- `authFailure` → pending false, error message kept.
- `loggedOut` → user null, status anonymous, pending false.

### `trading.models.spec.ts` (new — quick wins)
- `contractSizeFor`: `XAUUSD`→100, `XAGUSD`→5000, `EURUSD` (6 letters)→100000,
  `US30`/`NAS100`→1, lowercase input handled.
- `lotsForRisk`: zero distance / zero balance / zero risk → 0; rounds to 0.01
  step; min 0.01 floor. (Existing fill-engine.spec covers the gold sizing case.)
- `pickTradingData`: returns exactly the persistable keys, drops `summaryOpen`
  and `savedSessions`.
- `defaultTradingData(initialBalance)`: balance==initialBalance, empty books.

### `trading.reducer.spec.ts` (EXTEND existing) — regression #1
The existing spec covers modifyOrder re-sizing, box hide/delete, archive on
switch (named-empty vs anonymous-empty), rename, legacy restore. ADD cases for
the UNCOVERED reducer branches:
- `openMarket`: opens a position with `lotsForRisk` sizing; `reviveIfEnded`
  re-opens a `sessionEnded` session and clears a now-past `sessionEnd`; returns
  state unchanged when lots ≤ 0 (SL == price).
- `placeOrder`: appends an order; lots ≤ 0 → unchanged; revive path.
- `modifyPosition`: never re-sizes (already 1 case — keep).
- `cancelOrder`: removes by id; unknown id no-op.
- `closePosition`: closes via `closeTrade`, moves to history, updates balance;
  unknown id → unchanged.
- `processCandle`: `changed:false` path still bumps `lastProcessedTime`;
  `changed:true` applies the book.
- `endSession`: closes book, `sessionEnded:true`, `summaryOpen:true`.
- `setInitialBalance`: rebases balance to `initial + realized`; ≤0 → no-op.
- `setRiskPct`: sets; ≤0 → no-op. `setSessionEnd`: sets time (incl. null).
- `openSummary`/`closeSummary`.
- **REGRESSION #1 (verify+extend)**: `newSession` archives a named-empty session
  (already covered) AND archives one WITH activity AND drops anonymous-empty
  (covered). ADD: `switchSession` with activity present archives the outgoing,
  restores target.trading with `sessionName = target.name`, removes target from
  saved list; unknown id → unchanged.
- `deleteSession` removes by id.
- `sessionImported`: history set to trades, balance = initial + Σprofit,
  sessionEnded+summaryOpen true, name `Importada · dd/MM`, archives prior active.
- `workspaceRestored`: defaults-first merge of `workspace.trading`,
  `savedSessions` from `workspace.sessions ?? []`.

### `selectors.spec.ts` (new) — BIG WIN, use `.projector()`
For each composed selector call `.projector(inputs)`:
- `selectChartStyle` bundles colors/grid/opacity.
- `selectTradingData` → `pickTradingData(state)`.
- `selectWorkspaceSnapshot` / `selectWorkspaceMetaSnapshot`: bundle correct keys
  (meta has NO `series`).
- `selectLoadedTfs`: filters+orders loaded tfs by `TIMEFRAME_ORDER`.
- `selectActiveCandles`: tf null → `[]`; tf set but missing → `[]`; present →
  the array.
- `selectVisibleIndex`: empty/`t<=0` → −1; binary search returns last index with
  `time <= t`; exact-boundary case.
- `selectDataRange`: null when empty; `{from,to}` from first/last.
- `selectProgress`: `{shown: idx+1, total}`.
- `selectChartView`: bundles tf/candles/idx/utcOffset.
- `selectContractSize`: `contractSizeFor(symbol ?? '')` (null → 1).
- `selectCurrentCandle`: idx<0 → null; else candle at idx.
- `selectPointSize`: empty → 0.01; else `derivePointSize`.
- `selectTradePanelView`: price null when no candle; floating P/L per position;
  equity = balance + floating; passes through orders/history/flags.
- `selectFloatingPnl`: null when no positions or no candle; sums `floatingPnl`
  for buy AND sell direction.
- `selectTradeMarkers` (it's private — exercise via `selectTradeChartView`):
  entry markers for positions + history, exit circle markers with +/− sign;
  `snapToCandle` snapping; sorted by time; empty candles → `[]`.
- `selectTradeBoxes`: open/pending/closed mapping; `boxDeleted` filtered out;
  `hidden` from `boxHidden`.
- `selectTradeChartView`: `boxesVisible:false` → `boxes:[]`; true → boxes.
- `selectClosedTradeBoxes`: maps history, filters deleted.
- `selectSessionStats`: delegates to `computeSessionStats` (one smoke case).
- `selectFillContext`: bundles candles/idx/series/tf/contractSize/trading.
- `lowerSeriesFor` (exported fn): null tf → null; returns the lowest loaded TF
  strictly below `tf`; null when none lower is loaded.

---

# 3. AREA 2 — effects + auth

Files: `state/replay/replay.effects.ts`, `state/trading/trading.effects.ts`,
`state/settings/settings.effects.ts`, `state/auth/auth.effects.ts`,
**`state/workspaces/workspaces.effects.ts` (BIG WIN, regression #4)**,
`auth/auth.guard.ts`, `auth/auth.interceptor.ts`.

Pattern: §1.4-C (Subject + provideMockActions + provideMockStore.overrideSelector).

### `replay.effects.spec.ts` (new)
- `advance$`: idx+1 < length → `goToTime({time: candles[idx+1].time})`;
  idx+1 >= length → `endOfData()`. Override `selectActiveCandles` + `selectVisibleIndex`.
- `stepBack$`: idx>=1 → `goToTime` previous candle time; idx<1 → no emission
  (filtered). Use `take(1), toArray()` with a timeout-free guarantee, or push a
  second action that DOES pass to prove the first was filtered.
- `autoplay$`: store-driven. Override `selectPlaying` true→`selectMsPerCandle`;
  use `vi.useFakeTimers()` and advance the interval to assert it emits
  `advanceCandle()`. `selectPlaying` false → `EMPTY` (no emission). Keep this
  case minimal; fake timers + `interval` is the only fiddly one.

### `trading.effects.spec.ts` (new)
Override `selectFillContext` per case (it's a single composed selector — easy).
- `processFills$`: emits `processCandle` when the cursor lands exactly on
  `candles[idx].time` AND there are orders/positions AND not sessionEnded.
  Filtered out when: idx<0, no tf, `candle.time !== action.time` (a jump),
  sessionEnded, or no orders & no positions. Assert `subCandles` is null when no
  lower series, and a sliced array when a lower TF is loaded (set
  `ctx.series`/`ctx.tf` so `lowerSeriesFor` returns one).
- `endOnSchedule$`: when `sessionEnd !== null` and `candle.time >= sessionEnd`,
  emits `[pause(), endSession({...})]` (collect 2 with `take(2),toArray()`);
  filtered when sessionEnded or it's a jump.
- `endOnDataExhausted$`: on `endOfData` with activity (positions OR orders OR
  history) emits `endSession`; filtered when idx<0, sessionEnded, or no activity.

### `settings.effects.spec.ts` (new)
- `persist$` (`dispatch:false`): override `settingsFeature.selectSettingsState`
  to emit a state; spy on `persistSettings` (vi.spyOn the imported module fn or
  spy `localStorage.setItem`) and assert it was called with that state. Subscribe
  to the effect manually.

### `auth.effects.spec.ts` (new)
Stub `BackendApiService` with `vi.fn()` returning `of(...)` / `throwError`.
Provide a Router stub with `navigateByUrl: vi.fn()`.
- `init$`: ROOT_EFFECTS_INIT → `checkSession()`.
- `check$`: `me()` ok → `sessionResolved({user, offline:false})`; `me()` errors
  with status 0 → `sessionResolved({user:null, offline:true})`; status 401 →
  `offline:false`.
- `login$`: success → `authSuccess`; error → `authFailure` with `describeError`
  (status 0 → "No se pudo conectar…"; `error.detail` string → that detail;
  else generic). Cover the 3 `describeError` branches here.
- `register$`: success/failure analogous (one happy + one error).
- `navigateAfterAuth$` (`dispatch:false`): `authSuccess` with returnUrl →
  `navigateByUrl(returnUrl)`; null → `/mercados`.
- `logout$`: api ok → `loggedOut`; api error → still `loggedOut` (catchError).
- `redirectAfterLogout$` (`dispatch:false`): `loggedOut` → `navigateByUrl('/login')`.

### `workspaces.effects.spec.ts` (new) — BIG WIN, REGRESSION #4
Use `workspaceDbStub` + `provideMockStore` with overrides for
`selectCurrentAsset` and `selectWorkspaceMetaSnapshot`. Clear
`localStorage` (`emulador.currentAsset`) in afterEach.

- `init$` / `loadInitial`:
  - assets loaded, no stored current → emits just `assetsLoaded({assets, current:null})`.
  - stored current that EXISTS in assets + `getWorkspace` returns ws → emits
    `assetsLoaded` THEN `workspaceRestored`. (`take(2),toArray()`)
  - stored current NOT in assets → current coerced to null.
  - `db.list()` throws → emits `assetsLoaded({assets:[], current:null})`.
  - localStorage.getItem throws → current null.
- **REGRESSION #4 — `switch$` / `doSwitch` ORDER of emitted actions.** For each
  case set `selectCurrentAsset` and `selectWorkspaceMetaSnapshot`, dispatch
  `switchAsset({...})`, collect all emissions with `take(N),toArray()` and assert
  the EXACT sequence:
  1. Base: `getWorkspace` undefined → `[workspaceRestored(emptyWorkspace(symbol))]`.
     Also asserts `putMeta` called for the OUTGOING `current` (when set), and
     `localStorage` set to the new symbol.
  2. `thenLoad: [csvA, csvB]` → `[workspaceRestored, csvLoaded(A), csvLoaded(B)]`
     in that order.
  3. `thenImport` with trades → after restore:
     `sessionImported({trades, currentCursor})` then `goToTime({time:lastClose})`
     (only when lastClose>0).
  4. `thenNewSession {name:'X'}` → `[workspaceRestored, newSession({currentCursor}),
     setSessionName({name:'X'})]`; `name:null` omits `setSessionName`.
  5. `thenOpenSession` matching a restored session → `[workspaceRestored,
     switchSession({id,currentCursor}), goToTime?]` (goToTime only when the
     target.currentTime>0); non-matching id → only `workspaceRestored`.
  6. `thenGoTo` → appends `goToTime({time:thenGoTo})` last (before sessionEnd).
  7. `thenSessionEnd` → appends `setSessionEnd({time})` as the FINAL action.
  8. Combined wizard (`thenLoad + thenNewSession + thenGoTo + thenSessionEnd`):
     assert the full canonical order
     `[workspaceRestored, csvLoaded…, newSession, setSessionName?, goToTime, setSessionEnd]`.
  9. `getWorkspace` throws → falls back to `emptyWorkspace`; `putMeta` rejection
     on the outgoing asset is swallowed (no throw).
- `persistSeries$` (`dispatch:false`): on `csvLoaded` with a current asset calls
  `db.putSeries(current, tf, candles)`; filtered when no current. (Subscribe and
  assert the stub; `db.putSeries` rejection swallowed.)
- `persistMeta$` (`dispatch:false`): debounced 300ms — use `vi.useFakeTimers()`,
  emit a meta snapshot via overridden selector, advance 300ms, assert
  `db.putMeta` called with `{symbol: current, ...meta, lastModified}`; filtered
  when no current. (This one is fiddly; if `debounceTime` + mock-store emission
  proves hard in vitest, it is acceptable to cover `persistSeries$` thoroughly
  and give `persistMeta$` a single happy-path test — the `doSwitch`/`loadInitial`
  cases carry most of the file's lines.)

### `auth.guard.spec.ts` (new)
`provideMockStore`, override `authFeature.selectStatus`. Router stub with
`createUrlTree: vi.fn().mockReturnValue('URLTREE')`.
`TestBed.runInInjectionContext(() => authGuard(route, {url:'/x'} as any))`,
then take the first emission:
- status 'authenticated' → true. 'offline' → true.
- 'anonymous' → `createUrlTree(['/login'], {queryParams:{volver:'/x'}})`.
- 'unknown' first, then 'authenticated' → waits (filter) and resolves true
  (push two values through a `BehaviorSubject` override).

### `auth.interceptor.spec.ts` (new) — regression-prone
`provideHttpClient(withInterceptors([authInterceptor]))` +
`provideHttpClientTesting()` + `provideMockStore()` + Router stub. Drive real
`HttpClient` calls; assert via `HttpTestingController`. NOTE: `refreshInFlight`
is module-level mutable state — `vi.resetModules()` between tests OR ensure each
test fully drains the refresh so it resets to null via `finalize`.
- Non-backend URL (e.g. `http://localhost:8765/x`) → passes through untouched,
  NO `withCredentials`.
- Backend URL success → request carries `withCredentials:true`.
- Backend 401 on a normal endpoint → triggers ONE POST `/auth/refresh`, then
  RETRIES the original; retry success → original response delivered.
- 401 then refresh ok then retry 401 → dispatches `loggedOut()` and
  `navigateByUrl('/login')`, error propagates.
- 401 on a NO_RETRY endpoint (`/auth/login`) → no refresh, error propagates.
- Single shared refresh: fire TWO concurrent backend requests that both 401 →
  only ONE `/auth/refresh` is issued (assert `expectOne` for refresh).

---

# 4. AREA 3 — services + pages

Files: `services/backend-api.service.ts`, `services/csv-loader.service.ts`,
**`services/workspace-db.service.ts` (BIG WIN — fake-indexeddb)**,
`pages/auth`, `pages/mercados`, **`pages/crear-sesion` (BIG WIN, V2.6)**,
**`pages/sesiones` (BIG WIN, V2.6)**, `pages/emulador` (smoke).

### `backend-api.service.spec.ts` (new) — pattern §1.4-E
- `register`/`login`/`logout`/`refresh`/`me`/`symbols`: assert URL, method,
  body, and `symbols(q)` puts `q` in params only when non-empty. Flush a
  response and assert the mapped value.
- `downloadChunked`: two-iteration loop. First `/candles` flush
  `{velas:[[t,o,h,l,c],…], siguiente: 12345}`, second flush `{velas:[…],
  siguiente:null}`. Assert: `onChunk` called twice, candles mapped to
  `{time,open,high,low,close}`, the 2nd request params include `desde:12345`,
  `limite:50000`. Also a `desde` provided up front → first request carries it.

### `csv-loader.service.spec.ts` (new)
- `parseText` happy path: header `time,open,high,low,close`, unix-seconds time →
  candles sorted, tf detected (build ~5 H1 rows so `detectTimeframe` returns H1).
- `parseText` with `YYYY-MM-DD HH:MM` time → parsed as UTC seconds (`parseTime`
  branch). With seconds `HH:MM:SS` too.
- errors (Spanish): <2 lines → "archivo vacio"; missing column → `falta la
  columna "open"`; non-finite row → `fila N invalida`; undetectable tf (random
  gaps) → "no se pudo detectar la temporalidad".
- `parse(File)`: wrap a `new File([csv], 'xau.csv')` and assert it delegates to
  `parseText` (jsdom File has `.text()`).

### `workspace-db.service.spec.ts` (new) — BIG WIN, fake-indexeddb
TOP of file: `import 'fake-indexeddb/auto';` (installs `indexedDB` +
`IDBKeyRange` globally). Each test uses a FRESH db: in `beforeEach`
`indexedDB.deleteDatabase('emulador-workspaces')` and create a new service
instance (`new WorkspaceDbService()`) so its `dbPromise` is fresh.
- `putMeta` + `getMeta` round-trip.
- `putSeries` + `getWorkspace`: workspace = meta + series keyed by tf; returns
  `undefined` when no meta.
- `appendSeriesChunk`: empty input no-op; first chunk creates the record;
  appending a chunk whose first time > stored tail → cheap concat; an
  OVERLAPPING chunk → dedupe-by-time + sort (assert merged length/order).
- `getSeriesInfo`: null when no record / empty; `{lastTime, count}` otherwise.
- `listMetas`: returns all metas sorted by symbol.
- `list`: maps to `{symbol,lastModified}` sorted.
- `remove`: deletes meta + the symbol's series range (assert `getWorkspace`
  undefined after).
- v1→v2 migration: PRE-SEED a v1 DB. Open `indexedDB.open('emulador-workspaces',1)`
  in the test, create a `workspaces` store, put a legacy whole-workspace record,
  close, THEN instantiate the service (which opens v2 and triggers
  `onupgradeneeded` with `oldVersion===1`). Assert the legacy record migrated
  into `meta` + `series` and the `workspaces` store is gone. (This single test
  covers the largest uncovered block — the migration.)

### `auth-page.component.spec.ts` (new)
`provideMockStore` + ActivatedRoute stub
(`{snapshot:{queryParamMap:{get:()=> '/volver'}}}`). `spyOn(store,'dispatch')`.
- `mode` input drives `isLogin`. `valid()`: username≥3 & password≥6.
- `submit()`: invalid or pending → no dispatch; login mode → dispatches
  `AuthActions.login({username:trimmed, password, returnUrl})`; register mode →
  `register`. `offline()` reflects status selector (override
  `authFeature.selectStatus`).

### `mercados-page.component.spec.ts` (new)
Stub `BackendApiService.symbols` returning `of({total, symbols:[...]})`.
- constructor `load()` → `state:'ok'`, symbols set; error → `state:'error'`.
- `filtered`: query filters by name/descripcion (case-insensitive); empty query
  → all.
- `groups`: groups by `categoria`.
- `rangeLabel`, `compactCount` (1.2M / 12k / 999) pure formatting.

### `crear-sesion-page.component.spec.ts` (new) — BIG WIN, V2.6
Stub `BackendApiService` (`symbols`, `downloadChunked`), `workspaceDbStub`,
Router stub (`navigateByUrl: vi.fn().mockResolvedValue(undefined)`),
ActivatedRoute stub. `spyOn(store,'dispatch')`.
- constructor: filters out symbols with empty `cobertura`; `state:'ok'`; with
  `?symbol=` query preselecting a match → `pickSymbol` + `step=2`.
- `pickSymbol`: selects all tfs, sets default date (~70% of range).
- `toggleTf`: add/remove; re-defaults the date if it became invalid.
- `dateRange`: intersection (max desde / min hasta) of chosen tfs; null when none.
- `startEpoch`/`dateValid`: ISO date → epoch; valid inside range; invalid outside.
- **V2.6 — `endValid`** (NEW end-date rule): empty end → valid; end must be
  `> start` AND `endDate <= isoDate(range.to)`; equal-to-start invalid; beyond
  range invalid; missing range/start → invalid.
- `step2Valid`: tfs>0 && dateValid && endValid.
- `progressPct`: 0 when no total; clamps to 100.
- `next`/`back`: step transitions; `back` blocked while downloading.
- **V2.6 — `confirm()` streaming + resume + hydrate decision** (the core):
  - Small fresh dataset (`total < 200k`, `getSeriesInfo`→null): `accumulate`
    true; `downloadChunked` invokes its `onChunk` (stub it to call the callback
    with a chunk) → `appendSeriesChunk` called per chunk; dispatches
    `switchAsset` with `thenLoad: pending` (in-memory copy), `thenNewSession`,
    `thenGoTo:start`, `thenSessionEnd` from `endEpoch`. Then `navigateByUrl('/')`.
  - Resume: `getSeriesInfo`→`{lastTime, count}` → `desde = lastTime+1` passed to
    `downloadChunked`; `done` seeded with `count`; forces `hydrateFromDb` (since
    `stored` truthy) → `thenLoad: undefined`, and `getMeta`/`putMeta` called to
    ensure a meta exists with `files` stamped `harvester <tf>`.
  - Large expected total (`>= 200k`): `accumulate` false → `hydrateFromDb` true,
    same meta-ensure + `thenLoad:undefined` path.
  - Download failure: `downloadChunked` rejects → `downloadError` set to the
    Spanish resume message, `downloading:false`, `progress:null`, NO navigate.
  - `newMeta`: produced for a brand-new symbol when `getMeta` returns undefined.
  To drive `downloadChunked`, stub it as
  `vi.fn(async (s,tf,desde,onChunk)=>{ await onChunk(series(3)); })`.

### `sesiones-page.component.spec.ts` (new) — BIG WIN, V2.6
`provideMockStore` overriding `selectCurrentAsset`, `selectCurrentTime`,
`selectTradingData`, `selectSavedSessions`. `workspaceDbStub` with
`listMetas`/`getMeta`/`putMeta`. `spyOn(store,'dispatch')`. Stub
`window.prompt`/`window.confirm`; fake timers for `flash` setTimeout.
- constructor `reload()`: `listMetas` populates `metas`, `state:'ok'`; throw →
  `metas:[]` still `ok`.
- `groups`: for each meta builds an ACTIVE card first then archived cards sorted
  by `createdAt` desc. **V2.6 — live override**: for the CURRENT asset the card
  uses live NgRx `liveTrading`/`liveSessions`/`currentTime` (not the DB meta).
  Assert a non-current meta uses its own `meta.trading`/`meta.sessions`.
- `total`: sum of all cards.
- `isCurrent`.
- `open(card)`:
  - current asset + archived id → dispatches `switchSession` then `goToTime`
    (when cursor>0); navigates '/'.
  - current asset + active card (id null) → just navigates (no dispatch).
  - OTHER asset → dispatches `switchAsset({symbol, thenOpenSession:id?})`,
    navigates.
- `rename(card)`: prompt cancelled/empty/unchanged → no-op. Current asset:
  active(id null) → `setSessionName`; archived → `renameSession`. **Other asset
  (writes IndexedDB directly)**: `getMeta` → mutate `trading.sessionName` (active)
  or the matching `sessions[]` entry → `putMeta` → `reload` → flash. `getMeta`
  undefined → returns.
- `remove(card)`: active card (id null) → no-op; confirm cancelled → no-op.
  Current asset → `deleteSession`. Other asset → `getMeta`→filter `sessions`→
  `putMeta`→`reload`→flash; `getMeta` undefined → returns.

### `emulador-page.component.spec.ts` (new) — smoke
`provideMockStore` overriding `selectSummaryOpen` + `selectFloatingToolbar`.
`TestBed.createComponent(EmuladorPageComponent)` truthy; toggling the overridden
selectors flips `summaryOpen()`/`floatingToolbar()`. The child components
(`app-chart` etc.) are in `components/` and unmeasured — they will be
instantiated by the template; if any child errors in jsdom, prefer
`TestBed.inject` of the class alone (don't render) — assert the two signals.
This file is cheap insurance for the 73 measured LOC of the shell.

### `components/csv-start-dialog` — REGRESSION #2 (DECISION: SKIP)
This component lives under `components/` and is **NOT measured**. Per the brief,
it's "cheap insurance OR skip" — DECISION: **skip** it from the coverage-driven
plan (zero coverage impact). The behavioral contract it encodes (dialog opens
only on manual CSV when `currentTime===0`, never in the wizard flow because
`goToTime` follows `csvLoaded`) IS exercised indirectly: the wizard's
`confirm()` test (AREA 3) and the `workspaces.effects doSwitch` order test
(REGRESSION #4, AREA 2) both prove `goToTime` is dispatched right after
`csvLoaded`, which is the mechanism that suppresses the dialog. If time permits,
a 2-case spec (opens when currentTime 0 + range present; no-op otherwise) is a
nice-to-have but does not count toward the 80% target.

---

## Execution order recommendation
1. Land `src/app/testing/fixtures.ts` + `workspace-db.stub.ts` first.
2. AREA 1 (pure, fast, biggest single win in selectors) and AREA 3 services
   (workspace-db migration) in parallel — these move the needle most.
3. AREA 2 effects + AREA 3 pages.
Run `npm run test:coverage` after each area; the gate is global over the four
globs, so selectors + workspace-db + the two wizard/sessions pages together
should clear 80% even before the smaller reducers are fully covered.
