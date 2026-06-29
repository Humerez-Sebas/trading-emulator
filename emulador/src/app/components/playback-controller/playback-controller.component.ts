import { Component, OnDestroy, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Store } from '@ngrx/store';
import { ReplayActions } from '../../state/replay/replay.actions';
import { replayFeature } from '../../state/replay/replay.reducer';
import {
  selectAvailableResolutions,
  selectCurrentTime,
  selectMsPerCandle,
  selectPlaying,
  selectResolutionMinutes,
  selectResolutionProgress,
  selectUtcOffset,
} from '../../state/selectors';
import { DropdownComponent, DropdownOption } from '../ui/dropdown.component';
import { TooltipDirective } from '../ui/tooltip.directive';
import { DraggableDirective } from '../ui/draggable.directive';

const JUMP_SIZES = [5, 10, 50];

@Component({
  selector: 'app-playback-controller',
  standalone: true,
  imports: [DatePipe, DropdownComponent, TooltipDirective, DraggableDirective],
  templateUrl: './playback-controller.component.html',
  styleUrl: './playback-controller.component.css',
})
export class PlaybackControllerComponent implements OnDestroy {
  private store = inject(Store);
  private repeatTimer: ReturnType<typeof setInterval> | null = null;

  playing = this.store.selectSignal(selectPlaying);
  msPerCandle = this.store.selectSignal(selectMsPerCandle);
  jumpSize = this.store.selectSignal(replayFeature.selectJumpSize);
  private currentTime = this.store.selectSignal(selectCurrentTime);
  private utcOffset = this.store.selectSignal(selectUtcOffset);

  availableResolutions = this.store.selectSignal(selectAvailableResolutions);
  resolutionMinutes = this.store.selectSignal(selectResolutionMinutes);
  private resProgress = this.store.selectSignal(selectResolutionProgress);

  clockMs = computed(() => {
    const t = this.currentTime();
    return t > 0 ? (t + this.utcOffset() * 3600) * 1000 : null;
  });

  readonly speedOptions: DropdownOption[] = [
    { value: '1000', label: '1 vela/s' },
    { value: '500', label: '2 velas/s' },
    { value: '250', label: '4 velas/s' },
    { value: '100', label: '10 velas/s' },
  ];

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
  setResolution(v: string): void {
    this.store.dispatch(ReplayActions.setReplayResolution({ minutes: v === 'full' ? null : +v }));
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

  /** Clear the auto-repeat interval on teardown. */
  ngOnDestroy(): void {
    this.stopRepeat();
  }
}
