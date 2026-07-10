import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { ChartPanelComponent } from './chart-panel.component';
import { ChartRegistry } from './chart-registry.service';
import { ChartSyncBus } from '../../domain/chart/chart-sync-bus';
import { ChartSyncRouter } from './chart-sync-router';
import { LinkGroupsMenuComponent } from './link-groups-menu.component';
import { LayoutActions } from '../../state/layout/layout.actions';
import { layoutFeature, selectVisiblePanelIds } from '../../state/layout/layout.reducer';
import { linkGroupsFeature } from '../../state/link-groups/link-groups.reducer';
import {
  GRID_TEMPLATE_CELLS,
  GridTemplate,
  MAX_PANELS_PER_TAB,
  PanelDescriptor,
  TabLayout,
} from '../../state/layout/layout.models';

/** RFC-013 (D5): the closed `GridTemplate` union, in the order the switcher renders its buttons. */
const GRID_TEMPLATES: GridTemplate[] = ['1', '2h', '2v', '3', '2x2', '1+2', '1+3'];

/**
 * RFC-008: tab bar + single-level grid host. Projects `WorkspaceLayout.tabs`,
 * highlights `activeTabId`, and renders the active tab's cells according to
 * the closed `GridTemplate` enum (max depth 1 — no BSP/nesting). Each cell is
 * a tab-group: several stacked panels, one visible at a time.
 *
 * Provides the per-Session `ChartSyncBus` (one hub per Session, not per panel),
 * the per-Session `ChartRegistry` (RFC-009 liveness tracker), and the
 * per-Session `ChartSyncRouter` (RFC-010: group-scoped fan-out over the bus +
 * registry above). All three stay framework-free, hence the `useFactory`
 * providers; the router cannot inject the Store itself, so this component
 * feeds it live `{panels, linkGroups}` snapshots via an `effect` (see the
 * constructor).
 */
