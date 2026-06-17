import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { BackendApiService, BackendSymbol, TfCoverage } from '../../services/backend-api.service';
import { UserSymbolsActions } from '../../state/user-symbols/user-symbols.actions';
import { userSymbolsFeature } from '../../state/user-symbols/user-symbols.reducer';
import { authFeature } from '../../state/auth/auth.reducer';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { OfflineSymbol, DEFAULT_OFFLINE_CATEGORY } from '../../services/offline-catalog';
import { DialogService } from '../../components/ui/dialog.service';
import { ButtonDirective } from '../../components/ui/button.directive';
import { BadgeDirective } from '../../components/ui/badge.directive';
import { TooltipDirective } from '../../components/ui/tooltip.directive';
import { SegmentedControlComponent } from '../../components/ui/segmented-control.component';
import { EmptyStateComponent } from '../../components/ui/empty-state.component';
import { MenuComponent } from '../../components/ui/menu.component';
import { environment } from '../../../environments/environment';

/** Per-symbol coverage rollup shown in the card summary line. */
export interface CoverageSummary {
  tfCount: number;
  desde: number;
  hasta: number;
  totalVelas: number;
}

type MarketMode = 'todos' | 'mis';

/**
 * Market catalog served by the backend DB: symbols grouped by category with
 * their stored data coverage per timeframe. The user can curate their own
 * subset ("Mis activos") with a per-card checkbox; the selection is stored
 * server-side and auto-saved on each toggle.
 *
 * In offline/guest mode, symbols are loaded from IndexedDB (the uploaded CSV
 * catalog) instead of the backend. Curation controls are hidden and a delete
 * action is available per symbol.
 */
@Component({
  selector: 'app-mercados-page',
  standalone: true,
  imports: [
    RouterLink,
    ButtonDirective,
    BadgeDirective,
    TooltipDirective,
    SegmentedControlComponent,
    EmptyStateComponent,
    MenuComponent,
  ],
  templateUrl: './mercados-page.component.html',
  styleUrl: './mercados-page.component.css',
})
export class MercadosPageComponent {
  private api = inject(BackendApiService);
  private store = inject(Store);
  private db = inject(WorkspaceDbService);
  private dialog = inject(DialogService);

  private statusSig = this.store.selectSignal(authFeature.selectStatus);

  /** True when running in static/offline build or authenticated as guest. */
  offline = computed(
    () => environment.offlineOnly || this.statusSig() === 'guest' || this.statusSig() === 'offline',
  );

  state = signal<'loading' | 'ok' | 'error'>('loading');
  symbols = signal<BackendSymbol[]>([]);
  query = signal('');
  /** 'todos' = full catalog · 'mis' = only the user's curated selection. */
  mode = signal<MarketMode>('todos');

  /** The user's curated selection (sorted symbol names). */
  selected = this.store.selectSignal(userSymbolsFeature.selectSymbols);
  private selectedSet = computed(() => new Set(this.selected()));

  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const set = this.selectedSet();
    const mine = this.mode() === 'mis';
    return this.symbols().filter((s) => {
      if (mine && !set.has(s.name)) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.descripcion.toLowerCase().includes(q);
    });
  });

  /** Symbols grouped by `categoria` (Forex, Metales, Índices…). */
  groups = computed(() => {
    const map = new Map<string, BackendSymbol[]>();
    for (const s of this.filtered()) {
      const list = map.get(s.categoria) ?? [];
      list.push(s);
      map.set(s.categoria, list);
    }
    return [...map.entries()].map(([category, items]) => ({ category, items }));
  });

  constructor() {
    this.load();
    if (!this.offline()) this.store.dispatch(UserSymbolsActions.load());
  }

  load(): void {
    this.state.set('loading');
    if (this.offline()) {
      this.db
        .listSymbols()
        .then((list) => {
          this.symbols.set(list.map((s) => this.toBackendSymbol(s)));
          this.state.set('ok');
        })
        .catch(() => {
          this.symbols.set([]);
          this.state.set('ok');
        });
      return;
    }
    this.api.symbols().subscribe({
      next: (r) => {
        this.symbols.set(r.symbols);
        this.state.set('ok');
      },
      error: () => this.state.set('error'),
    });
  }

  /** Maps a catalog entry to the BackendSymbol shape the template renders. */
  private toBackendSymbol(s: OfflineSymbol): BackendSymbol {
    return {
      name: s.symbol,
      descripcion: s.descripcion,
      categoria: s.categoria || DEFAULT_OFFLINE_CATEGORY,
      digits: s.digits ?? 0,
      cobertura: s.coverage,
    };
  }

  /** Offline: delete a symbol everywhere (catalog + meta + series). */
  async remove(name: string): Promise<void> {
    const ok = await this.dialog.confirm({
      title: 'Eliminar activo',
      message: `Se borrarán los datos y sesiones de ${name} de este navegador. ¿Continuar?`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    await this.db.removeSymbol(name).catch(() => undefined);
    this.load();
  }

  setMode(mode: MarketMode): void {
    this.mode.set(mode);
  }

  isSelected(name: string): boolean {
    return this.selectedSet().has(name);
  }

  /** Optimistic add/remove; the slice persists it (replace-all PUT). */
  toggleSelected(name: string): void {
    this.store.dispatch(UserSymbolsActions.toggle({ symbol: name }));
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  /**
   * Roll up a symbol's per-TF coverage into one summary line: how many TFs,
   * the overall date envelope (earliest start → latest end) and total candles.
   * The per-TF date ranges are near-identical (same harvest window), so the
   * envelope is representative; exact per-TF detail lives in the chips/expander.
   */
  coverageSummary(cobertura: TfCoverage[]): CoverageSummary {
    return {
      tfCount: cobertura.length,
      desde: Math.min(...cobertura.map((c) => c.desde)),
      hasta: Math.max(...cobertura.map((c) => c.hasta)),
      totalVelas: cobertura.reduce((sum, c) => sum + c.velas, 0),
    };
  }

  /** "M1 · 12 ene 2024 – 14 jun 2026 · 1.2M velas" for a chip's tooltip. */
  tfTooltip(c: TfCoverage): string {
    return `${c.tf} · ${this.rangeLabel(c.desde, c.hasta)} · ${this.compactCount(c.velas)} velas`;
  }

  /** "12 ene 2024 – 10 jun 2026" from the epoch-seconds coverage range. */
  rangeLabel(desde: number, hasta: number): string {
    const fmt = (t: number) =>
      new Date(t * 1000).toLocaleDateString('es', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
    return `${fmt(desde)} – ${fmt(hasta)}`;
  }

  compactCount(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
    return `${n}`;
  }
}
