import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { BackendApiService, BackendSymbol, TfCoverage } from '../../services/backend-api.service';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { Candle, Timeframe, derivePointSize, symbolFromFileName } from '../../models';
import { PendingCsv, WorkspacesActions } from '../../state/workspaces/workspaces.actions';
import { emptyWorkspace } from '../../state/workspaces/workspaces.models';
import { ButtonDirective } from '../../components/ui/button.directive';
import { DatePickerComponent } from '../../components/ui/date-picker.component';
import { CsvLoaderService } from '../../services/csv-loader.service';
import {
  OfflineSymbol,
  ParsedTf,
  coverageFromParsed,
  DEFAULT_OFFLINE_CATEGORY,
} from '../../services/offline-catalog';
import { authFeature } from '../../state/auth/auth.reducer';
import { environment } from '../../../environments/environment';

type Step = 1 | 2 | 3;

/**
 * Below this many expected candles the freshly downloaded chunks are ALSO
 * kept in memory and handed to the workspace flow directly (csvLoaded);
 * above it (or when resuming) NgRx hydrates by reading the series back from
 * IndexedDB, so the download never holds two copies of a huge dataset.
 */
const STREAM_HYDRATE_THRESHOLD = 200_000;

/**
 * Three-step wizard ("Paso N de 3" per the UX guidelines): asset -> TFs +
 * start date (validated against the stored coverage) -> name + summary.
 * On confirm it downloads the FULL stored history per TF in chunks (with a
 * progress bar), loads it through the regular workspace flow and opens the
 * chart positioned at the chosen start date with the past scrollable behind.
 */
@Component({
  selector: 'app-crear-sesion-page',
  standalone: true,
  imports: [ButtonDirective, DatePickerComponent],
  templateUrl: './crear-sesion-page.component.html',
  styleUrl: './crear-sesion-page.component.css',
})
export class CrearSesionPageComponent {
  private api = inject(BackendApiService);
  private db = inject(WorkspaceDbService);
  private store = inject(Store);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private csvLoader = inject(CsvLoaderService);
  private status = this.store.selectSignal(authFeature.selectStatus);

  /** csv = create from uploaded files / catalog; backend = stored harvester. */
  source = signal<'backend' | 'csv'>(environment.offlineOnly ? 'csv' : 'backend');
  /** Forced CSV mode: static build or guest/offline session. */
  csvOnly = computed(
    () => environment.offlineOnly || this.status() === 'guest' || this.status() === 'offline',
  );
  catalog = signal<OfflineSymbol[]>([]);
  csvError = signal('');
  parsedFiles = signal<ParsedTf[]>([]);
  parsedSymbol = signal('');

  state = signal<'loading' | 'ok' | 'error'>('loading');
  symbols = signal<BackendSymbol[]>([]);

  step = signal<Step>(1);
  selected = signal<BackendSymbol | null>(null);
  selectedTfs = signal<Set<string>>(new Set());
  startDate = signal('');
  endDate = signal('');
  sessionName = signal('');

  downloading = signal(false);
  progress = signal<{ loaded: number; total: number; tf: string } | null>(null);
  downloadError = signal('');

  /** TFs offered: parsed CSV / catalog coverage in CSV mode, else the backend symbol. */
  coverage = computed<TfCoverage[]>(() =>
    this.source() === 'csv' && this.parsedFiles().length
      ? coverageFromParsed(this.parsedFiles())
      : (this.selected()?.cobertura ?? []),
  );

  /** Intersection of the selected TFs' ranges, for the date validation. */
  dateRange = computed(() => {
    const chosen = this.coverage().filter((c) => this.selectedTfs().has(c.tf));
    if (!chosen.length) return null;
    return {
      from: Math.max(...chosen.map((c) => c.desde)),
      to: Math.min(...chosen.map((c) => c.hasta)),
    };
  });

  startEpoch = computed(() => {
    const d = this.startDate();
    if (!d) return null;
    const t = Date.parse(`${d}T00:00:00Z`);
    return Number.isNaN(t) ? null : Math.floor(t / 1000);
  });

  dateValid = computed(() => {
    const range = this.dateRange();
    const t = this.startEpoch();
    if (!range || t === null) return false;
    return t >= range.from && t <= range.to;
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
    if (!range || start === null || end === null) return false;
    // lexicographic ISO-date compare allows ending ON the last covered day
    return end > start && this.endDate() <= this.isoDate(range.to);
  });

  step2Valid = computed(() => this.selectedTfs().size > 0 && this.dateValid() && this.endValid());

  progressPct = computed(() => {
    const p = this.progress();
    if (!p || !p.total) return 0;
    return Math.min(100, Math.round((p.loaded / p.total) * 100));
  });