@Component({
  selector: 'app-workspace-viewport',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: ChartSyncBus, useFactory: () => new ChartSyncBus() },
    { provide: ChartRegistry, useFactory: () => new ChartRegistry() },
    {
      provide: ChartSyncRouter,
      useFactory: (bus: ChartSyncBus, registry: ChartRegistry) =>
        new ChartSyncRouter(bus, registry),
      deps: [ChartSyncBus, ChartRegistry],
    },
  ],
  imports: [ChartPanelComponent, LinkGroupsMenuComponent],
  host: {
    '(document:click)': 'onDocClick($event)',
  },
  template: `
    <div class="tab-bar" role="tablist">
      @for (tab of workspace().tabs; track tab.id) {
        @if (editingTabId() === tab.id) {
          <input
            class="tab-rename-input"
            aria-label="Renombrar pestaña"
            [value]="editingTabName()"
            (input)="onRenameInput($event)"
            (blur)="commitRename()"
            (keydown.enter)="commitRename()"
            (keydown.escape)="cancelRename()"
          />
        } @else {
          <button
            role="tab"
            class="tab"
            [class.active]="tab.id === workspace().activeTabId"
            [attr.aria-selected]="tab.id === workspace().activeTabId"
            (click)="selectTab(tab.id)"
            (dblclick)="startRename(tab)"
          >
            {{ tab.name }}
            @if (workspace().tabs.length > 1) {
              <span
                class="tab-close"
                role="button"
                tabindex="0"
                [attr.aria-label]="'Cerrar ' + tab.name"
                (click)="closeTab($event, tab.id)"
                (keydown.enter)="closeTab($event, tab.id)"
                (keydown.space)="closeTab($event, tab.id)"
                >&times;</span
              >
            }
          </button>
        }
      }
      <button class="tab-bar-add" (click)="addTab()">+</button>
      <div class="tab-bar-tools">
        @for (template of gridTemplates; track template) {
          <button
            class="template-btn"
            [class.active]="template === activeTabTemplate()"
            [attr.aria-label]="'Plantilla ' + template"
            (click)="applyTemplate(template)"
          >
            {{ template }}
          </button>
        }
        <div class="link-groups-anchor">
          <button
            class="link-groups-toggle"
            aria-label="Grupos de enlace"
            [attr.aria-expanded]="linkGroupsMenuOpen()"
            (click)="toggleLinkGroupsMenu($event)"
          >
            &#128279;
          </button>
          @if (linkGroupsMenuOpen()) {
            <app-link-groups-menu class="link-groups-popover" />
          }
        </div>
      </div>
    </div>
    @for (tab of workspace().tabs; track tab.id) {
      <div
        class="grid"
        [attr.data-template]="tab.template"
        [hidden]="tab.id !== workspace().activeTabId"
      >
        @for (cell of tab.cells; track $index; let ci = $index) {
          <div class="cell" [hidden]="ci >= renderedCount(tab)">
            @if (cell.panelIds.length > 1) {
              <div class="cell-tabs" role="tablist">
                @for (pid of cell.panelIds; track pid) {
                  <button
                    role="tab"
                    class="cell-tab"
                    [class.active]="pid === cell.activePanelId"
                    [attr.aria-selected]="pid === cell.activePanelId"
                    (click)="selectPanel(tab.id, ci, pid)"
                  >
                    {{ panelLabel(pid) }}
                    <span
                      class="cell-tab-close"
                      role="button"
                      tabindex="0"
                      [attr.aria-label]="'Cerrar ' + panelLabel(pid)"
                      (click)="closePanel($event, pid)"
                      (keydown.enter)="closePanel($event, pid)"
                      (keydown.space)="closePanel($event, pid)"
                      >&times;</span
                    >
                  </button>
                }
              </div>
            }
            @for (pid of cell.panelIds; track pid) {
              @if (descriptorOf(pid); as d) {
                <app-chart-panel
                  class="cell-panel"
                  [descriptor]="d"
                  [visible]="visibleIds()[pid] === true"
                  [hidden]="pid !== cell.activePanelId"
                />
              }
            }
            @if (cell.panelIds.length === 0) {
              <div class="cell-empty">Sin panel</div>
            }
            <button class="cell-add" [disabled]="tabAtCap(tab)" (click)="addPanel(tab.id, ci)">
              +
            </button>
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }
      .tab-bar {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 4px 4px 0;
        border-bottom: 1px solid var(--border);
      }
      .tab {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 14px;
        background: none;
        border: 1px solid transparent;
        border-bottom: none;
        border-radius: var(--radius) var(--radius) 0 0;
        color: var(--text-muted);
        font-size: 12px;
        cursor: pointer;
      }
      .tab.active {
        background: var(--surface);
        border-color: var(--border);
        color: var(--text);
      }
      .tab-close {
        cursor: pointer;
      }
      .tab-rename-input {
        width: 100px;
        padding: 4px 8px;
        font-size: 12px;
        background: var(--surface);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: var(--radius);
      }
      .tab-bar-add {
        padding: 3px 10px;
        background: none;
        border: 1px dashed var(--border);
        border-radius: var(--radius);
        color: var(--text-muted);
        font-size: 11px;
        cursor: pointer;
      }
      .tab-bar-tools {
        display: flex;
        gap: 2px;
        margin-left: auto;
        padding-bottom: 4px;
      }
      .template-btn {
        padding: 3px 8px;
        background: none;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text-muted);
        font-size: 11px;
        cursor: pointer;
      }
      .template-btn.active {
        background: var(--surface);
        color: var(--text);
      }
      .link-groups-anchor {
        position: relative;
      }
      .link-groups-toggle {
        padding: 3px 8px;
        background: none;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text-muted);
        font-size: 11px;
        cursor: pointer;
      }
      .link-groups-popover {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        z-index: 20;
      }
      .grid {
        flex: 1;
        min-height: 0;
        display: grid;
        gap: 4px;
        padding: 4px;
      }
      .grid[hidden] {
        display: none;
      }
      .cell[hidden] {
        display: none;
      }
      .grid[data-template='1'] {
        grid-template-columns: 1fr;
      }
      .grid[data-template='2h'] {
        grid-template-columns: 1fr 1fr;
      }
      .grid[data-template='2v'] {
        grid-template-rows: 1fr 1fr;
      }
      .grid[data-template='3'] {
        grid-template-columns: repeat(3, 1fr);
      }
      .grid[data-template='2x2'] {
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr;
      }
      .grid[data-template='1+2'] {
        grid-template-columns: 2fr 1fr;
        grid-template-rows: 1fr 1fr;
      }
      .grid[data-template='1+2'] .cell:first-child {
        grid-row: span 2;
      }
      .grid[data-template='1+3'] {
        grid-template-columns: 3fr 1fr;
        grid-template-rows: repeat(3, 1fr);
      }
      .grid[data-template='1+3'] .cell:first-child {
        grid-row: span 3;
      }
      .cell {
        display: flex;
        flex-direction: column;
        min-height: 0;
        min-width: 0;
      }
      .cell-tabs {
        display: flex;
        gap: 2px;
        padding: 2px 2px 0;
      }
      .cell-tab {
        padding: 3px 10px;
        background: none;
        border: 1px solid var(--border);
        border-bottom: none;
        border-radius: var(--radius) var(--radius) 0 0;
        color: var(--text-muted);
        font-size: 11px;
        cursor: pointer;
      }
      .cell-tab.active {
        background: var(--surface);
        color: var(--text);
      }
      .cell-tab-close {
        margin-left: 6px;
        cursor: pointer;
      }
      .cell-add {
        padding: 3px 10px;
        background: none;
        border: 1px dashed var(--border);
        border-radius: var(--radius);
        color: var(--text-muted);
        font-size: 11px;
        cursor: pointer;
        align-self: flex-start;
      }
      .cell-add:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .cell-panel {
        flex: 1;
        min-height: 0;
      }
      .cell-empty {
        flex: 1;
        display: grid;
        place-items: center;
        border: 1px dashed var(--border);
        border-radius: var(--radius);
        color: var(--text-muted);
        font-size: 12px;
      }
    `,
  ],
})
export class WorkspaceViewportComponent implements OnDestroy {
  private readonly store = inject(Store);
  private readonly syncBus = inject(ChartSyncBus);
  private readonly syncRouter = inject(ChartSyncRouter);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** RFC-013 (D5): the closed GridTemplate union, rendered in this fixed order by the switcher. */
  readonly gridTemplates = GRID_TEMPLATES;

