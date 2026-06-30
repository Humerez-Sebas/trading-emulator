import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { ReplayActions } from '../../state/replay/replay.actions';
import { replayFeature } from '../../state/replay/replay.reducer';
import {
  selectAvailableResolutions,
  selectMsPerCandle,
  selectPlaying,
  selectResolutionMinutes,
} from '../../state/selectors';
import { TooltipDirective } from '../ui/tooltip.directive';
import { DraggableDirective } from '../ui/draggable.directive';

/** Replay speeds offered, in candles per second. */
const SPEED_OPTIONS = [1, 2, 5, 10, 25, 50] as const;
/** Jump amounts offered (in replay-resolution candles). */
const JUMP_OPTIONS = [1, 2, 3, 4, 5, 10, 20, 50] as const;

/**
 * Floating, glassmorphism playback HUD. Display Navigation (`-1`/`+1`), play,
 * speed, multi-candle jumps and the replay resolution (sub-TF) live here. No
 * clock — the cursor time reads off the chart crosshair and the replay price
 * line instead.
 */
@Component({
  selector: 'app-playback-controller',
  standalone: true,
  imports: [TooltipDirective, DraggableDirective],
  templateUrl: './playback-controller.component.html',
  styleUrl: './playback-controller.component.css',
  host: { '(document:click)': 'onDocClick($event)' },
})
export class PlaybackControllerComponent {
  private store = inject(Store);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  playing = this.store.selectSignal(selectPlaying);
  private msPerCandle = this.store.selectSignal(selectMsPerCandle);
  jumpSize = this.store.selectSignal(replayFeature.selectJumpSize);
  availableResolutions = this.store.selectSignal(selectAvailableResolutions);
  private resolutionMinutes = this.store.selectSignal(selectResolutionMinutes);

  readonly speedOptions = SPEED_OPTIONS;
  readonly jumpOptions = JUMP_OPTIONS;

  /** One open menu at a time: 'speed' | 'jump' | 'res' | null. */
  openMenu = signal<'speed' | 'jump' | 'res' | null>(null);

  /** Current speed in candles per second (derived from msPerCandle). */
  speedVps = computed(() => Math.round(1000 / this.msPerCandle()));

  /** Active resolution label: "Gráfico" (main TF) or the sub-TF tag ("M5"…). */
  resolutionLabel = computed(() => {
    const m = this.resolutionMinutes();
    if (m == null) return 'Gráfico';
    return this.availableResolutions().find((r) => r.minutes === m)?.label ?? `M${m}`;
  });

  isResolutionActive(minutes: number | null): boolean {
    return this.resolutionMinutes() === minutes;
  }

  // ---- transport ----
  play(): void {
    this.store.dispatch(ReplayActions.play());
  }
  pause(): void {
    this.store.dispatch(ReplayActions.pause());
  }
  /** `+1`: Display Navigation — snap to the next display candle (fills simulated). */
  step(): void {
    this.store.dispatch(ReplayActions.advanceDisplay());
  }
  /** `-1`: Display Navigation back — snap to the display grid (no fills). */
  stepBack(): void {
    this.store.dispatch(ReplayActions.stepBack());
  }
  jumpForward(): void {
    this.store.dispatch(ReplayActions.jumpForward());
  }
  jumpBack(): void {
    this.store.dispatch(ReplayActions.jumpBack());
  }

  // ---- selectors ----
  toggleMenu(menu: 'speed' | 'jump' | 'res'): void {
    this.openMenu.update((m) => (m === menu ? null : menu));
  }
  closeMenus(): void {
    this.openMenu.set(null);
  }
  /** Close any open menu when clicking outside the HUD. */
  onDocClick(event: MouseEvent): void {
    if (this.openMenu() && !this.host.nativeElement.contains(event.target as Node)) {
      this.closeMenus();
    }
  }

  setSpeed(vps: number): void {
    this.store.dispatch(ReplayActions.changeSpeed({ msPerCandle: Math.round(1000 / vps) }));
    this.closeMenus();
  }
  setJump(size: number): void {
    this.store.dispatch(ReplayActions.setJumpSize({ size }));
    this.closeMenus();
  }
  /** `null` → main display TF ("Gráfico"); a number → that sub-TF in minutes. */
  setResolution(minutes: number | null): void {
    this.store.dispatch(ReplayActions.setReplayResolution({ minutes }));
    this.closeMenus();
  }
}
