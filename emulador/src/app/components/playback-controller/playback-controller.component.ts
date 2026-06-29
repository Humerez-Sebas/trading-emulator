import { Component, OnDestroy, computed, inject } from '@angular/core';
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
export class PlaybackControllerComponent implements OnDestroy {
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

  play(): void {
    this.store.dispatch(ReplayActions.play());
  }
  pause(): void {
    this.store.dispatch(ReplayActions.pause());
  }
  step(): void {
    this.store.dispatch(ReplayActions.advanceCandle());
  }
  stepBack(): void {
    this.store.dispatch(ReplayActions.stepBack());
  }
  jumpForward(): void {
    this.store.dispatch(ReplayActions.jumpForward());
  }
  jumpBack(): void {
    this.store.dispatch(ReplayActions.jumpBack());
  }
  setSpeed(v: string): void {
    this.store.dispatch(ReplayActions.changeSpeed({ msPerCandle: +v }));
  }

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
    if (this.repeatTimer) {
      clearInterval(this.repeatTimer);
      this.repeatTimer = null;
    }
  }

  /**
   * Scrubber drag → seekTo the corresponding time (teleport, no fills). Grabbing
   * the timeline pauses auto-play first, so the cursor doesn't fight the thumb.
   */
  onScrub(fraction: number): void {
    const r = this.range();
    if (!r) return;
    this.store.dispatch(ReplayActions.pause());
    const time = Math.round(r.from + fraction * (r.to - r.from));
    this.store.dispatch(ReplayActions.seekTo({ time }));
  }

  /** Clear the auto-repeat interval if the HUD is torn down mid-hold. */
  ngOnDestroy(): void {
    this.stopRepeat();
  }
}