  readonly workspace = this.store.selectSignal(layoutFeature.selectWorkspace);
  readonly panels = this.store.selectSignal(layoutFeature.selectPanels);
  readonly visibleIds = this.store.selectSignal(selectVisiblePanelIds);
  /** RFC-010: live LinkGroup map, fed to the ChartSyncRouter below. */
  readonly linkGroups = this.store.selectSignal(linkGroupsFeature.selectGroups);

  /** RFC-013 (D4): id of the tab currently in inline-rename mode; null when none. */
  readonly editingTabId = signal<string | null>(null);
  /** RFC-013 (D4): local draft of the rename input's value, uncommitted until Enter/blur. */
  readonly editingTabName = signal('');

  /** RFC-013 (D6): open/closed state of the LinkGroups manager popover. */
  readonly linkGroupsMenuOpen = signal(false);

  /** RFC-013 (D5): the active tab's current template, for highlighting the switcher. */
  readonly activeTabTemplate = () => {
    const ws = this.workspace();
    return ws.tabs.find((t) => t.id === ws.activeTabId)?.template ?? null;
  };

  constructor() {
    // RFC-010: the router is framework-free (no Store injection of its own), so it is kept fed
    // with the live panels/linkGroups snapshot it needs to resolve "same linkGroup" siblings.
    effect(() =>
      this.syncRouter.setState({ panels: this.panels(), linkGroups: this.linkGroups() }),
    );
  }

  selectTab(tabId: string): void {
    this.store.dispatch(LayoutActions.setActiveTab({ tabId }));
  }

  /** RFC-013 (D4): appends a new tab seeded with one active-asset panel; caller supplies both ids (reducer stays pure). */
  addTab(): void {
    const n = this.workspace().tabs.length + 1;
    this.store.dispatch(
      LayoutActions.createTab({
        id: crypto.randomUUID(),
        name: `Tab ${n}`,
        descriptor: { id: crypto.randomUUID(), symbol: '', timeframe: 'M1', linkGroupId: null },
      }),
    );
  }

