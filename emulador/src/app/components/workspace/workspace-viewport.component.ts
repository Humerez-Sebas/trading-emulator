import { ChangeDetectionStrategy, Component, OnDestroy, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { ChartPanelComponent } from './chart-panel.component';
import { ChartSyncBus } from '../../domain/chart/chart-sync-bus';
import { LayoutActions } from '../../state/layout/layout.actions';
import { layoutFeature, selectActiveTab } from '../../state/layout/layout.reducer';
import { GridCell, PanelDescriptor } from '../../state/layout/layout.models';

/**
 * RFC-008: tab bar + single-level grid host. Projects `WorkspaceLayout.tabs`,
 * highlights `activeTabId`, and renders the active tab's cells according to
 * the closed `GridTemplate` enum (max depth 1 — no BSP/nesting). Each cell is
 * a tab-group: several stacked panels, one visible at a time.
 *
 * Provides the per-Session `ChartSyncBus` (one hub per Session, not per panel).
 * The bus stays framework-free, hence the `useFactory` provider.
 */
@Component({
  selector: 'app-workspace-viewport',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: ChartSyncBus, useFactory: () => new ChartSyncBus() }],
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
    @if (activeTab(); as tab) {
      <div class="grid" [attr.data-template]="tab.template">
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
                  </button>
                }
              </div>
            }
            @if (activeDescriptor(cell); as d) {
              <app-chart-panel class="cell-panel" [descriptor]="d" />
            } @else {
              <div class="cell-empty">Sin panel</div>
            }
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
  readonly activeTab = this.store.selectSignal(selectActiveTab);

  selectTab(tabId: string): void {
    this.store.dispatch(LayoutActions.setActiveTab({ tabId }));
  }

  selectPanel(tabId: string, cellIndex: number, panelId: string): void {
    this.store.dispatch(LayoutActions.setActivePanel({ tabId, cellIndex, panelId }));
  }

  activeDescriptor(cell: GridCell): PanelDescriptor | null {
    return cell.activePanelId ? (this.panels()[cell.activePanelId] ?? null) : null;
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