  constructor() {
    const preselect = this.route.snapshot.queryParamMap.get('symbol');
    if (this.csvOnly()) {
      this.source.set('csv');
      this.loadCatalog(preselect);
      return;
    }
    this.api.symbols().subscribe({
      next: (r) => {
        // only symbols with data can start a session
        this.symbols.set(r.symbols.filter((s) => s.cobertura.length > 0));
        this.state.set('ok');
        if (preselect) {
          const match = this.symbols().find((s) => s.name === preselect);
          if (match) {
            this.pickSymbol(match);
            this.step.set(2);
          }
        }
      },
      error: () => this.state.set('error'),
    });
  }

  private async loadCatalog(preselect: string | null): Promise<void> {
    try {
      const list = await this.db.listSymbols();
      this.catalog.set(list);
      this.state.set('ok');
      if (preselect) {
        const match = list.find((s) => s.symbol === preselect);
        if (match) this.pickCatalogSymbol(match);
      }
    } catch {
      this.catalog.set([]);
      this.state.set('ok');
    }
  }

  pickSymbol(s: BackendSymbol): void {
    this.selected.set(s);
    // sensible defaults: every available TF, starting at the common range
    this.selectedTfs.set(new Set(s.cobertura.map((c) => c.tf)));
    this.defaultDate();
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
    if (this.step() === 1 && this.selected()) this.step.set(2);
    else if (this.step() === 2 && this.step2Valid()) this.step.set(3);
  }

