import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, PercentPipe, NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { SessionRevision, WorkspaceDbService } from '../../services/workspace-db.service';
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
import {
  SessionPayloadV1,
  SessionPayloadV2,
  SessionPayloadV3,
  SessionSummary,
} from '../../services/session-sync.models';
import { authFeature } from '../../state/auth/auth.reducer';
import type { DatasetRecord } from '../../services/market-data-db';
import { ReplayActions } from '../../state/replay/replay.actions';
import { TradingActions } from '../../state/trading/trading.actions';
import { WorkspacesActions } from '../../state/workspaces/workspaces.actions';
import { loadAnchorCandles } from '../../state/workspaces/load-anchor-candles';
import { Timeframe } from '../../models';
import { MarketDataRepository } from '../../domain/market-data.repository';
import {
  DataOnboardingService,
  OnboardingJob,
} from '../../services/market-data/data-onboarding.service';
import { ManifestService } from '../../services/market-data/manifest.service';
import { ClosedTrade, defaultTradingData, PendingOrder } from '../../state/trading/trading.models';
import { Drawing } from '../../state/drawings/drawings.models';
import {
  selectAllDrawings,
  selectCurrentAsset,
  selectCurrentTime,
  selectDataRange,
  selectLoadedTfs,
  selectMsPerCandle,
  selectResolutionMinutes,
  selectSavedSessions,
  selectTradingData,
  selectWorkspaceMetaSnapshot,
} from '../../state/selectors';
import { marketFeature } from '../../state/market/market.reducer';
import { MarketActions } from '../../state/market/market.actions';
import { tradingFeature } from '../../state/trading/trading.reducer';
import { SavedSession, SessionFolder, TradingData } from '../../state/trading/trading.models';
import { WorkspaceMeta } from '../../state/workspaces/workspaces.models';
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
  | {
      kind: 'cloudOpen';
      card: SessionCard;
      payload: SessionPayloadV1 | SessionPayloadV2 | SessionPayloadV3;
      expectedOwnerId: string;
      expectedMeta: WorkspaceMeta | undefined;
      expectedLiveAggregate: string | null;
    };

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
  /**
   * The cloud row id this card maps to: the archived session's id, or — for the
   * ACTIVE card (whose `id` is null) — the workspace's `activeSessionId`. Used to
   * de-duplicate a local card against its own cloud summary.
   */
  syncId?: string | null;
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
  clientUpdatedAt?: number;
  syncedAt?: number;
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

// Folder/session ids become Supabase row ids (uuid columns), so they MUST be
// valid UUIDs or the push is rejected with Postgres 22P02 (invalid uuid syntax).
function newId(): string {
  return crypto.randomUUID();
}

/** Sparse step between reassigned folder `order` values (room to insert later without a full re-sort). */
const FOLDER_ORDER_STEP = 1000;

function nextClientClock(now: number, clientUpdatedAt?: number, syncedAt?: number): number {
  return Math.max(now, (clientUpdatedAt ?? 0) + 1, (syncedAt ?? 0) + 1);
}

/**
 * Pure reorder helper for the folder sidebar's drag-drop. Given the current
 * folder order and a drag of `draggedId` onto `targetId`, returns a NEW array
 * (input untouched) with the dragged folder moved just before `targetId`
 * (dropping a folder onto itself is a no-op) and every folder's `order`
 * reassigned with a sparse step (1000, 2000, 3000…) so the persisted order
 * matches the new visual order. Only folders whose `order` actually changed
 * get `clientUpdatedAt` bumped to `now`, so unaffected folders stay clean
 * (not re-pushed to the cloud on every drag).
 */
