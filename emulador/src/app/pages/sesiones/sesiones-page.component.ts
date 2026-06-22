import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, PercentPipe, NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { StorageManagerService } from '../storage-manager/storage-manager.service';
import {
  AnchorTf,
  missingDatasets,
  RequiredDataset,
  restorePlan,
  SessionFileV1,
  SessionService,
  snapshotFromState,
  yearsInRange,
} from '../../services/session.service';
import { SessionSyncService } from '../../services/session-sync.service';
import { fromPayload } from '../../services/session-sync.mapping';
import { SessionPayloadV1, SessionSummary } from '../../services/session-sync.models';
import { authFeature } from '../../state/auth/auth.reducer';
import type { DatasetRecord } from '../../services/market-data-db';
import { ReplayActions } from '../../state/replay/replay.actions';
import { TradingActions } from '../../state/trading/trading.actions';
import { WorkspacesActions } from '../../state/workspaces/workspaces.actions';
import { isSessionCsv, parseSessionCsv } from '../../state/trading/session-csv';
import { Candle, Timeframe, symbolFromFileName } from '../../models';
import { environment } from '../../../environments/environment';
import { MarketDataRepository } from '../../domain/market-data.repository';
import {
  DataOnboardingService,
  OnboardingJob,
} from '../../services/market-data/data-onboarding.service';
import { ManifestService } from '../../services/market-data/manifest.service';
import { PendingCsv } from '../../state/workspaces/workspaces.actions';
import { ClosedTrade, defaultTradingData, PendingOrder } from '../../state/trading/trading.models';
import { Drawing } from '../../state/drawings/drawings.models';
import {
  selectCurrentAsset,
  selectCurrentTime,
  selectDataRange,
  selectLoadedTfs,
  selectMsPerCandle,
  selectSavedSessions,
  selectTradingData,
} from '../../state/selectors';
import { marketFeature } from '../../state/market/market.reducer';
import { drawingsFeature } from '../../state/drawings/drawings.reducer';
import { SavedSession, SessionFolder, TradingData } from '../../state/trading/trading.models';
import { emptyWorkspace, WorkspaceMeta } from '../../state/workspaces/workspaces.models';
import { TrashIconComponent } from '../../components/icons/trash-icon.component';
import { DialogService } from '../../components/ui/dialog.service';
import { ButtonDirective } from '../../components/ui/button.directive';
import { BadgeDirective } from '../../components/ui/badge.directive';
import { MenuComponent } from '../../components/ui/menu.component';
import { EmptyStateComponent } from '../../components/ui/empty-state.component';
import { SegmentedControlComponent } from '../../components/ui/segmented-control.component';
import { MissingDatasetDialogComponent } from '../../components/missing-dataset-dialog/missing-dataset-dialog.component';

/** The only timeframes a session may reference (anchors). */
const ANCHOR_TFS: readonly AnchorTf[] = ['M1', 'H1', 'D1'];

type Density = 'card' | 'row';

/**
 * What runs after the missing-dataset modal's download completes. Both the
 * `.session.json` import and a cloud-only card's open route through the same
 * modal/`runJobs` plumbing — this discriminates what to do once the missing
 * datasets have landed locally.
 */
type PendingDownload =
  | { kind: 'jsonImport'; session: SessionFileV1 }
  | { kind: 'cloudOpen'; card: SessionCard; payload: SessionPayloadV1 };

/** One row in the folder navigator sidebar. */
interface SidebarItem {
  /** 'all' | '__none__' | folder id. */
  key: string;
  label: string;
  /** Drop target / move target (null for "Sin carpeta"; ignored for "all"). */
  folderId: string | null;
  count: number;
  /** Whether the row has rename/delete actions (real folders only). */
  removable: boolean;
}

/** One card on the sessions page: the active or an archived session. */
export interface SessionCard {
  /** Archived session id; null = the workspace's ACTIVE session. */
  id: string | null;
  symbol: string;
  name: string;
  trades: number;
  balance: number;
  initialBalance: number;
  /** Net realized P/L (balance - initialBalance). */
  pnl: number;
  /** ms epoch (archived: when archived; active: workspace lastModified). */
  createdAt: number;
  /** Replay cursor, UTC epoch seconds (0 = not positioned yet). */
  cursor: number;
  active: boolean;
  /** Folder the session belongs to (null = "Sin carpeta"). */
  folderId: string | null;
  /** Cumulative balance series (incl. initial) for the preview sparkline. */
  equity: number[];
  /** True for a cloud-only session not yet pulled into local storage. */
  cloudOnly?: boolean;
  /** True when this session's required datasets aren't all in the local cache. */
  needsDownload?: boolean;
}

