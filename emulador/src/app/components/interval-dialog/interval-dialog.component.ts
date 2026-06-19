import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { Timeframe } from '../../models';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { MarketActions } from '../../state/market/market.actions';
import { selectCurrentAsset, selectSeries } from '../../state/selectors';
import {
  buildAnchorDownloadJobs,
  formatIntervalShort,
  formatIntervalVerbose,
  loadedTfForMinutes,
  parseInterval,
  pickBaseSeriesTf,
} from '../../state/market/custom-timeframe';
import { anchorFor } from '../../services/timeframe-generator';
import type { AnchorTf } from '../../services/session.service';
import { ManifestService } from '../../services/market-data/manifest.service';
import {
  DataOnboardingService,
  OnboardingProgress,
} from '../../services/market-data/data-onboarding.service';
import { ModalComponent } from '../ui/modal.component';
import { ButtonDirective } from '../ui/button.directive';

/** Lowercase manifest tf -> uppercase Timeframe the candle stores use. */
const ANCHOR_TIMEFRAME: Record<AnchorTf, Timeframe> = { M1: 'M1', H1: 'H1', D1: 'D1' };

/**
 * TradingView-style "type a number to open" interval dialog (Task 3). Typing
 * any digit 0-9 anywhere outside a text field opens the dialog with that
 * digit pre-filled; the user can keep typing (e.g. "90") and optional 'H'/'D'
 * suffixes, see the verbose readout, and apply. When the typed interval needs
 * an anchor (M1/H1/D1) that isn't loaded yet, a notice + "Descargar" button
 * lets the user fetch it from R2 before applying.
 *
 * Replaces the old always-visible toolbar number input (`controls.component`),
 * which only covered bare minutes and cluttered the toolbar.
 */
@Component({
  selector: 'app-interval-dialog',
  standalone: true,
  imports: [ModalComponent, ButtonDirective],
  templateUrl: './interval-dialog.component.html',
  styleUrl: './interval-dialog.component.css',
})
export class IntervalDialogComponent {
  private store = inject(Store);
  private manifestService = inject(ManifestService);
  private onboarding = inject(DataOnboardingService);
  private repo = inject(MarketDataRepository);

  private input = viewChild<ElementRef<HTMLInputElement>>('input');

  open = signal(false);
  raw = signal('');

  private series = this.store.selectSignal(selectSeries);
  private currentAsset = this.store.selectSignal(selectCurrentAsset);

  downloading = signal(false);
  progress = signal<OnboardingProgress | null>(null);
  downloadError = signal('');

  minutes = computed(() => parseInterval(this.raw()));

  verbose = computed(() => {
    const m = this.minutes();
    return m !== null ? formatIntervalVerbose(m) : '';
  });

  private loadedTfs = computed(() =>
    (Object.keys(this.series()) as Timeframe[]).filter((tf) => !!this.series()[tf]?.length),
  );

  /** The missing anchor (M1/H1/D1) the typed interval would need, or null when it's ready. */
  neededAnchor = computed<AnchorTf | null>(() => {
    const m = this.minutes();
    if (m === null) return null;
    return pickBaseSeriesTf(this.series(), m) === null ? anchorFor(m) : null;
  });

  canApply = computed(() => this.minutes() !== null && this.neededAnchor() === null);

  progressPct = computed(() => {
    const p = this.progress();
    if (!p || !p.total) return 0;
    return Math.min(100, Math.round((p.index / p.total) * 100));
  });

  formatIntervalShort = formatIntervalShort;

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    if (this.open()) return;
    const target = event.target as HTMLElement | null;
    if (target && this.isTextEntryTarget(target)) return;
    if (!/^[0-9]$/.test(event.key)) return;

    event.preventDefault();
    this.raw.set(event.key);
    this.downloadError.set('');
    this.open.set(true);
    queueMicrotask(() => this.input()?.nativeElement.focus());
  }

  private isTextEntryTarget(el: HTMLElement): boolean {
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || el.isContentEditable;
  }

  onInput(event: Event): void {
    this.raw.set((event.target as HTMLInputElement).value);
  }

  apply(): void {
    if (!this.canApply()) return;
    const min = this.minutes()!;
    const tf = loadedTfForMinutes(min, this.loadedTfs());
    if (tf) {
      this.store.dispatch(MarketActions.changeTimeframe({ tf }));
    } else {
      this.store.dispatch(MarketActions.changeCustomTimeframe({ minutes: min }));
    }
    this.close();
  }

  close(): void {
    this.open.set(false);
    this.downloading.set(false);
    this.progress.set(null);
    this.downloadError.set('');
  }

  async downloadAnchor(): Promise<void> {
    const anchor = this.neededAnchor();
    const symbol = this.currentAsset();
    if (!anchor || !symbol || this.downloading()) return;

    this.downloading.set(true);
    this.downloadError.set('');
    this.progress.set(null);

    try {
      const manifest = await this.manifestService.fetchManifest();
      const m1Years = this.manifestService.listM1Years(manifest, symbol);
      const jobs = buildAnchorDownloadJobs(anchor, symbol, m1Years);
      await this.onboarding.runJobs(manifest, jobs, (p) => this.progress.set(p));

      const anchorTf = ANCHOR_TIMEFRAME[anchor];
      const candles = await this.repo.getCandles(symbol, anchorTf);
      this.store.dispatch(
        MarketActions.csvLoaded({ tf: anchorTf, candles, fileName: `R2:${symbol}-${anchorTf}` }),
      );
      this.downloading.set(false);
      this.progress.set(null);
      this.apply();
    } catch (e) {
      this.downloadError.set((e as Error).message || 'La descarga falló. Inténtalo de nuevo.');
      this.downloading.set(false);
      this.progress.set(null);
    }
  }
}
