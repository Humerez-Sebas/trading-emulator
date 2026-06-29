import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { PlaybackControllerComponent } from './playback-controller.component';
import { ReplayActions } from '../../state/replay/replay.actions';
import { replayFeature } from '../../state/replay/replay.reducer';
import {
  selectCurrentTime,
  selectDataRange,
  selectMsPerCandle,
  selectPlaying,
  selectUtcOffset,
} from '../../state/selectors';

describe('PlaybackControllerComponent', () => {
  let fixture: ComponentFixture<PlaybackControllerComponent>;
  let store: MockStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PlaybackControllerComponent],
      providers: [provideMockStore()],
    });
    store = TestBed.inject(MockStore);
    localStorage.clear(); // isolate the persisted HUD position between tests
    // The component reads selectors that derive from selectActiveCandles /
    // selectSeries (market feature state), which is undefined under a bare
    // mock store. Override every selector the component consumes so the
    // MockStore short-circuits the throwing projector chain.
    store.overrideSelector(selectPlaying, false);
    store.overrideSelector(selectMsPerCandle, 500);
    store.overrideSelector(replayFeature.selectJumpSize, 10);
    store.overrideSelector(selectCurrentTime, 0);
    store.overrideSelector(selectUtcOffset, 0);
    store.overrideSelector(selectDataRange, null);
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

  it('onScrub pausa el auto-play y luego teletransporta el cursor', () => {
    store.overrideSelector(selectDataRange, { from: 1000, to: 2000 });
    store.refreshState();
    const spy = vi.spyOn(store, 'dispatch');
    fixture.componentInstance.onScrub(0.5);
    expect(spy).toHaveBeenCalledWith(ReplayActions.pause());
    expect(spy).toHaveBeenCalledWith(ReplayActions.seekTo({ time: 1500 }));
  });

  it('ngOnDestroy detiene el auto-repeat', () => {
    vi.useFakeTimers();
    const c = fixture.componentInstance;
    const spy = vi.spyOn(store, 'dispatch');
    c.startRepeat('fwd'); // dispara una vez de inmediato
    expect(spy).toHaveBeenCalledTimes(1);
    c.ngOnDestroy(); // limpia el intervalo
    vi.advanceTimersByTime(300); // habría disparado ~3 veces más sin la limpieza
    expect(spy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('pos por defecto es null (HUD centrado) sin posición guardada', () => {
    localStorage.clear();
    const f = TestBed.createComponent(PlaybackControllerComponent);
    expect(f.componentInstance.pos()).toBeNull();
  });

  it('carga la posición arrastrada desde localStorage', () => {
    localStorage.setItem('emulador.playbackPos', JSON.stringify({ x: 200, y: 100 }));
    const f = TestBed.createComponent(PlaybackControllerComponent);
    expect(f.componentInstance.pos()).toEqual({ x: 200, y: 100 });
  });

  it('persiste la posición en localStorage al soltar el arrastre', () => {
    const c = fixture.componentInstance;
    c.pos.set({ x: 120, y: 64 });
    c.startDrag(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
    window.dispatchEvent(new MouseEvent('mouseup'));
    expect(JSON.parse(localStorage.getItem('emulador.playbackPos')!)).toEqual({ x: 120, y: 64 });
  });
});
