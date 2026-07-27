import { inject, Injectable, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { BehaviorSubject, combineLatest, Observable, ReplaySubject } from 'rxjs';
import { distinctUntilChanged, filter, map, startWith } from 'rxjs/operators';
import {
  selectChartStyle,
  selectChartView,
  selectCurrentAsset,
  selectCurrentTime,
  selectSeries,
  selectSessionEnd,
  selectTradeChartView,
  selectUtcOffset,
  selectResolutionMinutes,
  selectResolutionSeries,
  formatCountdown,
  TradeBoxItem as StateTradeBoxItem,
  TradeMarker as StateTradeMarker,
} from '../../state/selectors';
import {
  PendingOrder as StatePendingOrder,
  Position as StatePosition,
} from '../../state/trading/trading.models';
import { drawingsFeature } from '../../state/drawings/drawings.reducer';
import { Drawing as StateDrawing } from '../../state/drawings/drawings.models';
import { ownerKeyOf } from '../../state/drawings/drawing-ownership';
import { linkGroupsFeature } from '../../state/link-groups/link-groups.reducer';
import { LinkGroup } from '../../state/link-groups/link-groups.models';
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
import { lastIndexAtOrBefore, firstIndexAtOrAfter } from '../../state/trading/fill-engine';
import {
  effectivePanelSymbol,
  panelRendersTrades,
  PanelDescriptor,
} from '../../state/layout/layout.models';
import { Candle, Timeframe, TIMEFRAME_SECONDS } from '../../models';
import { generateCustomSeries } from '../../state/market/custom-timeframe';

function computeFormingCandle(
  resSeries: Candle[] | null,
  activeSeconds: number,
  cursor: number,
  minutes: number | null,
): Candle | null {
  if (minutes == null || !resSeries || activeSeconds <= 0 || cursor <= 0) return null;
  if (minutes * 60 >= activeSeconds) return null;
  const bucketStart = Math.floor(cursor / activeSeconds) * activeSeconds;
  const lo = firstIndexAtOrAfter(resSeries, bucketStart);
  const hi = lastIndexAtOrBefore(resSeries, cursor);
  if (hi < lo) return null;
  let high = resSeries[lo].high;
  let low = resSeries[lo].low;
  for (let i = lo + 1; i <= hi; i++) {
    if (resSeries[i].high > high) high = resSeries[i].high;
    if (resSeries[i].low < low) low = resSeries[i].low;
  }
  return {
    time: bucketStart,
    open: resSeries[lo].open,
    high,
    low,
    close: resSeries[hi].close,
  };
}

function computeCountdown(activeSeconds: number, currentTime: number): string | null {
  if (activeSeconds <= 0 || currentTime <= 0) return null;
  const bucketStart = Math.floor(currentTime / activeSeconds) * activeSeconds;
  return formatCountdown(bucketStart + activeSeconds - currentTime);
}

/**
 * RFC-008 (D8): the per-panel chart view derived by a panel-local mapper
 * instance from raw NgRx slices, parametrized by the panel's descriptor.
 */
export interface PanelChartView {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  idx: number;
  utcOffset: number;
}

/** A panel's composed drawing layer: its own set plus its group's shared one, already resolved and ordered. */
export interface PanelDrawingsView {
  items: readonly StateDrawing[];
  selectedId: string | null;
}

/**
 * Composes one panel's rendered drawing layer: local drawings union the
 * shared group layer (when linked AND that group has drawing sync on),
 * narrowed to this panel's symbol and visible flag, ordered by flat zIndex
 * with the id as a total-order tiebreak. A dangling link group resolves to
 * an empty shared layer rather than throwing. The panel's own selection is
 * re-resolved against the composed set: pointing at a drawing that fell out
 * of composition (deleted, hidden, wrong symbol, unlinked) renders as
 * unselected. `descriptor.hideSharedDrawings` drops the shared union for
 * THIS panel only — the entities and every other member panel's own
 * composition are untouched.
 */
export function composePanelDrawings(
  entities: Record<string, StateDrawing>,
  ownerIndex: Record<string, readonly string[]>,
  selection: Record<string, string | null>,
  groups: Record<string, LinkGroup>,
  descriptor: PanelDescriptor,
  currentAsset: string | null,
): PanelDrawingsView {
  const localIds = ownerIndex[ownerKeyOf({ type: 'panel', id: descriptor.id })] ?? [];
  const group = descriptor.linkGroupId != null ? groups[descriptor.linkGroupId] : undefined;
  const sharedIds =
    !descriptor.hideSharedDrawings && group?.syncDrawings && descriptor.linkGroupId != null
      ? (ownerIndex[ownerKeyOf({ type: 'group', id: descriptor.linkGroupId })] ?? [])
      : [];
  const ids = sharedIds.length ? [...localIds, ...sharedIds] : localIds;
  const symbol = effectivePanelSymbol(descriptor, currentAsset);
  const items = ids
    .map((id) => entities[id])
    .filter((d): d is StateDrawing => d != null && d.symbol === symbol && d.visible)
    .sort((a, b) => a.zIndex - b.zIndex || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const selected = selection[descriptor.id] ?? null;
  const selectedId = selected != null && items.some((d) => d.id === selected) ? selected : null;
  return { items, selectedId };
}

/** This panel's gated trade overlay (RFC-018 T-1/T-2, D18.C): open positions, pending orders, markers, boxes. */
interface TradeChartView {
  positions: Position[];
  orders: PendingOrder[];
  markers: TradeMarker[];
  boxes: TradeBoxItem[];
}

/**
 * Builds a frozen empty array typed as `T[]` for a render-domain array field. `Object.freeze`
 * widens the static type to `readonly T[]`; the cast back to `T[]` is confined to this one
 * helper so `TradeChartView`'s fields keep the plain mutable element type every existing
 * consumer (`ChartComponent`, the builder methods, the engine) already expects — the runtime
 * freeze is unaffected by the cast.
 */
function frozenEmptyArray<T>(): T[] {
  const empty: T[] = [];
  return Object.freeze(empty) as T[];
}

/**
 * RFC-018 (R18-3) — the single shared gate-closed emission for `tradeChartView$`. Allocated
 * exactly ONCE at module load, never mutated, and returned by reference (never spread or
 * cloned) on every gate-closed tick, for two reasons:
 *
 * 1. It IS the invariant detector: two consecutive gate-closed emissions must be the exact
 *    same object (`toBe`, not `toEqual`) — a fresh `{ positions: [], … }` literal per tick
 *    would make that assertion meaningless.
 * 2. A fresh literal per tick would defeat the engine's referential short-circuit and
 *    reintroduce per-frame allocation on a path RFC-017 §4 requires to cost zero ("cero
 *    asignaciones en el camino sin cambios") — a panel with its trade layer gated closed
 *    (a foreign symbol, or `hideTrades`) sits on this path for the entire replay session.
 *
 * `Object.freeze` on the outer object AND each inner array means a consumer mutation
 * attempt (`view.positions.push(...)`, `view.orders = [...]`) throws `TypeError` at runtime
 * — this app compiles to ES modules, which execute in strict mode unconditionally — instead
 * of silently corrupting the shared instance for every other gate-closed panel.
 */
const EMPTY_TRADE_CHART_VIEW: TradeChartView = Object.freeze({
  positions: frozenEmptyArray<Position>(),
  orders: frozenEmptyArray<PendingOrder>(),
  markers: frozenEmptyArray<TradeMarker>(),
  boxes: frozenEmptyArray<TradeBoxItem>(),
});

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

  /** Descriptor of the panel this instance serves (ReplaySubject: late-subscription safe). */
  private readonly panelDescriptor$ = new ReplaySubject<PanelDescriptor>(1);

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

  /**
   * Memoizes a single-object transformation to preserve reference equality
   * across emissions if the input object reference hasn't changed.
   */
  private memoizeObject<I, O>(mapFn: (input: I) => O): (input: I) => O {
    let lastInput: I | null = null;
    let lastOutput: O | null = null;
    return (input: I) => {
      if (input === lastInput) return lastOutput!;
      lastInput = input;
      lastOutput = mapFn(input);
      return lastOutput;
    };
  }

  /** RFC-009 (D6): update-gating switch — true by default (visible panel). */
  private readonly updatesEnabled$ = new BehaviorSubject<boolean>(true);

  setUpdatesEnabled(enabled: boolean): void {
    if (this.updatesEnabled$.value !== enabled) this.updatesEnabled$.next(enabled);
  }

  /**
   * Pauses the stream while updates are disabled and replays the LATEST
   * upstream value on re-enable (distinctUntilChanged suppresses the replay
   * when nothing changed while hidden — the engine already painted it).
   */
  private gated<T>(): (source: Observable<T>) => Observable<T> {
    return (source) =>
      combineLatest([source, this.updatesEnabled$]).pipe(
        filter(([, enabled]) => enabled),
        map(([value]) => value),
        distinctUntilChanged(),
      );
  }

  // ───────── selector observables ─────────

  /**
   * Normalizes the state-owned `ChartColors` into the domain-owned shape.
   * Memoized on the `style.colors` reference so unrelated `chartStyle$`
   * emissions (e.g. `gridOpacity` changes) don't allocate a new object —
   * `TradingCapability.render()` short-circuits on `colors` referential
   * identity, and a fresh object here would defeat that and force a full
   * price-line rebuild on every style emission.
   */
  private mapColors = this.memoizeObject((colors: ChartColors) => ({
    upColor: colors.upColor,
    downColor: colors.downColor,
    wickUp: colors.wickUp,
    wickDown: colors.wickDown,
    borderUpColor: colors.borderUpColor,
    borderDownColor: colors.borderDownColor,
    background: colors.background,
    grid: colors.grid,
    text: colors.text,
    crosshair: colors.crosshair,
    tpZone: colors.tpZone,
    slZone: colors.slZone,
  }));

  /** Same reference-stability guarantee as `mapColors`, for trade-box opacity. */
  private mapTradeBoxOpacity = this.memoizeObject((opacity: TradeBoxOpacity) => ({
    fill: opacity.fill,
    border: opacity.border,
  }));

  /** Chart styling data: colors, grid visibility/opacity, trade-box opacity. */
  readonly chartStyle$: Observable<{
    colors: ChartColors;
    gridVisible: boolean;
    gridOpacity: number;
    tradeBoxOpacity: TradeBoxOpacity;
  }> = this.store.select(selectChartStyle).pipe(
    map((style) => ({
      colors: this.mapColors(style.colors),
      gridVisible: style.gridVisible,
      gridOpacity: style.gridOpacity,
      tradeBoxOpacity: this.mapTradeBoxOpacity(style.tradeBoxOpacity),
    })),
    this.gated(),
  );

  /** Consistent chart view: TF label, candles, visible index, UTC offset, forming candle, countdown. */
  readonly chartView$: Observable<{
    tf: string | null;
    candles: import('../../models').Candle[];
    idx: number;
    utcOffset: number;
    forming: import('../../models').Candle | null;
    countdown: string | null;
  }> = combineLatest([
    this.panelDescriptor$.pipe(startWith(null)),
    this.store.select(selectSeries),
    this.store.select(selectCurrentTime),
    this.store.select(selectUtcOffset),
    this.store.select(selectResolutionMinutes),
    this.store.select(selectResolutionSeries),
    this.store.select(selectChartView),
  ]).pipe(
    map(
      ([
        descriptor,
        series,
        currentTime,
        utcOffset,
        resolutionMinutes,
        resolutionSeries,
        globalChartView,
      ]) => {
        if (!descriptor) {
          return globalChartView;
        }
        const tf = descriptor.timeframe;
        let candles = series[tf] ?? [];
        let activeSeconds = TIMEFRAME_SECONDS[tf] ?? 0;
        if (candles.length === 0 && tf.startsWith('M')) {
          const minutes = parseInt(tf.substring(1), 10);
          if (!isNaN(minutes)) {
            candles = generateCustomSeries(series, minutes);
            activeSeconds = minutes * 60;
          }
        }
        const idx = lastIndexAtOrBefore(candles, currentTime);
        const forming = computeFormingCandle(
          resolutionSeries,
          activeSeconds,
          currentTime,
          resolutionMinutes,
        );
        const countdown = computeCountdown(activeSeconds, currentTime);
        if (resolutionMinutes != null && forming != null && idx >= 0) {
          return { tf, candles, idx: idx - 1, utcOffset, forming, countdown };
        }
        return { tf, candles, idx, utcOffset, forming: null, countdown };
      },
    ),
    this.gated(),
  );

  private mapPositions = this.memoizeMap((p: StatePosition) => ({
    id: p.id,
    side: p.side,
    entryPrice: p.entryPrice,
    sl: p.sl,
    tp: p.tp,
    lots: p.lots,
    openTime: p.openTime,
    origin: p.origin,
    declaredRuleId: p.declaredRuleId ?? null,
  }));
  private mapOrders = this.memoizeMap((o: StatePendingOrder) => ({
    id: o.id,
    side: o.side,
    type: o.type,
    entryPrice: o.entryPrice,
    sl: o.sl,
    tp: o.tp,
    lots: o.lots,
    declaredRuleId: o.declaredRuleId ?? null,
  }));
  private mapMarkers = this.memoizeMap((m: StateTradeMarker) => ({
    time: m.time,
    position: m.position,
    shape: m.shape,
    color: m.color,
    text: m.text,
  }));
  private mapBoxes = this.memoizeMap((b: StateTradeBoxItem) => ({
    id: b.id,
    status: b.status,
    side: b.side,
    entry: b.entry,
    sl: b.sl,
    tp: b.tp,
    from: b.from,
    to: b.to,
    hidden: b.hidden,
  }));

  /**
   * Trade-gate memo slot (RFC-018 D18.C): keyed on exactly 3 references — the panel
   * descriptor, the raw slice from `selectTradeChartView`, and `currentAsset`. Deliberately
   * excludes `groups` (RFC-018 §4.3): pulling the whole groups record in would invalidate
   * every panel's trade layer whenever any group's colour changes elsewhere in the
   * workspace. One slot per mapper instance — the same discipline as `lastDrawingsInputs`.
   */
  private lastTradeInputs: {
    descriptor: PanelDescriptor | null;
    data: {
      positions: StatePosition[];
      orders: StatePendingOrder[];
      markers: StateTradeMarker[];
      boxes: StateTradeBoxItem[];
    };
    currentAsset: string | null;
  } | null = null;
  private lastTradeChartView: TradeChartView | null = null;

  /**
   * Trade overlay: open positions, pending orders, markers, boxes — gated per panel by
   * `panelRendersTrades` (RFC-018 T-1 symbol invariant ∧ T-2 `hideTrades` preference). Until
   * this RFC the stream had no panel awareness at all: every panel painted the book's
   * trades, including one showing a different instrument.
   *
   * R18-1: `panelDescriptor$` is a `ReplaySubject(1)` that emits only after `configurePanel`.
   * `startWith(null)` makes an unconfigured mapper gate CLOSED rather than stay silent — a
   * single frame of trade ink on an as-yet-unidentified pane would be a false statement
   * about the market (T-1 is a correctness invariant, not a preference). The one-frame
   * delay before ink appears on a freshly configured panel is harmless; the inverse is not.
   * This deliberately differs from `panelDrawings$`, which simply does not emit until
   * configured — a drawing layer with no data yet is not a false statement.
   *
   * Gate open: the existing four `memoizeMap` calls run exactly as before this RFC, so every
   * pre-existing reference-stability guarantee on the four arrays survives verbatim. Gate
   * closed: emits the single shared `EMPTY_TRADE_CHART_VIEW` (R18-3), never a fresh literal.
   */
  readonly tradeChartView$: Observable<TradeChartView> = combineLatest([
    this.panelDescriptor$.pipe(startWith(null)),
    this.store.select(selectTradeChartView),
    this.store.select(selectCurrentAsset),
  ]).pipe(
    map(([descriptor, data, currentAsset]) => {
      const last = this.lastTradeInputs;
      if (
        last &&
        last.descriptor === descriptor &&
        last.data === data &&
        last.currentAsset === currentAsset
      ) {
        return this.lastTradeChartView!;
      }
      this.lastTradeInputs = { descriptor, data, currentAsset };
      this.lastTradeChartView =
        descriptor != null && panelRendersTrades(descriptor, currentAsset)
          ? {
              positions: this.mapPositions(data.positions) as Position[],
              orders: this.mapOrders(data.orders) as PendingOrder[],
              markers: this.mapMarkers(data.markers) as TradeMarker[],
              boxes: this.mapBoxes(data.boxes) as TradeBoxItem[],
            }
          : EMPTY_TRADE_CHART_VIEW;
      return this.lastTradeChartView;
    }),
    this.gated(),
  );

  /** Session end UTC timestamp (signal). */
  readonly sessionEnd = this.store.selectSignal(selectSessionEnd);

  /** Session end as observable (for subscription-based session indicator repaint). */
  readonly sessionEnd$: Observable<number | null> = this.store
    .select(selectSessionEnd)
    .pipe(this.gated());

  /** Composition memo slot: keyed on the six input references, one per mapper instance. */
  private lastDrawingsInputs: {
    descriptor: PanelDescriptor;
    entities: Record<string, StateDrawing>;
    ownerIndex: Record<string, readonly string[]>;
    selection: Record<string, string | null>;
    groups: Record<string, LinkGroup>;
    currentAsset: string | null;
  } | null = null;
  private lastDrawingsView: PanelDrawingsView | null = null;

  /**
   * This panel's composed drawing layer, recomputed only when one of the six
   * upstream references actually changes (never per frame, never per replay
   * tick) — the same reference-keyed memo discipline as `panelChartView$`,
   * applied to `composePanelDrawings` instead of candle geometry. The active
   * asset resolves the panel's `''` sentinel symbol (`effectivePanelSymbol`)
   * so a hot-added or freshly opened panel composes drawings from the first
   * emission, not only once its own symbol is explicitly set.
   */
  readonly panelDrawings$: Observable<PanelDrawingsView> = combineLatest([
    this.panelDescriptor$,
    this.store.select(drawingsFeature.selectEntities),
    this.store.select(drawingsFeature.selectOwnerIndex),
    this.store.select(drawingsFeature.selectSelection),
    this.store.select(linkGroupsFeature.selectGroups),
    this.store.select(selectCurrentAsset),
  ]).pipe(
    map(([descriptor, entities, ownerIndex, selection, groups, currentAsset]) => {
      const last = this.lastDrawingsInputs;
      if (
        last &&
        last.descriptor === descriptor &&
        last.entities === entities &&
        last.ownerIndex === ownerIndex &&
        last.selection === selection &&
        last.groups === groups &&
        last.currentAsset === currentAsset
      ) {
        return this.lastDrawingsView!;
      }
      this.lastDrawingsInputs = { descriptor, entities, ownerIndex, selection, groups, currentAsset };
      this.lastDrawingsView = composePanelDrawings(
        entities,
        ownerIndex,
        selection,
        groups,
        descriptor,
        currentAsset,
      );
      return this.lastDrawingsView;
    }),
    this.gated(),
  );

  // ───────── RFC-008: per-panel parametrized derivation (D8) ─────────

  /** One memo slot per mapper instance — N panels ⇒ N independent memoizers. */
  private lastPanelInputs: {
    descriptor: PanelDescriptor;
    candles: Candle[] | undefined;
    currentTime: number;
    utcOffset: number;
  } | null = null;
  private lastPanelView: PanelChartView | null = null;

  /** Parametrizes this instance with its panel's identity. Idempotent. */
  configurePanel(descriptor: PanelDescriptor): void {
    this.panelDescriptor$.next(descriptor);
  }

  /** This panel's identity as a signal; null until `configurePanel` has run. */
  readonly descriptor: Signal<PanelDescriptor | null> = toSignal(this.panelDescriptor$, {
    initialValue: null,
  });

  /** Pure recompute — spied on by the RFC-008 isolation test; called on memo miss only. */
  private computePanelView(
    descriptor: PanelDescriptor,
    candles: Candle[],
    currentTime: number,
    utcOffset: number,
  ): PanelChartView {
    return {
      symbol: descriptor.symbol,
      timeframe: descriptor.timeframe,
      candles,
      idx: lastIndexAtOrBefore(candles, currentTime),
      utcOffset,
    };
  }

  /**
   * Per-panel view composed with `combineLatest` over RAW slice selectors and
   * memoized per instance. Deliberately NOT a shared NgRx factory selector
   * (`selectChartView(panelId)`): a single-slot memo receiving alternating
   * panelIds would invalidate on every tick (0% hit rate) — the P1 defect this
   * RFC forbids re-introducing. Emissions are reference-stable when this
   * panel's own inputs did not change.
   */
  readonly panelChartView$: Observable<PanelChartView> = combineLatest([
    this.panelDescriptor$,
    this.store.select(selectSeries),
    this.store.select(selectCurrentTime),
    this.store.select(selectUtcOffset),
  ]).pipe(
    map(([descriptor, series, currentTime, utcOffset]) => {
      const tf = descriptor.timeframe;
      let candles = series[tf];
      if ((!candles || candles.length === 0) && tf.startsWith('M')) {
        const minutes = parseInt(tf.substring(1), 10);
        if (!isNaN(minutes)) {
          candles = generateCustomSeries(series, minutes);
        }
      }
      const last = this.lastPanelInputs;
      if (
        last &&
        last.descriptor === descriptor &&
        last.candles === candles &&
        last.currentTime === currentTime &&
        last.utcOffset === utcOffset
      ) {
        return this.lastPanelView!;
      }
      this.lastPanelInputs = { descriptor, candles, currentTime, utcOffset };
      this.lastPanelView = this.computePanelView(descriptor, candles ?? [], currentTime, utcOffset);
      return this.lastPanelView;
    }),
    distinctUntilChanged(),
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
    ruleSlotMap?: Record<string, number | null>,
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
      ruleSlotMap,
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
    color = '#7b7b7b',
  ): SessionModel {
    return { sessionEnd, shift, times, barSpacing, color };
  }

  /**
   * Assembles the `CountdownModel` DTO for the price-axis countdown tag.
   */
  buildCountdownModel(
    price: number | null,
    text: string | null,
    backColor = '#363a45',
    textColor = '#ffffff',
  ): CountdownModel {
    return { price, text, backColor, textColor };
  }
}
