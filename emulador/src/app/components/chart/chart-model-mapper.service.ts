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
  selectTradeMarkers,
  selectTradeBoxes,
  selectTradeBoxesVisible,
  selectUtcOffset,
  selectReplayTfSeconds,
  selectReplaySeries,
  formatCountdown,
  TradeBoxItem as StateTradeBoxItem,
  TradeMarker as StateTradeMarker,
} from '../../state/selectors';
import {
  ClosedTrade,
  PendingOrder as StatePendingOrder,
  Position as StatePosition,
} from '../../state/trading/trading.models';
import { tradingFeature } from '../../state/trading/trading.reducer';
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
import { lastIndexAtOrBefore } from '../../state/trading/fill-engine';
import { aggregateFormingCandle } from '../../state/market/forming-candle';
import {
  effectivePanelSymbol,
  panelRendersTrades,
  panelTracksPrimarySeries,
  PanelDescriptor,
} from '../../state/layout/layout.models';
import { Candle, Timeframe, TIMEFRAME_SECONDS } from '../../models';
import { generateCustomSeries } from '../../state/market/custom-timeframe';

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
 * RFC-018 F3 — shared stable reference for "this panel has no candles yet" (unconfigured,
 * or its timeframe has no loaded/generated series). Reusing one module constant instead of
 * a fresh `[]` per miss keeps `resolvePanelCandles`'s cache reference-stable across repeat
 * misses on the same (series, timeframe) pair. Frozen like every other shared empty-array
 * placeholder in this file (`frozenEmptyArray`): it is now a SINGLE instance shared across
 * every `ChartModelMapper` instance (unlike the pre-F3 `candles ?? []` fallback, a fresh
 * throwaway literal per call), so an accidental downstream mutation would otherwise corrupt
 * every panel's "no data" placeholder silently instead of throwing.
 */
