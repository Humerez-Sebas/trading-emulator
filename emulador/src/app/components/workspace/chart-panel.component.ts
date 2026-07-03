import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { UTCTimestamp } from 'lightweight-charts';
import { ChartComponent, ChartControlHandle } from '../chart/chart.component';
import { ChartModelMapper } from '../chart/chart-model-mapper.service';
import { ChartEventBus, Unsubscribe } from '../../domain/chart/chart-event-bus';
import { ChartSyncBus } from '../../domain/chart/chart-sync-bus';
import { ChartRegistry } from './chart-registry.service';
import { PanelDescriptor } from '../../state/layout/layout.models';

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
  template: `
    <div class="panel-header">
      <span class="panel-label">{{ headerLabel() }}</span>
      @if (lastClose() !== null) {
        <span class="panel-price">{{ lastClose() }}</span>
      }
    </div>
    <app-chart
      class="panel-chart"
      (chartReady)="onChartReady($event)"
      (chartControlReady)="onChartControlReady($event)"
    />
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
  private busUnsubs: Unsubscribe[] = [];
  /** RFC-010: the wrapped ChartComponent's control handle, once it's ready. */
  private controlHandle: ChartControlHandle | null = null;

  /** Panel-local view (own mapper instance, own memo slot — D8). */
  private readonly panelView = toSignal(this.mapper.panelChartView$, { initialValue: null });

  readonly headerLabel = computed(() => {
    const d = this.descriptor();
    return d.symbol ? `${d.symbol} · ${d.timeframe}` : d.timeframe;
  });

  readonly lastClose = computed(() => {
    const view = this.panelView();
    if (!view || view.idx < 0) return null;
    return view.candles[view.idx]?.close ?? null;
  });

  constructor() {
    effect(() => this.mapper.configurePanel(this.descriptor()));
    effect(() => this.mapper.setUpdatesEnabled(this.visible()));
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