interface SessionGroup {
  key: string;
  /** Folder (carpeta mode) or symbol (activo mode) heading. */
  label: string;
  /** Folder id for drop targets; null for symbol groups / "Sin carpeta". */
  folderId: string | null;
  cards: SessionCard[];
}

type GroupBy = 'carpeta' | 'activo';

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Cumulative balance after each closed trade (chronological), incl. initial. */
function equityCurve(t: TradingData): number[] {
  const sorted = [...t.history].sort((a, b) => a.closeTime - b.closeTime);
  const pts = [t.initialBalance];
  let bal = t.initialBalance;
  for (const trade of sorted) {
    bal += trade.profit;
    pts.push(bal);
  }
  return pts;
}

/**
 * Central hub for ALL backtesting sessions across ALL assets. Sessions can be
 * grouped by user-defined folders (cross-asset, by strategy) or by asset, with
 * drag-and-drop into folders, an equity preview per card and instant search.
 * Folders are local-only (IndexedDB), like the sessions themselves.
 */
@Component({
  selector: 'app-sesiones-page',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
    PercentPipe,
    NgTemplateOutlet,
    RouterLink,
    TrashIconComponent,
    ButtonDirective,
    BadgeDirective,
    MenuComponent,
    EmptyStateComponent,
    SegmentedControlComponent,
    MissingDatasetDialogComponent,
  ],
  templateUrl: './sesiones-page.component.html',
  styleUrl: './sesiones-page.component.css',
})
export class SesionesPageComponent {
  private store = inject(Store);
  private db = inject(WorkspaceDbService);
  private router = inject(Router);
  private dialogs = inject(DialogService);
  private sessionService = inject(SessionService);
  private storageManager = inject(StorageManagerService);
  private repo = inject(MarketDataRepository);
  private onboarding = inject(DataOnboardingService);
  private manifests = inject(ManifestService);
  private sync = inject(SessionSyncService);

  /** R2 deployment uses `.session.json` import; CSV keeps the legacy path. */
  isR2 = environment.dataSource === 'r2';

  private authStatus = this.store.selectSignal(authFeature.selectStatus);

  state = signal<'loading' | 'ok'>('loading');
  private metas = signal<WorkspaceMeta[]>([]);
  folders = signal<SessionFolder[]>([]);
  info = signal('');
  importInfo = signal('');
  importError = signal('');

  /** Lightweight cloud session list (Task 4/8), loaded when authenticated. */
  private cloudSummaries = signal<SessionSummary[]>([]);
  /** Local dataset cache snapshot, used to decide `needsDownload` for cloud cards. */
  private localDatasets = signal<DatasetRecord[]>([]);
  /** Cloud sync status for the header chip. */
  syncState = signal<'local' | 'syncing' | 'synced' | 'offline'>('local');

  groupBy = signal<GroupBy>('carpeta');
  search = signal('');
  /** Folder navigator selection: 'all' | '__none__' | folder id. */
  selectedKey = signal('all');
  /** Card grid vs. compact rows (Linear-style dense list). */
  density = signal<Density>('card');

  /** Drag-and-drop state for moving a session into a folder. */
  dragging = signal<SessionCard | null>(null);
  dragOverKey = signal<string | null>(null);

  private currentAsset = this.store.selectSignal(selectCurrentAsset);
  private currentTime = this.store.selectSignal(selectCurrentTime);
  private liveTrading = this.store.selectSignal(selectTradingData);
  private liveSessions = this.store.selectSignal(selectSavedSessions);

  // ---- .session.json export (active session's live state) ----
  private liveDataRange = this.store.selectSignal(selectDataRange);
  private liveActiveTf = this.store.selectSignal(marketFeature.selectActiveTf);
  private liveCustomTf = this.store.selectSignal(marketFeature.selectCustomTf);
  private livePlaybackSpeed = this.store.selectSignal(selectMsPerCandle);
  private liveDrawings = this.store.selectSignal(drawingsFeature.selectItems);
  private liveLoadedTfs = this.store.selectSignal(selectLoadedTfs);

  /** Flat list of every session as a card (live state wins for the open asset). */
  private allCards = computed<SessionCard[]>(() => {
    const current = this.currentAsset();
    const out: SessionCard[] = [];
    for (const meta of this.metas()) {
      const live = meta.symbol === current;
      const trading = live ? this.liveTrading() : meta.trading;
      const sessions = live ? this.liveSessions() : (meta.sessions ?? []);
      const cursor = live ? this.currentTime() : meta.currentTime;
      if (trading) {
        out.push({
          id: null,
          symbol: meta.symbol,
          name: trading.sessionName ?? 'Sesión en curso',
          trades: trading.history.length,
          balance: trading.balance,
          initialBalance: trading.initialBalance,
          pnl: trading.balance - trading.initialBalance,
          createdAt: meta.lastModified,
          cursor,
          active: true,
          folderId: trading.folderId ?? null,
          equity: equityCurve(trading),
        });
      }
      for (const s of sessions) {
        out.push({
          id: s.id,
          symbol: meta.symbol,
          name: s.name,
          trades: s.trading.history.length,
          balance: s.trading.balance,
          initialBalance: s.trading.initialBalance,
          pnl: s.trading.balance - s.trading.initialBalance,
          createdAt: s.createdAt,
          cursor: s.currentTime,
          active: false,
          folderId: s.trading.folderId ?? null,
          equity: equityCurve(s.trading),
        });
      }
    }
    return out;
  });

