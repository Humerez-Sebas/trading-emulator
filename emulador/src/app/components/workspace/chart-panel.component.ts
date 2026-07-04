import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { UTCTimestamp } from 'lightweight-charts';
import { ChartComponent, ChartControlHandle } from '../chart/chart.component';
import { ChartModelMapper } from '../chart/chart-model-mapper.service';
import { ChartEventBus, Unsubscribe } from '../../domain/chart/chart-event-bus';
import { ChartSyncBus } from '../../domain/chart/chart-sync-bus';
import { ChartRegistry } from './chart-registry.service';
import { LayoutActions } from '../../state/layout/layout.actions';
import { selectSessionTfs } from '../../state/selectors';
import { PanelDescriptor } from '../../state/layout/layout.models';
import { linkGroupsFeature } from '../../state/link-groups/link-groups.reducer';
import { Timeframe } from '../../models';

/**
 * RFC-008: thin wrapper around the audited ChartComponent — one instance per
 * `PanelDescriptor.id`, no implicit shared state between instances.
 *
 * - Provides its OWN `ChartModelMapper` (D8: per-panel derivation + memo slot).
 * - Forwards the chart's interaction events (crosshair, visible range) to the
 *   session's `ChartSyncBus`, tagged with this panel's id.
 */
@Component({
  selector: 'app-chart-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ChartModelMapper],
  imports: [ChartComponent],
  host: {
    '(document:click)': 'onDocClick($event)',
  },
  template: `
    <div class="panel-header">
      <span class="panel-label">{{ headerLabel() }}</span>
      <select class="panel-tf-select" (change)="onTimeframeChange($event)">
        @for (tf of tfOptions(); track tf) {
          <option [value]="tf" [selected]="tf === descriptor().timeframe">{{ tf }}</option>
        }
      </select>
      <div class="link-chip-anchor">
        <button
          type="button"
          class="panel-link-chip"
          [class.linked]="linkedGroupColor() !== null"
          [style.background-color]="linkedGroupColor()"
          aria-label="Grupo de enlace del panel"
          (click)="toggleLinkChipMenu($event)"
        ></button>
        @if (linkChipMenuOpen()) {
          <div class="link-chip-menu" role="menu">
            @for (group of linkGroupsList(); track group.id) {
              <button
                type="button"
                class="link-chip-menu-item"
                role="menuitem"
                (click)="selectLinkGroup(group.id)"
              >
                <span class="link-chip-menu-dot" [style.background-color]="group.color"></span>
              </button>
            }
            <button type="button" class="link-chip-menu-item link-chip-menu-none" role="menuitem" (click)="selectLinkGroup(null)">
              Sin grupo
            </button>
          </div>
        }
      </div>
      @if (lastClose() !== null) {
        <span class="panel-price">{{ lastClose() }}</span>
      }
    </div>
    @if (hasBeenVisible()) {
      <app-chart
        class="panel-chart"
        (chartReady)="onChartReady($event)"
        (chartControlReady)="onChartControlReady($event)"
      />
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        overflow: hidden;
      }
      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 4px 8px;
        font-size: 11.5px;
        color: var(--text-muted);
        border-bottom: 1px solid var(--border);
      }
      .panel-label {
        font-weight: 600;
      }
      .panel-tf-select {
        font-size: 11px;
        padding: 1px 4px;
        background: transparent;
        color: var(--text-muted);
        border: 1px solid var(--border);
        border-radius: var(--radius);
      }
      .link-chip-anchor {
        position: relative;
        display: flex;
      }
      .panel-link-chip {
        width: 12px;
        height: 12px;
        padding: 0;
        border-radius: 50%;
        border: 1px solid var(--border);
        background: transparent;
        cursor: pointer;
      }
      .panel-link-chip.linked {
        border-color: transparent;
      }
      .link-chip-menu {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        z-index: 20;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 4px;
        min-width: 90px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
      }
      .link-chip-menu-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 6px;
        background: none;
        border: none;
        color: var(--text-muted);
        font-size: 11px;
        text-align: left;
        cursor: pointer;
      }
      .link-chip-menu-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .panel-chart {
        flex: 1;
        min-height: 0;
      }
    `,
  ],
})
export class ChartPanelComponent implements OnInit, OnDestroy {
  readonly descriptor = input.required<PanelDescriptor>();

  /** RFC-009 (D6): drives update-gating; the viewport derives it from selectVisiblePanelIds. */
  readonly visible = input<boolean>(true);

  private readonly mapper = inject(ChartModelMapper);
  private readonly syncBus = inject(ChartSyncBus);
  private readonly registry = inject(ChartRegistry);
  /** RFC-013 (Task 3): sole consumer is the per-panel timeframe select's dispatch below. */
  private readonly store = inject(Store);
  private readonly host = inject(ElementRef<HTMLElement>);
  private busUnsubs: Unsubscribe[] = [];
  /** RFC-010: the wrapped ChartComponent's control handle, once it's ready. */
  private controlHandle: ChartControlHandle | null = null;

  /** RFC-013 (Task 4): live LinkGroup map, for the link chip + its mini-menu. */
  private readonly linkGroups = this.store.selectSignal(linkGroupsFeature.selectGroups);

  /** Template-facing list; `@for` cannot iterate the raw `Record<string, LinkGroup>` map. */
  readonly linkGroupsList = computed(() => Object.values(this.linkGroups()));

  /**
   * The linked group's color, or null when unlinked OR when `linkGroupId` dangles (the group
   * was deleted elsewhere — RFC-010 tolerates dangling ids by design). A dangling id must
   * render as the hollow/unlinked chip, never throw.
   */
  readonly linkedGroupColor = computed(() => {
    const id = this.descriptor().linkGroupId;
    if (id === null) return null;
    return this.linkGroups()[id]?.color ?? null;
  });

