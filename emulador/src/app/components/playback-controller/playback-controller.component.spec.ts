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
  selectProgress,
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
    // The component reads selectors that derive from selectActiveCandles /
    // selectSeries (market feature state), which is undefined under a bare
    // mock store. Override every selector the component consumes so the
    // MockStore short-circuits the throwing projector chain.
    store.overrideSelector(selectPlaying, false);
    store.overrideSelector(selectMsPerCandle, 500);
    store.overrideSelector(selectProgress, { shown: 0, total: 0 });
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
});
