import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, PercentPipe, NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { ReplayActions } from '../../state/replay/replay.actions';
import { TradingActions } from '../../state/trading/trading.actions';
import { WorkspacesActions } from '../../state/workspaces/workspaces.actions';
import {
  selectCurrentAsset,
  selectCurrentTime,
  selectSavedSessions,
  selectTradingData,
} from '../../state/selectors';
import { SessionFolder, TradingData } from '../../state/trading/trading.models';
import { WorkspaceMeta } from '../../state/workspaces/workspaces.models';
import { TrashIconComponent } from '../../components/icons/trash-icon.component';
import { DialogService } from '../../components/ui/dialog.service';
import { ButtonDirective } from '../../components/ui/button.directive';
import { BadgeDirective } from '../../components/ui/badge.directive';
import { MenuComponent } from '../../components/ui/menu.component';
import { EmptyStateComponent } from '../../components/ui/empty-state.component';
import { SegmentedControlComponent } from '../../components/ui/segmented-control.component';

type Density = 'card' | 'row';

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
  ],
  templateUrl: './sesiones-page.component.html',
  styleUrl: './sesiones-page.component.css',
})
export class SesionesPageComponent {
  private store = inject(Store);
  private db = inject(WorkspaceDbService);
  private router = inject(Router);
  private dialogs = inject(DialogService);

  state = signal<'loading' | 'ok'>('loading');
  private metas = signal<WorkspaceMeta[]>([]);
  folders = signal<SessionFolder[]>([]);
  info = signal('');

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

  /** Search filter by session name or asset symbol (instant). */
  private searchedCards = computed<SessionCard[]>(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.allCards();
    return this.allCards().filter(
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

  total = computed(() => this.allCards().length);

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

  // ---- open / rename / delete (unchanged behavior) ----

  open(card: SessionCard): void {
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