export function reorderFolders(
  folders: readonly SessionFolder[],
  draggedId: string,
  targetId: string,
  now: number,
): SessionFolder[] {
  if (draggedId === targetId) return [...folders];
  const dragged = folders.find((f) => f.id === draggedId);
  if (!dragged) return [...folders];
  const targetIndex = folders.findIndex((f) => f.id === targetId);
  if (targetIndex === -1) return [...folders];

  const without = folders.filter((f) => f.id !== draggedId);
  const insertAt = without.findIndex((f) => f.id === targetId);
  const reordered = [...without.slice(0, insertAt), dragged, ...without.slice(insertAt)];

  return reordered.map((f, i) => {
    const order = (i + 1) * FOLDER_ORDER_STEP;
    if (order === f.order) return f;
    return { ...f, order, clientUpdatedAt: nextClientClock(now, f.clientUpdatedAt, f.syncedAt) };
  });
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

  /** Drag-and-drop state for REORDERING folders (distinct from `dragging`, which moves a session). */
  draggingFolder = signal<string | null>(null);
  folderDragOverId = signal<string | null>(null);

  private currentAsset = this.store.selectSignal(selectCurrentAsset);
  private currentTime = this.store.selectSignal(selectCurrentTime);
  private liveTrading = this.store.selectSignal(selectTradingData);
  private liveSessions = this.store.selectSignal(selectSavedSessions);
  /** The current asset's active-session cloud id (Fix #2 state field), to de-dup its cloud card. */
  private liveActiveSessionId = this.store.selectSignal(tradingFeature.selectActiveSessionId);

  // ---- .session.json export (active session's live state) ----
  private liveDataRange = this.store.selectSignal(selectDataRange);
  private liveActiveTf = this.store.selectSignal(marketFeature.selectActiveTf);
  private liveCustomTf = this.store.selectSignal(marketFeature.selectCustomTf);
  private livePlaybackSpeed = this.store.selectSignal(selectMsPerCandle);
  private liveReplayResolution = this.store.selectSignal(selectResolutionMinutes);
  private liveDrawings = this.store.selectSignal(selectAllDrawings);
  private liveLoadedTfs = this.store.selectSignal(selectLoadedTfs);
  private liveWorkspaceAggregate = this.store.selectSignal(selectWorkspaceMetaSnapshot);

  private serializeLiveAggregate(): string {
    return JSON.stringify({
      workspace: this.liveWorkspaceAggregate(),
      activeSessionId: this.liveActiveSessionId(),
      trading: this.liveTrading(),
      currentTime: this.currentTime(),
      customTfMinutes: this.liveCustomTf(),
      playbackSpeed: this.livePlaybackSpeed(),
      replayResolution: this.liveReplayResolution(),
    });
  }

  private liveAggregateStillMatches(symbol: string, expected: string | null): boolean {
    if (symbol !== this.currentAsset()) return expected === null;
    return expected !== null && this.serializeLiveAggregate() === expected;
  }

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
          syncId: live ? this.liveActiveSessionId() : (meta.activeSessionId ?? null),
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
          clientUpdatedAt: meta.activeClientUpdatedAt,
          syncedAt: meta.activeSyncedAt,
        });
      }
      for (const s of sessions) {
        out.push({
          id: s.id,
          syncId: s.id,
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
          clientUpdatedAt: s.clientUpdatedAt,
          syncedAt: s.syncedAt,
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
    // De-dup by the cloud row id each local card maps to (`syncId`): an archived
    // card's id, or the ACTIVE card's `activeSessionId` (its `id` is null). This
    // hides a cloud summary that is just the cloud copy of a local session —
    // otherwise the active session shows twice (local card + its cloud row).
    const localIds = new Set(local.map((c) => c.syncId).filter((id): id is string => id != null));
    const localDatasets = this.localDatasets();
    const cloudOnly: SessionCard[] = this.cloudSummaries()
      .filter((s) => !localIds.has(s.id))
      .map((s) => ({
        id: s.id,
        syncId: s.id,
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

  private sessionRevision(card: SessionCard): SessionRevision | null {
    const id = card.id ?? card.syncId;
    if (!id) return null;
    return {
      kind: card.id === null ? 'active' : 'archived',
      id,
      clientUpdatedAt: card.clientUpdatedAt,
      syncedAt: card.syncedAt,
    };
  }

  private currentRevisionStillMatches(revision: SessionRevision): boolean {
    if (revision.kind === 'active') return this.liveActiveSessionId() === revision.id;
    const saved = this.liveSessions().find((session) => session.id === revision.id);
    return (
      saved?.clientUpdatedAt === revision.clientUpdatedAt && saved?.syncedAt === revision.syncedAt
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

  /**
   * The id `/journal/:id` and `/journal/:id/reflect` navigate with (RFC-016
   * §3). `card.syncId` already covers every case uniformly: an archived
   * card's `syncId` mirrors its own `id`; the ACTIVE card's `id` is null but
   * `syncId` carries `activeSessionId`; a cloud-only card's `syncId` mirrors
   * its cloud row id. Falls back to `card.id` defensively (never both null
   * in practice — `activeSessionId` is minted on every `switchAsset`/
   * `newSession` transition) so the link never renders `null` in the URL.
   */
  journalId(card: SessionCard): string {
    return card.syncId ?? card.id ?? '';
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
   * datasets, then restores the full live session and opens the chart.
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
      // NOTE: runJobs no-ops if another batch is already in flight (service guard); a resolved promise here does not guarantee THIS caller's datasets finished. Follow-up: re-check missing() after this resolves.
      await this.onboarding.runJobs(manifest, jobs, (p) =>
        this.downloadProgress.set(Math.round((p.index / p.total) * 100)),
      );
      this.closeMissingModal();
      if (pending.kind === 'jsonImport') {
        await this.restoreSession(pending.session);
      } else {
        await this.materializeAndOpen(
          pending.card,
          pending.payload,
          pending.expectedOwnerId,
          pending.expectedMeta,
          pending.expectedLiveAggregate,
        );
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
    const pending = await loadAnchorCandles(
      this.repo,
      plan.symbol,
      plan.selectedTfs as Timeframe[],
    );

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
          replayResolution: plan.replayResolutionMinutes,
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
      // NEW LOGIC: Fetch target workspace meta to get selectedTfs
      const meta = this.metas().find((m) => m.symbol === card.symbol);
      const tfs = (
        meta?.selectedTfs?.length ? meta.selectedTfs : ['M1', 'H1', 'D1']
      ) as Timeframe[];

      try {
        const pending = await loadAnchorCandles(this.repo, card.symbol, tfs);

        this.store.dispatch(
          WorkspacesActions.switchAsset({
            symbol: card.symbol,
            selectedTfs: tfs,
            thenLoad: pending,
            thenOpenSession: card.id ?? undefined,
          }),
        );
      } catch (e) {
        this.importError.set(
          (e as Error).message || 'Error leyendo los datos locales de IndexedDB.',
        );
        return;
      }
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
      const expectedLiveAggregate =
        card.symbol === this.currentAsset() ? this.serializeLiveAggregate() : null;
      const expectedOwnerId = await this.sync.captureOwner();
      const expectedMeta = await this.db.getMeta(card.symbol);
      await this.sync.assertExpectedOwner(expectedOwnerId);
      const payload = await this.sync.fetchPayload(card.id);
      const missing = missingDatasets(payload.requiredDatasets, this.localDatasets());
      if (missing.length) {
        this.pendingDownload.set({
          kind: 'cloudOpen',
          card,
          payload,
          expectedOwnerId,
          expectedMeta,
          expectedLiveAggregate,
        });
        this.downloadError.set('');
        this.downloadProgress.set(null);
        this.missing.set(missing);
        return;
      }
      await this.materializeAndOpen(
        card,
        payload,
        expectedOwnerId,
        expectedMeta,
        expectedLiveAggregate,
      );
    } catch (e) {
      this.importError.set((e as Error).message || 'No se pudo descargar la sesión desde la nube.');
    }
  }

  /**
   * Materializes a cloud-only card's payload as a local `SavedSession` on its
   * symbol's workspace meta, reloads so the rest of the app treats it like any
   * other local card, then runs the normal open dispatch + navigation.
   */
  private async materializeAndOpen(
    card: SessionCard,
    payload: SessionPayloadV1 | SessionPayloadV2 | SessionPayloadV3,
    expectedOwnerId: string,
    expectedMeta: WorkspaceMeta | undefined,
    expectedLiveAggregate: string | null,
  ): Promise<void> {
    if (!card.id) return;
    const restored = fromPayload(payload, card.symbol);
    // `card.createdAt` for a cloud-only card is `Date.parse(summary.updatedAt)` —
    // the cloud version's edit time. Stamping both fields with it marks the
    // materialized local copy as "synced as of the cloud version" (not dirty).
    const session: SavedSession = {
      id: card.id,
      name: card.name,
      createdAt: card.createdAt,
      currentTime: restored.cursor,
      customTfMinutes: restored.customTfMinutes,
      playbackSpeed: restored.playbackSpeed,
      replayResolution: restored.replayResolution,
      trading: restored.trading,
      clientUpdatedAt: card.createdAt,
      syncedAt: card.createdAt,
    };
    await this.sync.assertExpectedOwner(expectedOwnerId);
    if (!this.liveAggregateStillMatches(card.symbol, expectedLiveAggregate)) return;
    const committed = await this.db.promoteSessionIfUnchanged(card.symbol, expectedMeta, {
      session,
      activeTf: restored.activeTf,
      selectedTfs: restored.selectedTfs,
      drawings: restored.drawings.items,
      layout: restored.layout,
      panels: restored.panels,
      linkGroups: restored.linkGroups,
      archivedAt: Date.now(),
    });
    if (!committed) return;
    await this.sync.assertExpectedOwner(expectedOwnerId);
    if (!this.liveAggregateStillMatches(card.symbol, expectedLiveAggregate)) {
      await this.compensatePromotion(
        card,
        expectedOwnerId,
        expectedMeta,
        expectedLiveAggregate,
        session,
      );
      return;
    }
    if (card.symbol === this.currentAsset()) {
      const workspace = await this.db.getWorkspace(card.symbol);
      await this.sync.assertExpectedOwner(expectedOwnerId);
      if (
        card.symbol !== this.currentAsset() ||
        (expectedMeta?.activeSessionId ?? null) !== (this.liveActiveSessionId() ?? null) ||
        !this.liveAggregateStillMatches(card.symbol, expectedLiveAggregate)
      ) {
        await this.compensatePromotion(
          card,
          expectedOwnerId,
          expectedMeta,
          expectedLiveAggregate,
          session,
        );
        return;
      }
      if (
        !workspace ||
        workspace.activeSessionId !== session.id ||
        workspace.activeClientUpdatedAt !== session.clientUpdatedAt ||
        workspace.activeSyncedAt !== session.syncedAt
      ) {
        return;
      }
      this.store.dispatch(WorkspacesActions.workspaceRestored({ workspace }));
      if (restored.customTfMinutes != null) {
        this.store.dispatch(
          MarketActions.changeCustomTimeframe({ minutes: restored.customTfMinutes }),
        );
      }
      this.store.dispatch(ReplayActions.changeSpeed({ msPerCandle: restored.playbackSpeed }));
      this.store.dispatch(
        ReplayActions.setReplayResolution({ minutes: restored.replayResolution }),
      );
      await this.reload();
      await this.sync.assertExpectedOwner(expectedOwnerId);
      await this.router.navigateByUrl('/');
      return;
    }
    await this.reload();
    await this.sync.assertExpectedOwner(expectedOwnerId);
    await this.dispatchOpen({ ...card, id: null, cloudOnly: false, needsDownload: false });
  }

  private async compensatePromotion(
    card: SessionCard,
    expectedOwnerId: string,
    expectedMeta: WorkspaceMeta | undefined,
    expectedLiveAggregate: string | null,
    promoted: SavedSession,
  ): Promise<void> {
    await this.sync.assertExpectedOwner(expectedOwnerId);
    const activeSessionId = this.liveActiveSessionId();
    if (
      expectedLiveAggregate === null ||
      this.liveAggregateStillMatches(card.symbol, expectedLiveAggregate) ||
      card.symbol !== this.currentAsset() ||
      !expectedMeta?.activeSessionId ||
      activeSessionId !== expectedMeta.activeSessionId
    ) {
      return;
    }
    const now = Date.now();
    const live = this.liveWorkspaceAggregate();
    const trading = this.liveTrading();
    await this.db.compensatePromotionIfUnchanged(card.symbol, expectedOwnerId, promoted, {
      session: {
        id: activeSessionId,
        name: trading.sessionName ?? 'Sesión en curso',
        createdAt: now,
        currentTime: this.currentTime(),
        customTfMinutes: this.liveCustomTf(),
        playbackSpeed: this.livePlaybackSpeed(),
        replayResolution: this.liveReplayResolution(),
        trading,
        clientUpdatedAt: nextClientClock(
          now,
          expectedMeta.activeClientUpdatedAt,
          expectedMeta.activeSyncedAt,
        ),
        syncedAt: expectedMeta.activeSyncedAt,
      },
      activeTf: live.activeTf,
      selectedTfs: live.selectedTfs,
      drawings: live.drawings,
      layout: live.layout,
      panels: live.panels,
      linkGroups: Object.values(live.linkGroups),
      archivedAt: now,
    });
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
    const revision = this.sessionRevision(card);
    if (!revision) return;
    const clientUpdatedAt = nextClientClock(
      Date.now(),
      revision.clientUpdatedAt,
      revision.syncedAt,
    );
    const changed = await this.db.replaceSessionIfUnchanged(card.symbol, revision, (meta) => {
      if (revision.kind === 'active') {
        return {
          ...meta,
          trading: { ...meta.trading!, sessionName: name },
          activeClientUpdatedAt: clientUpdatedAt,
        };
      }
      return {
        ...meta,
        sessions: (meta.sessions ?? []).map((session) =>
          session.id === revision.id
            ? {
                ...session,
                name,
                trading: { ...session.trading, sessionName: name },
                clientUpdatedAt,
              }
            : session,
        ),
      };
    });
    if (!changed) return;
    if (card.symbol === this.currentAsset()) {
      if (!this.currentRevisionStillMatches(revision)) return;
      this.store.dispatch(
        revision.kind === 'active'
          ? TradingActions.setSessionName({ name })
          : TradingActions.renameSession({ id: revision.id, name, clientUpdatedAt }),
      );
    } else {
      await this.reload();
      await this.syncDirty();
    }
    this.flash(`Sesión renombrada a "${name}".`);
  }

  /**
   * Archives the ACTIVE session: moves it into the saved list (keeping its cloud
   * id) and starts a fresh empty session. For the current asset that's the
   * reducer's `newSession`; for an off-screen asset we replicate it on the meta.
   */
  async archive(card: SessionCard): Promise<void> {
    if (!card.active) return;
    const revision = this.sessionRevision(card);
    if (!revision || revision.kind !== 'active') return;
    const current = card.symbol === this.currentAsset();
    if (current && !this.currentRevisionStillMatches(revision)) return;
    const expectedLiveAggregate = current ? this.serializeLiveAggregate() : null;
    const intendedTrading = current ? this.liveTrading() : undefined;
    const intendedCurrentTime = current ? this.currentTime() : undefined;
    const intendedCustomTfMinutes = current ? this.liveCustomTf() : undefined;
    const intendedPlaybackSpeed = current ? this.livePlaybackSpeed() : undefined;
    const intendedReplayResolution = current ? this.liveReplayResolution() : undefined;
    const replacementActiveSessionId = newId();
    let archivedClientUpdatedAt = revision.clientUpdatedAt;
    let archivedSession: SavedSession | undefined;
    const changed = await this.db.replaceSessionIfUnchanged(card.symbol, revision, (meta) => {
      if (current && !this.currentRevisionStillMatches(revision)) return undefined;
      const trading = intendedTrading ?? meta.trading;
      if (!trading) return undefined;
      const currentTime = intendedCurrentTime ?? meta.currentTime;
      const payloadChanged =
        current &&
        JSON.stringify({
          trading,
          currentTime,
          customTfMinutes: intendedCustomTfMinutes,
          playbackSpeed: intendedPlaybackSpeed,
          replayResolution: intendedReplayResolution,
        }) !==
          JSON.stringify({
            trading: meta.trading,
            currentTime: meta.currentTime,
            customTfMinutes: meta.customTfMinutes,
            playbackSpeed: meta.playbackSpeed,
            replayResolution: meta.replayResolution,
          });
      archivedClientUpdatedAt = payloadChanged
        ? nextClientClock(Date.now(), revision.clientUpdatedAt, revision.syncedAt)
        : revision.clientUpdatedAt;
      const real =
        trading.orders.length > 0 || trading.positions.length > 0 || trading.history.length > 0;
      archivedSession =
        real || trading.sessionName !== null
          ? {
              id: revision.id,
              name: trading.sessionName ?? `Sesión ${(meta.sessions ?? []).length + 1}`,
              createdAt: Date.now(),
              currentTime,
              customTfMinutes: current ? intendedCustomTfMinutes : meta.customTfMinutes,
              playbackSpeed: current ? intendedPlaybackSpeed : meta.playbackSpeed,
              replayResolution: current ? intendedReplayResolution : meta.replayResolution,
              trading: { ...trading },
              clientUpdatedAt: archivedClientUpdatedAt,
              syncedAt: revision.syncedAt,
            }
          : undefined;
      return {
        ...meta,
        sessions:
          archivedSession === undefined
            ? meta.sessions
            : [...(meta.sessions ?? []), archivedSession],
        trading: defaultTradingData(trading.initialBalance),
        activeSessionId: replacementActiveSessionId,
        activeClientUpdatedAt: undefined,
        activeSyncedAt: undefined,
      };
    });
    if (!changed) return;
    if (current) {
      if (!this.currentRevisionStillMatches(revision)) return;
      if (!this.liveAggregateStillMatches(card.symbol, expectedLiveAggregate)) {
        const expectedReconciledLiveAggregate = this.serializeLiveAggregate();
        const trading = this.liveTrading();
        const real =
          trading.orders.length > 0 || trading.positions.length > 0 || trading.history.length > 0;
        if (real || trading.sessionName !== null) {
          const now = Date.now();
          const reconciled: SavedSession = {
            id: revision.id,
            name:
              trading.sessionName ??
              archivedSession?.name ??
              `Sesión ${(this.liveSessions() ?? []).length + 1}`,
            createdAt: archivedSession?.createdAt ?? now,
            currentTime: this.currentTime(),
            customTfMinutes: this.liveCustomTf(),
            playbackSpeed: this.livePlaybackSpeed(),
            replayResolution: this.liveReplayResolution(),
            trading,
            clientUpdatedAt: nextClientClock(
              now,
              archivedSession?.clientUpdatedAt ?? revision.clientUpdatedAt,
              revision.syncedAt,
            ),
            syncedAt: revision.syncedAt,
          };
          const reconciledCommit = await this.db.reconcileArchivedSessionIfUnchanged(
            card.symbol,
            replacementActiveSessionId,
            archivedSession,
            reconciled,
          );
          if (!reconciledCommit) return;
          if (card.symbol !== this.currentAsset() || !this.currentRevisionStillMatches(revision)) {
            return;
          }
          archivedSession = reconciled;
          archivedClientUpdatedAt = reconciled.clientUpdatedAt;
          if (!this.liveAggregateStillMatches(card.symbol, expectedReconciledLiveAggregate)) {
            const latestTrading = this.liveTrading();
            const latestWorkspace = this.liveWorkspaceAggregate();
            const restoreTime = Date.now();
            const restoredSession: SavedSession = {
              id: revision.id,
              name:
                latestTrading.sessionName ??
                reconciled.name ??
                `Sesión ${(this.liveSessions() ?? []).length + 1}`,
              createdAt: reconciled.createdAt,
              currentTime: this.currentTime(),
              customTfMinutes: this.liveCustomTf(),
              playbackSpeed: this.livePlaybackSpeed(),
              replayResolution: this.liveReplayResolution(),
              trading: latestTrading,
              clientUpdatedAt: nextClientClock(
                restoreTime,
                reconciled.clientUpdatedAt,
                reconciled.syncedAt,
              ),
              syncedAt: reconciled.syncedAt,
            };
            await this.db.restoreArchivedSessionAsActiveIfUnchanged(
              card.symbol,
              replacementActiveSessionId,
              reconciled,
              {
                session: restoredSession,
                activeTf: latestWorkspace.activeTf,
                selectedTfs: latestWorkspace.selectedTfs,
                drawings: latestWorkspace.drawings,
                layout: latestWorkspace.layout,
                panels: latestWorkspace.panels,
                linkGroups: Object.values(latestWorkspace.linkGroups),
                archivedAt: restoreTime,
              },
            );
            return;
          }
        }
      }
      this.store.dispatch(
        TradingActions.newSession({
          currentCursor: archivedSession ? archivedSession.currentTime : intendedCurrentTime!,
          replacementActiveSessionId,
          archivedClientUpdatedAt,
          archivedSyncedAt: revision.syncedAt,
          customTfMinutes: archivedSession
            ? archivedSession.customTfMinutes
            : intendedCustomTfMinutes,
          playbackSpeed: archivedSession ? archivedSession.playbackSpeed : intendedPlaybackSpeed,
          replayResolution: archivedSession
            ? archivedSession.replayResolution
            : intendedReplayResolution,
          archivedSession,
        }),
      );
    } else {
      await this.reload();
    }
    this.flash('Sesión archivada.');
  }

  async remove(card: SessionCard): Promise<void> {
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
    const revision = this.sessionRevision(card);
    if (!revision) return;
    const enqueuePendingDelete =
      this.authStatus() === 'authenticated' &&
      (revision.kind === 'archived' || revision.syncedAt != null);
    const deleted = await this.db.deleteSessionIfUnchanged(
      card.symbol,
      revision,
      enqueuePendingDelete,
    );
    if (!deleted) return;
    if (card.symbol === this.currentAsset()) {
      if (revision.kind === 'active') {
        this.store.dispatch(
          TradingActions.deleteActiveSessionCommitted({
            deletedId: deleted.deletedId,
            replacementActiveSessionId: deleted.replacementActiveSessionId!,
          }),
        );
      } else {
        if (!this.currentRevisionStillMatches(revision)) return;
        this.store.dispatch(TradingActions.deleteSession({ id: revision.id }));
      }
    } else {
      await this.reload();
    }
    if (enqueuePendingDelete) {
      try {
        await this.sync.flushPendingDeletes();
      } catch {
        // Local delete and its pending record already committed atomically.
      }
    }
    this.flash(
      revision.kind === 'active'
        ? 'Sesión en curso eliminada.'
        : `Sesión "${card.name}" eliminada.`,
    );
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
        replayResolutionMinutes: this.liveReplayResolution(),
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
      replayResolutionMinutes: null,
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
    await this.db.putFolder({ id: newId(), name, order, clientUpdatedAt: Date.now() });
    await this.reloadFolders();
    await this.syncDirty();
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
    const changed = await this.db.replaceFolderIfUnchanged(folder, {
      ...folder,
      name,
      clientUpdatedAt: nextClientClock(Date.now(), folder.clientUpdatedAt, folder.syncedAt),
    });
    if (!changed) {
      await this.reloadFolders();
      return;
    }
    await this.reloadFolders();
    await this.syncDirty();
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
    const enqueuePendingDelete = this.authStatus() === 'authenticated';
    const deleted = await this.db.deleteFolderIfUnchanged(folder, enqueuePendingDelete);
    await this.reloadFolders();
    if (!deleted) return;
    if (enqueuePendingDelete) {
      try {
        await this.sync.flushPendingDeletes();
      } catch {
        // Local delete already applied; the pending-delete record (if it made
        // it to IndexedDB) is retried on the next flush — local-first.
      }
    }
    this.flash(`Carpeta "${folder.name}" eliminada.`);
  }

  /** Pushes locally-dirty sessions/folders to the cloud when authenticated. Local mutation already happened — never let a sync failure surface to the user. */
  private async syncDirty(): Promise<void> {
    if (this.authStatus() !== 'authenticated') return;
    try {
      await this.sync.flushDirty();
    } catch {
      // Offline/transient — stays dirty locally, retried on next flush.
    }
  }

  /** Moves a session into a folder (folderId null = unassign). */
  async moveToFolder(card: SessionCard, folderId: string | null): Promise<void> {
    if (card.folderId === folderId) return;
    const revision = this.sessionRevision(card);
    if (!revision) return;
    const clientUpdatedAt = nextClientClock(
      Date.now(),
      revision.clientUpdatedAt,
      revision.syncedAt,
    );
    const changed = await this.db.replaceSessionIfUnchanged(card.symbol, revision, (meta) => {
      if (revision.kind === 'active') {
        return {
          ...meta,
          trading: { ...meta.trading!, folderId },
          activeClientUpdatedAt: clientUpdatedAt,
        };
      }
      return {
        ...meta,
        sessions: (meta.sessions ?? []).map((session) =>
          session.id === revision.id
            ? { ...session, trading: { ...session.trading, folderId }, clientUpdatedAt }
            : session,
        ),
      };
    });
    if (!changed) return;
    if (card.symbol === this.currentAsset()) {
      if (!this.currentRevisionStillMatches(revision)) return;
      this.store.dispatch(
        TradingActions.setSessionFolder({
          id: revision.kind === 'active' ? null : revision.id,
          folderId,
          clientUpdatedAt,
        }),
      );
    } else {
      await this.reload();
      await this.syncDirty();
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

  // ---- sidebar folder REORDER drag & drop (distinct from session-into-folder above) ----

  onFolderDragStart(item: SidebarItem, event: DragEvent): void {
    if (!item.removable) return; // only real folders ('all' / '__none__' are not orderable)
    this.draggingFolder.set(item.key);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.key);
    }
  }

  onFolderDragEnd(): void {
    this.draggingFolder.set(null);
    this.folderDragOverId.set(null);
  }

  onFolderDragOver(item: SidebarItem, event: DragEvent): void {
    const draggedId = this.draggingFolder();
    if (!draggedId || !item.removable || item.key === draggedId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.folderDragOverId.set(item.key);
  }

  onFolderDragLeave(item: SidebarItem): void {
    if (this.folderDragOverId() === item.key) this.folderDragOverId.set(null);
  }

  async onFolderDrop(item: SidebarItem, event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const draggedId = this.draggingFolder();
    this.folderDragOverId.set(null);
    this.draggingFolder.set(null);
    if (!draggedId || !item.removable || draggedId === item.key) return;

    const previous = this.folders();
    const reordered = reorderFolders(previous, draggedId, item.key, Date.now());
    const previousOrderById = new Map(previous.map((f) => [f.id, f.order]));
    const changed = reordered.filter((f) => f.order !== previousOrderById.get(f.id));
    if (!changed.length) return;
    const previousById = new Map(previous.map((folder) => [folder.id, folder]));
    const committed = await this.db.replaceFoldersIfUnchanged(
      changed.map((next) => ({ expected: previousById.get(next.id)!, next })),
    );
    if (!committed) {
      await this.reloadFolders();
      return;
    }
    this.folders.set(reordered);
    await this.syncDirty();
  }

  private flash(message: string): void {
    this.info.set(message);
    setTimeout(() => this.info.set(''), 4000);
  }
}
