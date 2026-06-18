import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Timeframe } from '../../models';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { PendingCsv, WorkspacesActions } from '../../state/workspaces/workspaces.actions';
import { ButtonDirective } from '../ui/button.directive';
import { BadgeDirective } from '../ui/badge.directive';
import { EmptyStateComponent } from '../ui/empty-state.component';
import { ManifestService, Manifest } from '../../services/market-data/manifest.service';
import {
  DataOnboardingService,
  OnboardingJob,
  OnboardingProgress,
} from '../../services/market-data/data-onboarding.service';

type Step = 1 | 2 | 3;
type State = 'loading' | 'ok' | 'error';

/** Maps a manifest tf key to the uppercase Timeframe the candle stores use. */
const TF_MAP: Record<'m1' | 'h1' | 'd1', Timeframe> = { m1: 'M1', h1: 'H1', d1: 'D1' };

/**
 * First-launch onboarding for the R2/Parquet data source (Task 6).
 *
 * Thin by design: it fetches the manifest, lets the user pick a symbol and m1
 * years (h1/d1 implied), then delegates the download → worker ingest → record
 * flow to the tested {@link DataOnboardingService}. On completion it reuses the
 * EXISTING session-start path (`switchAsset`) from `crear-sesion`: candles are
 * read back from the `candles` store via the {@link MarketDataRepository} and
 * handed in as `thenLoad`, so the chart opens exactly as the CSV flow does.
 *
 * Reached only when `environment.dataSource === 'r2'` (route `/data-wizard`);
 * the CSV onboarding is untouched.
 */
@Component({
  selector: 'app-data-wizard',
  standalone: true,
  imports: [ButtonDirective, BadgeDirective, EmptyStateComponent],
  templateUrl: './data-wizard.component.html',
  styleUrl: './data-wizard.component.css',
})
export class DataWizardComponent {
  private manifestService = inject(ManifestService);
  private onboarding = inject(DataOnboardingService);
  private repo = inject(MarketDataRepository);
  private store = inject(Store);
  private router = inject(Router);

  state = signal<State>('loading');
  errorMsg = signal('');
  step = signal<Step>(1);

  manifest = signal<Manifest | null>(null);
  symbols = signal<string[]>([]);
  selectedSymbol = signal<string | null>(null);

  /** m1 year partitions available for the chosen symbol. */
  years = computed(() => {
    const m = this.manifest();
    const s = this.selectedSymbol();
    return m && s ? this.manifestService.listM1Years(m, s) : [];
  });

  /** User-selected m1 years (h1/d1 are always included when present). */
  selectedYears = signal<Set<string>>(new Set());

  hasH1 = computed(() => {
    const m = this.manifest();
    const s = this.selectedSymbol();
    return !!m && !!s && this.manifestService.hasTf(m, s, 'h1');
  });
  hasD1 = computed(() => {
    const m = this.manifest();
    const s = this.selectedSymbol();
    return !!m && !!s && this.manifestService.hasTf(m, s, 'd1');
  });

  /** Step 2 needs at least one partition selected (m1 year, or h1/d1 present). */
  step2Valid = computed(
    () => this.selectedYears().size > 0 || this.hasH1() || this.hasD1(),
  );

  downloading = signal(false);
  progress = signal<OnboardingProgress | null>(null);
  downloadError = signal('');

  progressPct = computed(() => {
    const p = this.progress();
    if (!p || !p.total) return 0;
    return Math.min(100, Math.round((p.index / p.total) * 100));
  });

  /** Comma-joined, sorted m1 years for the step-3 summary (or an em dash). */
  selectedYearsLabel = computed(() => {
    const years = [...this.selectedYears()].sort();
    return years.length ? years.join(', ') : '—';
  });

  constructor() {
    void this.loadManifest();
  }

  async loadManifest(): Promise<void> {
    this.state.set('loading');
    try {
      const manifest = await this.manifestService.fetchManifest();
      this.manifest.set(manifest);
      this.symbols.set(this.manifestService.listSymbols(manifest));
      this.state.set('ok');
    } catch (e) {
      this.errorMsg.set((e as Error).message);
      this.state.set('error');
    }
  }

  pickSymbol(symbol: string): void {
    this.selectedSymbol.set(symbol);
    // default: every available m1 year selected
    this.selectedYears.set(new Set(this.years()));
    this.step.set(2);
  }

  toggleYear(year: string): void {
    const set = new Set(this.selectedYears());
    if (set.has(year)) set.delete(year);
    else set.add(year);
    this.selectedYears.set(set);
  }

  next(): void {
    if (this.step() === 2 && this.step2Valid()) this.step.set(3);
  }

  back(): void {
    if (this.downloading()) return;
    this.step.update((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  /** The (tf, partition) jobs the current selection implies. */
  private buildJobs(): OnboardingJob[] {
    const symbol = this.selectedSymbol();
    if (!symbol) return [];
    const jobs: OnboardingJob[] = [];
    for (const year of [...this.selectedYears()].sort()) {
      jobs.push({ symbol, tf: 'm1', year });
    }
    if (this.hasH1()) jobs.push({ symbol, tf: 'h1', year: 'all' });
    if (this.hasD1()) jobs.push({ symbol, tf: 'd1', year: 'all' });
    return jobs;
  }

  /** The Timeframes this session will load (used to scope the TF toolbar). */
  private selectedTimeframes(): Timeframe[] {
    const tfs: Timeframe[] = [];
    if (this.selectedYears().size > 0) tfs.push(TF_MAP.m1);
    if (this.hasH1()) tfs.push(TF_MAP.h1);
    if (this.hasD1()) tfs.push(TF_MAP.d1);
    return tfs;
  }

  /**
   * Runs the orchestrator, then reads the freshly-ingested candles back and
   * starts a session via the existing `switchAsset` path.
   */
  async confirm(): Promise<void> {
    const manifest = this.manifest();
    const symbol = this.selectedSymbol();
    if (!manifest || !symbol || this.downloading()) return;
    this.downloading.set(true);
    this.downloadError.set('');
    this.progress.set(null);

    try {
      const jobs = this.buildJobs();
      await this.onboarding.runJobs(manifest, jobs, (p) => this.progress.set(p));

      // read the ingested candles back and hand them to the regular session flow
      const tfs = this.selectedTimeframes();
      const pending: PendingCsv[] = [];
      for (const tf of tfs) {
        const candles = await this.repo.getCandles(symbol, tf);
        if (candles.length) {
          pending.push({ tf, candles, fileName: `${symbol.toLowerCase()}_${tf.toLowerCase()}` });
        }
      }
      if (!pending.length) {
        throw new Error('No se ingirieron velas: revisa el manifiesto y vuelve a intentar.');
      }
      // open ~70% into the loaded range, with the past scrollable behind
      const first = pending[0].candles;
      const goTo = first[Math.floor(first.length * 0.7)]?.time ?? first[0].time;

      this.store.dispatch(
        WorkspacesActions.switchAsset({
          symbol,
          selectedTfs: tfs,
          thenLoad: pending,
          thenNewSession: { name: null },
          thenGoTo: goTo,
        }),
      );
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.downloadError.set(
        (e as Error).message ||
          'La descarga falló. Vuelve a ejecutar el asistente para reintentar.',
      );
      this.downloading.set(false);
      this.progress.set(null);
    }
  }
}