  /**
   * `allCards` plus one card per cloud summary whose id isn't already a local
   * card — local always wins (it has the full trading data). Cloud-only cards
   * carry only what the lightweight summary provides: sparkline (equity),
   * trade count and the "necesita descarga" flag from `needsDownload`.
   */
  private mergedCards = computed<SessionCard[]>(() => {
    const local = this.allCards();
    const localIds = new Set(local.map((c) => c.id).filter((id): id is string => id !== null));
    const localDatasets = this.localDatasets();
    const cloudOnly: SessionCard[] = this.cloudSummaries()
      .filter((s) => !localIds.has(s.id))
      .map((s) => ({
        id: s.id,
        symbol: s.symbol,
        name: s.name,
        trades: s.tradeCount,
        balance: s.balance,
        initialBalance: s.initialBalance,
        pnl: s.balance - s.initialBalance,
        createdAt: Date.parse(s.updatedAt),
        cursor: s.cursor,
        active: false,
        folderId: s.folderId,
        equity: s.sparkline ?? [],
        cloudOnly: true,
        needsDownload: missingDatasets(s.requiredDatasets, localDatasets).length > 0,
      }));
    return [...local, ...cloudOnly];
  });

  /** Search filter by session name or asset symbol (instant). */
  private searchedCards = computed<SessionCard[]>(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.mergedCards();
    return this.mergedCards().filter(
      (c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q),
    );
  });

  /** Known folder ids, to send orphaned sessions (deleted folder) to "Sin carpeta". */
  private folderIds = computed(() => new Set(this.folders().map((f) => f.id)));

  /** Normalized folder key of a card ('__none__' for loose/orphaned). */
  private cardKey(c: SessionCard): string {
    return c.folderId && this.folderIds().has(c.folderId) ? c.folderId : '__none__';
  }

  /** Cards after BOTH the search and the sidebar folder filter. */
  private filteredCards = computed<SessionCard[]>(() => {
    const key = this.selectedKey();
    const cards = this.searchedCards();
    if (key === 'all') return cards;
    return cards.filter((c) => this.cardKey(c) === key);
  });

  /** Flat, sorted list for the compact (row) density. */
  rows = computed<SessionCard[]>(() => this.sortCards(this.filteredCards()));

  /** Folder navigator: Todas / Sin carpeta / folders, each with a live count. */
  sidebar = computed<SidebarItem[]>(() => {
    const cards = this.searchedCards();
    let none = 0;
    const counts = new Map<string, number>();
    for (const c of cards) {
      const k = this.cardKey(c);
      if (k === '__none__') none++;
      else counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [
      { key: 'all', label: 'Todas', folderId: null, count: cards.length, removable: false },
      { key: '__none__', label: 'Sin carpeta', folderId: null, count: none, removable: false },
      ...this.folders().map((f) => ({
        key: f.id,
        label: f.name,
        folderId: f.id as string | null,
        count: counts.get(f.id) ?? 0,
        removable: true,
      })),
    ];
  });

  /** Groups for the current grouping dimension. */
  groups = computed<SessionGroup[]>(() => {
    const cards = this.filteredCards();
    if (this.groupBy() === 'activo') {
      const map = new Map<string, SessionCard[]>();
      for (const c of cards) (map.get(c.symbol) ?? map.set(c.symbol, []).get(c.symbol)!).push(c);
      return [...map.keys()].sort().map((symbol) => ({
        key: symbol,
        label: symbol,
        folderId: null,
        cards: this.sortCards(map.get(symbol)!),
      }));
    }
    // a specific sidebar folder is selected → one group, no cross-folder headers
    const sel = this.selectedKey();
    if (sel !== 'all') {
      const label = sel === '__none__' ? 'Sin carpeta' : this.folderName(sel);
      const folderId = sel === '__none__' ? null : sel;
      return [{ key: sel, label, folderId, cards: this.sortCards(cards) }];
    }
    // carpeta mode: a group per folder (ordered) + a "Sin carpeta" bucket
    const known = this.folderIds();
    const byFolder = new Map<string, SessionCard[]>();
    const loose: SessionCard[] = [];
    for (const c of cards) {
      if (c.folderId && known.has(c.folderId)) {
        (byFolder.get(c.folderId) ?? byFolder.set(c.folderId, []).get(c.folderId)!).push(c);
      } else {
        loose.push(c);
      }
    }
    const groups: SessionGroup[] = this.folders().map((f) => ({
      key: f.id,
      label: f.name,
      folderId: f.id,
      cards: this.sortCards(byFolder.get(f.id) ?? []),
    }));
    // "Sin carpeta" always shown last (it is also a drop target = unassign)
    groups.push({
      key: '__none__',
      label: 'Sin carpeta',
      folderId: null,
      cards: this.sortCards(loose),
    });
    return groups;
  });

  total = computed(() => this.mergedCards().length);

  private sortCards(cards: SessionCard[]): SessionCard[] {
    // active first, then most recently touched
    return [...cards].sort(
      (a, b) => Number(b.active) - Number(a.active) || b.createdAt - a.createdAt,
    );
  }

  constructor() {
    this.reload();
  }

  private async reload(): Promise<void> {
    try {
      const [metas, folders] = await Promise.all([this.db.listMetas(), this.db.listFolders()]);
      this.metas.set(metas);
      this.folders.set(folders);
    } catch {
      this.metas.set([]);
      this.folders.set([]);
    }

    try {
      this.localDatasets.set(await this.db.listDatasets());
    } catch {
      this.localDatasets.set([]);
    }

    if (this.authStatus() === 'authenticated') {
      this.syncState.set('syncing');
      try {
        this.cloudSummaries.set(await this.sync.listSummaries());
        this.syncState.set('synced');
      } catch {
        this.cloudSummaries.set([]);
        this.syncState.set('offline');
      }
    } else {
      this.cloudSummaries.set([]);
      this.syncState.set('local');
    }

    this.state.set('ok');
  }

  private async reloadFolders(): Promise<void> {
    try {
      this.folders.set(await this.db.listFolders());
    } catch {
      /* keep current */
    }
  }

  isCurrent(symbol: string): boolean {
    return symbol === this.currentAsset();
  }

  setGroupBy(by: GroupBy): void {
    this.groupBy.set(by);
  }

  setDensity(d: string): void {
    this.density.set(d as Density);
  }

  selectFolder(key: string): void {
    this.selectedKey.set(key);
  }

  /** Rename/delete from a sidebar row, looking up the real folder (keeps order). */
  renameFolderRow(item: SidebarItem): void {
    const f = this.folders().find((x) => x.id === item.key);
    if (f) void this.renameFolder(f);
  }
  deleteFolderRow(item: SidebarItem): void {
    const f = this.folders().find((x) => x.id === item.key);
    if (f) void this.deleteFolder(f);
  }

  /** Heading shown above the content area for the current sidebar selection. */
  selectionLabel = computed(() => {
    const key = this.selectedKey();
    if (key === 'all') return 'Todas las sesiones';
    if (key === '__none__') return 'Sin carpeta';
    return this.folderName(key);
  });

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  /** Return percentage of a card (net P/L over its initial balance). */
  returnPct(card: SessionCard): number {
    return card.initialBalance ? card.pnl / card.initialBalance : 0;
  }

  folderName(id: string | null): string {
    if (!id) return 'Sin carpeta';
    return this.folders().find((f) => f.id === id)?.name ?? 'Sin carpeta';
  }

  /** Equity sparkline as an SVG polyline `points` string in a WxH box. */
  sparkPoints(equity: number[], w = 96, h = 28): string {
    if (equity.length < 2) return '';
    const min = Math.min(...equity);
    const max = Math.max(...equity);
    const span = max - min || 1;
    const pad = 2;
    const stepX = (w - pad * 2) / (equity.length - 1);
    return equity
      .map((v, i) => {
        const x = pad + i * stepX;
        const y = pad + (h - pad * 2) * (1 - (v - min) / span);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  // ---- session CSV import ----

  /** Imports a session CSV exported from the summary into its workspace. */
  async onImportSession(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.importError.set('');
    this.importInfo.set('');
    for (const file of Array.from(input.files)) {
      try {
        const text = await file.text();
        if (!isSessionCsv(text)) {
          this.importError.set(`${file.name}: no parece un CSV de sesión del emulador.`);
          continue;
        }
        const trades = parseSessionCsv(text);
        if (!trades.length) {
          this.importError.set(`${file.name}: sin trades reconocibles.`);
          continue;
        }
        const symbol = symbolFromFileName(file.name);
        if (symbol === this.currentAsset()) {
          this.store.dispatch(
            TradingActions.sessionImported({ trades, currentCursor: this.currentTime() }),
          );
          const lastClose = trades.reduce((m, t) => Math.max(m, t.closeTime), 0);
          if (lastClose > 0) this.store.dispatch(ReplayActions.goToTime({ time: lastClose }));
        } else {
          this.store.dispatch(WorkspacesActions.switchAsset({ symbol, thenImport: { trades } }));
        }
        this.importInfo.set(`Sesión importada en ${symbol} (${trades.length} trades).`);
      } catch (e) {
        this.importError.set((e as Error).message);
      }
    }
    input.value = '';
  }

  // ---- .session.json import (R2: version gate + missing-dataset download + restore) ----

  /** What to do once the missing-dataset modal's download completes (open = modal open). */
  private pendingDownload = signal<PendingDownload | null>(null);
  /** Missing datasets to list in the modal (empty = modal closed). */
  missing = signal<RequiredDataset[]>([]);
  /** A dataset download is running. */
  downloading = signal(false);
  /** 0..100 download progress, or null before it starts. */
  downloadProgress = signal<number | null>(null);
  /** Error surfaced inside the missing-dataset modal. */
  downloadError = signal('');

  /**
   * Imports a `.session.json`: version-gates it, prompts to download any missing
   * datasets, then restores the full live session and opens the chart. Only the
   * R2 deployment uses this; `dataSource==='csv'` keeps {@link onImportSession}.
   */
  async onImportSessionJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.importError.set('');
    this.importInfo.set('');
    try {
      const text = await file.text();
      const result = this.sessionService.parse(text);
      if (result.status === 'future') {
        this.importError.set(
          `Actualiza el emulador para abrir esta sesión (versión ${result.version}).`,
        );
        return;
      }
      if (result.status === 'invalid') {
        this.importError.set(result.reason);
        return;
      }
      const session = result.session;
      const missing = await this.sessionService.findMissingDatasets(session);
      if (missing.length) {
        // open the missing-dataset modal; restore continues from confirmDownload()
        this.pendingDownload.set({ kind: 'jsonImport', session });
        this.downloadError.set('');
        this.downloadProgress.set(null);
        this.missing.set(missing);
        return;
      }
      await this.restoreSession(session);
    } catch (e) {
      this.importError.set((e as Error).message);
    }
  }

  /** Modal action: download the missing datasets from R2, then run the pending action. */
  async confirmDownload(): Promise<void> {
    const pending = this.pendingDownload();
    const missing = this.missing();
    if (!pending || !missing.length || this.downloading()) return;
    this.downloading.set(true);
    this.downloadError.set('');
    this.downloadProgress.set(0);
    try {
      const manifest = await this.manifests.fetchManifest();
      const jobs = missing.map((d) => this.jobForDataset(d));
      await this.onboarding.runJobs(manifest, jobs, (p) =>
        this.downloadProgress.set(Math.round((p.index / p.total) * 100)),
      );
      this.closeMissingModal();
      if (pending.kind === 'jsonImport') {
        await this.restoreSession(pending.session);
      } else {
        await this.materializeAndOpen(pending.card, pending.payload);
      }
    } catch (e) {
      this.downloadError.set(
        (e as Error).message || 'No se pudieron descargar los datasets de R2.',
      );
      this.downloading.set(false);
    }
  }

  /** Modal action: dismiss the missing-dataset prompt and abort the import/open. */
  cancelDownload(): void {
    if (this.downloading()) return;
    this.closeMissingModal();
  }

  private closeMissingModal(): void {
    this.missing.set([]);
    this.pendingDownload.set(null);
    this.downloading.set(false);
    this.downloadProgress.set(null);
    this.downloadError.set('');
  }

  /** One onboarding job per missing partition (m1 carries the year; h1/d1 use 'all'). */
  private jobForDataset(d: RequiredDataset): OnboardingJob {
    const tf = d.timeframe.toLowerCase() as OnboardingJob['tf'];
    return d.timeframe === 'M1'
      ? { symbol: d.symbol, tf, year: String(d.year) }
      : { symbol: d.symbol, tf, year: 'all' };
  }

  /**
   * Restores a fully-validated session: reads the required anchor candles from
   * the local cache, reconstructs the trading slice, and dispatches `switchAsset`
   * with the race-safe `thenRestore` payload, then opens the chart.
   */
  private async restoreSession(session: SessionFileV1): Promise<void> {
    const plan = restorePlan(session);
    // selectedTfs are anchors (M1/H1/D1) — a subset of Timeframe — so read each
    // anchor's stored candles and hand them to the workspace as PendingCsv.
    const pending: PendingCsv[] = [];
    for (const tf of plan.selectedTfs) {
      const timeframe = tf as Timeframe;
      const candles: Candle[] = await this.repo.getCandles(plan.symbol, timeframe);
      pending.push({
        tf: timeframe,
        candles,
        fileName: `${plan.symbol.toLowerCase()}_${tf.toLowerCase()}.csv`,
      });
    }

    // Reconstruct the persistable trading slice from the session. Balance follows
    // the realized convention used across the reducer: initialBalance + Σ profits.
    const history = plan.trades as ClosedTrade[];
    const initialBalance = session.context.initialBalance;
    const realized = history.reduce((sum, t) => sum + t.profit, 0);
    const lastClose = history.reduce((max, t) => Math.max(max, t.closeTime), 0);
    const trading = {
      ...defaultTradingData(initialBalance),
      initialBalance,
      balance: initialBalance + realized,
      orders: plan.pendingOrders as PendingOrder[],
      positions: [],
      history,
      lastProcessedTime: lastClose,
      // an imported session is a finished backtest snapshot
      sessionEnded: true,
      sessionName: `Importada · ${this.shortDate(plan.thenGoTo)}`,
    };

    this.store.dispatch(
      WorkspacesActions.switchAsset({
        symbol: plan.symbol,
        selectedTfs: plan.selectedTfs as Timeframe[],
        thenLoad: pending,
        thenGoTo: plan.thenGoTo,
        thenRestore: {
          trading,
          drawings: plan.drawings as Drawing[],
          intervalMinutes: plan.currentTimeframeMinutes,
          playbackSpeed: plan.playbackSpeed,
        },
      }),
    );
    this.importInfo.set(`Sesión importada en ${plan.symbol} (${history.length} trades).`);
    await this.router.navigateByUrl('/');
  }

  /** "dd/MM" of a unix-seconds timestamp (UTC), for the imported session name. */
  private shortDate(unixSeconds: number): string {
    if (unixSeconds <= 0) return '—';
    const d = new Date(unixSeconds * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`;
  }

  // ---- open / rename / delete (unchanged behavior) ----

  async open(card: SessionCard): Promise<void> {
    if (card.cloudOnly) {
      await this.openCloudOnlySession(card);
      return;
    }
    await this.dispatchOpen(card);
  }

  /** Dispatches the switchSession/switchAsset open for an already-local card and navigates. */
  private async dispatchOpen(card: SessionCard): Promise<void> {
    if (card.symbol === this.currentAsset()) {
      if (card.id !== null) {
        this.store.dispatch(
          TradingActions.switchSession({ id: card.id, currentCursor: this.currentTime() }),
        );
        if (card.cursor > 0) {
          this.store.dispatch(ReplayActions.goToTime({ time: card.cursor }));
        }
      }
    } else {
      this.store.dispatch(
        WorkspacesActions.switchAsset({
          symbol: card.symbol,
          thenOpenSession: card.id ?? undefined,
        }),
      );
    }
    void this.router.navigateByUrl('/');
  }

  /**
   * Opens a cloud-only card: fetches its payload, then — if its required
   * datasets aren't all cached locally — routes through the SAME
   * missing-dataset modal/`runJobs` download used by the `.session.json`
   * import (so candles still load from R2 before the chart opens). With no
   * missing datasets it materializes and opens immediately, as before.
   */
  private async openCloudOnlySession(card: SessionCard): Promise<void> {
    if (!card.id) return;
    try {
      const payload = await this.sync.fetchPayload(card.id);
      const missing = missingDatasets(payload.requiredDatasets, this.localDatasets());
      if (missing.length) {
        this.pendingDownload.set({ kind: 'cloudOpen', card, payload });
        this.downloadError.set('');
        this.downloadProgress.set(null);
        this.missing.set(missing);
        return;
      }
      await this.materializeAndOpen(card, payload);
    } catch (e) {
      this.importError.set((e as Error).message || 'No se pudo descargar la sesión desde la nube.');
    }
  }

  /**
   * Materializes a cloud-only card's payload as a local `SavedSession` on its
   * symbol's workspace meta, reloads so the rest of the app treats it like any
   * other local card, then runs the normal open dispatch + navigation.
   */
  private async materializeAndOpen(card: SessionCard, payload: SessionPayloadV1): Promise<void> {
    if (!card.id) return;
    const restored = fromPayload(payload);
    const session: SavedSession = {
      id: card.id,
      name: card.name,
      createdAt: card.createdAt,
      currentTime: restored.cursor,
      trading: restored.trading,
    };
    const meta = (await this.db.getMeta(card.symbol)) ?? emptyWorkspace(card.symbol);
    meta.sessions = [...(meta.sessions ?? []).filter((s) => s.id !== session.id), session];
    await this.db.putMeta(meta);
    await this.reload();
    await this.dispatchOpen({ ...card, cloudOnly: false, needsDownload: false });
  }

  async rename(card: SessionCard): Promise<void> {
    const name = await this.dialogs.prompt({
      title: 'Renombrar sesión',
      label: 'Nombre de la sesión',
      initialValue: card.name,
      confirmLabel: 'Renombrar',
      maxLength: 60,
    });
    if (!name || name === card.name) return;
    if (card.symbol === this.currentAsset()) {
      if (card.id === null) this.store.dispatch(TradingActions.setSessionName({ name }));
      else this.store.dispatch(TradingActions.renameSession({ id: card.id, name }));
    } else {
      const meta = await this.db.getMeta(card.symbol);
      if (!meta) return;
      if (card.id === null) {
        if (meta.trading) meta.trading = { ...meta.trading, sessionName: name };
      } else {
        meta.sessions = (meta.sessions ?? []).map((s) =>
          s.id === card.id ? { ...s, name, trading: { ...s.trading, sessionName: name } } : s,
        );
      }
      await this.db.putMeta(meta);
      await this.reload();
    }
    this.flash(`Sesión renombrada a "${name}".`);
  }

  async remove(card: SessionCard): Promise<void> {
    if (card.id === null) return;
    const confirmed = await this.dialogs.deleteSession({
      name: card.name,
      symbol: card.symbol,
      trades: card.trades,
      pnl: card.pnl,
      balance: card.balance,
      createdAt: card.createdAt,
      equity: card.equity,
    });
    if (!confirmed) return;
    if (card.symbol === this.currentAsset()) {
      this.store.dispatch(TradingActions.deleteSession({ id: card.id }));
    } else {
      const meta = await this.db.getMeta(card.symbol);
      if (!meta) return;
      meta.sessions = (meta.sessions ?? []).filter((s) => s.id !== card.id);
      await this.db.putMeta(meta);
      await this.reload();
    }
    this.flash(`Sesión "${card.name}" eliminada.`);
  }

  /**
   * Exports a card's session as a `.session.json`. The workspace's ACTIVE
   * session (the one open on the chart, `card.id === null` for the current
   * asset) is built from live state (same fields as the session-summary
   * export, with a real data range/years). Any other card — an archived
   * session, or the active session of an asset that is not on screen — is
   * built from its STORED `trading` + cursor: no candle data is kept for it,
   * so the data range defaults to empty. Anchor TFs/years are derived from the
   * SYMBOL's locally downloaded datasets (`StorageManagerService.listDatasets`)
   * rather than from `meta.selectedTfs`, so they stay consistent with each
   * other: `'M1'` is only claimed as an anchor when M1 datasets actually exist
   * for that symbol, and in that case `years` always has the years to match —
   * otherwise `buildRequiredDatasets` would silently drop the M1 ref.
   */
  async exportSession(card: SessionCard): Promise<void> {
    const isLiveActive = card.id === null && card.symbol === this.currentAsset();
    const filename = `${card.symbol.toLowerCase()}-${card.name}.session.json`;

    if (isLiveActive) {
      const range = this.liveDataRange();
      const snapshot = snapshotFromState({
        symbol: card.symbol,
        initialBalance: card.initialBalance,
        startRangeSec: range?.from ?? 0,
        endRangeSec: range?.to ?? 0,
        replayTimeSec: this.currentTime(),
        activeTf: this.liveActiveTf(),
        customTfMinutes: this.liveCustomTf(),
        playbackSpeed: this.livePlaybackSpeed(),
        trades: this.liveTrading().history,
        pendingOrders: this.liveTrading().orders,
        drawings: this.liveDrawings(),
        notes: [],
        anchorTimeframes: this.liveLoadedTfs().filter((tf): tf is AnchorTf =>
          ANCHOR_TFS.includes(tf as AnchorTf),
        ),
        years: yearsInRange(range?.from ?? 0, range?.to ?? 0),
      });
      this.sessionService.exportSession(snapshot, filename);
      return;
    }

    // Archived session (or another asset's active one): stored data only.
    const meta = await this.db.getMeta(card.symbol);
    const session = card.id !== null ? meta?.sessions?.find((s) => s.id === card.id) : undefined;
    const trading: TradingData | undefined = card.id !== null ? session?.trading : meta?.trading;
    if (!trading) return;
    const cursor = card.id !== null ? (session?.currentTime ?? 0) : (meta?.currentTime ?? 0);

    // Derive anchorTimeframes + years from the symbol's locally downloaded
    // datasets (not `meta.selectedTfs`) so the two always stay consistent:
    // 'M1' is only claimed when M1 datasets exist, and years always covers
    // them — otherwise buildRequiredDatasets would silently emit no M1 ref.
    const symbolDatasets = (await this.storageManager.listDatasets()).filter(
      (d) => d.symbol === card.symbol,
    );
    const anchorTimeframes = ANCHOR_TFS.filter((tf) =>
      symbolDatasets.some((d) => d.timeframe === tf),
    );
    const years = [
      ...new Set(symbolDatasets.filter((d) => d.timeframe === 'M1').map((d) => Number(d.year))),
    ].sort((a, b) => a - b);

    const snapshot = snapshotFromState({
      symbol: card.symbol,
      initialBalance: trading.initialBalance,
      startRangeSec: 0,
      endRangeSec: 0,
      replayTimeSec: cursor,
      activeTf: null,
      customTfMinutes: null,
      playbackSpeed: 1,
      trades: trading.history,
      pendingOrders: trading.orders,
      drawings: [],
      notes: [],
      anchorTimeframes,
      years,
    });
    this.sessionService.exportSession(snapshot, filename);
  }

  // ---- folders CRUD ----

  async createFolder(): Promise<void> {
    const name = await this.dialogs.prompt({
      title: 'Nueva carpeta',
      label: 'Nombre de la carpeta',
      placeholder: 'p. ej. Swing US30',
      confirmLabel: 'Crear',
      maxLength: 40,
    });
    if (!name) return;
    const order = (this.folders().at(-1)?.order ?? -1) + 1;
    await this.db.putFolder({ id: newId(), name, order });
    await this.reloadFolders();
    this.flash(`Carpeta "${name}" creada.`);
  }

  async renameFolder(folder: SessionFolder): Promise<void> {
    const name = await this.dialogs.prompt({
      title: 'Renombrar carpeta',
      label: 'Nombre de la carpeta',
      initialValue: folder.name,
      confirmLabel: 'Renombrar',
      maxLength: 40,
    });
    if (!name || name === folder.name) return;
    await this.db.putFolder({ ...folder, name });
    await this.reloadFolders();
    this.flash(`Carpeta renombrada a "${name}".`);
  }

  async deleteFolder(folder: SessionFolder): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: 'Eliminar carpeta',
      message: `¿Eliminar la carpeta "${folder.name}"? Sus sesiones pasan a "Sin carpeta" (no se borran).`,
      confirmLabel: 'Eliminar carpeta',
      danger: true,
    });
    if (!confirmed) return;
    await this.db.deleteFolder(folder.id);
    await this.reloadFolders();
    this.flash(`Carpeta "${folder.name}" eliminada.`);
  }

  /** Moves a session into a folder (folderId null = unassign). */
  async moveToFolder(card: SessionCard, folderId: string | null): Promise<void> {
    if (card.folderId === folderId) return;
    if (card.symbol === this.currentAsset()) {
      this.store.dispatch(TradingActions.setSessionFolder({ id: card.id, folderId }));
    } else {
      const meta = await this.db.getMeta(card.symbol);
      if (!meta) return;
      if (card.id === null) {
        if (meta.trading) meta.trading = { ...meta.trading, folderId };
      } else {
        meta.sessions = (meta.sessions ?? []).map((s) =>
          s.id === card.id ? { ...s, trading: { ...s.trading, folderId } } : s,
        );
      }
      await this.db.putMeta(meta);
      await this.reload();
    }
    this.flash(folderId ? `Movida a "${this.folderName(folderId)}".` : 'Movida a "Sin carpeta".');
  }

  // ---- drag & drop ----

  onDragStart(card: SessionCard, event: DragEvent): void {
    this.dragging.set(card);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.id ?? 'active');
    }
  }

  onDragEnd(): void {
    this.dragging.set(null);
    this.dragOverKey.set(null);
  }

  onGroupDragOver(group: SessionGroup, event: DragEvent): void {
    if (!this.dragging() || this.groupBy() !== 'carpeta') return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverKey.set(group.key);
  }

  onGroupDragLeave(group: SessionGroup): void {
    if (this.dragOverKey() === group.key) this.dragOverKey.set(null);
  }

  onGroupDrop(group: SessionGroup, event: DragEvent): void {
    event.preventDefault();
    const card = this.dragging();
    this.dragOverKey.set(null);
    this.dragging.set(null);
    if (card) void this.moveToFolder(card, group.folderId);
  }

  // ---- sidebar folder rows as always-visible drop targets ----

  onSidebarDragOver(item: SidebarItem, event: DragEvent): void {
    if (!this.dragging() || item.key === 'all') return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dragOverKey.set(`side:${item.key}`);
  }

  onSidebarDragLeave(item: SidebarItem): void {
    if (this.dragOverKey() === `side:${item.key}`) this.dragOverKey.set(null);
  }

  onSidebarDrop(item: SidebarItem, event: DragEvent): void {
    event.preventDefault();
    const card = this.dragging();
    this.dragOverKey.set(null);
    this.dragging.set(null);
    if (card && item.key !== 'all') void this.moveToFolder(card, item.folderId);
  }

  private flash(message: string): void {
    this.info.set(message);
    setTimeout(() => this.info.set(''), 4000);
  }
}
