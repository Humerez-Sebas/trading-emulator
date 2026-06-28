# Playback Controller — Fase 2: Replay Resolution configurable

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el usuario elija la resolución con la que avanza el replay (cualquier TF estándar que divida al TF mostrado y tenga datos: H1→M1, M15→M5…). La vela del TF mostrado se forma progresivamente, los SL/TP/fills se evalúan a esa resolución, y el progreso se muestra como rango temporal (`09:37 / 10:00`).

**Architecture:** `resolutionMinutes` (replay state, persistido) elige el grano del avance. La serie de resolución se genera en memoria con `generateCustomSeries` (espejo del custom-TF). Selectores "replay-aware" (`selectReplaySeries`/`selectReplayIndex`) hacen que los effects de avance y el `selectFillContext` operen sobre la serie de resolución sin reescribir su lógica. `selectFormingCandle` sintetiza la vela parcial del bucket; el chart la pinta con `series.update()`. Reusa toda la maquinaria de agregación y fills existente.

**Tech Stack:** Angular 21 (standalone, signals), NgRx (`createFeature`/`createSelector`), RxJS, lightweight-charts, Vitest. Sin dependencias nuevas.

## Global Constraints

- Construye sobre la Fase 1 (HUD flotante ya existente). Misma rama.
- Test runner: Vitest vía `npm test` desde `emulador/`. Mantener verde tras cada tarea.
- Build: `npm run build`; lint/format: `npm run lint`, `npm run format` (CI exige `format:check`).
- Sin dependencias runtime nuevas. Reusar `generateCustomSeries`/`pickBaseSeriesTf`/`loadedTfForMinutes` (`state/market/custom-timeframe.ts`), `aggregateCandles` (`services/timeframe-generator.ts`), `sliceRange`/`processCandle` (`state/trading/fill-engine.ts`), `lowerSeriesForSeconds` (`state/selectors.ts`).
- `formatIntervalShort` (`state/market/custom-timeframe.ts:72`) para etiquetas de resolución ("M5", "H1").
- Trailer de commit (cada commit): `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `emulador/src/app/state/replay/replay.{actions,reducer,reducer.spec}.ts` — `resolutionMinutes`, `setReplayResolution`, clamp en cambio de TF. (Task 1)
- `emulador/src/app/state/market/market.{reducer,reducer.spec,actions,effects,effects.spec}.ts` — `resolutionSeries`/`resolutionFor` + generación. (Task 2)
- `emulador/src/app/state/selectors.ts` (+ `selectors.spec.ts`) — selectores de resolución, replay-aware y forming candle; redefinir `selectFillContext` y `selectChartView`. (Tasks 3, 4, 5)
- `emulador/src/app/state/replay/replay.effects.ts` (+ spec) — avanzar sobre la serie de resolución. (Task 5)
- `emulador/src/app/components/chart/chart.component.ts` — render de la vela en formación. (Task 6)
- `emulador/src/app/components/playback-controller/playback-controller.component.{ts,html}` — selector de resolución + readout temporal. (Task 7)
- `emulador/src/app/services/session.{service,service.spec}.ts` + `services/session-sync.mapping.ts` — persistencia. (Task 8)

---

### Task 1: Estado `resolutionMinutes` + `setReplayResolution` + clamp

`resolutionMinutes` (null = vela completa) vive en `ReplayState`. Al cambiar el TF mostrado a
uno donde la resolución ya no es divisor válido, se resetea a null. El cambio de activo
también resetea.

**Files:**
- Modify: `emulador/src/app/state/replay/replay.actions.ts`
- Modify: `emulador/src/app/state/replay/replay.reducer.ts`
- Test: `emulador/src/app/state/replay/replay.reducer.spec.ts`

**Interfaces:**
- Produces: `ReplayState.resolutionMinutes: number | null`, `replayFeature.selectResolutionMinutes`, `ReplayActions.setReplayResolution({ minutes: number | null })`.

- [ ] **Step 1: Tests que fallan**

```ts
import { MarketActions } from '../market/market.actions';

