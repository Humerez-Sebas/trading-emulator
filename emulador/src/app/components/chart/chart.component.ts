import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineStyle,
  LogicalRange,
  MouseEventParams,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { Candle, derivePointSize } from '../../models';
import {
  selectActiveTfShortfall,
  selectChartStyle,
  selectChartView,
  selectDataRange,
  selectSessionEnd,
  selectTradeChartView,
  selectTradePanelView,
  TradeBoxItem,
  TradeMarker,
} from '../../state/selectors';
import { ReplayActions } from '../../state/replay/replay.actions';
import {
  ChartColors,
  TradeBoxOpacity,
  CHART_ACCENT,
  DARK_CHART_COLORS,
  DARK_TRADE_BOX_OPACITY,
} from '../../state/settings/settings.models';
import { DialogService } from '../ui/dialog.service';
import { DrawingsActions } from '../../state/drawings/drawings.actions';
import { drawingsFeature } from '../../state/drawings/drawings.reducer';
import { Drawing, DrawingPoint, DrawingType } from '../../state/drawings/drawings.models';
import { DrawingsPrimitive } from './drawings-primitive';
import { TradeButtonsPrimitive } from './trade-buttons-primitive';
import { TradeBoxesPrimitive } from './trade-boxes-primitive';
import { CountdownPrimitive } from './countdown-primitive';
import { TradingActions } from '../../state/trading/trading.actions';
import {
  lotsForRisk,
  OrderSide,
  PendingOrder,
  PendingType,
  Position,
} from '../../state/trading/trading.models';
import { ChartEngine } from '../../domain/chart/chart-engine';
import { RenderModel } from '../../domain/chart/render-model';

/** A horizontal trade level rendered as a price line on the chart. */
interface TradeLine {
  /** Position or pending-order id. */
  id: string;
  target: 'position' | 'order';
  field: 'entry' | 'sl' | 'tp';
  price: number;
  draggable: boolean;
  line: IPriceLine;
}

/** Vertical hit tolerance (px) for grabbing a trade price line. */
const LINE_GRAB_PX = 4;

/**
 * Bars painted at once on a TF switch / big jump. A full M1 history is hundreds
 * of thousands of candles; one setData of all of them froze the UI. We paint a
 * trailing window and lazily prepend older bars when the user scrolls left.
 */
const RENDER_WINDOW = 12_000;
/** Older bars prepended per lazy load when scrolling near the left edge. */
const LOAD_MORE_CHUNK = 6_000;
/** Trigger a lazy prepend when fewer than this many bars remain to the left. */
const LOAD_MORE_THRESHOLD = 50;

/** One pending-order entry in the right-click context menu. */
interface MenuOrderOption {
  label: string;
  side: OrderSide;
  orderType: PendingType;
  price: number;
}

/** Interactive placement started from the context menu: SL click, TP click. */
interface PlacingState {
  side: OrderSide;
  orderType: PendingType;
  entryPrice: number;
  /** Fixed once the user clicks; null while still following the mouse. */
  sl: number | null;
  stage: 'sl' | 'tp';
}