  /** RFC-013 (Task 4): open/closed state of the panel's link-group mini-menu. */
  readonly linkChipMenuOpen = signal(false);

  /** Panel-local view (own mapper instance, own memo slot — D8). */
  private readonly panelView = toSignal(this.mapper.panelChartView$, { initialValue: null });

  /**
   * RFC-013 (Task 3): the panel timeframe select reuses the SAME source of truth as the global
   * toolbar (`ControlsComponent`) — `selectSessionTfs` (loaded timeframes intersected with the
   * session's selected set) — rather than a second hand-written list, and rather than the full
   * static `TIMEFRAME_ORDER` (which would offer timeframes with no series harvested yet).
   */
  readonly tfOptions = this.store.selectSignal(selectSessionTfs);

  /**
   * RFC-013 (Task 3) deviation note: the plan invites reducing this label to symbol-only now
   * that the adjacent select surfaces the timeframe. Left UNCHANGED instead — the existing
   * spec (`'shows the panel identity (symbol · timeframe) in the header'`) asserts the current
   * "symbol · timeframe" text verbatim, and the hard constraint for this task is to keep
   * existing specs passing untouched (STOP/BLOCKED if one must change beyond TestBed
   * providers). The label and the select are therefore redundant-but-harmless for now: the
   * select is the interactive control, the label keeps its historical "symbol · timeframe"
   * summary text (bare timeframe when symbol is '' — D3 sentinel), unchanged from RFC-008.
   */
  readonly headerLabel = computed(() => {
    const d = this.descriptor();
    return d.symbol ? `${d.symbol} · ${d.timeframe}` : d.timeframe;
  });

  readonly lastClose = computed(() => {
    const view = this.panelView();
    if (!view || view.idx < 0) return null;
    return view.candles[view.idx]?.close ?? null;
  });

  /**
   * RFC-012 (pt 3): sticky "has this panel ever been visible" latch. Once true, never flips
   * back — preserving RFC-009 keep-alive (hiding after first show must NOT destroy the engine).
   * Gates only the child `<app-chart>`, deferring `ChartEngine` construction until a panel born
   * in a non-active tab/cell is first shown.
   */
  readonly hasBeenVisible = signal(false);

  constructor() {
    effect(() => {
      if (this.visible()) this.hasBeenVisible.set(true);
    });
    effect(() => this.mapper.configurePanel(this.descriptor()));
    effect(() => this.mapper.setUpdatesEnabled(this.visible()));
  }

  /** RFC-013 (Task 3): dispatches this panel's timeframe change; the mapper re-derives the view from the updated descriptor. */
  onTimeframeChange(event: Event): void {
    const timeframe = (event.target as HTMLSelectElement).value as Timeframe;
    this.store.dispatch(LayoutActions.setPanelTimeframe({ panelId: this.descriptor().id, timeframe }));
  }

  /** RFC-013 (Task 4): opens/closes the link-group mini-menu; stops propagation so the host's own document-click handler doesn't immediately close it again. */
  toggleLinkChipMenu(event: Event): void {
    event.stopPropagation();
    this.linkChipMenuOpen.update((v) => !v);
  }

  /** RFC-013 (Task 4): assigns (or clears, when null) this panel's link group and closes the mini-menu. */
  selectLinkGroup(linkGroupId: string | null): void {
    this.store.dispatch(LayoutActions.setPanelLinkGroup({ panelId: this.descriptor().id, linkGroupId }));
    this.linkChipMenuOpen.set(false);
  }

  /** RFC-013 (Task 4): plain-DOM outside-click-to-close (no CDK) — ignores clicks inside this component's own host. */
  onDocClick(event: MouseEvent): void {
    if (this.linkChipMenuOpen() && !this.host.nativeElement.contains(event.target as Node)) {
      this.linkChipMenuOpen.set(false);
    }
  }

  /** RFC-009/RFC-010: registers this panel's live handle in the session ChartRegistry. */
  ngOnInit(): void {
    this.registry.register(this.descriptor().id, {
      setUpdatesEnabled: (on) => this.mapper.setUpdatesEnabled(on),
      // Both delegates read `this.controlHandle` lazily at CALL time (not captured at
      // registration time), so registration order relative to chartControlReady's emission
      // does not matter: a call arriving before the handle exists is simply a no-op (`?.`)
      // rather than a crash, and every call after chartControlReady fires reaches the real
      // handle (RFC-010 Task 3).
      applyCrosshair: (time) => this.controlHandle?.applyCrosshair(time as UTCTimestamp | null),
      applyVisibleRange: (range) => this.controlHandle?.applyVisibleRange(range),
    });
  }

  /** Wires the wrapped chart's engine bus into the session ChartSyncBus. */
  onChartReady(events: ChartEventBus): void {
    this.busUnsubs.push(
      events.on('CrosshairMoved', (p) =>
        this.syncBus.emit(this.descriptor().id, 'CrosshairMoved', p),
      ),
      events.on('VisibleRangeChanged', (r) =>
        this.syncBus.emit(this.descriptor().id, 'VisibleRangeChanged', r),
      ),
    );
  }

  /** RFC-010: stores the wrapped chart's control handle for the registry delegates above. */
  onChartControlReady(handle: ChartControlHandle): void {
    this.controlHandle = handle;
  }

  ngOnDestroy(): void {
    this.registry.deregister(this.descriptor().id);
    this.busUnsubs.forEach((off) => off());
    this.busUnsubs = [];
  }
}