const EMPTY_CANDLES: Candle[] = frozenEmptyArray<Candle>();

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

  /**
   * RFC-019 (D19.H) — per-instance memo for the forming-candle aggregation, same
   * discipline as `lastCandlesInputs`/`lastCandlesOutput` below: `chartView$` recomputes
   * on ANY of its `combineLatest` inputs, not just the cursor, so an unrelated emission
   * (e.g. a style change) must not re-walk the bucket. Keyed on `cursor`, NOT
   * incrementally updated — a rewind is a cache miss by construction (R7), which is the
   * only correct behavior under jumps/rewind; an O(1) incremental form would silently
   * assume monotonic advance and is explicitly rejected (plan Step 4 / brief §7).
   */
  private lastFormingInputs: {
    series: Candle[] | null;
    bucketStart: number;
    cursor: number;
  } | null = null;
  private lastFormingOutput: Candle | null = null;

  private resolveForming(series: Candle[] | null, bucketStart: number, cursor: number): Candle | null {
    const last = this.lastFormingInputs;
    if (last && last.series === series && last.bucketStart === bucketStart && last.cursor === cursor) {
      return this.lastFormingOutput;
    }
    this.lastFormingInputs = { series, bucketStart, cursor };
    this.lastFormingOutput = aggregateFormingCandle(series, bucketStart, cursor);
    return this.lastFormingOutput;
  }

  /**
   * Consistent chart view: TF label, candles, visible index, UTC offset, forming candle,
   * countdown.
   *
   * RFC-019 (D19.C/D/E/G/H, N19-2/N19-3) — closes the cross-TF lookahead defect: a panel
   * whose own timeframe is COARSER than the replay's advance grain used to paint its
   * containing candle whole (the candle whose close lies in the trader's future). The fix
   * reads the REPLAY grain (`selectReplayTfSeconds`/`selectReplaySeries` — never-null,
   * global, D8-safe zero-arg selectors the fill engine already uses) instead of the
   * user's sub-TF opt-in (`selectResolutionMinutes`), which conflated "how fast does the
   * clock advance" with "did the user turn on Replay Resolution" (RFC-019 §1). The symbol
   * gate is the isolated T-1 clause, `panelTracksPrimarySeries` — deliberately NOT the
   * sibling trade-ink predicate one block below, whose `hideTrades` opt-out is a
   * visibility preference that must never govern candle fidelity (plan §0 C1; gating this
   * stream on that predicate would silently reintroduce the exact lookahead this RFC
   * closes whenever a panel hides its trade layer).
   */
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
    this.store.select(selectReplayTfSeconds),
    this.store.select(selectReplaySeries),
    this.store.select(selectCurrentAsset),
    this.store.select(selectChartView),
  ]).pipe(
    map(
      ([
        descriptor,
        series,
        currentTime,
        utcOffset,
        replayTfSeconds,
        replaySeries,
        currentAsset,
        globalChartView,
      ]) => {
        if (!descriptor) {
          return globalChartView;
        }
        const tf = descriptor.timeframe;
        const candles = this.resolvePanelCandles(series, tf); // D19.G — F3's shared memo
        const activeSeconds = TIMEFRAME_SECONDS[tf]; // C6 — no `?? 0`, no recompute; every Timeframe member is covered
        const idx = lastIndexAtOrBefore(candles, currentTime);
        const countdown = computeCountdown(activeSeconds, currentTime);

        // D19.D/D19.E (N19-2, N19-3) — the isolated T-1 clause only; see the doc comment
        // above for why the trade-ink predicate must not be used here (plan §0 C1).
        const subGrain =
          activeSeconds > replayTfSeconds &&
          currentTime > 0 &&
          panelTracksPrimarySeries(descriptor, currentAsset);

        if (!subGrain) {
          return { tf, candles, idx, utcOffset, forming: null, countdown };
        }

        const bucketStart = Math.floor(currentTime / activeSeconds) * activeSeconds;
        const forming = this.resolveForming(replaySeries, bucketStart, currentTime); // D19.H
        // D-B1: idx-1 is conditioned on `subGrain` alone, NEVER on `forming != null`. When
        // the honest partial bar can't be computed (a gap in the replay series, `hi < lo`),
        // the degraded path must show the last CLOSED candle, never the containing one —
        // falling through to `idx` inclusive here would repaint the future candle.
        return idx >= 0
          ? { tf, candles, idx: idx - 1, utcOffset, forming, countdown }
          : { tf, candles, idx, utcOffset, forming, countdown };
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
   * RFC-018 F3 — per-instance memo resolving THIS panel's own candle array for a
   * `(series, timeframe)` pair. Shared by `panelChartView$` and `tradeChartView$` (below)
   * so the M* synthetic-series path (`generateCustomSeries`) runs at most once per genuine
   * change, never once per consumer — a second independent derivation would double the
   * per-panel cost (plan Risk Register) AND add a second file call-site, which the run's
   * invariant grep forbids. One slot per mapper instance, the same discipline as
   * `lastPanelInputs`/`lastDrawingsInputs`; N panels ⇒ N independent slots (D8).
   */
  private lastCandlesInputs: {
    series: Partial<Record<Timeframe, Candle[]>>;
    timeframe: Timeframe;
  } | null = null;
  private lastCandlesOutput: Candle[] = EMPTY_CANDLES;

  private resolvePanelCandles(
    series: Partial<Record<Timeframe, Candle[]>>,
    timeframe: Timeframe,
  ): Candle[] {
    const last = this.lastCandlesInputs;
    if (last && last.series === series && last.timeframe === timeframe) {
      return this.lastCandlesOutput;
    }
    let candles = series[timeframe];
    if ((!candles || candles.length === 0) && timeframe.startsWith('M')) {
      const minutes = parseInt(timeframe.substring(1), 10);
      if (!isNaN(minutes)) {
        candles = generateCustomSeries(series, minutes);
      }
    }
    this.lastCandlesInputs = { series, timeframe };
    this.lastCandlesOutput = candles ?? EMPTY_CANDLES;
    return this.lastCandlesOutput;
  }

  /**
   * RFC-018 F3 — fine-grained memo for the panel-parametrized marker geometry, keyed ONLY
   * on the inputs that actually determine marker content: this panel's own candles (from
   * `resolvePanelCandles` above), `positions`, and `history`. Calls `selectTradeMarkers`'s
   * `.projector` directly — the EXACT snapping + ordering logic the (kept-alive, R18-14)
   * global selector uses, just fed this panel's candles instead of the global active
   * series (the defect). `.projector` itself IS memoized by NgRx (`createSelector` wraps it
   * in `memoizedProjector.memoized`) — but that memoization is ONE slot, module-global,
   * shared by every caller of the selector. At N panels, each feeding a different candle
   * array, that single shared slot thrashes at a ~0% hit rate: exactly the pathology the D8
   * factory-selector ban (kernel invariant 5, `CLAUDE.md`) exists to prevent — a shared
   * memoized function does not scale to N independently-keyed callers. This local,
   * per-mapper-instance cache is what actually gives this panel its own hit rate: a
   * `tradeChartView$` recompute triggered by something irrelevant to trade content (e.g. the
   * descriptor object being rebuilt for an unrelated field such as a panel rename) must not
   * reallocate the marker array.
   */
  private lastMarkerInputs: {
    candles: Candle[];
    positions: StatePosition[];
    history: ClosedTrade[];
  } | null = null;
  private lastRawMarkers: StateTradeMarker[] = [];

  private resolveMarkers(
    candles: Candle[],
    positions: StatePosition[],
    history: ClosedTrade[],
  ): StateTradeMarker[] {
    const last = this.lastMarkerInputs;
    if (last && last.candles === candles && last.positions === positions && last.history === history) {
      return this.lastRawMarkers;
    }
    this.lastMarkerInputs = { candles, positions, history };
    this.lastRawMarkers = selectTradeMarkers.projector(candles, positions, history);
    return this.lastRawMarkers;
  }

  /**
   * Same discipline as {@link resolveMarkers}, for `selectTradeBoxes` — no candle snapping
   * needed (raw open/close times), but routed through the identical per-panel pattern
   * (plain `.projector` call + local cache) so markers and boxes share one provenance
   * (RFC-018 F3 direction #4), and so a marker-only recompute (this panel's candles
   * changed) does not also reallocate boxes, which don't depend on candles at all.
   */
  private lastBoxInputs: {
    positions: StatePosition[];
    orders: StatePendingOrder[];
    history: ClosedTrade[];
  } | null = null;
  private lastRawBoxes: StateTradeBoxItem[] = [];

  private resolveBoxes(
    positions: StatePosition[],
    orders: StatePendingOrder[],
    history: ClosedTrade[],
  ): StateTradeBoxItem[] {
    const last = this.lastBoxInputs;
    if (last && last.positions === positions && last.orders === orders && last.history === history) {
      return this.lastRawBoxes;
    }
    this.lastBoxInputs = { positions, orders, history };
    this.lastRawBoxes = selectTradeBoxes.projector(positions, orders, history);
    return this.lastRawBoxes;
  }

  /**
   * Trade-gate memo slot (RFC-018 D18.C, R18-13): keyed on the panel's OWN resolved
   * candles (RFC-018 F3 — `resolvePanelCandles`, NOT the global active series), the three
   * raw trading slices, `boxesVisible`, plus the descriptor and `currentAsset` the gate
   * needs. Deliberately excludes `groups` (RFC-018 §4.3), for the identical reason
   * `panelDrawings$`'s own memo slot does: pulling the whole groups record in would
   * invalidate every panel's trade layer whenever any group's colour changes elsewhere in
   * the workspace. One slot per mapper instance — the same discipline as
   * `lastDrawingsInputs`.
   */
  private lastTradeInputs: {
    descriptor: PanelDescriptor | null;
    candles: Candle[];
    positions: StatePosition[];
    orders: StatePendingOrder[];
    history: ClosedTrade[];
    boxesVisible: boolean;
    currentAsset: string | null;
  } | null = null;
  private lastTradeChartView: TradeChartView | null = null;

  /**
   * Trade overlay: open positions, pending orders, markers, boxes — gated per panel by
   * `panelRendersTrades` (RFC-018 T-1 symbol invariant ∧ T-2 `hideTrades` preference) AND,
   * as of RFC-018 F3, geometrically correct per panel: markers snap against THIS panel's
   * own candles (`resolvePanelCandles`, shared with `panelChartView$` — never a second
   * `generateCustomSeries` derivation), not the global active timeframe's series. Before F3
   * a panel on H4 with the global TF on M1 received markers snapped to M1's grid — a
   * pre-existing production defect, independent of gating, fixed here.
   *
   * R18-1: `panelDescriptor$` is a `ReplaySubject(1)` that emits only after `configurePanel`.
   * `startWith(null)` makes an unconfigured mapper gate CLOSED rather than stay silent — a
   * single frame of trade ink on an as-yet-unidentified pane would be a false statement
   * about the market (T-1 is a correctness invariant, not a preference). The one-frame
   * delay before ink appears on a freshly configured panel is harmless; the inverse is not.
   * This deliberately differs from `panelDrawings$`, which simply does not emit until
   * configured — a drawing layer with no data yet is not a false statement.
   *
   * Gate open: `resolveMarkers`/`resolveBoxes` (fine-grained per-field memos) feed the
   * existing four `memoizeMap` calls exactly as before this RFC, so every pre-existing
   * reference-stability guarantee on the four arrays survives verbatim. `boxesVisible` is
   * applied HERE (the mapper no longer consumes `selectTradeChartView`, which used to apply
   * it) — the global eye-off behavior is preserved verbatim, just relocated. Gate closed:
   * emits the single shared `EMPTY_TRADE_CHART_VIEW` (R18-3), never a fresh literal.
   */
  readonly tradeChartView$: Observable<TradeChartView> = combineLatest([
    this.panelDescriptor$.pipe(startWith(null)),
    this.store.select(selectSeries),
    this.store.select(tradingFeature.selectPositions),
    this.store.select(tradingFeature.selectOrders),
    this.store.select(tradingFeature.selectHistory),
    this.store.select(selectTradeBoxesVisible),
    this.store.select(selectCurrentAsset),
  ]).pipe(
    map(([descriptor, series, positions, orders, history, boxesVisible, currentAsset]) => {
      const candles = descriptor
        ? this.resolvePanelCandles(series, descriptor.timeframe)
        : EMPTY_CANDLES;
      const gateOpen = descriptor != null && panelRendersTrades(descriptor, currentAsset);
      const last = this.lastTradeInputs;
      if (
        last &&
        last.descriptor === descriptor &&
        last.candles === candles &&
        last.positions === positions &&
        last.orders === orders &&
        last.history === history &&
        last.boxesVisible === boxesVisible &&
        last.currentAsset === currentAsset
      ) {
        return this.lastTradeChartView!;
      }
      this.lastTradeInputs = {
        descriptor,
        candles,
        positions,
        orders,
        history,
        boxesVisible,
        currentAsset,
      };
      this.lastTradeChartView = gateOpen
        ? {
            positions: this.mapPositions(positions) as Position[],
            orders: this.mapOrders(orders) as PendingOrder[],
            markers: this.mapMarkers(this.resolveMarkers(candles, positions, history)) as TradeMarker[],
            boxes: boxesVisible
              ? (this.mapBoxes(this.resolveBoxes(positions, orders, history)) as TradeBoxItem[])
              : frozenEmptyArray<TradeBoxItem>(),
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
    candles: Candle[];
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
   *
   * RFC-018 F3: candle resolution itself is delegated to `resolvePanelCandles`, the SAME
   * per-instance memoized helper `tradeChartView$` uses — one shared cache instead of two
   * independent `generateCustomSeries` call sites, so the two streams' candle arrays are
   * reference-identical whenever both resolve in the same tick, and the M* synthetic path
   * still runs at most once per genuine `(series, timeframe)` change regardless of which
   * stream asks first.
   */
  readonly panelChartView$: Observable<PanelChartView> = combineLatest([
    this.panelDescriptor$,
    this.store.select(selectSeries),
    this.store.select(selectCurrentTime),
    this.store.select(selectUtcOffset),
  ]).pipe(
    map(([descriptor, series, currentTime, utcOffset]) => {
      const candles = this.resolvePanelCandles(series, descriptor.timeframe);
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
      this.lastPanelView = this.computePanelView(descriptor, candles, currentTime, utcOffset);
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
