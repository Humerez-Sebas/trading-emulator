import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ChartComponent } from '../chart/chart.component';
import { ChartModelMapper } from '../chart/chart-model-mapper.service';
import { ChartEventBus, Unsubscribe } from '../../domain/chart/chart-event-bus';
import { ChartSyncBus } from '../../domain/chart/chart-sync-bus';
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
    <app-chart class="panel-chart" (chartReady)="onChartReady($event)" />
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
export class ChartPanelComponent implements OnDestroy {
  readonly descriptor = input.required<PanelDescriptor>();

  private readonly mapper = inject(ChartModelMapper);
  private readonly syncBus = inject(ChartSyncBus);
  private busUnsubs: Unsubscribe[] = [];

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

  ngOnDestroy(): void {
    this.busUnsubs.forEach((off) => off());
    this.busUnsubs = [];
  }
}
