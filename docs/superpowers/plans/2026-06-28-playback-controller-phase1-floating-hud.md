# Playback Controller — Fase 1: HUD flotante + refactor de la barra

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraer toda la navegación del replay a una barra flotante, compacta y siempre visible sobre el gráfico (transporte `±1` con auto-repeat, saltos `±N` seleccionables, velocidad, scrubber, reloj, progreso), mover el P/L flotante a un overlay del gráfico, y reducir la barra superior a solo contexto (activo + TF).

**Architecture:** El cursor de replay (`replay.currentTime`, segundos) ya es global e independiente del TF. Sumamos a `ReplayState` un `jumpSize` y cuatro acciones (`setJumpSize`, `jumpForward`, `jumpBack`, `seekTo`). `jumpForward$` foldea el `processCandle` puro sobre las velas cruzadas; `jumpBack$`/`seekTo` solo mueven el cursor. La UI se parte en tres componentes standalone: `PlaybackControllerComponent` (HUD flotante), `FloatingPnlComponent` (overlay) y la `ControlsComponent` reducida a contexto.

**Tech Stack:** Angular 21 (standalone, signals), NgRx (store/effects, `createFeature`/`createActionGroup`), RxJS, lightweight-charts, Vitest. Sin dependencias nuevas.

## Global Constraints

- Implementar en una rama dedicada (worktree actual `claude/eager-chaum-6000cb` o una nueva desde `main`). NO trabajar sobre `main`.
- Test runner: Vitest vía `npm test` desde `emulador/` (suite completa ≈ 680 tests; mantener verde tras cada tarea).
- Build: `npm run build` desde `emulador/` (Angular AOT estricto).
- Lint/format (CI los exige): `npm run format` antes de cada commit; `npm run lint` debe pasar. CI corre `npm run format:check`.
- Sin dependencias runtime nuevas.
- Tokens de diseño desde `DESIGN.md` (negro `#000`, superficie `#181818`, borde `#333`, azul `#2962ff`, up `#26a69a`, down `#ef5350`, warning `#f0b90b`, `font-variant-numeric: tabular-nums`).
- Trailer de commit (cada commit): `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `emulador/src/app/state/replay/replay.actions.ts` — sumar `setJumpSize`, `jumpForward`, `jumpBack`, `seekTo`. (Task 1)
- `emulador/src/app/state/replay/replay.reducer.ts` — sumar `jumpSize` a `ReplayState`; handlers de `setJumpSize` y `seekTo`. (Task 1)
- `emulador/src/app/state/replay/replay.reducer.spec.ts` — tests de los nuevos handlers. (Task 1)
- `emulador/src/app/state/replay/replay.effects.ts` — `jumpForward$`, `jumpBack$`. (Task 2)
- `emulador/src/app/state/replay/replay.effects.spec.ts` — tests de los nuevos effects. (Task 2)
- `emulador/src/app/components/playback-controller/playback-controller.component.ts` (+ `.html`, `.css`) — NUEVO HUD flotante. (Task 3)
- `emulador/src/app/components/playback-controller/playback-controller.component.spec.ts` — smoke. (Task 3)
- `emulador/src/app/components/floating-pnl/floating-pnl.component.ts` — NUEVO overlay de P/L. (Task 4)
- `emulador/src/app/components/floating-pnl/floating-pnl.component.spec.ts` — smoke. (Task 4)
- `emulador/src/app/components/controls/controls.component.{ts,html,css,spec.ts}` — quitar replay/reloj/progreso/P/L. (Task 5)
- `emulador/src/app/pages/emulador/emulador-page.component.ts` — montar los dos componentes nuevos en `.chart-area`. (Task 5)

---

### Task 1: Estado y acciones de navegación (`jumpSize`, `seekTo`)

`seekTo` es una acción de teletransporte distinta de `goToTime`: `processFills$` solo escucha
`goToTime`, así que el scrubber (que usa `seekTo`) nunca dispara fills. `jumpForward`/`jumpBack`
son `emptyProps` (leen `jumpSize` del estado en el effect).

**Files:**
- Modify: `emulador/src/app/state/replay/replay.actions.ts`
- Modify: `emulador/src/app/state/replay/replay.reducer.ts`
- Test: `emulador/src/app/state/replay/replay.reducer.spec.ts`

**Interfaces:**
- Produces: `ReplayState.jumpSize: number` (default 10). `replayFeature.selectJumpSize`. Acciones `ReplayActions.setJumpSize({ size: number })`, `ReplayActions.jumpForward()`, `ReplayActions.jumpBack()`, `ReplayActions.seekTo({ time: number })`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar en `replay.reducer.spec.ts`:

```ts
import { replayFeature } from './replay.reducer';
import { ReplayActions } from './replay.actions';

