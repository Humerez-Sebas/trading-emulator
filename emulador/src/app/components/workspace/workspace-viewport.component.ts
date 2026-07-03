import { ChangeDetectionStrategy, Component, OnDestroy, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { ChartPanelComponent } from './chart-panel.component';
import { ChartRegistry } from './chart-registry.service';
import { ChartSyncBus } from '../../domain/chart/chart-sync-bus';
import { LayoutActions } from '../../state/layout/layout.actions';
import { layoutFeature, selectVisiblePanelIds } from '../../state/layout/layout.reducer';
import { MAX_PANELS_PER_TAB, PanelDescriptor, TabLayout } from '../../state/layout/layout.models';

/**
 * RFC-008: tab bar + single-level grid host. Projects `WorkspaceLayout.tabs`,
 * highlights `activeTabId`, and renders the active tab's cells according to
 * the closed `GridTemplate` enum (max depth 1 — no BSP/nesting). Each cell is
 * a tab-group: several stacked panels, one visible at a time.
 *
 * Provides the per-Session `ChartSyncBus` (one hub per Session, not per panel)
 * and the per-Session `ChartRegistry` (RFC-009 liveness tracker). Both stay
 * framework-free, hence the `useFactory` providers.
 */
@Component({
  selector: 'app-workspace-viewport',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: ChartSyncBus, useFactory: () => new ChartSyncBus() },
    { provide: ChartRegistry, useFactory: () => new ChartRegistry() },
  ],
  imports: [ChartPanelComponent],
  template: `
    <div class="tab-bar" role="tablist">
      @for (tab of workspace().tabs; track tab.id) {
        <button
          role="tab"
          class="tab"
          [class.active]="tab.id === workspace().activeTabId"
          [attr.aria-selected]="tab.id === workspace().activeTabId"
          (click)="selectTab(tab.id)"
        >
          {{ tab.name }}
        </button>
      }
    </div>
    @for (tab of workspace().tabs; track tab.id) {
      <div class="grid" [attr.data-template]="tab.template" [hidden]="tab.id !== workspace().activeTabId">
        @for (cell of tab.cells; track $index; let ci = $index) {
          <div class="cell">
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
            <button class="cell-add" [disabled]="tabAtCap(tab)" (click)="addPanel(tab.id, ci)">+</button>
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
        gap: 2px;
        padding: 4px 4px 0;
        border-bottom: 1px solid var(--border);
      }
      .tab {
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
      .grid {
        flex: 1;
        min-height: 0;
        display: grid;
        gap: 4px;
        padding: 4px;
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

  readonly workspace = this.store.selectSignal(layoutFeature.selectWorkspace);
  readonly panels = this.store.selectSignal(layoutFeature.selectPanels);
  readonly visibleIds = this.store.selectSignal(selectVisiblePanelIds);

  selectTab(tabId: string): void {
    this.store.dispatch(LayoutActions.setActiveTab({ tabId }));
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

  descriptorOf(panelId: string): PanelDescriptor | null {
    return this.panels()[panelId] ?? null;
  }

  panelLabel(panelId: string): string {
    const d = this.panels()[panelId];
    if (!d) return panelId;
    return d.symbol ? `${d.symbol} · ${d.timeframe}` : d.timeframe;
  }

  ngOnDestroy(): void {
    this.syncBus.destroy();
  }
}