  /** RFC-013 (D4): closes a tab; stops propagation so the tab's own click (selectTab) doesn't also fire. Absent in the template when it is the last tab. */
  closeTab(event: Event, tabId: string): void {
    event.stopPropagation();
    this.store.dispatch(LayoutActions.closeTab({ tabId }));
  }

  /** RFC-013 (D4): enters inline rename for this tab, prefilled with its current name. */
  startRename(tab: TabLayout): void {
    this.editingTabId.set(tab.id);
    this.editingTabName.set(tab.name);
  }

  onRenameInput(event: Event): void {
    this.editingTabName.set((event.target as HTMLInputElement).value);
  }

  /** Enter or blur: commits a trimmed non-empty name; an empty/whitespace-only commit cancels instead. */
  commitRename(): void {
    const tabId = this.editingTabId();
    if (tabId === null) return;
    const name = this.editingTabName().trim();
    if (name.length > 0) {
      this.store.dispatch(LayoutActions.renameTab({ tabId, name }));
    }
    this.editingTabId.set(null);
  }

  /** Escape: cancels the rename without dispatching. */
  cancelRename(): void {
    this.editingTabId.set(null);
  }

  /** RFC-013 (D5): applies a grid template to the ACTIVE tab. */
  applyTemplate(template: GridTemplate): void {
    const tabId = this.workspace().activeTabId;
    this.store.dispatch(LayoutActions.applyGridTemplate({ tabId, template }));
  }

  /** RFC-013 (D6): opens/closes the LinkGroups manager popover; stops propagation so the host's own document-click handler doesn't immediately close it again. */
  toggleLinkGroupsMenu(event: Event): void {
    event.stopPropagation();
    this.linkGroupsMenuOpen.update((v) => !v);
  }

  /** RFC-013 (D6): plain-DOM outside-click-to-close (no CDK) — ignores clicks inside this component's own host. */
  onDocClick(event: MouseEvent): void {
    if (this.linkGroupsMenuOpen() && !this.host.nativeElement.contains(event.target as Node)) {
      this.linkGroupsMenuOpen.set(false);
    }
  }

  selectPanel(tabId: string, cellIndex: number, panelId: string): void {
    this.store.dispatch(LayoutActions.setActivePanel({ tabId, cellIndex, panelId }));
  }

  /** RFC-009 Task 5: hot-creates a fresh panel targeting (tabId, cellIndex); no-op past MAX_PANELS_PER_TAB (reducer-enforced). */
  addPanel(tabId: string, cellIndex: number): void {
    this.store.dispatch(
      LayoutActions.addPanel({
        tabId,
        cellIndex,
        descriptor: { id: crypto.randomUUID(), symbol: '', timeframe: 'M1', linkGroupId: null },
      }),
    );
  }

  /** RFC-009 Task 5: closes a panel via the single deregistration path (removePanel); stops propagation so the cell-tab's own click (selectPanel) doesn't also fire. */
  closePanel(event: Event, panelId: string): void {
    event.stopPropagation();
    this.store.dispatch(LayoutActions.removePanel({ panelId }));
  }

  /** RFC-009 Task 5: true when the tab already holds MAX_PANELS_PER_TAB panels across all its cells (mirrors the reducer's own cap check). */
  tabAtCap(tab: TabLayout): boolean {
    return tab.cells.reduce((n, c) => n + c.panelIds.length, 0) >= MAX_PANELS_PER_TAB;
  }

  /** RFC-013 follow-up: number of cells the current template renders; cells past this index are parked (kept mounted, hidden). */
  renderedCount(tab: TabLayout): number {
    return GRID_TEMPLATE_CELLS[tab.template];
  }

  descriptorOf(panelId: string): PanelDescriptor | null {
    return this.panels()[panelId] ?? null;
  }

  panelLabel(panelId: string): string {
    const d = this.panels()[panelId];
    if (!d) return panelId;
    return d.symbol ? `${d.symbol} · ${d.timeframe}` : d.timeframe;
  }

  ngOnDestroy(): void {
    this.syncRouter.destroy();
    this.syncBus.destroy();
  }
}