describe('replay reducer — resolution', () => {
  const reducer = replayFeature.reducer;
  const init = reducer(undefined, { type: '@@init' } as any);

  it('resolutionMinutes por defecto es null', () => {
    expect(init.resolutionMinutes).toBeNull();
  });

  it('setReplayResolution fija los minutos', () => {
    const next = reducer(init, ReplayActions.setReplayResolution({ minutes: 5 }));
    expect(next.resolutionMinutes).toBe(5);
  });

  it('changeTimeframe a un TF incompatible resetea la resolución', () => {
    const m30 = reducer(init, ReplayActions.setReplayResolution({ minutes: 30 }));
    const toM15 = reducer(m30, MarketActions.changeTimeframe({ tf: 'M15' })); // 1800 ∤ 900
    expect(toM15.resolutionMinutes).toBeNull();
  });

  it('changeTimeframe a un TF compatible conserva la resolución', () => {
    const m30 = reducer(init, ReplayActions.setReplayResolution({ minutes: 30 }));
    const toH1 = reducer(m30, MarketActions.changeTimeframe({ tf: 'H1' })); // 1800 | 3600
    expect(toH1.resolutionMinutes).toBe(30);
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd emulador && npm test -- replay.reducer`
Expected: FAIL.

- [ ] **Step 3: Acción**

En `replay.actions.ts`, dentro de `events`:

```ts
    /** Sets the replay resolution in minutes (null = full display-TF candle). */
    'Set Replay Resolution': props<{ minutes: number | null }>(),
```

- [ ] **Step 4: Estado + handlers + clamp**

En `replay.reducer.ts`, sumar import y campo:

```ts
import { MarketActions } from '../market/market.actions';
import { TIMEFRAME_SECONDS } from '../../models';
```

```ts
export interface ReplayState {
  currentTime: number;
  playing: boolean;
  msPerCandle: number;
  jumpSize: number;
  resolutionMinutes: number | null;
}
```

`initialState`: sumar `resolutionMinutes: null,`.

Helper antes del `createFeature`:

```ts
/** Resets the resolution when it no longer divides the new display-TF seconds. */
function clampResolution(state: ReplayState, displaySeconds: number): ReplayState {
  const r = state.resolutionMinutes;
  if (r === null) return state;
  const rs = r * 60;
  return rs < displaySeconds && displaySeconds % rs === 0
    ? state
    : { ...state, resolutionMinutes: null };
}
```

Handlers dentro de `createReducer`:

```ts
    on(
      ReplayActions.setReplayResolution,
      (state, { minutes }): ReplayState => ({ ...state, resolutionMinutes: minutes }),
    ),
    on(MarketActions.changeTimeframe, (state, { tf }): ReplayState =>
      clampResolution(state, TIMEFRAME_SECONDS[tf]),
    ),
    on(MarketActions.changeCustomTimeframe, (state, { minutes }): ReplayState =>
      clampResolution(state, minutes * 60),
    ),
```

En el handler existente de `WorkspacesActions.workspaceRestored`, sumar `resolutionMinutes: null,` (el restore de sesión lo re-setea después; un cambio de activo simple vuelve a vela completa).

- [ ] **Step 5: Correr y verificar que pasan**

Run: `cd emulador && npm test -- replay.reducer`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add emulador/src/app/state/replay/
git commit -m "feat(replay): resolutionMinutes state with setReplayResolution and TF-change clamp"
```

---

### Task 2: Serie de resolución generada (`resolutionSeries` + effect)

Espejo exacto de `customTimeframe$`: al `setReplayResolution`, generar la serie con
`generateCustomSeries` (null → `[]`) y guardarla en `MarketState`. `selectResolutionSeries`
(Task 3) descarta la serie si quedó obsoleta usando `resolutionFor`.

**Files:**
- Modify: `emulador/src/app/state/market/market.actions.ts`
- Modify: `emulador/src/app/state/market/market.reducer.ts`
- Modify: `emulador/src/app/state/market/market.effects.ts`
- Test: `emulador/src/app/state/market/market.reducer.spec.ts`, `emulador/src/app/state/market/market.effects.spec.ts`

**Interfaces:**
- Consumes: `generateCustomSeries` (`state/market/custom-timeframe.ts`), `marketFeature.selectSeries`, `ReplayActions.setReplayResolution`.
- Produces: `MarketState.resolutionSeries: Candle[]`, `MarketState.resolutionFor: number | null`, `MarketActions.replayResolutionGenerated({ minutes: number | null; candles: Candle[] })`.

- [ ] **Step 1: Tests que fallan**

En `market.reducer.spec.ts`:

```ts
it('replayResolutionGenerated guarda la serie y el for', () => {
  const c = [{ time: 0, open: 1, high: 2, low: 0, close: 1 }];
  const next = marketFeature.reducer(
    marketFeature.reducer(undefined, { type: '@@init' } as any),
    MarketActions.replayResolutionGenerated({ minutes: 5, candles: c }),
  );
  expect(next.resolutionSeries).toEqual(c);
  expect(next.resolutionFor).toBe(5);
});
```

En `market.effects.spec.ts` (seguir el patrón existente del archivo para `customTimeframe$`):

```ts
it('replayResolution$ genera desde los anchors al setReplayResolution', async () => {
  const m1 = series(120, 0, 60); // 120 velas M1
  store.overrideSelector(marketFeature.selectSeries, { M1: m1 });
  store.refreshState();

  const p = firstValueFrom(effects.replayResolution$);
  actions$.next(ReplayActions.setReplayResolution({ minutes: 5 }));
  const result = await p;

  expect(result.type).toBe(MarketActions.replayResolutionGenerated.type);
  expect((result as any).minutes).toBe(5);
  expect((result as any).candles.length).toBe(24); // 120 M1 / 5 = 24 velas M5
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd emulador && npm test -- market.reducer market.effects`
Expected: FAIL.

- [ ] **Step 3: Acción + estado**

En `market.actions.ts`:

```ts
    'Replay Resolution Generated': props<{ minutes: number | null; candles: Candle[] }>(),
```

En `market.reducer.ts` — `MarketState`: sumar `resolutionSeries: Candle[];` y `resolutionFor: number | null;`. `initialState`: `resolutionSeries: [], resolutionFor: null,`. Handler:

```ts
    on(
      MarketActions.replayResolutionGenerated,
      (state, { minutes, candles }): MarketState => ({
        ...state,
        resolutionSeries: candles,
        resolutionFor: minutes,
      }),
    ),
```

En el handler de `WorkspacesActions.workspaceRestored`, sumar `resolutionSeries: [], resolutionFor: null,` (reset por cambio de activo).

- [ ] **Step 4: Effect**

En `market.effects.ts`:

```ts
import { ReplayActions } from '../replay/replay.actions';

  replayResolution$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayActions.setReplayResolution),
      withLatestFrom(this.store.select(marketFeature.selectSeries)),
      map(([{ minutes }, series]) =>
        MarketActions.replayResolutionGenerated({
          minutes,
          candles: minutes == null ? [] : generateCustomSeries(series, minutes),
        }),
      ),
    ),
  );
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `cd emulador && npm test -- market.reducer market.effects`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add emulador/src/app/state/market/
git commit -m "feat(market): generate replay-resolution series mirroring custom timeframe"
```

---

### Task 3: Selectores base de resolución

**Files:**
- Modify: `emulador/src/app/state/selectors.ts`
- Test: `emulador/src/app/state/selectors.spec.ts`

**Interfaces:**
- Consumes: `selectSeries`, `selectActiveTfSeconds`, `selectCurrentTime`, `marketFeature.select{ResolutionSeries,ResolutionFor}`, `replayFeature.selectResolutionMinutes`, `pickBaseSeriesTf`, `loadedTfForMinutes`, `formatIntervalShort`, `TIMEFRAME_ORDER`, `TIMEFRAME_SECONDS`.
- Produces: `selectResolutionMinutes`, `selectResolutionSeries: () => Candle[] | null`, `selectAvailableResolutions: () => { minutes: number; label: string }[]`, `selectResolutionProgress: () => { cursorTime: number; bucketEndTime: number } | null`.

- [ ] **Step 1: Tests que fallan**

```ts
import {
  selectAvailableResolutions,
  selectResolutionProgress,
} from './selectors';

describe('selectAvailableResolutions', () => {
  it('lista divisores válidos del TF mostrado con datos (H1 con M1)', () => {
    const series = { M1: [{ time: 0, open: 1, high: 1, low: 1, close: 1 }] };
    const out = selectAvailableResolutions.projector(series, 3600); // H1
    const mins = out.map((r) => r.minutes);
    expect(mins).toEqual([1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30]);
    expect(out.find((r) => r.minutes === 5)!.label).toBe('M5');
  });

  it('vacío cuando no hay serie base para generar', () => {
    const series = { H1: [{ time: 0, open: 1, high: 1, low: 1, close: 1 }] };
    expect(selectAvailableResolutions.projector(series, 3600)).toEqual([]); // sin M-data < H1
  });
});

describe('selectResolutionProgress', () => {
  it('devuelve el cursor y el fin del bucket actual del TF mostrado', () => {
    // cursor 09:37 dentro de la H1 09:00-10:00 → bucketEnd 10:00
    const cursor = 9 * 3600 + 37 * 60;
    const out = selectResolutionProgress.projector(3600, cursor, 5);
    expect(out).toEqual({ cursorTime: cursor, bucketEndTime: 10 * 3600 });
  });

  it('null en vela completa', () => {
    expect(selectResolutionProgress.projector(3600, 1000, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd emulador && npm test -- selectors`
Expected: FAIL.

- [ ] **Step 3: Implementar los selectores**

En `selectors.ts`, sumar imports:

```ts
import { pickBaseSeriesTf, loadedTfForMinutes, formatIntervalShort } from './market/custom-timeframe';
import { replayFeature } from './replay/replay.reducer';
```

```ts
export const selectResolutionMinutes = replayFeature.selectResolutionMinutes;

/** The replay-resolution candles: a loaded series at R, else the generated one, else null. */
export const selectResolutionSeries = createSelector(
  selectSeries,
  marketFeature.selectResolutionSeries,
  marketFeature.selectResolutionFor,
  selectResolutionMinutes,
  (series, generated, generatedFor, minutes): Candle[] | null => {
    if (minutes == null) return null;
    const loaded = loadedTfForMinutes(minutes, Object.keys(series) as Timeframe[]);
    if (loaded && series[loaded]?.length) return series[loaded]!;
    return generatedFor === minutes && generated.length ? generated : null;
  },
);

/** Standard TFs that divide the display TF, are finer, and can be generated from loaded data. */
export const selectAvailableResolutions = createSelector(
  selectSeries,
  selectActiveTfSeconds,
  (series, activeSeconds): { minutes: number; label: string }[] => {
    if (activeSeconds <= 0) return [];
    const out: { minutes: number; label: string }[] = [];
    for (const tf of TIMEFRAME_ORDER) {
      const secs = TIMEFRAME_SECONDS[tf];
      if (secs >= activeSeconds) break;
      const minutes = secs / 60;
      if (activeSeconds % secs === 0 && pickBaseSeriesTf(series, minutes)) {
        out.push({ minutes, label: formatIntervalShort(minutes) });
      }
    }
    return out;
  },
);

/** Cursor time + current display-bucket end, for the "HH:mm / HH:mm" readout. */
export const selectResolutionProgress = createSelector(
  selectActiveTfSeconds,
  selectCurrentTime,
  selectResolutionMinutes,
  (activeSeconds, cursor, minutes): { cursorTime: number; bucketEndTime: number } | null => {
    if (minutes == null || activeSeconds <= 0 || cursor <= 0) return null;
    const bucketStart = Math.floor(cursor / activeSeconds) * activeSeconds;
    return { cursorTime: cursor, bucketEndTime: bucketStart + activeSeconds };
  },
);
```

Asegurar que `TIMEFRAME_ORDER`, `TIMEFRAME_SECONDS`, `Timeframe`, `Candle` estén importados en `selectors.ts` (ya se usan).

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd emulador && npm test -- selectors`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add emulador/src/app/state/selectors.ts emulador/src/app/state/selectors.spec.ts
git commit -m "feat(selectors): resolution series, available resolutions, progress range"
```

---

### Task 4: `selectFormingCandle` + extender `selectChartView`

La vela en formación agrega las velas de resolución del bucket actual hasta el cursor.
`selectChartView` en modo resolución entrega las velas completas (hasta `bucketIdx-1`) más la
`forming`, para que el chart pinte la barra viva sin filtrar el futuro.

**Files:**
- Modify: `emulador/src/app/state/selectors.ts`
- Test: `emulador/src/app/state/selectors.spec.ts`

**Interfaces:**
- Consumes: `selectResolutionSeries`, `selectActiveTfSeconds`, `selectCurrentTime`, `selectResolutionMinutes`, `sliceRange` (`state/trading/fill-engine.ts`).
- Produces: `selectFormingCandle: () => Candle | null`; `selectChartView` ahora incluye `forming: Candle | null`.

- [ ] **Step 1: Tests que fallan**

```ts
import { selectFormingCandle } from './selectors';

describe('selectFormingCandle', () => {
  const res = [ // velas M30 dentro de la H1 09:00-10:00
    { time: 9 * 3600, open: 10, high: 12, low: 9, close: 11 },
    { time: 9 * 3600 + 1800, open: 11, high: 15, low: 8, close: 14 },
  ];

  it('agrega las velas de resolución reveladas hasta el cursor', () => {
    const cursor = 9 * 3600 + 1800; // ambas M30 reveladas
    const out = selectFormingCandle.projector(res, 3600, cursor, 30);
    expect(out).toEqual({ time: 9 * 3600, open: 10, high: 15, low: 8, close: 14 });
  });

  it('solo la primera M30 cuando el cursor está a mitad de hora', () => {
    const cursor = 9 * 3600; // solo la primera revelada
    const out = selectFormingCandle.projector(res, 3600, cursor, 30);
    expect(out).toEqual({ time: 9 * 3600, open: 10, high: 12, low: 9, close: 11 });
  });

  it('null en vela completa', () => {
    expect(selectFormingCandle.projector(res, 3600, 9 * 3600, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd emulador && npm test -- selectors`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `selectors.ts`:

```ts
import { sliceRange } from './trading/fill-engine';

/** Partial display-TF candle aggregated from resolution candles revealed in the current bucket. */
export const selectFormingCandle = createSelector(
  selectResolutionSeries,
  selectActiveTfSeconds,
  selectCurrentTime,
  selectResolutionMinutes,
  (resSeries, activeSeconds, cursor, minutes): Candle | null => {
    if (minutes == null || !resSeries || activeSeconds <= 0 || cursor <= 0) return null;
    const bucketStart = Math.floor(cursor / activeSeconds) * activeSeconds;
    const inBucket = sliceRange(resSeries, bucketStart, cursor + 1); // [bucketStart, cursor]
    if (!inBucket.length) return null;
    let high = inBucket[0].high;
    let low = inBucket[0].low;
    for (const c of inBucket) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
    }
    return {
      time: bucketStart,
      open: inBucket[0].open,
      high,
      low,
      close: inBucket[inBucket.length - 1].close,
    };
  },
);
```

Reemplazar `selectChartView` por la versión que incluye `forming`:

```ts
export const selectChartView = createSelector(
  selectActiveTfLabel,
  selectActiveCandles,
  selectVisibleIndex,
  selectUtcOffset,
  selectResolutionMinutes,
  selectFormingCandle,
  (tf, candles, idx, utcOffset, minutes, forming) => {
    // Resolution mode: hide the (future-complete) bucket candle and paint the
    // forming bar instead; complete candles run up to bucketIdx-1.
    if (minutes != null && forming != null && idx >= 0) {
      return { tf, candles, idx: idx - 1, utcOffset, forming };
    }
    return { tf, candles, idx, utcOffset, forming: null };
  },
);
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd emulador && npm test -- selectors`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add emulador/src/app/state/selectors.ts emulador/src/app/state/selectors.spec.ts
git commit -m "feat(selectors): forming candle synthesis and resolution-aware chart view"
```

---

### Task 5: Avance y fills sobre la serie de resolución (replay-aware)

Selectores `selectReplaySeries`/`selectReplayIndex`/`selectReplayTfSeconds`/`selectReplayLowerSeries`
generalizan "la serie que el replay recorre". Redefinir `selectFillContext` sobre ellos
(idéntico en vela completa) y apuntar los effects de avance a la serie de resolución. Así los
fills se evalúan a resolución base **sin reescribir** `processFills$`.

**Files:**
- Modify: `emulador/src/app/state/selectors.ts`
- Modify: `emulador/src/app/state/replay/replay.effects.ts`
- Test: `emulador/src/app/state/selectors.spec.ts`, `emulador/src/app/state/replay/replay.effects.spec.ts`

**Interfaces:**
- Produces: `selectReplaySeries`, `selectReplayIndex`, `selectReplayTfSeconds`, `selectReplayLowerSeries`. `selectFillContext` ahora se deriva de ellos.

- [ ] **Step 1: Tests que fallan**

En `selectors.spec.ts`:

```ts
import { selectReplaySeries, selectReplayIndex } from './selectors';

describe('selectReplaySeries / selectReplayIndex', () => {
  const active = [{ time: 0, open: 1, high: 1, low: 1, close: 1 }];
  const resolution = [
    { time: 0, open: 1, high: 1, low: 1, close: 1 },
    { time: 300, open: 1, high: 1, low: 1, close: 1 },
  ];

  it('usa la serie activa en vela completa', () => {
    expect(selectReplaySeries.projector(active, null)).toBe(active);
  });
  it('usa la serie de resolución cuando está activa', () => {
    expect(selectReplaySeries.projector(active, resolution)).toBe(resolution);
  });
  it('índice del último candle de resolución <= cursor', () => {
    expect(selectReplayIndex.projector(resolution, 300)).toBe(1);
    expect(selectReplayIndex.projector(resolution, 299)).toBe(0);
  });
});
```

En `replay.effects.spec.ts`:

```ts
import { selectReplaySeries, selectReplayIndex } from '../selectors';

describe('advance$ en modo resolución', () => {
  it('avanza a la próxima vela de resolución', async () => {
    const res = series(4, 0, 300); // M5: 0,300,600,900
    store.overrideSelector(selectReplaySeries, res);
    store.overrideSelector(selectReplayIndex, 1); // next = 600
    store.refreshState();

    const p = firstValueFrom(effects.advance$);
    actions$.next(ReplayActions.advanceCandle());
    expect(await p).toEqual(ReplayActions.goToTime({ time: 600 }));
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd emulador && npm test -- selectors replay.effects`
Expected: FAIL.

- [ ] **Step 3: Selectores replay-aware + redefinir `selectFillContext`**

En `selectors.ts`:

```ts
/** The series the replay cursor traverses: the resolution series when active, else the display series. */
export const selectReplaySeries = createSelector(
  selectActiveCandles,
  selectResolutionSeries,
  (active, resolution): Candle[] => resolution ?? active,
);

/** Index of the last replay-series candle whose time <= cursor. */
export const selectReplayIndex = createSelector(
  selectReplaySeries,
  selectCurrentTime,
  (candles, t): number => {
    if (!candles.length || t <= 0) return -1;
    let lo = 0, hi = candles.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (candles[mid].time <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  },
);

/** Candle duration (seconds) the replay advances by: resolution or display TF. */
export const selectReplayTfSeconds = createSelector(
  selectActiveTfSeconds,
  selectResolutionMinutes,
  (activeSeconds, minutes): number => (minutes != null ? minutes * 60 : activeSeconds),
);

/** Finest loaded series strictly below the replay candle duration (SL/TP tiebreak). */
export const selectReplayLowerSeries = createSelector(
  selectSeries,
  selectReplayTfSeconds,
  (series, seconds): Candle[] | null => lowerSeriesForSeconds(series, seconds),
);
```

Redefinir `selectFillContext` para derivar de los replay-aware (idéntico en vela completa):

```ts
export const selectFillContext = createSelector(
  selectReplaySeries,
  selectReplayIndex,
  selectReplayTfSeconds,
  selectReplayLowerSeries,
  selectContractSize,
  tradingFeature.selectTradingState,
  (candles, idx, tfSeconds, lower, contractSize, trading) => ({
    candles,
    idx,
    tfSeconds,
    lower,
    contractSize,
    trading,
  }),
);
```

- [ ] **Step 4: Apuntar los effects a la serie de resolución**

En `replay.effects.ts`, reemplazar en `advance$`, `stepBack$` y `jumpBack$` los selectores
`selectActiveCandles` → `selectReplaySeries` y `selectVisibleIndex` → `selectReplayIndex`
(actualizar imports). `jumpForward$` ya usa `selectFillContext` (ahora replay-aware) → sin cambios.

- [ ] **Step 5: Correr y verificar que pasan**

Run: `cd emulador && npm test -- selectors replay.effects`
Expected: PASS.
Run: `cd emulador && npm test`
Expected: suite verde (verificar que `processFills$` y sus specs siguen pasando: en vela completa `selectFillContext` es idéntico).

- [ ] **Step 6: Commit**

```bash
git add emulador/src/app/state/
git commit -m "feat(replay): traverse and fill over the resolution series when active"
```

---

### Task 6: Render de la vela en formación en el chart

El chart no tiene spec (render validado en navegador). `selectChartView` ahora trae
`forming`; el chart pinta las velas completas hasta `idx` y actualiza una barra viva con
`series.update(forming)` en cada emisión. Al cerrarse el bucket, `forming` ya iguala a la
vela completa → transición sin saltos.

**Files:**
- Modify: `emulador/src/app/components/chart/chart.component.ts`

**Interfaces:**
- Consumes: `selectChartView` `{ tf, candles, idx, utcOffset, forming }`.

- [ ] **Step 1: Suscripción y firma de `render`**

En `ngAfterViewInit`, cambiar la suscripción a `selectChartView`:

```ts
    this.store
      .select(selectChartView)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ tf, candles, idx, utcOffset, forming }) =>
        this.render(tf, candles, idx, utcOffset, forming),
      );
```

- [ ] **Step 2: Pintar la barra viva**

Cambiar la firma de `render` a `(tf, candles, idx, utcOffset, forming: Candle | null)` y, al
final del método (tras el render incremental existente y antes de cualquier `return`), aplicar
la barra en formación. Añadir un campo `private renderedFormingTime: number | null = null;` y:

```ts
  /** Paints/updates the live "forming" bar (resolution mode). */
  private applyForming(forming: Candle | null, shift: number): void {
    if (!this.series || !forming) {
      this.renderedFormingTime = null;
      return;
    }
    this.series.update({ ...forming, time: (forming.time + shift) as UTCTimestamp });
    this.renderedFormingTime = forming.time;
    this.renderedTimes = [...this.renderedTimes.filter((t) => t !== forming.time), forming.time];
  }
```

Llamar `this.applyForming(forming, shift)` al final de las tres ramas de `render` (jump/TF-switch,
avance incremental, y cuando no hay cambios) de modo que cada emisión actualice la barra viva.
En la rama de "gran salto / cambio de TF" llamarlo después de `renderWindow`; en la rama
incremental, después del `while`. (Nota: en modo resolución `idx` corresponde a la última vela
COMPLETA, así que el render incremental nunca pinta la vela del bucket; la `forming` la cubre.)

- [ ] **Step 3: Validación en navegador (preview tools)**

Run dev server (`preview_start`), cargar una sesión con M1 + H1:
- En H1, elegir resolución M5 desde el HUD (Task 7). Avanzar con `+1`: la vela H1 crece minuto
  a minuto (cuerpo/mechas se actualizan), sin revelar el cierre futuro.
- Al completarse la hora, la barra queda igual a la vela H1 real y arranca la siguiente.
- `preview_screenshot` para evidencia; `preview_console_logs` sin errores.

- [ ] **Step 4: Commit**

```bash
cd emulador && npm run format && npm run lint
git add emulador/src/app/components/chart/chart.component.ts
git commit -m "feat(chart): render the forming display candle in resolution mode"
```

---

### Task 7: Selector de resolución + readout temporal en el HUD

**Files:**
- Modify: `emulador/src/app/components/playback-controller/playback-controller.component.ts`
- Modify: `emulador/src/app/components/playback-controller/playback-controller.component.html`
- Test: `emulador/src/app/components/playback-controller/playback-controller.component.spec.ts`

**Interfaces:**
- Consumes: `selectAvailableResolutions`, `selectResolutionMinutes`, `selectResolutionProgress`, `ReplayActions.setReplayResolution`.

- [ ] **Step 1: Test que falla**

```ts
import { selectResolutionMinutes } from '../../state/selectors';

it('setResolution despacha setReplayResolution (full → null)', () => {
  const spy = vi.spyOn(store, 'dispatch');
  fixture.componentInstance.setResolution('full');
  expect(spy).toHaveBeenCalledWith(ReplayActions.setReplayResolution({ minutes: null }));
  fixture.componentInstance.setResolution('5');
  expect(spy).toHaveBeenCalledWith(ReplayActions.setReplayResolution({ minutes: 5 }));
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd emulador && npm test -- playback-controller`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En el componente, sumar señales y métodos:

```ts
import {
  selectAvailableResolutions,
  selectResolutionMinutes,
  selectResolutionProgress,
} from '../../state/selectors';

  availableResolutions = this.store.selectSignal(selectAvailableResolutions);
  resolutionMinutes = this.store.selectSignal(selectResolutionMinutes);
  private resProgress = this.store.selectSignal(selectResolutionProgress);

  resolutionOptions = computed<DropdownOption[]>(() => [
    { value: 'full', label: 'Vela completa' },
    ...this.availableResolutions().map((r) => ({ value: String(r.minutes), label: r.label })),
  ]);
  resolutionValue = computed(() => {
    const m = this.resolutionMinutes();
    return m == null ? 'full' : String(m);
  });
  /** "09:37 / 10:00" range readout, in the display time zone. */
  resolutionRangeMs = computed(() => {
    const p = this.resProgress();
    if (!p) return null;
    const shift = this.utcOffset() * 3600;
    return { cursor: (p.cursorTime + shift) * 1000, end: (p.bucketEndTime + shift) * 1000 };
  });

  setResolution(v: string): void {
    this.store.dispatch(
      ReplayActions.setReplayResolution({ minutes: v === 'full' ? null : +v }),
    );
  }
```

En el HTML, tras el dropdown de velocidad, sumar el selector de resolución (deshabilitado si no
hay opciones) y el readout:

```html
    @if (availableResolutions().length) {
      <div class="sep"></div>
      <ui-dropdown
        ariaLabel="Resolución del replay"
        [options]="resolutionOptions()"
        [value]="resolutionValue()"
        (valueChange)="setResolution($event)"
      />
      @if (resolutionRangeMs(); as r) {
        <span class="res-range">
          {{ r.cursor | date: 'HH:mm' : 'UTC' }} / {{ r.end | date: 'HH:mm' : 'UTC' }}
        </span>
      }
    }
```

CSS en `playback-controller.component.css`:

```css
.res-range { color: var(--accent, #2962ff); font-weight: 600; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd emulador && npm test -- playback-controller`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add emulador/src/app/components/playback-controller/
git commit -m "feat(playback): resolution selector and HH:mm range readout"
```

---

### Task 8: Persistencia de la resolución en `.session.json`

`replayResolution` opcional (ausente/null = vela completa) viaja en `SessionFileV1.state`.
Retrocompatible: las sesiones v1 existentes cargan como vela completa.

**Files:**
- Modify: `emulador/src/app/services/session.service.ts`
- Modify: `emulador/src/app/services/session-sync.mapping.ts`
- Test: `emulador/src/app/services/session.service.spec.ts`

**Interfaces:**
- Produces: `SessionFileV1.state.replayResolution?: number | null`; `SessionSnapshot.replayResolution`, `StateSnapshotInput.replayResolutionMinutes`, `RestorePlan.replayResolutionMinutes`.

- [ ] **Step 1: Tests que fallan**

En `session.service.spec.ts`:

```ts
it('buildSessionFile incluye replayResolution', () => {
  const file = buildSessionFile({
    symbol: 'XAUUSD', initialBalance: 1000, startRange: 0, endRange: 1000,
    replayTime: 500, currentTimeframe: 60, playbackSpeed: 500,
    trades: [], pendingOrders: [], drawings: [], notes: [],
    anchorTimeframes: ['H1'], years: [], replayResolution: 5,
  } as any);
  expect(file.state.replayResolution).toBe(5);
});

it('restorePlan default a null cuando falta el campo (v1 legacy)', () => {
  const file = buildSessionFile({
    symbol: 'XAUUSD', initialBalance: 1000, startRange: 0, endRange: 1000,
    replayTime: 500, currentTimeframe: 60, playbackSpeed: 500,
    trades: [], pendingOrders: [], drawings: [], notes: [],
    anchorTimeframes: ['H1'], years: [],
  } as any);
  delete (file.state as any).replayResolution;
  expect(restorePlan(file).replayResolutionMinutes).toBeNull();
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd emulador && npm test -- session.service`
Expected: FAIL.

- [ ] **Step 3: Implementar**

En `session.service.ts`:

- `SessionFileV1.state`: sumar `replayResolution?: number | null;`.
- `SessionSnapshot`: sumar `replayResolution: number | null;`.
- `buildSessionFile`: en `state`, sumar `replayResolution: s.replayResolution,`.
- `StateSnapshotInput`: sumar `replayResolutionMinutes: number | null;`.
- `snapshotFromState`: sumar `replayResolution: input.replayResolutionMinutes,` al objeto devuelto.
- `RestorePlan`: sumar `replayResolutionMinutes: number | null;`.
- `restorePlan`: sumar `replayResolutionMinutes: file.state.replayResolution ?? null,`.

En `session-sync.mapping.ts`, mapear `replayResolution` en ambas direcciones igual que
`playbackSpeed` (default `null` al leer de la nube).

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd emulador && npm test -- session.service`
Expected: PASS.

- [ ] **Step 5: Wiring del restore/export (browser-validated)**

Donde el flujo de export arma el `SessionSnapshot` (sesiones/crear-sesión), pasar la resolución
actual (`store.selectSignal(selectResolutionMinutes)` o lectura del estado). Donde el restore
aplica el `RestorePlan`, despachar `ReplayActions.setReplayResolution({ minutes: plan.replayResolutionMinutes })`
tras cargar los datos. Validar en navegador: exportar con resolución M5, reimportar, y verificar
que vuelve en M5; una sesión vieja sin el campo abre en vela completa.

- [ ] **Step 6: Commit**

```bash
cd emulador && npm run format && npm run lint
git add emulador/src/app/services/
git commit -m "feat(sessions): persist replay resolution in .session.json (backward compatible)"
```

---

## Verificación (fin de Fase 2)

- `cd emulador && npm test` — suite verde, incluyendo nuevos specs de `replay.reducer`, `market.reducer/effects`, `selectors` (resoluciones, forming, replay-aware), `session.service`.
- `npm run lint && npm run format:check && npm run build` — sin errores.
- Navegador (preview tools), sesión con anchors M1 + H1:
  1. En H1 el selector de resolución ofrece M30/M15/M10/M5/M1 (divisores con datos); en M15 ofrece M5/M3/M1.
  2. Al elegir M5, `+1`/`▶` forma la vela H1 progresivamente; el readout muestra `09:37 / 10:00`.
  3. Un SL tocado a mitad de la H1 cierra la posición en ese minuto exacto (fills a resolución base).
  4. Cambiar el TF mostrado a M15 con resolución M30 activa vuelve a "Vela completa".
  5. Exportar `.session.json` con resolución M5, reimportar → vuelve en M5; una sesión v1 sin el campo abre en vela completa.

## Self-Review (cubierto)

- **Cobertura del spec (Fase 2):** estado + clamp (Task 1), serie generada (Task 2), selectores de resolución/progress (Task 3), forming candle + chart view (Task 4), avance y fills a resolución (Task 5), render (Task 6), UI selector + readout (Task 7), persistencia (Task 8).
- **Sin placeholders:** cada paso de lógica trae test e implementación completos; el render del chart se valida en navegador (sin spec, coherente con el repo).
- **Consistencia de tipos:** `setReplayResolution({ minutes })`, `replayResolutionGenerated({ minutes, candles })`, `selectResolutionSeries: Candle[] | null`, `forming: Candle | null`, `replayResolutionMinutes` usados consistentemente entre reducer (1), market (2), selectores (3-5), chart (6), UI (7) y persistencia (8).