/** '#RRGGBB' + alpha (0..1) -> 'rgba(...)'. */
function hexToRgba(hex: string, alpha: number): string {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

@Component({
  selector: 'app-chart',
  standalone: true,
  template: `
    <div #container class="chart-container"></div>
    @if (menu(); as m) {
      <div class="ctx-menu" [style.left.px]="m.x" [style.top.px]="m.y" role="menu">
        <button role="menuitem" (click)="menuFit()">Ajustar gráfico</button>
        <button role="menuitem" (click)="menuGoToDate()">Ir a fecha…</button>
        <button role="menuitem" (click)="menuScheduleEnd()">Programar fin…</button>
        @if (m.options.length) {
          <div class="sep"></div>
          @for (opt of m.options; track opt.label) {
            <button
              role="menuitem"
              [class.buy]="opt.side === 'buy'"
              [class.sell]="opt.side === 'sell'"
              (click)="menuPlace(opt)"
            >
              {{ opt.label }}
            </button>
          }
        }
        @if (m.boxId; as boxId) {
          <div class="sep"></div>
          <button role="menuitem" (click)="menuHideBox(boxId)">Ocultar caja del trade</button>
          <button role="menuitem" class="sell" (click)="menuDeleteBox(boxId)">
            Eliminar caja del trade
          </button>
        }
      </div>
    }
    @if (placing()) {
      <div class="placing-hint">{{ placingHint() }}</div>
    } @else if (dragInfo(); as d) {
      <div class="placing-hint">{{ d }}</div>
    }
    @if (coverageBanner(); as b) {
      <div class="coverage-banner" role="status">{{ b }}</div>
    }
    @if (dateDialog(); as d) {
      <div class="date-dialog" role="dialog" aria-modal="true" [attr.aria-label]="dialogTitle()">
        <h4>{{ dialogTitle() }}</h4>
        <p class="dialog-help">
          {{
            d.mode === 'goto'
              ? 'El salto solo mueve el cursor: no evalúa órdenes ni SL/TP.'
              : 'Al llegar el replay a esta fecha, la sesión termina sola.'
          }}
        </p>
        <input
          type="datetime-local"
          [value]="d.value"
          [attr.min]="dialogMin()"
          [attr.max]="dialogMax()"
          (input)="onDialogValue($event)"
        />
        <div class="dialog-actions">
          <button class="ghost" (click)="dateDialog.set(null)">Cancelar</button>
          @if (d.mode === 'end' && sessionEnd() !== null) {
            <button class="ghost" (click)="clearSessionEnd()">Quitar fin</button>
          }
          <button class="primary" [disabled]="!dialogValid()" (click)="confirmDateDialog()">
            {{ d.mode === 'goto' ? 'Ir' : 'Programar' }}
          </button>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        position: relative;
      }
      .chart-container {
        width: 100%;
        height: 100%;
      }
      .ctx-menu {
        position: absolute;
        z-index: 40;
        min-width: 190px;
        display: flex;
        flex-direction: column;
        padding: 4px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
      }
      .ctx-menu button {
        text-align: left;
        background: none;
        border: none;
        color: var(--text);
        font-size: 13px;
        padding: 7px 10px;
        border-radius: 4px;
        cursor: pointer;
      }
      .ctx-menu button:hover {
        background: var(--surface-2);
      }
      .ctx-menu button.buy {
        color: var(--up);
      }
      .ctx-menu button.sell {
        color: var(--down);
      }
      .ctx-menu .sep {
        height: 1px;
        margin: 4px 6px;
        background: var(--border);
      }
      .placing-hint {
        position: absolute;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 40;
        background: var(--surface);
        border: 1px solid var(--accent);
        border-radius: var(--radius);
        color: var(--text);
        font-size: 12px;
        padding: 6px 12px;
        pointer-events: none;
      }
      .coverage-banner {
        position: absolute;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 39;
        background: var(--surface);
        border: 1px solid var(--warning);
        border-radius: var(--radius);
        color: var(--text);
        font-size: 12px;
        padding: 6px 12px;
        pointer-events: none;
      }
      .date-dialog {
        position: absolute;
        top: 48px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 41;
        min-width: 260px;
        padding: 14px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow);
      }
      .date-dialog h4 {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
      }
      .dialog-help {
        margin: 6px 0 10px;
        font-size: 11.5px;
        color: var(--text-muted);
      }
      .date-dialog input {
        width: 100%;
        padding: 7px 8px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text);
        font: inherit;
        font-size: 12.5px;
      }
      .date-dialog input:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -1px;
      }
      .dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 12px;
      }
      .dialog-actions .ghost {
        padding: 6px 10px;
        background: none;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        color: var(--text);
        font-size: 12px;
        cursor: pointer;
      }
      .dialog-actions .ghost:hover {
        background: var(--surface-2);
      }
      .dialog-actions .primary {
        padding: 6px 14px;
        background: var(--accent);
        border: none;
        border-radius: var(--radius);
        color: var(--on-accent);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .dialog-actions .primary:disabled {
        opacity: 0.5;
        cursor: default;
      }
    `,
  ],
})
export class ChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;

  private store = inject(Store);
  private destroyRef = inject(DestroyRef);
  private zone = inject(NgZone);
  private dialogs = inject(DialogService);

  private chart?: IChartApi;
  private series?: ISeriesApi<'Candlestick'>;
  private engine?: ChartEngine;
  private lastConfig?: any;
  private drawingsPrimitive = new DrawingsPrimitive();
  private tradeButtonsPrimitive = new TradeButtonsPrimitive();
  private tradeBoxesPrimitive = new TradeBoxesPrimitive();
  /** Candle-close countdown tag on the price axis (TradingView-style). */
  private countdownPrimitive = new CountdownPrimitive();
  private seriesMarkers?: ISeriesMarkersPluginApi<Time>;

  // --- trade overlay state ---
  private tradeLines: TradeLine[] = [];
  private tradeMarkers: TradeMarker[] = [];
  private tradeBoxes: TradeBoxItem[] = [];
  private lastTradeView: { positions: Position[]; orders: PendingOrder[] } = {
    positions: [],
    orders: [],
  };
  private lineDrag: {
    id: string;
    target: 'position' | 'order';
    field: 'entry' | 'sl' | 'tp';
  } | null = null;
  /** Live points/lots/R readout while dragging a trade level. */
  dragInfo = signal<string | null>(null);

  // --- right-click menu + interactive order placement ---
  /** Current price/risk context for placing orders from the chart. */
  private tradeCtx = this.store.selectSignal(selectTradePanelView);
  menu = signal<{
    x: number;
    y: number;
    options: MenuOrderOption[];
    /** Closed trade box under the right click (hide/delete actions). */
    boxId: string | null;
  } | null>(null);
  placing = signal<PlacingState | null>(null);

  // --- "Ir a fecha…" / "Programar fin…" dialog (context menu) ---
  private dataRange = this.store.selectSignal(selectDataRange);
  sessionEnd = this.store.selectSignal(selectSessionEnd);
  /** Non-blocking warning when the active TF's data ends before the cursor. */
  coverageBanner = signal<string | null>(null);
  dateDialog = signal<{ mode: 'goto' | 'end'; value: string } | null>(null);
  dialogTitle = computed(() =>
    this.dateDialog()?.mode === 'goto' ? 'Ir a fecha' : 'Programar fin de sesión',
  );
  /** Range bounds shifted to the display tz, in datetime-local format. */
  dialogMin = computed(() => {
    const r = this.dataRange();
    return r ? this.toInputValue(r.from) : null;
  });
  dialogMax = computed(() => {
    const r = this.dataRange();
    return r ? this.toInputValue(r.to) : null;
  });
  dialogValid = computed(() => {
    const d = this.dateDialog();
    const r = this.dataRange();
    if (!d?.value || !r) return false;
    const t = this.fromInputValue(d.value);
    return t !== null && t >= r.from && t <= r.to;
  });
  /** Live distance readout while placing (points, sized lots, R multiple). */
  private placingInfo = signal<{ points: number; lots: number | null; r: number | null } | null>(
    null,
  );
  /** Banner text for the interactive placement, ruler-style readout first. */
  placingHint = computed(() => {
    const p = this.placing();
    if (!p) return '';
    const info = this.placingInfo();
    if (p.stage === 'sl') {
      const detail = info
        ? `SL: ${info.points} pts${info.lots !== null ? ` · ${info.lots.toFixed(2)} lotes` : ''} — `
        : '';
      return `${detail}Click: fijar SL · Esc: cancelar`;
    }
    const detail = info
      ? `TP: ${info.points} pts${info.r !== null ? ` (${info.r.toFixed(1)}R)` : ''} — `
      : '';
    return `${detail}Click: fijar TP · Click derecho: sin TP · Esc: cancelar`;
  });
  /** Preview price lines while placing (entry fixed, SL/TP follow clicks). */
  private placingLines: { entry?: IPriceLine; sl?: IPriceLine; tp?: IPriceLine } = {};

  /** Up to which index (of the active TF) the chart is painted. */
  private renderedIdx = -1;
  private renderedTf: string | null = null;
  private renderedOffset = 0;
  /** Full active-TF series kept for lazy prepend; the window is a tail of it. */
  private renderedCandles: Candle[] = [];
  /** First index of the rendered window into `renderedCandles` (0 = all loaded). */
  private winStart = 0;
  /** UTC times (no shift) of the rendered window: anchor for time<->x mapping. */
  private renderedTimes: number[] = [];
  /** UTC time (no shift) of the currently painted "forming" bar, if any. */
  private renderedFormingTime: number | null = null;
  /** Reentrancy guard for the scroll-driven lazy prepend. */
  private loadingMore = false;
  /** nominal seconds/bar of the active TF (out-of-range overlay extrapolation) */
  private barSpacing = 0;
  /** minimum price increment, derived from the data (for the ruler) */
  private pointSize = 0.01;

  // --- drawing state ---
  private activeTool = this.store.selectSignal(drawingsFeature.selectActiveTool);
  private drawings = this.store.selectSignal(drawingsFeature.selectItems);
  private selectedId = this.store.selectSignal(drawingsFeature.selectSelectedId);
  private shiftSecs = 0; // time zone offset applied to the chart
  private accent = CHART_ACCENT;
  private up = DARK_CHART_COLORS.upColor;
  private down = DARK_CHART_COLORS.downColor;
  private tpZone = DARK_CHART_COLORS.tpZone;
  private slZone = DARK_CHART_COLORS.slZone;
  private boxFillAlpha = DARK_TRADE_BOX_OPACITY.fill;
  private boxBorderAlpha = DARK_TRADE_BOX_OPACITY.border;
  private draftP1: DrawingPoint | null = null;
  private draft: Drawing | null = null;
  /** Anchor of the ephemeral middle-click measurement (not persisted). */
  private quickRuler: DrawingPoint | null = null;
  private shiftKey = false;
  private drag: {
    id: string;
    mode: 'move' | 'p1' | 'p2';
    startX: number;
    startY: number;
    // screen coordinates of both endpoints at drag start
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null = null;

  // DOM listeners kept by reference so they can be removed
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Shift') this.shiftKey = true;
    if (e.key === 'Delete' && this.selectedId()) {
      this.zone.run(() => this.store.dispatch(DrawingsActions.deleteSelected()));
    }
    if (e.key === 'Escape') {
      if (this.placing()) this.zone.run(() => this.cancelPlacing());
      if (this.menu()) this.zone.run(() => this.menu.set(null));
      if (this.dateDialog()) this.zone.run(() => this.dateDialog.set(null));
      if (this.quickRuler) this.clearQuickRuler();
    }
    if (e.key === 'Escape' && this.draftP1) {
      this.draftP1 = null;
      this.draft = null;
      this.pushDrawings();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Shift') this.shiftKey = false;
  };
  private onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
  private onMouseMoveDom = (e: MouseEvent) => this.handleDragMove(e);
  private onMouseUp = () => this.endDrag();
  /** Middle-button auxclick: block paste-on-middle-click in some browsers. */
  private onAuxClick = (e: MouseEvent) => {
    if (e.button === 1) e.preventDefault();
  };
  /** Right click: context menu (fit view + pending orders at that price). */
  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    this.zone.run(() => this.handleContextMenu(e));
  };

  ngAfterViewInit(): void {
    // Initial canvas colors come straight from the DESIGN.md tokens.
    // lightweight-charts paints to <canvas> and can't resolve CSS var(), so we
    // read the computed token values once here. applyColors() (store-driven)
    // takes over on the first selectChartStyle emission for theme/user overrides.
    const tokens = getComputedStyle(document.documentElement);
    const token = (name: string, fallback: string): string =>
      tokens.getPropertyValue(name).trim() || fallback;

    this.engine = new ChartEngine(this.container.nativeElement);
    this.chart = this.engine.chartApi;
    this.series = this.engine.seriesApi as any;
    
    this.series!.attachPrimitive(this.tradeBoxesPrimitive);
    this.series!.attachPrimitive(this.drawingsPrimitive);
    this.series!.attachPrimitive(this.tradeButtonsPrimitive);
    this.series!.attachPrimitive(this.countdownPrimitive);
    this.seriesMarkers = createSeriesMarkers(this.series!, []);

    // chart colors + grid controls (theme / user customization)
    this.store
      .select(selectChartStyle)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ colors, gridVisible, gridOpacity, tradeBoxOpacity }) =>
        this.applyColors(colors, gridVisible, gridOpacity, tradeBoxOpacity),
      );

    // data + replay cursor + display time zone
    this.store
      .select(selectChartView)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ tf, candles, idx, utcOffset, forming, countdown }) =>
        this.render(tf, candles, idx, utcOffset, forming, countdown),
      );

    // warn (don't silently teleport) when the active TF's coverage is shorter
    // than the replay cursor — that TF was harvested less far than another
    this.store
      .select(selectActiveTfShortfall)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((last) =>
        this.coverageBanner.set(last === null ? null : this.formatShortfall(last)),
      );

    // drawings: repaint when they change
    this.store
      .select(drawingsFeature.selectDrawingsState)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.pushDrawings());

    // trade overlay: entry/SL/TP price lines + entry/exit markers
    this.store
      .select(selectTradeChartView)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ positions, orders, markers, boxes }) => {
        this.lastTradeView = { positions, orders };
        this.tradeMarkers = markers;
        this.tradeBoxes = boxes;
        this.rebuildTradeLines();
        this.applyTradeMarkers();
        this.pushTradeButtons();
        this.pushTradeBoxes();
      });

    // drawing interaction. DblClick too: the quick second click of a shape
    // falls within the double-click threshold and the library suppresses it
    // from Click.
    this.chart.subscribeClick((p) => this.zone.run(() => this.handleClick(p)));
    this.chart.subscribeDblClick((p) => this.zone.run(() => this.handleClick(p)));
    this.chart.subscribeCrosshairMove((p) => this.handleCrosshair(p));
    // lazy-load older bars when scrolling near the left edge of the window
    this.chart.timeScale().subscribeVisibleLogicalRangeChange((r) => this.maybeLoadMore(r));

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    const el = this.container.nativeElement;
    el.addEventListener('mousedown', this.onMouseDown);
    el.addEventListener('mousemove', this.onMouseMoveDom);
    el.addEventListener('contextmenu', this.onContextMenu);
    el.addEventListener('auxclick', this.onAuxClick);
    window.addEventListener('mouseup', this.onMouseUp);
  }

  /**
   * Recenters the chart on the data: re-enables price auto-scaling (lost
   * when the user drags the price scale) and scrolls to the latest candle.
   * Useful after big time jumps where the price level changed a lot.
   */
  private resetView(): void {
    if (!this.chart || !this.series) return;
    this.engine?.resetPriceScale();
    this.chart.timeScale().scrollToRealTime();
  }

  // ============ candle rendering ============

  private applyColors(
    c: ChartColors,
    gridVisible: boolean,
    gridOpacity: number,
    boxOpacity: TradeBoxOpacity,
  ): void {
    this.accent = '#2962FF';
    this.up = c.upColor;
    this.down = c.downColor;
    this.tpZone = c.tpZone;
    this.slZone = c.slZone;
    this.boxFillAlpha = boxOpacity.fill;
    this.boxBorderAlpha = boxOpacity.border;
    this.lastConfig = { colors: c, gridVisible, gridOpacity };
    if (this.engine) {
      this.engine.render({ config: this.lastConfig });
    }
    this.pushDrawings();
    // trade overlay uses the theme's up/down colors
    this.rebuildTradeLines();
    this.applyTradeMarkers();
    this.pushTradeButtons();
    this.pushTradeBoxes();
  }

  private render(
    tf: string | null,
    candles: Candle[],
    idx: number,
    utcOffset: number,
    forming: Candle | null,
    countdown: string | null,
  ): void {
    if (!this.series) return;
    const shift = utcOffset * 3600;
    if (shift !== this.shiftSecs) {
      this.shiftSecs = shift;
      this.pushDrawings();
      this.applyTradeMarkers();
    }
    // Initialize spacing/precision whenever enough candle data exists — even when
    // idx === -1 (resolution mode hides the forming bucket), so overlay primitives
    // (drawings, trade boxes) get valid values from the first frame.
    if (candles.length > 1) {
      this.barSpacing = candles[1].time - candles[0].time;
      this.pointSize = derivePointSize(candles);
    }

    // A large forward jump / TF switch must NOT go through the incremental
    // path: series.update() once per candle re-renders each time and a jump on
    // M1 (hundreds of thousands of calls) freezes the UI. One setData() of a
    // bounded trailing window paints any jump in a single cheap pass.
    const forwardJump = idx - this.renderedIdx;
    if (
      tf !== this.renderedTf ||
      idx < this.renderedIdx ||
      shift !== this.renderedOffset ||
      forwardJump > 240
    ) {
      this.renderedCandles = candles;
      this.renderWindow(idx, Math.max(0, idx + 1 - RENDER_WINDOW), shift);
      this.renderedTf = tf;
      this.renderedIdx = idx;
      this.renderedOffset = shift;
      if (this.renderedTimes.length) this.chart?.timeScale().scrollToRealTime();
      this.pushDrawings();
      this.pushTradeBoxes();
      this.applyForming(forming, shift);
      this.updateCountdown(forming, candles, idx, countdown);
      return;
    }

    // small advance (normal replay): O(1) per new candle
    while (this.renderedIdx < idx) {
      this.renderedIdx++;
      const c = candles[this.renderedIdx];
      this.series.update({ ...c, time: (c.time + shift) as UTCTimestamp });
      // A forming bucket may already have recorded this time (applyForming); keep
      // renderedTimes free of duplicates so overlay coordinate lookups stay correct.
      if (!this.renderedTimes.includes(c.time)) this.renderedTimes.push(c.time);
    }
    // live trade boxes grow with the last rendered candle
    this.pushTradeBoxes();
    this.applyForming(forming, shift);
    this.updateCountdown(forming, candles, idx, countdown);
  }

  /**
   * Feeds the price-axis countdown tag: anchored to the live price (forming
   * close in sub-TF mode, else the last revealed candle's close). Cleared when
   * there's no countdown or no valid price.
   */
  private updateCountdown(
    forming: Candle | null,
    candles: Candle[],
    idx: number,
    label: string | null,
  ): void {
    const price = forming
      ? forming.close
      : idx >= 0 && idx < candles.length
        ? candles[idx].close
        : null;
    if (!label || price === null) {
      this.countdownPrimitive.setSource(null);
      return;
    }
    this.countdownPrimitive.setSource({
      price,
      text: label,
      backColor: '#363a45',
      textColor: '#ffffff',
    });
  }

  /** Paints/updates the live "forming" bar (resolution mode). */
  private applyForming(forming: Candle | null, shift: number): void {
    if (!this.series || !forming) {
      this.renderedFormingTime = null;
      return;
    }
    this.series.update({ ...forming, time: (forming.time + shift) as UTCTimestamp });
    this.renderedFormingTime = forming.time;
    this.renderedTimes = [...this.renderedTimes.filter((t) => t !== forming.time), forming.time];
  }

  /** Paints the window [winStart, idx] of `renderedCandles` and records its
   * bar times (the anchor every overlay maps against). */
  private renderWindow(idx: number, winStart: number, shift: number): void {
    if (!this.series) return;
    const slice = idx >= 0 ? this.renderedCandles.slice(winStart, idx + 1) : [];
    this.winStart = winStart;
    this.renderedTimes = slice.map((c) => c.time);
    const mapped = slice.map((c) => ({ ...c, time: (c.time + shift) as UTCTimestamp }));
    if (this.engine) {
      this.engine.render({ candles: mapped });
    }
  }

  /**
   * Lazy prepend: when the user scrolls near the left edge of the rendered
   * window, paint an older chunk and shift the visible range by the number of
   * bars added so the view stays put (no jump).
   */
  private maybeLoadMore(range: LogicalRange | null): void {
    if (!range || this.loadingMore || this.winStart <= 0) return;
    if ((range.from as number) > LOAD_MORE_THRESHOLD) return;
    this.loadingMore = true;
    const newStart = Math.max(0, this.winStart - LOAD_MORE_CHUNK);
    const added = this.winStart - newStart;
    if (added > 0) {
      this.renderWindow(this.renderedIdx, newStart, this.shiftSecs);
      this.chart?.timeScale().setVisibleLogicalRange({
        from: (range.from as number) + added,
        to: (range.to as number) + added,
      } as unknown as LogicalRange);
      this.pushDrawings();
      this.pushTradeBoxes();
    }
    this.loadingMore = false;
  }

  /** "Esta temporalidad solo tiene datos hasta 31 dic 14:30" for the banner. */
  private formatShortfall(lastUtc: number): string {
    const when = new Date((lastUtc + this.shiftSecs) * 1000).toLocaleString('es', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
    return `Esta temporalidad solo tiene datos hasta ${when}`;
  }

  // ============ right-click menu + interactive order placement ============

  /** Rounds a price to the instrument's minimum increment. */
  private roundToPoint(price: number): number {
    const p = Math.round(price / this.pointSize) * this.pointSize;
    // avoid float noise like 4588.000000000001
    const decimals = Math.max(0, Math.round(-Math.log10(this.pointSize)));
    return +p.toFixed(decimals);
  }

  private formatPrice(price: number): string {
    const decimals = Math.max(0, Math.round(-Math.log10(this.pointSize)));
    return price.toFixed(decimals);
  }

  private handleContextMenu(e: MouseEvent): void {
    const placing = this.placing();
    if (placing) {
      // TP stage: right click = place the order without TP; SL stage: cancel
      if (placing.stage === 'tp' && placing.sl !== null) this.finishPlacing(null);
      else this.cancelPlacing();
      return;
    }
    if (!this.series) return;
    const rect = this.container.nativeElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const raw = this.series.coordinateToPrice(y);
    const current = this.tradeCtx().price;

    const options: MenuOrderOption[] = [];
    if (raw !== null && current !== null) {
      const price = this.roundToPoint(raw);
      const label = this.formatPrice(price);
      if (price < current) {
        options.push(
          { label: `Buy Limit @ ${label}`, side: 'buy', orderType: 'limit', price },
          { label: `Sell Stop @ ${label}`, side: 'sell', orderType: 'stop', price },
        );
      } else if (price > current) {
        options.push(
          { label: `Buy Stop @ ${label}`, side: 'buy', orderType: 'stop', price },
          { label: `Sell Limit @ ${label}`, side: 'sell', orderType: 'limit', price },
        );
      }
    }
    // closed trade box under the cursor: offer hide/delete of the record
    const box = this.tradeBoxesPrimitive.hitTestBox(x, y);
    this.menu.set({ x, y, options, boxId: box?.id ?? null });
  }

  menuHideBox(id: string): void {
    this.menu.set(null);
    this.store.dispatch(TradingActions.setTradeBoxHidden({ id, hidden: true }));
  }

  async menuDeleteBox(id: string): Promise<void> {
    this.menu.set(null);
    const confirmed = await this.dialogs.confirm({
      title: 'Eliminar caja del trade',
      message: '¿Eliminar la caja de este trade del gráfico? No se puede deshacer.',
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!confirmed) return;
    this.store.dispatch(TradingActions.deleteTradeBox({ id }));
  }

  menuFit(): void {
    this.menu.set(null);
    this.resetView();
  }

  // ---- "Ir a fecha…" / "Programar fin…" ----

  /** Epoch UTC seconds -> "yyyy-MM-ddTHH:mm" in the display time zone. */
  private toInputValue(epoch: number): string {
    return new Date((epoch + this.shiftSecs) * 1000).toISOString().slice(0, 16);
  }

  /** "yyyy-MM-ddTHH:mm" in the display time zone -> epoch UTC seconds. */
  private fromInputValue(value: string): number | null {
    const ms = Date.parse(`${value}:00Z`);
    if (Number.isNaN(ms)) return null;
    return Math.floor(ms / 1000) - this.shiftSecs;
  }

  menuGoToDate(): void {
    this.menu.set(null);
    const at = this.tradeCtx().time || this.dataRange()?.from || 0;
    this.dateDialog.set({ mode: 'goto', value: this.toInputValue(at) });
  }

  menuScheduleEnd(): void {
    this.menu.set(null);
    const at = this.sessionEnd() ?? (this.tradeCtx().time || this.dataRange()?.to || 0);
    this.dateDialog.set({ mode: 'end', value: this.toInputValue(at) });
  }

  onDialogValue(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.dateDialog.update((d) => (d ? { ...d, value } : d));
  }

  confirmDateDialog(): void {
    const d = this.dateDialog();
    if (!d || !this.dialogValid()) return;
    const time = this.fromInputValue(d.value)!;
    this.dateDialog.set(null);
    if (d.mode === 'goto') {
      // jumps only move the cursor; fills are evaluated on +1 advances only
      this.store.dispatch(ReplayActions.goToTime({ time }));
    } else {
      this.store.dispatch(TradingActions.setSessionEnd({ time }));
    }
  }

  clearSessionEnd(): void {
    this.dateDialog.set(null);
    this.store.dispatch(TradingActions.setSessionEnd({ time: null }));
  }

  /** Starts the interactive placement: SL follows the mouse, click to fix. */
  menuPlace(opt: MenuOrderOption): void {
    this.menu.set(null);
    if (!this.series) return;
    this.placing.set({
      side: opt.side,
      orderType: opt.orderType,
      entryPrice: opt.price,
      sl: null,
      stage: 'sl',
    });
    this.placingLines.entry = this.series.createPriceLine({
      price: opt.price,
      color: this.accent,
      lineWidth: 1,
      lineStyle: LineStyle.LargeDashed,
      axisLabelVisible: true,
      title: `${opt.side === 'buy' ? 'Buy' : 'Sell'} ${opt.orderType}`,
    });
    this.placingLines.sl = this.series.createPriceLine({
      price: opt.price,
      color: this.down,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: 'SL?',
    });
    this.container.nativeElement.style.cursor = 'crosshair';
  }

  /**
   * Mouse follow: moves the SL/TP preview line while placing and refreshes
   * the ruler-style readout (points, sized lots, R multiple).
   */
  private updatePlacingHover(param: MouseEventParams<Time>): void {
    const placing = this.placing();
    if (!placing || !param.point || !this.series) return;
    const raw = this.series.coordinateToPrice(param.point.y);
    if (raw === null) return;
    const price = this.roundToPoint(raw);
    const points = Math.round(Math.abs(price - placing.entryPrice) / this.pointSize);

    let lots: number | null = null;
    let r: number | null = null;
    if (placing.stage === 'sl') {
      const ctx = this.tradeCtx();
      const sized = lotsForRisk(
        ctx.balance,
        ctx.riskPct,
        placing.entryPrice,
        price,
        ctx.contractSize,
      );
      lots = sized > 0 ? sized : null;
    } else if (placing.sl !== null) {
      const slDist = Math.abs(placing.entryPrice - placing.sl);
      r = slDist > 0 ? Math.abs(price - placing.entryPrice) / slDist : null;
    }

    const line = placing.stage === 'sl' ? this.placingLines.sl : this.placingLines.tp;
    line?.applyOptions({
      price,
      title: `${placing.stage === 'sl' ? 'SL?' : 'TP?'} ${points}p`,
    });
    this.zone.run(() => this.placingInfo.set({ points, lots, r }));
  }

  /** Click while placing: fixes the SL first, then the TP (TP optional). */
  private handlePlacingClick(param: MouseEventParams<Time>): void {
    const placing = this.placing();
    if (!placing || !param.point || !this.series) return;
    const raw = this.series.coordinateToPrice(param.point.y);
    if (raw === null) return;
    const price = this.roundToPoint(raw);
    const buy = placing.side === 'buy';

    if (placing.stage === 'sl') {
      // the SL must be on the losing side of the entry
      if (buy ? price >= placing.entryPrice : price <= placing.entryPrice) return;
      this.placingLines.sl?.applyOptions({ price, title: 'SL' });
      this.placingLines.tp = this.series.createPriceLine({
        price: placing.entryPrice,
        color: this.up,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'TP?',
      });
      this.placing.set({ ...placing, sl: price, stage: 'tp' });
      this.placingInfo.set(null); // readout switches to TP distances
      return;
    }
    // TP stage: must be on the winning side of the entry
    if (buy ? price <= placing.entryPrice : price >= placing.entryPrice) return;
    this.finishPlacing(price);
  }

  /** Dispatches the pending order and clears the preview. */
  private finishPlacing(tp: number | null): void {
    const placing = this.placing();
    const ctx = this.tradeCtx();
    if (!placing || placing.sl === null) {
      this.cancelPlacing();
      return;
    }
    this.store.dispatch(
      TradingActions.placeOrder({
        side: placing.side,
        orderType: placing.orderType,
        entryPrice: placing.entryPrice,
        sl: placing.sl,
        tp,
        riskPct: ctx.riskPct,
        time: ctx.time,
        contractSize: ctx.contractSize,
      }),
    );
    this.clearPlacing();
  }

  private cancelPlacing(): void {
    this.clearPlacing();
  }

  private clearPlacing(): void {
    if (this.series) {
      for (const line of Object.values(this.placingLines)) {
        if (line) this.series.removePriceLine(line);
      }
    }
    this.placingLines = {};
    this.placing.set(null);
    this.placingInfo.set(null);
    this.container.nativeElement.style.cursor = '';
  }

  // ============ trade overlay (price lines + markers) ============

  /** Recreates the entry/SL/TP price lines from the last trading state. */
  private rebuildTradeLines(): void {
    if (!this.series) return;
    for (const tl of this.tradeLines) this.series.removePriceLine(tl.line);
    this.tradeLines = [];

    const add = (
      id: string,
      target: 'position' | 'order',
      field: 'entry' | 'sl' | 'tp',
      price: number,
      color: string,
      style: LineStyle,
      title: string,
      draggable: boolean,
    ) => {
      const line = this.series!.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: style,
        axisLabelVisible: true,
        title,
      });
      this.tradeLines.push({ id, target, field, price, draggable, line });
    };

    for (const p of this.lastTradeView.positions) {
      const sideColor = p.side === 'buy' ? this.up : this.down;
      const label = `${p.side === 'buy' ? 'C' : 'V'} ${p.lots}`;
      add(p.id, 'position', 'entry', p.entryPrice, sideColor, LineStyle.Solid, label, false);
      add(p.id, 'position', 'sl', p.sl, this.down, LineStyle.Dashed, 'SL', true);
      if (p.tp !== null) add(p.id, 'position', 'tp', p.tp, this.up, LineStyle.Dashed, 'TP', true);
    }
    for (const o of this.lastTradeView.orders) {
      const label = `${o.side === 'buy' ? 'C' : 'V'} ${o.type} ${o.lots}`;
      add(o.id, 'order', 'entry', o.entryPrice, this.accent, LineStyle.LargeDashed, label, true);
      add(o.id, 'order', 'sl', o.sl, this.down, LineStyle.Dashed, 'SL', true);
      if (o.tp !== null) add(o.id, 'order', 'tp', o.tp, this.up, LineStyle.Dashed, 'TP', true);
    }
  }

  /** Syncs the TP/SL zone boxes (one per trade) to their primitive. */
  private pushTradeBoxes(): void {
    this.tradeBoxesPrimitive.setSource({
      items: this.tradeBoxes,
      shift: this.shiftSecs,
      times: this.renderedTimes,
      barSpacing: this.barSpacing,
      tpColor: this.tpZone,
      slColor: this.slZone,
      fillAlpha: this.boxFillAlpha,
      borderAlpha: this.boxBorderAlpha,
    });
  }

  /** ×-buttons on the entry line of every order/position (quick delete). */
  private pushTradeButtons(): void {
    this.tradeButtonsPrimitive.setSource({
      items: [
        ...this.lastTradeView.positions.map((p) => ({
          id: p.id,
          target: 'position' as const,
          price: p.entryPrice,
        })),
        ...this.lastTradeView.orders.map((o) => ({
          id: o.id,
          target: 'order' as const,
          price: o.entryPrice,
        })),
      ],
      color: this.down,
    });
  }

  /** Pushes entry/exit markers, applying the display time-zone shift. */
  private applyTradeMarkers(): void {
    this.seriesMarkers?.setMarkers(
      this.tradeMarkers.map((m) => ({
        time: (m.time + this.shiftSecs) as UTCTimestamp,
        position: m.position,
        shape: m.shape,
        color: m.color === 'up' ? this.up : this.down,
        text: m.text,
      })),
    );
  }

  /** Draggable trade line under the cursor, if any. */
  private hitTestTradeLine(y: number): TradeLine | null {
    if (!this.series) return null;
    let best: TradeLine | null = null;
    let bestDist = LINE_GRAB_PX + 1;
    for (const tl of this.tradeLines) {
      if (!tl.draggable) continue;
      const ly = this.series.priceToCoordinate(tl.price);
      if (ly === null) continue;
      const dist = Math.abs(ly - y);
      if (dist <= LINE_GRAB_PX && dist < bestDist) {
        best = tl;
        bestDist = dist;
      }
    }
    return best;
  }

  /**
   * Dispatches the SL/TP/entry modification while dragging a trade level
   * (price line or live box edge) and refreshes the points readout banner.
   */
  private dragTradeLine(y: number): void {
    if (!this.lineDrag || !this.series) return;
    const raw = this.series.coordinateToPrice(y);
    if (raw === null) return;
    const price = this.roundToPoint(raw);
    const { id, target, field } = this.lineDrag;

    const position =
      target === 'position' ? this.lastTradeView.positions.find((p) => p.id === id) : undefined;
    const order =
      target === 'order' ? this.lastTradeView.orders.find((o) => o.id === id) : undefined;
    const trade = position ?? order;
    if (!trade) return;

    const entry = field === 'entry' ? price : trade.entryPrice;
    const sl = field === 'sl' ? price : trade.sl;
    // a pending order must keep its SL on the losing side of the entry
    if (order && (field === 'sl' || field === 'entry')) {
      if (order.side === 'buy' ? sl >= entry : sl <= entry) return;
    }

    const ctx = this.tradeCtx();
    this.zone.run(() => {
      this.dragInfo.set(this.dragReadout(field, price, entry, sl, order));
      if (target === 'position') {
        this.store.dispatch(TradingActions.modifyPosition({ id, [field]: price }));
      } else {
        const patch = field === 'entry' ? { entryPrice: price } : { [field]: price };
        this.store.dispatch(
          TradingActions.modifyOrder({ id, ...patch, contractSize: ctx.contractSize }),
        );
      }
    });
  }

  /** Ruler-style text for the drag banner: points, sized lots, R multiple. */
  private dragReadout(
    field: 'entry' | 'sl' | 'tp',
    price: number,
    entry: number,
    sl: number,
    order: PendingOrder | undefined,
  ): string {
    const pts = (a: number, b: number) => Math.round(Math.abs(a - b) / this.pointSize);
    if (field === 'tp') {
      const slDist = Math.abs(entry - sl);
      const r = slDist > 0 ? Math.abs(price - entry) / slDist : null;
      return `TP: ${pts(price, entry)} pts${r !== null ? ` (${r.toFixed(1)}R)` : ''}`;
    }
    const points = field === 'entry' ? pts(price, sl) : pts(price, entry);
    if (order) {
      // mirrors the reducer's re-sizing of pending orders (risk % constant)
      const ctx = this.tradeCtx();
      const lots = lotsForRisk(ctx.balance, order.riskPct, entry, sl, ctx.contractSize);
      const label = field === 'entry' ? 'Entrada' : 'SL';
      return `${label}: ${points} pts${lots > 0 ? ` · ${lots.toFixed(2)} lotes` : ''}`;
    }
    return `SL: ${points} pts`;
  }

  // ============ drawing ============

  /** Data point (real UTC) under the cursor; extrapolates into the future. */
  private pointAt(param: MouseEventParams<Time>): DrawingPoint | null {
    if (!param.point || !this.series || !this.chart) return null;
    const time = this.drawingsPrimitive.timeForX(param.point.x);
    const price = this.series.coordinateToPrice(param.point.y);
    if (time === null || price === null) return null;
    return { time, price };
  }

  private handleClick(param: MouseEventParams<Time>): void {
    // an active quick ruler: the next left click dismisses the measurement
    if (this.quickRuler) {
      this.clearQuickRuler();
      return;
    }
    // interactive order placement consumes clicks before any drawing logic
    if (this.placing()) {
      this.handlePlacingClick(param);
      return;
    }
    const tool = this.activeTool();
    const pt = this.pointAt(param);

    if (tool === 'none') {
      // selection by click
      if (!param.point) return;
      const hit = this.drawingsPrimitive.hitTestDrawing(param.point.x, param.point.y);
      this.store.dispatch(DrawingsActions.selectDrawing({ id: hit }));
      return;
    }

    if (!pt) return;
    if (!this.draftP1) {
      // first click: anchor
      this.draftP1 = pt;
      return;
    }
    // second click: complete the drawing (ignore the exact same point,
    // e.g. the click+dblclick pair of an accidental double click)
    if (pt.time === this.draftP1.time && pt.price === this.draftP1.price) return;
    const p2 = this.applySnap(this.draftP1, pt, tool as DrawingType);
    const drawing: Drawing = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      kind: tool as DrawingType,
      p1: this.draftP1,
      p2,
    };
    this.draftP1 = null;
    this.draft = null;
    this.store.dispatch(DrawingsActions.addDrawing({ drawing }));
  }

  private handleCrosshair(param: MouseEventParams<Time>): void {
    if (this.placing()) {
      this.updatePlacingHover(param);
      return;
    }
    // quick ruler follows the crosshair, reusing the ruler draft renderer
    if (this.quickRuler) {
      const pt = this.pointAt(param);
      if (pt) {
        this.draft = { id: '__quick_ruler__', kind: 'ruler', p1: this.quickRuler, p2: pt };
        this.pushDrawings();
      }
      return;
    }
    if (!this.draftP1) return;
    const tool = this.activeTool();
    if (tool === 'none') return;
    const pt = this.pointAt(param);
    if (!pt) return;
    this.draft = {
      id: '__draft__',
      kind: tool as DrawingType,
      p1: this.draftP1,
      p2: this.applySnap(this.draftP1, pt, tool as DrawingType),
    };
    this.pushDrawings();
  }

  /** Shift on the line tool = exact straight line (horizontal or vertical). */
  private applySnap(p1: DrawingPoint, p2: DrawingPoint, kind: DrawingType): DrawingPoint {
    if (kind !== 'line' || !this.shiftKey || !this.chart || !this.series) return p2;
    const ts = this.chart.timeScale();
    const x1 = ts.timeToCoordinate((p1.time + this.shiftSecs) as UTCTimestamp);
    const x2 = ts.timeToCoordinate((p2.time + this.shiftSecs) as UTCTimestamp);
    const y1 = this.series.priceToCoordinate(p1.price);
    const y2 = this.series.priceToCoordinate(p2.price);
    if (x1 === null || x2 === null || y1 === null || y2 === null) return p2;
    // snap to the dominant axis of the movement
    if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) {
      return { time: p2.time, price: p1.price }; // horizontal
    }
    return { time: p1.time, price: p2.price }; // vertical
  }

  // ============ drawing drag (move) and resize (endpoint handles) ============
  //
  // All dragging happens in PIXEL space: the original endpoints are captured
  // as screen coordinates at mousedown and translated by the mouse delta.
  // This keeps the shape size exactly constant while moving (time-delta based
  // dragging distorted shapes across weekend gaps). Chart panning/zooming is
  // disabled for the duration of the drag so the chart does not pan under
  // the object being dragged.

  private handleMouseDown(e: MouseEvent): void {
    // any interaction with the chart dismisses the context menu
    if (this.menu()) this.zone.run(() => this.menu.set(null));
    // middle button: start the ephemeral quick-ruler measurement
    if (e.button === 1) {
      e.preventDefault(); // blocks the browser's middle-click autoscroll
      if (this.placing() || this.draftP1 || this.activeTool() !== 'none' || !this.series) return;
      const rect = this.container.nativeElement.getBoundingClientRect();
      const time = this.drawingsPrimitive.timeForX(e.clientX - rect.left);
      const price = this.series.coordinateToPrice(e.clientY - rect.top);
      if (time !== null && price !== null) this.quickRuler = { time, price };
      return;
    }
    // an active quick ruler is dismissed by the next left click (handleClick)
    if (this.quickRuler) return;
    // while placing an order, clicks are handled by handlePlacingClick
    if (this.placing()) return;
    if (this.activeTool() !== 'none' || !this.chart || !this.series) return;
    const rect = this.container.nativeElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // ×-button on an entry line: cancel the order / close the position
    const del = this.tradeButtonsPrimitive.hitTestDelete(x, y);
    if (del) {
      const ctx = this.tradeCtx();
      this.zone.run(() => {
        if (del.target === 'order') {
          this.store.dispatch(TradingActions.cancelOrder({ id: del.id }));
        } else if (ctx.price !== null) {
          this.store.dispatch(
            TradingActions.closePosition({
              id: del.id,
              price: ctx.price,
              time: ctx.time,
              contractSize: ctx.contractSize,
            }),
          );
        }
      });
      e.preventDefault();
      return;
    }

    // resize handle of the selected drawing takes priority over moving
    const handle = this.drawingsPrimitive.hitTestHandle(x, y);
    let id: string | null = handle ? this.selectedId() : null;
    let mode: 'move' | 'p1' | 'p2' = handle ?? 'move';
    if (!id) {
      // trade lines (SL/TP/pending entry) go before drawing bodies: they are
      // thin and would be unreachable under a large rect/fib otherwise
      const tradeLine = this.hitTestTradeLine(y);
      if (tradeLine) {
        this.lineDrag = { id: tradeLine.id, target: tradeLine.target, field: tradeLine.field };
        this.engine?.setInteractivity(false);
        e.preventDefault();
        return;
      }
      // live trade-box edge (SL/TP): same drag pipeline as the price lines
      const edge = this.tradeBoxesPrimitive.hitTestEdge(x, y);
      if (edge) {
        this.lineDrag = {
          id: edge.id,
          target: edge.status === 'pending' ? 'order' : 'position',
          field: edge.field,
        };
        this.engine?.setInteractivity(false);
        e.preventDefault();
        return;
      }
      id = this.drawingsPrimitive.hitTestDrawing(x, y);
      mode = 'move';
    }
    if (!id) return;
    const d = this.drawings().find((it) => it.id === id);
    if (!d) return;

    const x1 = this.drawingsPrimitive.xForTime(d.p1.time);
    const x2 = this.drawingsPrimitive.xForTime(d.p2.time);
    const y1 = this.series.priceToCoordinate(d.p1.price);
    const y2 = this.series.priceToCoordinate(d.p2.price);
    if (x1 === null || x2 === null || y1 === null || y2 === null) return;

    this.zone.run(() => this.store.dispatch(DrawingsActions.selectDrawing({ id })));
    this.drag = { id, mode, startX: x, startY: y, x1, y1, x2, y2 };
    // freeze chart panning/zooming while dragging an object
    this.engine?.setInteractivity(false);
    e.preventDefault();
  }

  private handleDragMove(e: MouseEvent): void {
    if (!this.chart || !this.series) return;
    const rect = this.container.nativeElement.getBoundingClientRect();
    if (this.lineDrag) {
      this.dragTradeLine(e.clientY - rect.top);
      return;
    }
    // hover feedback: pointer over a ×-button, ns-resize over a trade line
    if (!this.drag) {
      if (this.activeTool() === 'none') {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        if (this.tradeButtonsPrimitive.hitTestDelete(x, y)) {
          this.container.nativeElement.style.cursor = 'pointer';
        } else {
          const over = this.hitTestTradeLine(y) ?? this.tradeBoxesPrimitive.hitTestEdge(x, y);
          this.container.nativeElement.style.cursor = over ? 'ns-resize' : '';
        }
      }
      return;
    }
    const dx = e.clientX - rect.left - this.drag.startX;
    const dy = e.clientY - rect.top - this.drag.startY;

    const pointFor = (sx: number, sy: number): DrawingPoint | null => {
      const time = this.drawingsPrimitive.timeForX(sx + dx);
      const price = this.series!.coordinateToPrice(sy + dy);
      return time !== null && price !== null ? { time, price } : null;
    };

    const d = this.drawings().find((it) => it.id === this.drag!.id);
    if (!d) return;
    let p1 = d.p1;
    let p2 = d.p2;
    if (this.drag.mode === 'move') {
      const n1 = pointFor(this.drag.x1, this.drag.y1);
      const n2 = pointFor(this.drag.x2, this.drag.y2);
      if (!n1 || !n2) return;
      p1 = n1;
      p2 = n2;
    } else if (this.drag.mode === 'p1') {
      const n = pointFor(this.drag.x1, this.drag.y1);
      if (!n) return;
      p1 = n;
    } else {
      const n = pointFor(this.drag.x2, this.drag.y2);
      if (!n) return;
      p2 = n;
    }
    const id = this.drag.id;
    this.zone.run(() => this.store.dispatch(DrawingsActions.moveDrawing({ id, p1, p2 })));
  }

  private endDrag(): void {
    if (!this.drag && !this.lineDrag) return;
    this.drag = null;
    this.lineDrag = null;
    this.zone.run(() => this.dragInfo.set(null));
    // restore chart panning/zooming
    this.engine?.setInteractivity(true);
  }

  /** Removes the ephemeral middle-click measurement from the chart. */
  private clearQuickRuler(): void {
    this.quickRuler = null;
    this.draft = null;
    this.pushDrawings();
  }

  /** Syncs the current state to the primitive and forces a repaint. */
  private pushDrawings(): void {
    this.drawingsPrimitive.setSource({
      items: this.drawings(),
      draft: this.draft,
      selectedId: this.selectedId(),
      shift: this.shiftSecs,
      times: this.renderedTimes,
      barSpacing: this.barSpacing,
      pointSize: this.pointSize,
      accent: this.accent,
      up: this.up,
      down: this.down,
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    const el = this.container.nativeElement;
    el.removeEventListener('mousedown', this.onMouseDown);
    el.removeEventListener('mousemove', this.onMouseMoveDom);
    el.removeEventListener('contextmenu', this.onContextMenu);
    el.removeEventListener('auxclick', this.onAuxClick);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.chart?.remove();
  }
}
