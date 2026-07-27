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
    '(document:keydown.escape)': 'onEscape()',
    '(click)': 'onPanelClick()',
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
            <button
              type="button"
              class="link-chip-menu-item link-chip-menu-none"
              role="menuitem"
              (click)="selectLinkGroup(null)"
            >
              Sin grupo
            </button>
          </div>
        }
      </div>
      <div class="eye-anchor">
        <button
          type="button"
          class="panel-eye"
          [class.active]="anyLayerHidden()"
          [attr.aria-label]="eyeLabel()"
          [attr.title]="eyeLabel()"
          [attr.aria-expanded]="eyeMenuOpen()"
          (click)="toggleEyeMenu($event)"
        >
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
            <circle cx="12" cy="12" r="3" />
            @if (anyLayerHidden()) {
              <path d="M2 2l20 20" />
            }
          </svg>
        </button>
        @if (eyeMenuOpen()) {
          <div class="eye-menu" role="menu">
            <button
              type="button"
              class="eye-menu-item"
              role="menuitemcheckbox"
              [class.disabled]="!canHideDrawings()"
              [attr.aria-disabled]="!canHideDrawings()"
              [attr.tabindex]="canHideDrawings() ? 0 : -1"
              [attr.aria-checked]="!hideSharedDrawings()"
              [attr.title]="drawingsRowTitle()"
              (click)="canHideDrawings() && toggleHideSharedDrawings($event)"
            >
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
                <circle cx="12" cy="12" r="3" />
                @if (hideSharedDrawings()) {
                  <path d="M2 2l20 20" />
                }
              </svg>
              Dibujos compartidos
            </button>
            <button
              type="button"
              class="eye-menu-item"
              role="menuitemcheckbox"
              [attr.aria-checked]="!hideTrades()"
              [attr.title]="tradesRowTitle()"
              (click)="toggleHideTrades($event)"
            >
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
                <circle cx="12" cy="12" r="3" />
                @if (hideTrades()) {
                  <path d="M2 2l20 20" />
                }
              </svg>
              Trades
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
        (chartFocused)="onPanelClick()"
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
      :host([hidden]) {
        display: none;
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
      .eye-anchor {
        position: relative;
        display: flex;
      }
      .panel-eye {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        padding: 0;
        background: none;
        border: none;
        border-radius: var(--radius);
        color: var(--text-muted);
        cursor: pointer;
      }
      .panel-eye:hover {
        background: var(--surface-2);
      }
      .panel-eye.active {
        color: var(--accent);
      }
      .eye-menu {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        z-index: 20;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 4px;
        min-width: 150px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
      }
      .eye-menu-item {
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
      .eye-menu-item:hover {
        background: var(--surface-2);
      }
      .eye-menu-item.disabled {
        opacity: 0.45;
        cursor: default;
      }
      .eye-menu-item.disabled:hover {
        background: none;
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

  /** This panel's local shared-layer visibility toggle; absent means false. */
  readonly hideSharedDrawings = computed(() => this.descriptor().hideSharedDrawings ?? false);

  /** Spanish label reflecting the CURRENT state as the action that flips it, for both aria-label and title. */
  readonly hideSharedLabel = computed(() =>
    this.hideSharedDrawings() ? 'Mostrar capa compartida' : 'Ocultar capa compartida',
  );

  /** RFC-018 (Task 6): open/closed state of the panel's eye popover. */
  readonly eyeMenuOpen = signal(false);

  /** This panel's local trade-layer visibility toggle (T-2); absent means false. */
  readonly hideTrades = computed(() => this.descriptor().hideTrades ?? false);

  /**
   * The shared-drawings row is meaningful only when a group actually shares drawings
   * (RFC-018 §8): unlinked, or linked to a group with `syncDrawings === false`, leaves
   * nothing for the toggle to act on.
   */
  readonly canHideDrawings = computed(() => {
    const id = this.descriptor().linkGroupId;
    return id !== null && this.linkGroups()[id]?.syncDrawings === true;
  });

  /**
   * Combined header indicator: dimmed when ANY layer is ACTUALLY suppressed (R18-8).
   * `hideSharedDrawings` only counts when a shared layer exists to suppress — a stale
   * `true` left on a panel that has since been unlinked hides nothing, and the indicator
   * must report reality, not stored intent.
   */
  readonly anyLayerHidden = computed(
    () => this.hideTrades() || (this.canHideDrawings() && this.hideSharedDrawings()),
  );

  /** RFC-018 §8: the eye opens a menu of two independent toggles, not a single flip. */
  eyeLabel(): string {
    return 'Capas visibles del panel';
  }

  /**
   * R18-7 (Option B): when the row is inert, the title explains WHY rather than naming a
   * flip action — the tooltip is the entire reason the row stays visible instead of
   * disappearing. When active, it follows the existing `hideSharedLabel` idiom.
   */
  readonly drawingsRowTitle = computed(() =>
    this.canHideDrawings()
      ? this.hideSharedLabel()
      : 'Vincula el panel a un grupo para compartir dibujos',
  );

  /** Spanish label reflecting the CURRENT state as the action that flips it (T-2). */
  readonly tradesRowTitle = computed(() =>
    this.hideTrades() ? 'Mostrar trades' : 'Ocultar trades',
  );

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
    this.store.dispatch(
      LayoutActions.setPanelTimeframe({ panelId: this.descriptor().id, timeframe }),
    );
  }

  /** RFC-013 (Task 4): opens/closes the link-group mini-menu; stops propagation so the host's own document-click handler doesn't immediately close it again. */
  toggleLinkChipMenu(event: Event): void {
    event.stopPropagation();
    this.linkChipMenuOpen.update((v) => !v);
  }

  /** RFC-013 (Task 4): assigns (or clears, when null) this panel's link group and closes the mini-menu. */
  selectLinkGroup(linkGroupId: string | null): void {
    this.store.dispatch(
      LayoutActions.setPanelLinkGroup({ panelId: this.descriptor().id, linkGroupId }),
    );
    this.linkChipMenuOpen.set(false);
  }

  onPanelClick(): void {
    this.store.dispatch(LayoutActions.setFocusedPanel({ panelId: this.descriptor().id }));
  }

  /** Flips this panel's local shared-layer visibility toggle. */
  toggleHideSharedDrawings(event: Event): void {
    event.stopPropagation();
    this.store.dispatch(
      LayoutActions.setPanelHideSharedDrawings({
        panelId: this.descriptor().id,
        hidden: !this.hideSharedDrawings(),
      }),
    );
  }

  /** RFC-018 (Task 6): opens/closes the eye popover; stops propagation so the host's own document-click handler doesn't immediately close it again. */
  toggleEyeMenu(event: Event): void {
    event.stopPropagation();
    this.eyeMenuOpen.update((v) => !v);
  }

  /** RFC-018 (Task 6, T-2): flips this panel's local trade-layer visibility toggle. Neither eye-menu row closes the popover — the trader may flip both in one visit. */
  toggleHideTrades(event: Event): void {
    event.stopPropagation();
    this.store.dispatch(
      LayoutActions.setPanelHideTrades({
        panelId: this.descriptor().id,
        hidden: !this.hideTrades(),
      }),
    );
  }

  /** RFC-013 (Task 4) / RFC-018 (Task 6): plain-DOM outside-click-to-close (no CDK) — ignores clicks inside this component's own host, closes both menus. */
  onDocClick(event: MouseEvent): void {
    if (this.host.nativeElement.contains(event.target as Node)) return;
    if (this.linkChipMenuOpen()) this.linkChipMenuOpen.set(false);
    if (this.eyeMenuOpen()) this.eyeMenuOpen.set(false);
  }

  /** RFC-018 (Task 6): Esc closes both popovers — extending Esc to the link-chip menu is a declared side-effect of this task (new key handling on this component). */
  onEscape(): void {
    this.linkChipMenuOpen.set(false);
    this.eyeMenuOpen.set(false);
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
