import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Timeframe } from '../../models';
import { PendingCsv, WorkspacesActions } from '../../state/workspaces/workspaces.actions';
import { ButtonDirective } from '../../components/ui/button.directive';
import { DatePickerComponent } from '../../components/ui/date-picker.component';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { StorageManagerService } from '../storage-manager/storage-manager.service';
import { intersectBounds, isEndValid, isStartValid } from './r2-coverage.logic';

type Step = 1 | 2 | 3;

/** Anchors the R2 pipeline ingests/serves — M1/H1/D1 only (see Task 3-6 specs). */
const R2_ANCHORS: Timeframe[] = ['M1', 'H1', 'D1'];

/** One pickable card in the R2 step 1 list: a downloaded asset + its anchors. */
interface R2Asset {
  symbol: string;
  tfs: Timeframe[];
}

/**
 * Three-step wizard ("Paso N de 3" per the UX guidelines): asset -> TFs +
 * start date (validated against the stored coverage) -> name + summary. The
 * wizard re-sources from already-downloaded R2 datasets: step 1 lists the
 * assets discovered locally, step 2 reads each anchor's cheap coverage
 * bounds to validate the date range, and confirm reads the full candle
 * series and opens the chart positioned at the chosen start date with the
 * past scrollable behind.
 */
@Component({
  selector: 'app-crear-sesion-page',
  standalone: true,
  imports: [ButtonDirective, DatePickerComponent],
  templateUrl: './crear-sesion-page.component.html',
  styleUrl: './crear-sesion-page.component.css',
})
export class CrearSesionPageComponent {
  private store = inject(Store);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private repo = inject(MarketDataRepository);
  private storageManager = inject(StorageManagerService);

  state = signal<'loading' | 'ok'>('loading');

  step = signal<Step>(1);
  selectedTfs = signal<Set<string>>(new Set());
  startDate = signal('');
  endDate = signal('');
  sessionName = signal('');

  // ---- R2 branch state ----
  /** Step 1: downloaded assets (unique symbols from `listDatasets`). */
  r2Assets = signal<R2Asset[]>([]);
  /** The picked R2 asset's symbol, or null before step 1 is done. */
  r2Symbol = signal<string | null>(null);
  /** Downloaded anchors for the picked symbol (M1/H1/D1 subset), in order. */
  r2Tfs = signal<Timeframe[]>([]);
  /** R2: cheap per-anchor coverage bounds (seconds), read on pick via getCoverage. */
  boundsByTf = signal<Partial<Record<Timeframe, { from: number; to: number }>>>({});
  r2Loading = signal(false);
  r2Error = signal('');

  /** Intersection of the selected anchors' cheap coverage bounds (seconds). */
  dateRange = computed(() =>
    intersectBounds(this.boundsByTf(), [...this.selectedTfs()] as Timeframe[]),
  );

  startEpoch = computed(() => {
    const d = this.startDate();
    if (!d) return null;
    const t = Date.parse(`${d}T00:00:00Z`);
    return Number.isNaN(t) ? null : Math.floor(t / 1000);
  });

  dateValid = computed(() => {
    const range = this.dateRange();
    const t = this.startEpoch();
    if (t === null) return false;
    return isStartValid(range, t);
  });

  /** Optional scheduled end, parsed at END of day (the whole day plays). */
  endEpoch = computed(() => {
    const d = this.endDate();
    if (!d) return null;
    const t = Date.parse(`${d}T23:59:59Z`);
    return Number.isNaN(t) ? null : Math.floor(t / 1000);
  });

  /** Empty = valid (no scheduled end); otherwise > start and inside range. */
  endValid = computed(() => {
    if (!this.endDate()) return true;
    const range = this.dateRange();
    const start = this.startEpoch();
    const end = this.endEpoch();
    if (start === null || end === null) return false;
    return isEndValid(range, start, end);
  });

  step2Valid = computed(() => this.selectedTfs().size > 0 && this.dateValid() && this.endValid());

  constructor() {
    const preselect = this.route.snapshot.queryParamMap.get('symbol');
    void this.loadR2Assets(preselect);
  }