describe('replay reducer — navegación', () => {
  const reducer = replayFeature.reducer;
  const init = reducer(undefined, { type: '@@init' } as any);

  it('jumpSize por defecto es 10', () => {
    expect(init.jumpSize).toBe(10);
  });

  it('setJumpSize actualiza jumpSize', () => {
    const next = reducer(init, ReplayActions.setJumpSize({ size: 50 }));
    expect(next.jumpSize).toBe(50);
  });

  it('seekTo mueve el cursor sin tocar playing', () => {
    const playing = reducer(init, ReplayActions.play());
    const next = reducer(playing, ReplayActions.seekTo({ time: 12345 }));
    expect(next.currentTime).toBe(12345);
    expect(next.playing).toBe(true);
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd emulador && npm test -- replay.reducer`
Expected: FAIL (`jumpSize` undefined, `setJumpSize`/`seekTo` no existen).

- [ ] **Step 3: Agregar las acciones**

En `replay.actions.ts`, dentro de `events`:

```ts
    /** Sets the multi-candle jump size (5 / 10 / 50). */
    'Set Jump Size': props<{ size: number }>(),
    /** Advances `jumpSize` candles, processing fills for each crossed candle. */
    'Jump Forward': emptyProps(),
    /** Moves `jumpSize` candles back (review; no new fills). */
    'Jump Back': emptyProps(),
    /** Teleports the cursor (scrubber). NOT a fill-processing advance. */
    'Seek To': props<{ time: number }>(),
```

- [ ] **Step 4: Agregar estado + handlers**

En `replay.reducer.ts`, sumar el campo y handlers:

```ts
export interface ReplayState {
  currentTime: number;
  playing: boolean;
  msPerCandle: number;
  jumpSize: number;
}

const initialState: ReplayState = {
  currentTime: 0,
  playing: false,
  msPerCandle: 500,
  jumpSize: 10,
};
```

Dentro de `createReducer`, sumar:

```ts
    on(ReplayActions.setJumpSize, (state, { size }): ReplayState => ({ ...state, jumpSize: size })),
    on(ReplayActions.seekTo, (state, { time }): ReplayState => ({ ...state, currentTime: time })),
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `cd emulador && npm test -- replay.reducer`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add emulador/src/app/state/replay/
git commit -m "feat(replay): add jumpSize state and setJumpSize/seekTo/jump actions"
```

---

### Task 2: Effects de salto (`jumpForward$`, `jumpBack$`)

`jumpForward$` calcula `to = min(idx + jumpSize, len-1)`, clampado además para no pasar un
fin de sesión programado; emite `processCandle` por cada vela intermedia `[idx+1 .. to-1]` y
un `goToTime(candles[to].time)` final (la última vela la procesa `processFills$`). `jumpBack$`
emite un solo `goToTime(candles[max(0, idx-jumpSize)].time)`.

**Files:**
- Modify: `emulador/src/app/state/replay/replay.effects.ts`
- Test: `emulador/src/app/state/replay/replay.effects.spec.ts`

**Interfaces:**
- Consumes: `selectFillContext` (`{ candles, idx, tfSeconds, lower, contractSize, trading }`), `replayFeature.selectJumpSize`, `sliceRange` (`state/trading/fill-engine.ts`), `TradingActions.processCandle`, `ReplayActions.goToTime`.
- Produces: `effects.jumpForward$`, `effects.jumpBack$`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar en `replay.effects.spec.ts` (reusa `series` de `../../testing/fixtures`, ya importado):

```ts
import { selectFillContext } from '../selectors';
import { replayFeature } from './replay.reducer';
import { TradingActions } from '../trading/trading.actions';

describe('jumpForward$', () => {
  it('procesa las velas intermedias y aterriza con goToTime en la vela objetivo', async () => {
    const c = series(6, 0, 3600); // idx 0..5
    store.overrideSelector(selectFillContext, {
      candles: c, idx: 1, tfSeconds: 3600, lower: null, contractSize: 1,
      trading: { orders: [], positions: [], sessionEnd: null, sessionEnded: false } as any,
    });
    store.overrideSelector(replayFeature.selectJumpSize, 3); // to = 4
    store.refreshState();

    const out = effects.jumpForward$.pipe(take(3), toArray()).toPromise();
    actions$.next(ReplayActions.jumpForward());
    const result = await out;

    // velas intermedias 2 y 3 procesadas, luego goToTime a candles[4]
    expect(result[0]).toEqual(
      TradingActions.processCandle({ candle: c[2], subCandles: null, contractSize: 1 }),
    );
    expect(result[1]).toEqual(
      TradingActions.processCandle({ candle: c[3], subCandles: null, contractSize: 1 }),
    );
    expect(result[2]).toEqual(ReplayActions.goToTime({ time: c[4].time }));
  });
});

describe('jumpBack$', () => {
  it('emite goToTime jumpSize velas atrás (clamp a 0)', async () => {
    const c = series(6, 0, 3600);
    store.overrideSelector(selectFillContext, {
      candles: c, idx: 2, tfSeconds: 3600, lower: null, contractSize: 1,
      trading: { orders: [], positions: [], sessionEnd: null, sessionEnded: false } as any,
    });
    store.overrideSelector(replayFeature.selectJumpSize, 10); // max(0, 2-10)=0
    store.refreshState();

    const p = firstValueFrom(effects.jumpBack$);
    actions$.next(ReplayActions.jumpBack());
    expect(await p).toEqual(ReplayActions.goToTime({ time: c[0].time }));
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd emulador && npm test -- replay.effects`
Expected: FAIL (`effects.jumpForward$` undefined).

- [ ] **Step 3: Implementar los effects**

En `replay.effects.ts`, sumar imports y effects:

```ts
import { selectFillContext } from '../selectors';
import { replayFeature } from './replay.reducer';
import { TradingActions } from '../trading/trading.actions';
import { sliceRange } from '../trading/fill-engine';
import { Action } from '@ngrx/store';

  /**
   * Forward jump of `jumpSize` candles. Fills are evaluated for every crossed
   * candle: a processCandle per intermediate candle, then a final goToTime whose
   * processFills$ handles the landing candle. `to` is clamped to the data end and
   * to a scheduled session end so the jump never overshoots either.
   */
  jumpForward$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayActions.jumpForward),
      withLatestFrom(
        this.store.select(selectFillContext),
        this.store.select(replayFeature.selectJumpSize),
      ),
      mergeMap(([, ctx, n]): Action[] => {
        const { candles, idx, tfSeconds, lower, contractSize, trading } = ctx;
        if (idx < 0 || idx + 1 >= candles.length) return [];
        let to = Math.min(idx + n, candles.length - 1);
        if (trading.sessionEnd !== null) {
          while (to > idx + 1 && candles[to].time > trading.sessionEnd) to--;
        }
        const actions: Action[] = [];
        for (let i = idx + 1; i < to; i++) {
          const candle = candles[i];
          const subCandles = lower ? sliceRange(lower, candle.time, candle.time + tfSeconds) : null;
          actions.push(TradingActions.processCandle({ candle, subCandles, contractSize }));
        }
        actions.push(ReplayActions.goToTime({ time: candles[to].time }));
        return actions;
      }),
    ),
  );

  /** Backward jump of `jumpSize` candles (cursor only; landing candle is idempotent). */
  jumpBack$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReplayActions.jumpBack),
      withLatestFrom(
        this.store.select(selectActiveCandles),
        this.store.select(selectVisibleIndex),
        this.store.select(replayFeature.selectJumpSize),
      ),
      filter(([, , idx]) => idx >= 1),
      map(([, candles, idx, n]) =>
        ReplayActions.goToTime({ time: candles[Math.max(0, idx - n)].time }),
      ),
    ),
  );
```

Sumar `mergeMap` al import de `rxjs/operators`.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd emulador && npm test -- replay.effects`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add emulador/src/app/state/replay/
git commit -m "feat(replay): add jumpForward/jumpBack effects with per-candle fills"
```

---

### Task 3: `PlaybackControllerComponent` (HUD flotante)

Barra flotante de dos filas: scrubber arriba; transporte `−1/▶/+1` (auto-repeat al mantener)
+ chip `« ×N »` (cicla 5/10/50) + velocidad + reloj + progreso. Despacha las acciones de
replay. El render fino (drag, auto-repeat) se valida en navegador; el spec es un smoke.

**Files:**
- Create: `emulador/src/app/components/playback-controller/playback-controller.component.ts`
- Create: `emulador/src/app/components/playback-controller/playback-controller.component.html`
- Create: `emulador/src/app/components/playback-controller/playback-controller.component.css`
- Test: `emulador/src/app/components/playback-controller/playback-controller.component.spec.ts`

**Interfaces:**
- Consumes: `selectPlaying`, `selectMsPerCandle`, `selectProgress`, `selectCurrentTime`, `selectUtcOffset`, `selectDataRange` (`state/selectors.ts`), `replayFeature.selectJumpSize`, `DropdownComponent`.
- Produces: `<app-playback-controller>`.

- [ ] **Step 1: Escribir el smoke test que falla**

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { PlaybackControllerComponent } from './playback-controller.component';
import { ReplayActions } from '../../state/replay/replay.actions';

describe('PlaybackControllerComponent', () => {
  let fixture: ComponentFixture<PlaybackControllerComponent>;
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PlaybackControllerComponent],
      providers: [provideMockStore()],
    });
    store = TestBed.inject(MockStore);
    fixture = TestBed.createComponent(PlaybackControllerComponent);
    fixture.detectChanges();
  });

  it('renderiza y cicla el tamaño de salto 10 → 50 → 5', () => {
    const spy = vi.spyOn(store, 'dispatch');
    const c = fixture.componentInstance;
    c.cycleJumpSize();
    expect(spy).toHaveBeenCalledWith(ReplayActions.setJumpSize({ size: 50 }));
  });

  it('+1 despacha advanceCandle', () => {
    const spy = vi.spyOn(store, 'dispatch');
    fixture.componentInstance.step();
    expect(spy).toHaveBeenCalledWith(ReplayActions.advanceCandle());
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd emulador && npm test -- playback-controller`
Expected: FAIL (componente no existe).

- [ ] **Step 3: Implementar el componente**

`playback-controller.component.ts`:

```ts
import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Store } from '@ngrx/store';
import { ReplayActions } from '../../state/replay/replay.actions';
import { replayFeature } from '../../state/replay/replay.reducer';
import {
  selectCurrentTime,
  selectDataRange,
  selectMsPerCandle,
  selectPlaying,
  selectProgress,
  selectUtcOffset,
} from '../../state/selectors';
import { DropdownComponent, DropdownOption } from '../ui/dropdown.component';
import { TooltipDirective } from '../ui/tooltip.directive';

const JUMP_SIZES = [5, 10, 50];

@Component({
  selector: 'app-playback-controller',
  standalone: true,
  imports: [DatePipe, DropdownComponent, TooltipDirective],
  templateUrl: './playback-controller.component.html',
  styleUrl: './playback-controller.component.css',
})
export class PlaybackControllerComponent {
  private store = inject(Store);
  private repeatTimer: ReturnType<typeof setInterval> | null = null;

  playing = this.store.selectSignal(selectPlaying);
  msPerCandle = this.store.selectSignal(selectMsPerCandle);
  progress = this.store.selectSignal(selectProgress);
  jumpSize = this.store.selectSignal(replayFeature.selectJumpSize);
  private currentTime = this.store.selectSignal(selectCurrentTime);
  private utcOffset = this.store.selectSignal(selectUtcOffset);
  private range = this.store.selectSignal(selectDataRange);

  clockMs = computed(() => {
    const t = this.currentTime();
    return t > 0 ? (t + this.utcOffset() * 3600) * 1000 : null;
  });

  /** Scrubber fill fraction 0..1 from the cursor position in the data range. */
  scrubFraction = computed(() => {
    const r = this.range();
    const t = this.currentTime();
    if (!r || r.to <= r.from || t <= 0) return 0;
    return Math.min(1, Math.max(0, (t - r.from) / (r.to - r.from)));
  });

  readonly speedOptions: DropdownOption[] = [
    { value: '1000', label: '1 vela/s' },
    { value: '500', label: '2 velas/s' },
    { value: '250', label: '4 velas/s' },
    { value: '100', label: '10 velas/s' },
  ];

  play(): void { this.store.dispatch(ReplayActions.play()); }
  pause(): void { this.store.dispatch(ReplayActions.pause()); }
  step(): void { this.store.dispatch(ReplayActions.advanceCandle()); }
  stepBack(): void { this.store.dispatch(ReplayActions.stepBack()); }
  jumpForward(): void { this.store.dispatch(ReplayActions.jumpForward()); }
  jumpBack(): void { this.store.dispatch(ReplayActions.jumpBack()); }
  setSpeed(v: string): void { this.store.dispatch(ReplayActions.changeSpeed({ msPerCandle: +v })); }

  cycleJumpSize(): void {
    const i = JUMP_SIZES.indexOf(this.jumpSize());
    const size = JUMP_SIZES[(i + 1) % JUMP_SIZES.length];
    this.store.dispatch(ReplayActions.setJumpSize({ size }));
  }

  /** Hold-to-repeat: fire once, then repeat every 90ms while held. */
  startRepeat(dir: 'fwd' | 'back'): void {
    const fire = dir === 'fwd' ? () => this.step() : () => this.stepBack();
    fire();
    this.stopRepeat();
    this.repeatTimer = setInterval(fire, 90);
  }
  stopRepeat(): void {
    if (this.repeatTimer) { clearInterval(this.repeatTimer); this.repeatTimer = null; }
  }

  /** Scrubber drag → seekTo the corresponding time (teleport, no fills). */
  onScrub(fraction: number): void {
    const r = this.range();
    if (!r) return;
    const time = Math.round(r.from + fraction * (r.to - r.from));
    this.store.dispatch(ReplayActions.seekTo({ time }));
  }
}
```

`playback-controller.component.html`:

```html
<div class="hud">
  <div class="scrub-row">
    <input
      class="scrub"
      type="range"
      min="0"
      max="1"
      step="0.001"
      [value]="scrubFraction()"
      aria-label="Línea de tiempo de la sesión"
      (input)="onScrub(+$any($event.target).value)"
    />
  </div>
  <div class="ctl-row">
    <div class="grp" role="group" aria-label="Transporte">
      <button
        class="btn"
        appTooltip="Retroceder una vela"
        (pointerdown)="startRepeat('back')"
        (pointerup)="stopRepeat()"
        (pointerleave)="stopRepeat()"
      >−1</button>
      @if (playing()) {
        <button class="btn play" (click)="pause()" aria-label="Pausar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="4" width="5" height="16" rx="1"></rect>
            <rect x="14" y="4" width="5" height="16" rx="1"></rect>
          </svg>
        </button>
      } @else {
        <button class="btn play" (click)="play()" aria-label="Reproducir">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6,4 20,12 6,20"></polygon>
          </svg>
        </button>
      }
      <button
        class="btn"
        appTooltip="Avanzar una vela"
        (pointerdown)="startRepeat('fwd')"
        (pointerup)="stopRepeat()"
        (pointerleave)="stopRepeat()"
      >+1</button>
    </div>

    <div class="sep"></div>

    <div class="grp" role="group" aria-label="Saltos">
      <button class="btn" appTooltip="Saltar atrás" (click)="jumpBack()">«</button>
      <button class="chip" appTooltip="Tamaño de salto" (click)="cycleJumpSize()">×{{ jumpSize() }}</button>
      <button class="btn" appTooltip="Saltar adelante" (click)="jumpForward()">»</button>
    </div>

    <div class="sep"></div>

    <ui-dropdown
      ariaLabel="Velocidad"
      [options]="speedOptions"
      [value]="msPerCandle() + ''"
      (valueChange)="setSpeed($event)"
    />

    <div class="sep"></div>

    @if (clockMs(); as ms) {
      <span class="clock">{{ ms | date: 'dd MMM HH:mm' : 'UTC' }}</span>
    }
    @if (progress(); as p) {
      <span class="progress">{{ p.shown }} / {{ p.total }}</span>
    }
  </div>
</div>
```

`playback-controller.component.css`:

```css
.hud {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(520px, 90%);
  padding: 8px 12px;
  background: var(--surface-2, #181818);
  border: 1px solid var(--border-strong, #333);
  border-radius: var(--radius-md, 10px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  z-index: 30;
}
.scrub-row { display: flex; }
.scrub { width: 100%; accent-color: var(--accent, #2962ff); cursor: pointer; }
.ctl-row { display: flex; align-items: center; gap: 8px; }
.grp { display: flex; align-items: center; gap: 4px; }
.btn,
.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 30px;
  padding: 0 9px;
  background: var(--surface-3, #1f1f1f);
  border: 1px solid var(--border-strong, #333);
  border-radius: var(--radius-sm, 6px);
  color: var(--text, #d1d4dc);
  font: inherit;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.btn:hover, .chip:hover { border-color: var(--border-strong, #555); }
.btn.play { background: var(--accent, #2962ff); border-color: var(--accent, #2962ff); color: #fff; min-width: 36px; }
.btn:focus-visible, .chip:focus-visible { outline: 2px solid var(--accent, #2962ff); outline-offset: 2px; }
.sep { width: 1px; height: 22px; background: var(--border-strong, #333); }
.clock { color: var(--warning, #f0b90b); font-weight: 600; font-variant-numeric: tabular-nums; }
.progress { color: var(--text-muted, #787b86); font-variant-numeric: tabular-nums; margin-left: auto; }
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd emulador && npm test -- playback-controller`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add emulador/src/app/components/playback-controller/
git commit -m "feat(playback): floating replay HUD with transport, jumps, scrubber"
```

---

### Task 4: `FloatingPnlComponent` (overlay del gráfico)

Pequeño readout del P/L flotante en una esquina del gráfico, separado de los controles.

**Files:**
- Create: `emulador/src/app/components/floating-pnl/floating-pnl.component.ts`
- Test: `emulador/src/app/components/floating-pnl/floating-pnl.component.spec.ts`

**Interfaces:**
- Consumes: `selectFloatingPnl` (`state/selectors.ts`).
- Produces: `<app-floating-pnl>`.

- [ ] **Step 1: Escribir el smoke test que falla**

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { describe, beforeEach, it, expect } from 'vitest';
import { FloatingPnlComponent } from './floating-pnl.component';
import { selectFloatingPnl } from '../../state/selectors';

describe('FloatingPnlComponent', () => {
  let fixture: ComponentFixture<FloatingPnlComponent>;
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FloatingPnlComponent],
      providers: [provideMockStore()],
    });
    store = TestBed.inject(MockStore);
  });

  it('oculto cuando el P/L es null', () => {
    store.overrideSelector(selectFloatingPnl, null);
    fixture = TestBed.createComponent(FloatingPnlComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.fpnl')).toBeNull();
  });

  it('muestra el P/L con clase up cuando es positivo', () => {
    store.overrideSelector(selectFloatingPnl, 120.5);
    fixture = TestBed.createComponent(FloatingPnlComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector('.fpnl');
    expect(el).not.toBeNull();
    expect(el.classList).toContain('up');
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd emulador && npm test -- floating-pnl`
Expected: FAIL (componente no existe).

- [ ] **Step 3: Implementar el componente**

```ts
import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Store } from '@ngrx/store';
import { selectFloatingPnl } from '../../state/selectors';

@Component({
  selector: 'app-floating-pnl',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    @if (pnl() !== null) {
      <span class="fpnl" [class.up]="pnl()! >= 0" [class.down]="pnl()! < 0"
            title="P/L flotante de las posiciones abiertas">
        P/L {{ pnl() | number: '1.2-2' }} $
      </span>
    }
  `,
  styles: [`
    .fpnl {
      position: absolute;
      top: 10px;
      right: 12px;
      z-index: 30;
      padding: 4px 10px;
      border-radius: var(--radius-sm, 6px);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      background: var(--surface-2, #181818);
      border: 1px solid var(--border, #222);
      pointer-events: none;
    }
    .fpnl.up { color: var(--up, #26a69a); }
    .fpnl.down { color: var(--down, #ef5350); }
  `],
})
export class FloatingPnlComponent {
  private store = inject(Store);
  pnl = this.store.selectSignal(selectFloatingPnl);
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd emulador && npm test -- floating-pnl`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add emulador/src/app/components/floating-pnl/
git commit -m "feat(trading): floating P/L overlay component"
```

---

### Task 5: Reducir `ControlsComponent` a contexto y montar el HUD

Quitar de la barra superior el grupo de replay, el reloj, el progreso y el P/L (ahora viven
en el HUD / overlay). Montar `<app-playback-controller>` y `<app-floating-pnl>` dentro de
`.chart-area` en la página del emulador.

**Files:**
- Modify: `emulador/src/app/components/controls/controls.component.html` (quitar `.replay-group`, `.progress`, `.clock`, `.floating-pnl`)
- Modify: `emulador/src/app/components/controls/controls.component.ts` (quitar `playing`, `msPerCandle`, `progress`, `floatingPnl`, `clockMs`, `speeds`, `speedOptions`, `step`, `stepBack`, `play`, `pause`, `setSpeed`; conservar activo + TFs)
- Modify: `emulador/src/app/components/controls/controls.component.spec.ts` (quitar asserts de replay/reloj/P/L)
- Modify: `emulador/src/app/pages/emulador/emulador-page.component.ts`

**Interfaces:**
- Consumes: `PlaybackControllerComponent`, `FloatingPnlComponent`.

- [ ] **Step 1: Montar los componentes en la página**

En `emulador-page.component.ts`, sumar imports y el template de `.chart-area`:

```ts
import { PlaybackControllerComponent } from '../../components/playback-controller/playback-controller.component';
import { FloatingPnlComponent } from '../../components/floating-pnl/floating-pnl.component';
```

Sumar ambos a `imports: [...]` y dentro de `<main class="chart-area">`, tras `<app-chart>`:

```html
        <main class="chart-area">
          <app-chart></app-chart>
          <app-floating-pnl></app-floating-pnl>
          <app-playback-controller></app-playback-controller>
          @if (floatingToolbar()) {
            <app-floating-toolbar></app-floating-toolbar>
          }
        </main>
```

- [ ] **Step 2: Quitar el replay de la barra de contexto**

En `controls.component.html`, eliminar los bloques `.replay-group`, `@if (progress())`,
`@if (clockMs())` y `@if (floatingPnl())`. Quedan solo el `ui-dropdown` de activo y el
`.tf-group`.

En `controls.component.ts`, eliminar los signals y métodos listados en **Files** (replay,
velocidad, progreso, reloj, P/L). Conservar: `tfs`, `activeTf`, `customTf`, `assets`,
`currentAsset`, `assetOptions`, `onAsset`, `setTf`, `customChipLabel`, `isShortTf`,
`shortTfTip`. Quitar imports sin uso (`DatePipe`, `DecimalPipe`, selectores de replay).

- [ ] **Step 3: Ajustar el spec de controls**

En `controls.component.spec.ts`, eliminar los tests que verifican botones de play/pausa,
velocidad, reloj, progreso o P/L. Conservar los de activo y temporalidades.

- [ ] **Step 4: Correr toda la suite + build**

Run: `cd emulador && npm test`
Expected: PASS (suite verde).
Run: `cd emulador && npm run build`
Expected: build OK.

- [ ] **Step 5: Lint/format + commit**

```bash
cd emulador && npm run format && npm run lint
git add emulador/src/app/components/controls/ emulador/src/app/pages/emulador/
git commit -m "refactor(controls): reduce top bar to context; mount floating HUD + P/L overlay"
```

---

## Verificación (fin de Fase 1)

- `cd emulador && npm test` — suite verde, incluyendo `replay.reducer`, `replay.effects`, `playback-controller`, `floating-pnl`.
- `npm run lint && npm run format:check && npm run build` — sin errores.
- Navegador (preview tools), sesión con datos cargados:
  1. La barra superior muestra solo activo + temporalidades.
  2. El HUD flotante aparece centrado abajo sobre el gráfico, siempre visible.
  3. `▶/⏸` reproduce/pausa; mantener `−1`/`+1` avanza en repetición; el chip `×N` cicla 5/10/50.
  4. `«`/`»` saltan N velas; un SL/TP dentro de las velas cruzadas por `»` se dispara; `«` solo retrocede el cursor.
  5. Arrastrar el scrubber reposiciona el cursor sin disparar fills.
  6. El P/L flotante se ve como overlay en la esquina del gráfico, verde/rojo según signo.

## Self-Review (cubierto)

- **Cobertura del spec (Fase 1):** barra de contexto (Task 5), HUD flotante (Task 3), saltos ±N + auto-repeat (Tasks 1-3), scrubber/seekTo (Tasks 1, 3), P/L overlay (Task 4), semántica de fills en `+N` (Task 2). La Replay Resolution es la Fase 2 (plan aparte).
- **Sin placeholders:** cada paso trae test e implementación completos.
- **Consistencia de tipos:** `setJumpSize({ size })`, `seekTo({ time })`, `jumpForward()`/`jumpBack()` usados igual en reducer (Task 1), effects (Task 2) y componente (Task 3).