  back(): void {
    if (this.downloading()) return;
    this.step.update((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  isoDate(epoch: number): string {
    return new Date(epoch * 1000).toISOString().slice(0, 10);
  }

  rangeLabel(c: TfCoverage): string {
    return `${this.isoDate(c.desde)} → ${this.isoDate(c.hasta)}`;
  }

  chosenTfs(): string[] {
    return this.coverage()
      .map((c) => c.tf)
      .filter((tf) => this.selectedTfs().has(tf));
  }

  /** Parses dropped/selected CSVs, enforces a single asset, prefills step 2. */
  async onCsvFiles(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.csvError.set('');
    const parsed: ParsedTf[] = [];
    let symbol = '';
    try {
      for (const file of Array.from(input.files)) {
        const text = await file.text();
        const { tf, candles, fileName } = this.csvLoader.parseText(text, file.name);
        const sym = symbolFromFileName(fileName);
        if (!symbol) symbol = sym;
        else if (sym !== symbol) {
          throw new Error(`Todos los archivos deben ser del mismo activo (${symbol} ≠ ${sym}).`);
        }
        parsed.push({ tf, candles });
      }
    } catch (e) {
      this.csvError.set((e as Error).message);
      this.parsedFiles.set([]);
      this.parsedSymbol.set('');
      input.value = '';
      return;
    }
    input.value = '';
    this.parsedFiles.set(parsed);
    this.parsedSymbol.set(symbol);
    // synthesize a BackendSymbol so the rest of the wizard works unchanged
    this.selected.set({
      name: symbol,
      descripcion: '',
      categoria: DEFAULT_OFFLINE_CATEGORY,
      digits: derivePointSize(parsed[0].candles),
      cobertura: coverageFromParsed(parsed),
    });
    this.selectedTfs.set(new Set(this.coverage().map((c) => c.tf)));
    this.defaultDate();
    this.step.set(2);
  }

  /** Step 1 (catalog path): reuse a previously uploaded symbol. */
  pickCatalogSymbol(s: OfflineSymbol): void {
    this.parsedFiles.set([]); // hydrate series from IndexedDB, not from memory
    this.parsedSymbol.set(s.symbol);
    this.selected.set({
      name: s.symbol,
      descripcion: s.descripcion,
      categoria: s.categoria,
      digits: s.digits ?? 0,
      cobertura: s.coverage,
    });
    this.selectedTfs.set(new Set(s.coverage.map((c) => c.tf)));
    this.defaultDate();
    this.step.set(2);
  }

  /**
   * CSV confirm: persist the catalog entry, then either hand the parsed candles
   * to the workspace flow (fresh upload) or let switchAsset hydrate them from
   * IndexedDB (existing catalog symbol).
   */
  async confirmCsv(): Promise<void> {
    const symbol = this.parsedSymbol();
    const start = this.startEpoch();
    if (!symbol || start === null) return;
    const tfs = this.chosenTfs() as Timeframe[];
    const parsed = this.parsedFiles();

    // build/merge the catalog entry from the chosen coverage
    const now = Date.now();
    const existing = await this.db.getSymbol(symbol).catch(() => undefined);
    // Catalog coverage must reflect only TFs actually stored: the selected upload
    // TFs (fresh upload) plus any TFs a previous upload of this symbol persisted.
    const uploadedCoverage =
      parsed.length > 0
        ? coverageFromParsed(parsed.filter((p) => tfs.includes(p.tf)))
        : (existing?.coverage ?? this.coverage());
    const byTf = new Map<string, TfCoverage>();
    for (const c of existing?.coverage ?? []) byTf.set(c.tf, c);
    for (const c of uploadedCoverage) byTf.set(c.tf, c);
    const coverage = [...byTf.values()];
    const entry: OfflineSymbol = {
      symbol,
      descripcion: existing?.descripcion ?? '',
      categoria: existing?.categoria ?? DEFAULT_OFFLINE_CATEGORY,
      digits: this.selected()?.digits || existing?.digits,
      coverage,
      createdAt: existing?.createdAt ?? now,
      lastModified: now,
    };
    await this.db.putSymbol(entry).catch(() => undefined);

    // fresh upload → hand candles directly; catalog pick → hydrate from DB
    const thenLoad =
      parsed.length > 0
        ? parsed
            .filter((p) => tfs.includes(p.tf))
            .map((p) => ({
              tf: p.tf,
              candles: p.candles,
              fileName: `${symbol.toLowerCase()}_${p.tf.toLowerCase()}.csv`,
            }))
        : undefined;

    this.store.dispatch(
      WorkspacesActions.switchAsset({
        symbol,
        selectedTfs: tfs,
        thenLoad,
        thenNewSession: { name: this.sessionName().trim() || null },
        thenGoTo: start,
        thenSessionEnd: this.endEpoch() ?? undefined,
      }),
    );
    await this.router.navigateByUrl('/');
  }

  /**
   * Streams every chunk straight into IndexedDB (so an interrupted download
   * resumes from the last persisted candle on the next run), then hands the
   * workspace flow either the small in-memory copy or lets it hydrate NgRx
   * by reading the stored series back.
   */
  async confirm(): Promise<void> {
    const sym = this.selected();
    const start = this.startEpoch();
    if (!sym || start === null || this.downloading()) return;
    this.downloading.set(true);
    this.downloadError.set('');

    const symbol = sym.name.toUpperCase();
    const tfs = this.chosenTfs();
    const total = this.coverage()
      .filter((c) => this.selectedTfs().has(c.tf))
      .reduce((sum, c) => sum + c.velas, 0);
    let done = 0;

    try {
      const pending: PendingCsv[] = [];
      let hydrateFromDb = false;
      for (const tf of tfs) {
        const timeframe = tf as Timeframe;
        this.progress.set({ loaded: done, total, tf });
        // resume: skip whatever a previous (interrupted) run already stored
        const stored = await this.db.getSeriesInfo(symbol, timeframe);
        const desde = stored ? stored.lastTime + 1 : undefined;
        done += stored?.count ?? 0;
        // small fresh datasets keep an in-memory copy for direct hydration
        const accumulate = !stored && total < STREAM_HYDRATE_THRESHOLD;
        const acc: Candle[] = [];
        await this.api.downloadChunked(sym.name, tf, desde, async (chunk) => {
          await this.db.appendSeriesChunk(symbol, timeframe, chunk);
          if (accumulate) acc.push(...chunk);
          done += chunk.length;
          this.progress.set({ loaded: done, total, tf });
        });
        if (accumulate) {
          pending.push({
            tf: timeframe,
            candles: acc,
            fileName: `${sym.name.toLowerCase()}_${tf.toLowerCase()}.csv`,
          });
        } else {
          hydrateFromDb = true;
        }
      }
      if (hydrateFromDb) {
        // make sure a meta record exists so switchAsset restores the stored
        // series (a brand-new symbol has series records but no meta yet)
        const meta = (await this.db.getMeta(symbol)) ?? this.newMeta(symbol);
        meta.files = { ...meta.files };
        for (const tf of tfs) meta.files[tf as Timeframe] = `harvester ${tf}`;
        meta.lastModified = Date.now();
        await this.db.putMeta(meta);
      }
      this.store.dispatch(
        WorkspacesActions.switchAsset({
          symbol,
          // scope the TF toolbar to exactly what this session selected
          selectedTfs: tfs as Timeframe[],
          // when hydrating from DB the restored workspace brings the series
          thenLoad: hydrateFromDb ? undefined : pending,
          thenNewSession: { name: this.sessionName().trim() || null },
          thenGoTo: start,
          thenSessionEnd: this.endEpoch() ?? undefined,
        }),
      );
      await this.router.navigateByUrl('/');
    } catch {
      this.downloadError.set(
        'La descarga falló. Lo ya descargado quedó guardado: vuelve a ejecutar el asistente y se reanudará solo.',
      );
      this.downloading.set(false);
      this.progress.set(null);
    }
  }

  private newMeta(symbol: string) {
    const ws = emptyWorkspace(symbol);
    return {
      symbol: ws.symbol,
      files: ws.files,
      activeTf: ws.activeTf,
      currentTime: ws.currentTime,
      drawings: ws.drawings,
      trading: ws.trading,
      sessions: ws.sessions,
      lastModified: ws.lastModified,
    };
  }
}