  /** R2 step 1: discover downloaded assets (unique symbol + its anchors). */
  private async loadR2Assets(preselect: string | null): Promise<void> {
    try {
      const datasets = await this.storageManager.listDatasets();
      const bySymbol = new Map<string, Set<Timeframe>>();
      for (const d of datasets) {
        const tf = d.timeframe as Timeframe;
        if (!R2_ANCHORS.includes(tf)) continue; // anchors only: M1/H1/D1
        if (!bySymbol.has(d.symbol)) bySymbol.set(d.symbol, new Set());
        bySymbol.get(d.symbol)!.add(tf);
      }
      const assets: R2Asset[] = [...bySymbol.entries()]
        .map(([symbol, tfs]) => ({
          symbol,
          tfs: R2_ANCHORS.filter((tf) => tfs.has(tf)),
        }))
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
      this.r2Assets.set(assets);
      this.state.set('ok');
      if (preselect) {
        const match = assets.find((a) => a.symbol === preselect);
        if (match) await this.pickR2Asset(match);
      }
    } catch (e) {
      this.r2Error.set((e as Error).message || 'No se pudieron leer los activos descargados.');
      this.state.set('ok'); // render the (empty) step with the error, not a hard error screen
      this.r2Assets.set([]);
    }
  }

  /** R2 step 1 -> 2: read each downloaded anchor's cheap coverage (first/last). */
  async pickR2Asset(asset: R2Asset): Promise<void> {
    this.r2Loading.set(true);
    this.r2Error.set('');
    try {
      const entries = await Promise.all(
        asset.tfs.map(async (tf) => [tf, await this.repo.getCoverage(asset.symbol, tf)] as const),
      );
      const bounds: Partial<Record<Timeframe, { from: number; to: number }>> = {};
      for (const [tf, b] of entries) if (b) bounds[tf] = b;
      this.boundsByTf.set(bounds);
      this.r2Symbol.set(asset.symbol);
      this.r2Tfs.set(asset.tfs);
      this.selectedTfs.set(new Set(asset.tfs));
      this.defaultDate();
      this.step.set(2);
    } catch (e) {
      this.r2Error.set((e as Error).message || 'No se pudieron leer las velas descargadas.');
    }
    this.r2Loading.set(false);
  }

  /**
   * R2 confirm: the heavy full-candle load is DEFERRED to this step (the
   * click only read cheap coverage bounds). Reads each selected anchor's
   * full series via `getCandles` here, behind the `r2Loading` flag, then
   * dispatches `switchAsset` BEFORE navigating, avoiding the known restore
   * race.
   */
  async confirmR2(): Promise<void> {
    const symbol = this.r2Symbol();
    const start = this.startEpoch();
    if (!symbol || start === null || this.r2Loading()) return;
    const tfs = [...this.selectedTfs()] as Timeframe[];
    this.r2Loading.set(true);
    this.r2Error.set('');
    try {
      const pending: PendingCsv[] = [];
      for (const tf of tfs) {
        const candles = await this.repo.getCandles(symbol, tf);
        pending.push({
          tf,
          candles,
          fileName: `${symbol.toLowerCase()}_${tf.toLowerCase()}.csv`,
        });
      }
      this.store.dispatch(
        WorkspacesActions.switchAsset({
          symbol,
          selectedTfs: tfs,
          thenLoad: pending,
          thenNewSession: { name: this.sessionName().trim() || null },
          thenGoTo: start,
          thenSessionEnd: this.endEpoch() ?? undefined,
        }),
      );
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.r2Error.set((e as Error).message || 'No se pudieron cargar las velas.');
      this.r2Loading.set(false);
    }
  }

  toggleTf(tf: string): void {
    const set = new Set(this.selectedTfs());
    if (set.has(tf)) set.delete(tf);
    else set.add(tf);
    this.selectedTfs.set(set);
    if (!this.dateValid()) this.defaultDate();
  }

  /** Suggests a start ~70% into the common range (past behind, future ahead). */
  private defaultDate(): void {
    const range = this.dateRange();
    if (!range) {
      this.startDate.set('');
      return;
    }
    const t = range.from + (range.to - range.from) * 0.7;
    this.startDate.set(new Date(t * 1000).toISOString().slice(0, 10));
  }

  onDate(event: Event): void {
    this.startDate.set((event.target as HTMLInputElement).value);
  }

  onEndDate(event: Event): void {
    this.endDate.set((event.target as HTMLInputElement).value);
  }

  onName(event: Event): void {
    this.sessionName.set((event.target as HTMLInputElement).value);
  }

  next(): void {
    if (this.step() === 1 && this.r2Symbol()) this.step.set(2);
    else if (this.step() === 2 && this.step2Valid()) this.step.set(3);
  }

  back(): void {
    this.step.update((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  isoDate(epoch: number): string {
    return new Date(epoch * 1000).toISOString().slice(0, 10);
  }
}
