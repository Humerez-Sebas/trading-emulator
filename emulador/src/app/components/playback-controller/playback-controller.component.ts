import { Component, ElementRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Store } from '@ngrx/store';
import { ReplayActions } from '../../state/replay/replay.actions';
import { replayFeature } from '../../state/replay/replay.reducer';
import {
  selectCurrentTime,
  selectDataRange,
  selectMsPerCandle,
  selectPlaying,
  selectUtcOffset,
} from '../../state/selectors';
import { DropdownComponent, DropdownOption } from '../ui/dropdown.component';
import { TooltipDirective } from '../ui/tooltip.directive';

const JUMP_SIZES = [5, 10, 50];

/** localStorage key for the dragged HUD position (top-left px in the chart area). */
const POSITION_KEY = 'emulador.playbackPos';

@Component({
  selector: 'app-playback-controller',
  standalone: true,
  imports: [DatePipe, DropdownComponent, TooltipDirective],
  templateUrl: './playback-controller.component.html',
  styleUrl: './playback-controller.component.css',
})
export class PlaybackControllerComponent implements OnDestroy {
  private store = inject(Store);
  private host = inject(ElementRef<HTMLElement>);
  private repeatTimer: ReturnType<typeof setInterval> | null = null;

  playing = this.store.selectSignal(selectPlaying);
  msPerCandle = this.store.selectSignal(selectMsPerCandle);
  jumpSize = this.store.selectSignal(replayFeature.selectJumpSize);
  private currentTime = this.store.selectSignal(selectCurrentTime);
  private utcOffset = this.store.selectSignal(selectUtcOffset);
  private range = this.store.selectSignal(selectDataRange);

  /** Top-left corner in px relative to the chart area; null = the centered default. */
  pos = signal<{ x: number; y: number } | null>(this.loadPosition());

  private drag: { startX: number; startY: number; baseX: number; baseY: number } | null = null;
  private onMove = (e: MouseEvent) => this.handleMove(e);
  private onUp = () => this.endDrag();

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

  /**
   * Drag the HUD by its grip — same mechanism as the floating tool bar. On the
   * first drag from the centered default we seed `pos` from the current rendered
   * box so the panel doesn't jump.
   */
  startDrag(e: MouseEvent): void {
    const el = this.host.nativeElement.firstElementChild as HTMLElement | null;
    if (this.pos() === null && el) {
      const parent = this.host.nativeElement.parentElement;
      const r = el.getBoundingClientRect();
      const pr = parent?.getBoundingClientRect();
      this.pos.set({ x: r.left - (pr?.left ?? 0), y: r.top - (pr?.top ?? 0) });
    }
    const p = this.pos() ?? { x: 0, y: 0 };
    this.drag = { startX: e.clientX, startY: e.clientY, baseX: p.x, baseY: p.y };
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('mouseup', this.onUp);
    e.preventDefault();
  }

  private handleMove(e: MouseEvent): void {
    if (!this.drag) return;
    const parent = this.host.nativeElement.parentElement;
    const el = this.host.nativeElement.firstElementChild as HTMLElement | null;
    const maxX = parent && el ? parent.clientWidth - el.offsetWidth : Infinity;
    const maxY = parent && el ? parent.clientHeight - el.offsetHeight : Infinity;
    const x = Math.max(0, Math.min(maxX, this.drag.baseX + e.clientX - this.drag.startX));
    const y = Math.max(0, Math.min(maxY, this.drag.baseY + e.clientY - this.drag.startY));
    this.pos.set({ x, y });
  }

  private endDrag(): void {
    if (!this.drag) return;
    this.drag = null;
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(this.pos()));
    } catch {
      /* storage unavailable: ignore */
    }
  }

  private loadPosition(): { x: number; y: number } | null {
    try {
      const raw = localStorage.getItem(POSITION_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { x?: number; y?: number };
        if (typeof p.x === 'number' && typeof p.y === 'number' && p.x >= 0 && p.y >= 0) {
          return { x: p.x, y: p.y };
        }
      }
    } catch {
      /* fall through to the centered default */
    }
    return null;
  }

  /** Clear the auto-repeat interval and any drag listeners on teardown. */
  ngOnDestroy(): void {
    this.stopRepeat();
    window.removeEventListener('mousemove', this.onMove);
    window.removeEventListener('mouseup', this.onUp);
  }
}
