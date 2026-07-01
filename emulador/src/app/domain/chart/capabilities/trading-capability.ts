import { Capability } from '../capability';
import {
  IChartApi,
  ISeriesApi,
  IPriceLine,
  ISeriesMarkersPluginApi,
  LineStyle,
  Time,
  UTCTimestamp,
  createSeriesMarkers,
} from 'lightweight-charts';
import { ChartEventBus } from '../chart-event-bus';
import { RenderModel } from '../render-model';
import { TradeBoxesPrimitive } from './trade-boxes-primitive';
import { TradeButtonsPrimitive, TradeButton } from './trade-buttons-primitive';
import { CHART_ACCENT } from '../../../state/settings/settings.models';

export interface TradeLine {
  id: string;
  target: 'position' | 'order';
  field: 'entry' | 'sl' | 'tp';
  price: number;
  draggable: boolean;
  line: IPriceLine;
}

export class TradingCapability implements Capability {
  public readonly id = 'trading';
  private chart: IChartApi | null = null;
  private bus: ChartEventBus | null = null;

  private tradeBoxesPrimitive = new TradeBoxesPrimitive();
  private tradeButtonsPrimitive = new TradeButtonsPrimitive();
  private seriesMarkers?: ISeriesMarkersPluginApi<Time>;
  private tradeLines: TradeLine[] = [];
  private destroyed = false;

  constructor(private series: ISeriesApi<'Candlestick'>) {}

  public init(chart: IChartApi, bus: ChartEventBus): void {
    if (this.destroyed || this.chart) return;
    this.chart = chart;
    this.bus = bus;

    this.series.attachPrimitive(this.tradeBoxesPrimitive);
    this.series.attachPrimitive(this.tradeButtonsPrimitive);
    this.seriesMarkers = createSeriesMarkers(this.series, []);
  }

  public render(model: Partial<RenderModel>): void {
    if (!model.trading) return;
    const t = model.trading;

    // 1. Update Trade Boxes
    this.tradeBoxesPrimitive.setSource({
      items: t.boxes,
      shift: t.shift,
      times: t.times,
      barSpacing: t.barSpacing,
      tpColor: t.colors.tpZone,
      slColor: t.colors.slZone,
      fillAlpha: t.opacity.fill,
      borderAlpha: t.opacity.border,
    });

    // 2. Update Trade Buttons
    this.tradeButtonsPrimitive.setSource({
      items: [
        ...t.positions.map((p) => ({
          id: p.id,
          target: 'position' as const,
          price: p.entryPrice,
        })),
        ...t.pendingOrders.map((o) => ({
          id: o.id,
          target: 'order' as const,
          price: o.entryPrice,
        })),
      ],
      color: t.colors.downColor,
    });

    // 3. Update Price Lines
    for (const tl of this.tradeLines) {
      this.series.removePriceLine(tl.line);
    }
    this.tradeLines = [];

    const addPriceLine = (
      id: string,
      target: 'position' | 'order',
      field: 'entry' | 'sl' | 'tp',
      price: number,
      color: string,
      style: LineStyle,
      title: string,
      draggable: boolean,
    ) => {
      const line = this.series.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: style,
        axisLabelVisible: true,
        title,
      });
      this.tradeLines.push({ id, target, field, price, draggable, line });
    };

    for (const p of t.positions) {
      const sideColor = p.side === 'buy' ? t.colors.upColor : t.colors.downColor;
      const label = `${p.side === 'buy' ? 'C' : 'V'} ${p.lots}`;
      addPriceLine(p.id, 'position', 'entry', p.entryPrice, sideColor, LineStyle.Solid, label, false);
      addPriceLine(p.id, 'position', 'sl', p.sl, t.colors.downColor, LineStyle.Dashed, 'SL', true);
      if (p.tp !== null) {
        addPriceLine(p.id, 'position', 'tp', p.tp, t.colors.upColor, LineStyle.Dashed, 'TP', true);
      }
    }
    for (const o of t.pendingOrders) {
      const label = `${o.side === 'buy' ? 'C' : 'V'} ${o.type} ${o.lots}`;
      addPriceLine(o.id, 'order', 'entry', o.entryPrice, CHART_ACCENT, LineStyle.LargeDashed, label, true);
      addPriceLine(o.id, 'order', 'sl', o.sl, t.colors.downColor, LineStyle.Dashed, 'SL', true);
      if (o.tp !== null) {
        addPriceLine(o.id, 'order', 'tp', o.tp, t.colors.upColor, LineStyle.Dashed, 'TP', true);
      }
    }

    // 4. Update Markers
    this.seriesMarkers?.setMarkers(
      t.markers.map((m) => ({
        time: (m.time + t.shift) as UTCTimestamp,
        position: m.position,
        shape: m.shape,
        color: m.color === 'up' ? t.colors.upColor : t.colors.downColor,
        text: m.text,
      })),
    );
  }

  public hitTestBox(x: number, y: number): { id: string } | null {
    return this.tradeBoxesPrimitive.hitTestBox(x, y);
  }

  public hitTestEdge(
    x: number,
    y: number,
  ): { id: string; status: 'open' | 'pending'; field: 'sl' | 'tp' } | null {
    return this.tradeBoxesPrimitive.hitTestEdge(x, y);
  }

  public hitTestDelete(x: number, y: number): TradeButton | null {
    return this.tradeButtonsPrimitive.hitTestDelete(x, y);
  }

  public hitTestTradeLine(y: number): TradeLine | null {
    const grabPx = 4;
    let best: TradeLine | null = null;
    let bestDist = grabPx + 1;
    for (const tl of this.tradeLines) {
      if (!tl.draggable) continue;
      const ly = this.series.priceToCoordinate(tl.price);
      if (ly === null) continue;
      const dist = Math.abs(ly - y);
      if (dist <= grabPx && dist < bestDist) {
        best = tl;
        bestDist = dist;
      }
    }
    return best;
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    this.series.detachPrimitive(this.tradeBoxesPrimitive);
    this.series.detachPrimitive(this.tradeButtonsPrimitive);
    if (this.seriesMarkers) {
      this.seriesMarkers.detach();
      this.seriesMarkers = undefined;
    }
    for (const tl of this.tradeLines) {
      this.series.removePriceLine(tl.line);
    }
    this.tradeLines = [];
    this.chart = null;
    this.bus = null;
  }
}
