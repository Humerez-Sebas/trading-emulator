import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  selectChartStyle,
  selectChartView,
  selectSessionEnd,
  selectTradeChartView,
} from '../../state/selectors';
import { drawingsFeature } from '../../state/drawings/drawings.reducer';
import {
  CountdownModel,
  DrawingsModel,
  SessionModel,
  TradingModel,
  Drawing,
  DrawingTool,
  Position,
  PendingOrder,
  TradeBoxItem,
  TradeMarker,
  ChartColors,
  TradeBoxOpacity,
} from '../../domain/chart/render-model';

/**
 * Anti-Corruption Layer (ACL) between NgRx state and the chart render domain.
 *
 * Centralizes the store selector subscriptions that feed the chart's render
 * models (`DrawingsModel`, `TradingModel`, `SessionModel`, `CountdownModel`)
 * and provides pure builder methods that assemble those DTOs from component-
 * local state and selector data.
 *
 * The `ChartComponent` injects this mapper, subscribes to its observables /
 * signals, and delegates model construction to the builder methods before
 * forwarding the DTOs to `ChartEngine.render()`.
 */
@Injectable()
export class ChartModelMapper {
  private readonly store = inject(Store);

  /** 
   * Memoizes array transformations to preserve reference equality across emissions
   * if the input array reference hasn't changed.
   */
  private memoizeMap<T, R>(mapFn: (item: T) => R): (items: T[]) => R[] {
    let lastInput: T[] | null = null;
    let lastOutput: R[] | null = null;
    return (items: T[]) => {
      if (items === lastInput) return lastOutput!;
      lastInput = items;
      lastOutput = items.map(mapFn);
      return lastOutput;
    };
  }

  // ───────── selector observables ─────────

  /** Chart styling data: colors, grid visibility/opacity, trade-box opacity. */
  readonly chartStyle$: Observable<{
    colors: ChartColors;
    gridVisible: boolean;
    gridOpacity: number;
    tradeBoxOpacity: TradeBoxOpacity;
  }> = this.store.select(selectChartStyle).pipe(
    map(style => ({
      colors: {
        upColor: style.colors.upColor,
        downColor: style.colors.downColor,
        wickUp: style.colors.wickUp,
        wickDown: style.colors.wickDown,
        borderUpColor: style.colors.borderUpColor,
        borderDownColor: style.colors.borderDownColor,
        background: style.colors.background,
        grid: style.colors.grid,
        text: style.colors.text,
        crosshair: style.colors.crosshair,
        tpZone: style.colors.tpZone,
        slZone: style.colors.slZone,
      },
      gridVisible: style.gridVisible,
      gridOpacity: style.gridOpacity,
      tradeBoxOpacity: {
        fill: style.tradeBoxOpacity.fill,
        border: style.tradeBoxOpacity.border,
      },
    }))
  );

  /** Consistent chart view: TF label, candles, visible index, UTC offset, forming candle, countdown. */
  readonly chartView$: Observable<{
    tf: string | null;
    candles: import('../../models').Candle[];
    idx: number;
    utcOffset: number;
    forming: import('../../models').Candle | null;
    countdown: string | null;
  }> = this.store.select(selectChartView);

  private mapPositions = this.memoizeMap((p: any) => ({
    id: p.id, side: p.side, entryPrice: p.entryPrice, sl: p.sl, tp: p.tp,
    lots: p.lots, openTime: p.openTime, origin: p.origin,
  }));
  private mapOrders = this.memoizeMap((o: any) => ({
    id: o.id, side: o.side, type: o.type, entryPrice: o.entryPrice,
    sl: o.sl, tp: o.tp, lots: o.lots,
  }));
  private mapMarkers = this.memoizeMap((m: any) => ({
    time: m.time, position: m.position, shape: m.shape, color: m.color, text: m.text,
  }));
  private mapBoxes = this.memoizeMap((b: any) => ({
    id: b.id, status: b.status, side: b.side, entry: b.entry, sl: b.sl, tp: b.tp,
    from: b.from, to: b.to, hidden: b.hidden,
  }));

  /** Trade overlay: open positions, pending orders, markers, boxes. */
  readonly tradeChartView$: Observable<{
    positions: Position[];
    orders: PendingOrder[];
    markers: TradeMarker[];
    boxes: TradeBoxItem[];
  }> = this.store.select(selectTradeChartView).pipe(
    map(data => ({
      positions: this.mapPositions(data.positions) as Position[],
      orders: this.mapOrders(data.orders) as PendingOrder[],
      markers: this.mapMarkers(data.markers) as TradeMarker[],
      boxes: this.mapBoxes(data.boxes) as TradeBoxItem[],
    }))
  );

  /** Session end UTC timestamp (signal). */
  readonly sessionEnd = this.store.selectSignal(selectSessionEnd);

  /** Session end as observable (for subscription-based session indicator repaint). */
  readonly sessionEnd$: Observable<number | null> = this.store.select(selectSessionEnd);

  /** Drawings state changes (triggers full drawings repaint). */
  readonly drawingsState$: Observable<unknown> = this.store.select(
    drawingsFeature.selectDrawingsState,
  );

  // ───────── model builders ─────────

  /**
   * Assembles the `DrawingsModel` DTO from the component's local chart state
   * and the drawings slice signals.
   */
  buildDrawingsModel(
    items: Drawing[],
    activeTool: DrawingTool,
    selectedId: string | null,
    draft: Drawing | null,
    shift: number,
    times: number[],
    barSpacing: number,
    pointSize: number,
    colors: { accent: string; up: string; down: string },
  ): DrawingsModel {
    return {
      items,
      activeTool,
      selectedId,
      draft,
      shift,
      times,
      barSpacing,
      pointSize,
      colors,
    };
  }

  /**
   * Assembles the `TradingModel` DTO from the component's local trade-overlay
   * state and the trading selector data.
   */
  buildTradingModel(
    positions: Position[],
    pendingOrders: PendingOrder[],
    boxes: TradeBoxItem[],
    markers: TradeMarker[],
    shift: number,
    times: number[],
    barSpacing: number,
    colors: ChartColors,
    opacity: TradeBoxOpacity,
  ): TradingModel {
    return {
      positions,
      pendingOrders,
      boxes,
      markers,
      shift,
      times,
      barSpacing,
      colors,
      opacity,
    };
  }

  /**
   * Assembles the `SessionModel` DTO from the session-end signal and
   * the component's local chart geometry state.
   */
  buildSessionModel(
    sessionEnd: number | null,
    shift: number,
    times: number[],
    barSpacing: number,
    color: string = '#7b7b7b',
  ): SessionModel {
    return { sessionEnd, shift, times, barSpacing, color };
  }

  /**
   * Assembles the `CountdownModel` DTO for the price-axis countdown tag.
   */
  buildCountdownModel(
    price: number | null,
    text: string | null,
    backColor: string = '#363a45',
    textColor: string = '#ffffff',
  ): CountdownModel {
    return { price, text, backColor, textColor };
  }
}
