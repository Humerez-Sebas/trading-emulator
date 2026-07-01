import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  selectChartStyle,
  selectChartView,
  selectSessionEnd,
  selectTradeChartView,
  TradeBoxItem as StateTradeBoxItem,
  TradeMarker as StateTradeMarker,
} from '../../state/selectors';
import { drawingsFeature } from '../../state/drawings/drawings.reducer';
import { Drawing as StateDrawing, DrawingTool as StateDrawingTool } from '../../state/drawings/drawings.models';
import { ChartColors as StateChartColors, TradeBoxOpacity as StateTradeBoxOpacity } from '../../state/settings/settings.models';
import { Position as StatePosition, PendingOrder as StatePendingOrder } from '../../state/trading/trading.models';
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
@Injectable({ providedIn: 'root' })
export class ChartModelMapper {
  private readonly store = inject(Store);

  // ───────── selector observables ─────────

  /** Chart styling data: colors, grid visibility/opacity, trade-box opacity. */
  readonly chartStyle$: Observable<{
    colors: ChartColors;
    gridVisible: boolean;
    gridOpacity: number;
    tradeBoxOpacity: TradeBoxOpacity;
  }> = this.store.select(selectChartStyle).pipe(
    map(style => ({
      colors: style.colors as ChartColors,
      gridVisible: style.gridVisible,
      gridOpacity: style.gridOpacity,
      tradeBoxOpacity: style.tradeBoxOpacity as TradeBoxOpacity,
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

  /** Trade overlay: open positions, pending orders, markers, boxes. */
  readonly tradeChartView$: Observable<{
    positions: Position[];
    orders: PendingOrder[];
    markers: TradeMarker[];
    boxes: TradeBoxItem[];
  }> = this.store.select(selectTradeChartView).pipe(
    map(data => ({
      positions: data.positions as unknown as Position[],
      orders: data.orders as unknown as PendingOrder[],
      markers: data.markers as unknown as TradeMarker[],
      boxes: data.boxes as unknown as TradeBoxItem[],
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
