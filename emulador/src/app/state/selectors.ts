import { createSelector } from '@ngrx/store';
import { marketFeature } from './market/market.reducer';
import { replayFeature } from './replay/replay.reducer';
import { settingsFeature } from './settings/settings.reducer';
import { drawingsFeature } from './drawings/drawings.reducer';
import { workspacesFeature } from './workspaces/workspaces.reducer';
import { tradingFeature } from './trading/trading.reducer';
import { Candle, derivePointSize, TIMEFRAME_ORDER, TIMEFRAME_SECONDS, Timeframe } from '../models';
import {
  pickBaseSeriesTf,
  loadedTfForMinutes,
  formatIntervalShort,
} from './market/custom-timeframe';
import { Drawing } from './drawings/drawings.models';
import {
  contractSizeFor,
  OrderSide,
  pickTradingData,
  Position,
  SavedSession,
  TradingData,
} from './trading/trading.models';
import {
  computeSessionStats,
  firstIndexAtOrAfter,
  lastIndexAtOrBefore,
} from './trading/fill-engine';

export const selectActiveTf = marketFeature.selectActiveTf;
export const selectSeries = marketFeature.selectSeries;
export const selectCustomTf = marketFeature.selectCustomTf;
export const selectCustomSeries = marketFeature.selectCustomSeries;
export const selectCurrentTime = replayFeature.selectCurrentTime;
export const selectPlaying = replayFeature.selectPlaying;
export const selectMsPerCandle = replayFeature.selectMsPerCandle;
export const selectTheme = settingsFeature.selectTheme;
export const selectChartColors = settingsFeature.selectChartColors;
export const selectUtcOffset = settingsFeature.selectUtcOffset;
export const selectGridVisible = settingsFeature.selectGridVisible;
export const selectGridOpacity = settingsFeature.selectGridOpacity;
export const selectFloatingToolbar = settingsFeature.selectFloatingToolbar;
export const selectSidePanel = settingsFeature.selectSidePanel;
export const selectTradeBoxesVisible = settingsFeature.selectTradeBoxesVisible;
export const selectTradeBoxOpacity = settingsFeature.selectTradeBoxOpacity;

/** Everything the chart needs to style itself (colors + grid controls). */
export const selectChartStyle = createSelector(
  selectChartColors,
  selectGridVisible,
  selectGridOpacity,
  selectTradeBoxOpacity,
  (colors, gridVisible, gridOpacity, tradeBoxOpacity) => ({
    colors,
    gridVisible,
    gridOpacity,
    tradeBoxOpacity,
  }),
);

export const selectCurrentAsset = workspacesFeature.selectCurrent;
export const selectAssets = workspacesFeature.selectAssets;

/** Persistable trading data (everything except the transient UI flags). */
export const selectTradingData = createSelector(tradingFeature.selectTradingState, (t) =>
  pickTradingData(t),
);

export const selectSavedSessions = tradingFeature.selectSavedSessions;

export interface WorkspaceSnapshot {
  series: Partial<Record<Timeframe, Candle[]>>;
  files: Partial<Record<Timeframe, string>>;
  activeTf: Timeframe | null;
  currentTime: number;
  drawings: Drawing[];
  trading: TradingData;
  sessions: SavedSession[];
}

/** Live view of everything that belongs to the active asset's workspace. */
export const selectWorkspaceSnapshot = createSelector(
  marketFeature.selectSeries,
  marketFeature.selectFiles,
  marketFeature.selectActiveTf,
  replayFeature.selectCurrentTime,
  drawingsFeature.selectItems,
  selectTradingData,
  selectSavedSessions,
  (series, files, activeTf, currentTime, drawings, trading, sessions): WorkspaceSnapshot => ({
    series,
    files,
    activeTf,
    currentTime,
    drawings,
    trading,
    sessions,
  }),
);

/**
 * Light snapshot WITHOUT the candle series. This is what gets persisted on
 * every change; the heavy series are persisted separately on CSV load only.
 */
export const selectWorkspaceMetaSnapshot = createSelector(
  marketFeature.selectFiles,
  marketFeature.selectActiveTf,
  marketFeature.selectSelectedTfs,
  replayFeature.selectCurrentTime,
  drawingsFeature.selectItems,
  selectTradingData,
  selectSavedSessions,
  tradingFeature.selectActiveSessionId,
  (files, activeTf, selectedTfs, currentTime, drawings, trading, sessions, activeSessionId) => ({
    files,
    activeTf,
    selectedTfs: selectedTfs ?? undefined,
    currentTime,
    drawings,
    trading,
    sessions,
    // stable active session id (= cloud row id once synced); carried so the
    // meta snapshot round-trips it without persistMeta$ reading it back.
    activeSessionId,
  }),
);

/** Loaded timeframes (any non-empty stored series), lowest to highest. */
export const selectLoadedTfs = createSelector(selectSeries, (series) =>
  TIMEFRAME_ORDER.filter((tf) => !!series[tf]?.length),
);

/**
 * TFs the toolbar should offer: the session's selected set intersected with
 * what's loaded. Series are shared per symbol, so without this scope every TF
 * ever downloaded for the symbol would appear. A null selection (legacy
 * sessions / direct CSV loads) falls back to every loaded TF.
 */
export const selectSessionTfs = createSelector(
  selectLoadedTfs,
  marketFeature.selectSelectedTfs,
  (loaded, selected) =>
    selected && selected.length ? loaded.filter((tf) => selected.includes(tf)) : loaded,
);

/** Last stored candle time per loaded TF (for the coverage-shortfall hint). */
export const selectTfLastTimes = createSelector(selectSeries, (series) => {
  const out: Partial<Record<Timeframe, number>> = {};
  for (const tf of TIMEFRAME_ORDER) {
    const candles = series[tf];
    if (candles?.length) out[tf] = candles[candles.length - 1].time;
  }
  return out;
});

/**
 * Candles of the active timeframe (all of them, including the future). When a
 * custom timeframe is active, the in-memory generated series is shown instead.
 * Every downstream view (visible index, progress, markers, fill context …)
 * derives from THIS selector, so custom timeframes flow everywhere for free.
 */
export const selectActiveCandles = createSelector(
  selectSeries,
  selectActiveTf,
  selectCustomTf,
  selectCustomSeries,
  (series, tf, customTf, customSeries): Candle[] =>
    customTf != null ? customSeries : tf ? (series[tf] ?? []) : [],
);

/**
 * Index (in the active TF) of the last visible candle according to the replay
 * cursor: the last candle whose OPEN is <= currentTime. -1 if none.
 */
export const selectVisibleIndex = createSelector(
  selectActiveCandles,
  selectCurrentTime,
  (candles, t): number => (!candles.length || t <= 0 ? -1 : lastIndexAtOrBefore(candles, t)),
);

/** Date range available in the active TF (for the start-time picker). */
export const selectDataRange = createSelector(selectActiveCandles, (candles) =>
  candles.length ? { from: candles[0].time, to: candles[candles.length - 1].time } : null,
);

export const selectProgress = createSelector(
  selectActiveCandles,
  selectVisibleIndex,
  (candles, idx) => ({ shown: idx + 1, total: candles.length }),
);

/**
 * When the replay cursor is BEYOND the active TF's last candle (that TF was
 * harvested with less coverage than another), returns that last candle time;
 * null otherwise. The chart shows a banner so the "jump to the last candle"
 * is explained instead of looking like a silent teleport.
 */
export const selectActiveTfShortfall = createSelector(
  selectActiveCandles,
  selectCurrentTime,
  (candles, t): number | null => {
    if (!candles.length || t <= 0) return null;
    const last = candles[candles.length - 1].time;
    return t > last ? last : null;
  },
);

/**
 * Single, CONSISTENT view for the chart. Important: the component must
 * subscribe to this composed selector (one emission per state change) and
 * not combine loose selectors with combineLatest, which produces interim
 * emissions with a new TF + old candles/index.
 */
/** Display label of the active timeframe: the standard name or `M<minutes>`. */
export const selectActiveTfLabel = createSelector(
  selectActiveTf,
  selectCustomTf,
  (tf, customTf): string | null => (customTf != null ? `M${customTf}` : tf),
);

// ============ trading ============

/** Contract size (units per lot) of the active asset. */
export const selectContractSize = createSelector(selectCurrentAsset, (symbol) =>
  contractSizeFor(symbol ?? ''),
);

/** Minimum price increment of the active series (for points display). */
export const selectPointSize = createSelector(selectActiveCandles, (candles) =>
  candles.length ? derivePointSize(candles) : 0.01,
);

export const selectSessionEnd = tradingFeature.selectSessionEnd;

/** Marker descriptor with semantic color (the chart maps it to the theme). */
export interface TradeMarker {
  /** UTC seconds, snapped to a candle of the active TF. */
  time: number;
  position: 'aboveBar' | 'belowBar';
  shape: 'arrowUp' | 'arrowDown' | 'circle';
  color: 'up' | 'down';
  text: string;
}

/** Time of the last candle whose open is <= t (markers must sit on a bar). */
function snapToCandle(candles: Candle[], t: number): number {
  let lo = 0,
    hi = candles.length - 1,
    ans = candles[0]?.time ?? t;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time <= t) {
      ans = candles[mid].time;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

const selectTradeMarkers = createSelector(
  selectActiveCandles,
  tradingFeature.selectPositions,
  tradingFeature.selectHistory,
  (candles, positions, history): TradeMarker[] => {
    if (!candles.length) return [];
    const markers: TradeMarker[] = [];
    const entry = (side: 'buy' | 'sell', time: number, lots: number): TradeMarker => ({
      time: snapToCandle(candles, time),
      position: side === 'buy' ? 'belowBar' : 'aboveBar',
      shape: side === 'buy' ? 'arrowUp' : 'arrowDown',
      color: side === 'buy' ? 'up' : 'down',
      text: `${side === 'buy' ? 'C' : 'V'} ${lots}`,
    });
    for (const p of positions) markers.push(entry(p.side, p.openTime, p.lots));
    for (const t of history) {
      markers.push(entry(t.side, t.openTime, t.lots));
      const sign = t.profit >= 0 ? '+' : '−';
      markers.push({
        time: snapToCandle(candles, t.closeTime),
        position: t.side === 'buy' ? 'aboveBar' : 'belowBar',
        shape: 'circle',
        color: t.profit >= 0 ? 'up' : 'down',
        text: `${sign}$${Math.abs(t.profit).toFixed(2)}`,
      });
    }
    markers.sort((a, b) => a.time - b.time);
    return markers;
  },
);

/**
 * One TP/SL zone box per trade, in chart-friendly form. Live boxes (open
 * positions and pending orders) have `to: null` and grow with the replay;
 * closed ones are frozen between open and close time (the trade record).
 */
export interface TradeBoxItem {
  id: string;
  status: 'open' | 'pending' | 'closed';
  side: OrderSide;
  entry: number;
  sl: number;
  tp: number | null;
  /** UTC seconds: open/placement time. */
  from: number;
  /** UTC seconds: close time; null = still alive (grows to the last bar). */
  to: number | null;
  /** Hidden by the user (closed trades only). */
  hidden: boolean;
}

export const selectTradeBoxes = createSelector(
  tradingFeature.selectPositions,
  tradingFeature.selectOrders,
  tradingFeature.selectHistory,
  (positions, orders, history): TradeBoxItem[] => [
    ...positions.map(
      (p): TradeBoxItem => ({
        id: p.id,
        status: 'open',
        side: p.side,
        entry: p.entryPrice,
        sl: p.sl,
        tp: p.tp,
        from: p.openTime,
        to: null,
        hidden: false,
      }),
    ),
    ...orders.map(
      (o): TradeBoxItem => ({
        id: o.id,
        status: 'pending',
        side: o.side,
        entry: o.entryPrice,
        sl: o.sl,
        tp: o.tp,
        from: o.createdAt,
        to: null,
        hidden: false,
      }),
    ),
    ...history
      .filter((t) => !t.boxDeleted)
      .map(
        (t): TradeBoxItem => ({
          id: t.id,
          status: 'closed',
          side: t.side,
          entry: t.entryPrice,
          sl: t.sl,
          tp: t.tp,
          from: t.openTime,
          to: t.closeTime,
          hidden: t.boxHidden === true,
        }),
      ),
  ],
);

/** Single consistent view for the chart's trade overlay (lines + markers). */
export const selectTradeChartView = createSelector(
  tradingFeature.selectPositions,
  tradingFeature.selectOrders,
  selectTradeMarkers,
  selectTradeBoxes,
  selectTradeBoxesVisible,
  // global eye off => the primitive receives no items at all
  (positions, orders, markers, boxes, boxesVisible) => ({
    positions,
    orders,
    markers,
    boxes: boxesVisible ? boxes : [],
  }),
);

/** Closed trades whose box can be toggled from the toolbar eye dropdown. */
export const selectClosedTradeBoxes = createSelector(tradingFeature.selectHistory, (history) =>
  history
    .filter((t) => !t.boxDeleted)
    .map((t) => ({
      id: t.id,
      side: t.side,
      closeTime: t.closeTime,
      profit: t.profit,
      hidden: t.boxHidden === true,
    })),
);

/** Session statistics computed from the closed-trade history. */
export const selectSessionStats = createSelector(
  tradingFeature.selectHistory,
  tradingFeature.selectInitialBalance,
  (history, initialBalance) => computeSessionStats(history, initialBalance),
);

/** Candle duration (seconds) of the active timeframe — standard or custom. */
export const selectActiveTfSeconds = createSelector(
  selectActiveTf,
  selectCustomTf,
  (tf, customTf): number => (customTf != null ? customTf * 60 : tf ? TIMEFRAME_SECONDS[tf] : 0),
);

export const selectResolutionMinutes = replayFeature.selectResolutionMinutes;

/** The replay-resolution candles: a loaded series at R, else the generated one, else null. */
export const selectResolutionSeries = createSelector(
  selectSeries,
  marketFeature.selectResolutionSeries,
  marketFeature.selectResolutionFor,
  selectResolutionMinutes,
  (series, generated, generatedFor, minutes): Candle[] | null => {
    if (minutes == null) return null;
    const loaded = loadedTfForMinutes(minutes, Object.keys(series) as Timeframe[]);
    if (loaded && series[loaded]?.length) return series[loaded]!;
    return generatedFor === minutes && generated.length ? generated : null;
  },
);

/** Standard TFs that divide the display TF, are finer, and can be generated from loaded data. */
export const selectAvailableResolutions = createSelector(
  selectSeries,
  selectActiveTfSeconds,
  (series, activeSeconds): { minutes: number; label: string }[] => {
    if (activeSeconds <= 0) return [];
    const out: { minutes: number; label: string }[] = [];
    for (const tf of TIMEFRAME_ORDER) {
      const secs = TIMEFRAME_SECONDS[tf];
      if (secs >= activeSeconds) break;
      const minutes = secs / 60;
      if (activeSeconds % secs === 0 && pickBaseSeriesTf(series, minutes)) {
        out.push({ minutes, label: formatIntervalShort(minutes) });
      }
    }
    return out;
  },
);

/** Cursor time + current display-bucket end, for the "HH:mm / HH:mm" readout. */
export const selectResolutionProgress = createSelector(
  selectActiveTfSeconds,
  selectCurrentTime,
  selectResolutionMinutes,
  (activeSeconds, cursor, minutes): { cursorTime: number; bucketEndTime: number } | null => {
    if (minutes == null || activeSeconds <= 0 || cursor <= 0) return null;
    const bucketStart = Math.floor(cursor / activeSeconds) * activeSeconds;
    return { cursorTime: cursor, bucketEndTime: bucketStart + activeSeconds };
  },
);

/** Partial display-TF candle aggregated from resolution candles revealed in the current bucket. */
export const selectFormingCandle = createSelector(
  selectResolutionSeries,
  selectActiveTfSeconds,
  selectCurrentTime,
  selectResolutionMinutes,
  (resSeries, activeSeconds, cursor, minutes): Candle | null => {
    if (minutes == null || !resSeries || activeSeconds <= 0 || cursor <= 0) return null;
    const bucketStart = Math.floor(cursor / activeSeconds) * activeSeconds;
    // Aggregate the bucket's revealed candles [bucketStart, cursor] directly over
    // their indices — no intermediate slice array (avoids GC churn at fast autoplay).
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
  },
);

/** Formats a remaining-seconds duration as `MM:SS` (or `HH:MM:SS` past an hour). */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

/**
 * Time left until the active DISPLAY-TF candle closes, formatted for the price
 * axis countdown tag. `null` before the replay starts or with no active TF.
 * In resolution mode it still counts down to the display candle's close.
 */
export const selectCandleCountdown = createSelector(
  selectActiveTfSeconds,
  selectCurrentTime,
  (tfSeconds, currentTime): string | null => {
    if (tfSeconds <= 0 || currentTime <= 0) return null;
    const bucketStart = Math.floor(currentTime / tfSeconds) * tfSeconds;
    return formatCountdown(bucketStart + tfSeconds - currentTime);
  },
);

/**
 * Single, CONSISTENT view for the chart. Important: the component must
 * subscribe to this composed selector (one emission per state change) and
 * not combine loose selectors with combineLatest, which produces interim
 * emissions with a new TF + old candles/index.
 */
export const selectChartView = createSelector(
  selectActiveTfLabel,
  selectActiveCandles,
  selectVisibleIndex,
  selectUtcOffset,
  selectResolutionMinutes,
  selectFormingCandle,
  selectCandleCountdown,
  (tf, candles, idx, utcOffset, minutes, forming, countdown) => {
    // Resolution mode: hide the (future-complete) bucket candle and paint the
    // forming bar instead; complete candles run up to bucketIdx-1.
    if (minutes != null && forming != null && idx >= 0) {
      return { tf, candles, idx: idx - 1, utcOffset, forming, countdown };
    }
    return { tf, candles, idx, utcOffset, forming: null, countdown };
  },
);

/** Finest loaded series strictly below the active candle duration (SL/TP order). */
export const selectLowerSeries = createSelector(
  selectSeries,
  selectActiveTfSeconds,
  (series, activeSeconds): Candle[] | null => lowerSeriesForSeconds(series, activeSeconds),
);

/** The series the replay cursor traverses: the resolution series when active, else the display series. */
export const selectReplaySeries = createSelector(
  selectActiveCandles,
  selectResolutionSeries,
  (active, resolution): Candle[] => resolution ?? active,
);

/** Index of the last replay-series candle whose time <= cursor. */
export const selectReplayIndex = createSelector(
  selectReplaySeries,
  selectCurrentTime,
  (candles, t): number => (!candles.length || t <= 0 ? -1 : lastIndexAtOrBefore(candles, t)),
);

/** Candle duration (seconds) the replay advances by: resolution or display TF. */
export const selectReplayTfSeconds = createSelector(
  selectActiveTfSeconds,
  selectResolutionMinutes,
  (activeSeconds, minutes): number => (minutes != null ? minutes * 60 : activeSeconds),
);

/** Finest loaded series strictly below the replay candle duration (SL/TP tiebreak). */
export const selectReplayLowerSeries = createSelector(
  selectSeries,
  selectReplayTfSeconds,
  (series, seconds): Candle[] | null => lowerSeriesForSeconds(series, seconds),
);

/**
 * Context the fill effect needs to evaluate a freshly revealed candle. Exposes
 * the active candle DURATION and the finer "lower" series directly (instead of
 * a Timeframe string), so fills work for custom timeframes too. Derived from
 * the replay-aware selectors so fills evaluate over the resolution series when
 * active (identical to the display series in full-candle mode).
 */
export const selectFillContext = createSelector(
  selectReplaySeries,
  selectReplayIndex,
  selectReplayTfSeconds,
  selectReplayLowerSeries,
  selectContractSize,
  tradingFeature.selectTradingState,
  (candles, idx, tfSeconds, lower, contractSize, trading) => ({
    candles,
    idx,
    tfSeconds,
    lower,
    contractSize,
    trading,
  }),
);

/** Finest loaded series whose candle duration is strictly below `activeSeconds`. */
export function lowerSeriesForSeconds(
  series: Partial<Record<Timeframe, Candle[]>>,
  activeSeconds: number,
): Candle[] | null {
  if (activeSeconds <= 0) return null;
  for (const lower of TIMEFRAME_ORDER) {
    if (TIMEFRAME_SECONDS[lower] >= activeSeconds) break;
    const candles = series[lower];
    if (candles?.length) return candles;
  }
  return null;
}

/**
 * Last candle the replay cursor sits on, RESOLUTION-AWARE: in resolution mode
 * it's the latest revealed sub-TF candle (its close is the live intrabar
 * price); in full-candle mode it equals the active display candle. Drives the
 * current price for floating P/L so the panel reflects each sub-TF tick instead
 * of the display candle's (future) close.
 */
export const selectCurrentReplayCandle = createSelector(
  selectReplaySeries,
  selectReplayIndex,
  (candles, idx): Candle | null => (idx >= 0 ? candles[idx] : null),
);

function floatingPnl(p: Position, price: number, contractSize: number): number {
  const dir = p.side === 'buy' ? 1 : -1;
  return (price - p.entryPrice) * dir * p.lots * contractSize;
}

/**
 * Everything the order panel needs, in ONE consistent emission: trading state,
 * current (intrabar) price, per-position floating P/L and equity.
 */
export const selectTradePanelView = createSelector(
  tradingFeature.selectTradingState,
  selectCurrentReplayCandle,
  selectContractSize,
  selectPointSize,
  (t, candle, contractSize, pointSize) => {
    const price = candle?.close ?? null;
    const positions = t.positions.map((p) => ({
      ...p,
      pnl: price !== null ? floatingPnl(p, price, contractSize) : 0,
    }));
    const floating = positions.reduce((sum, p) => sum + p.pnl, 0);
    return {
      balance: t.balance,
      initialBalance: t.initialBalance,
      equity: t.balance + floating,
      floating,
      orders: t.orders,
      positions,
      history: t.history,
      sessionEnded: t.sessionEnded,
      summaryOpen: t.summaryOpen,
      riskPct: t.riskPct,
      price,
      time: candle?.time ?? 0,
      contractSize,
      pointSize,
    };
  },
);

/** Floating P/L of all open positions (null when there are none). */
export const selectFloatingPnl = createSelector(
  tradingFeature.selectPositions,
  selectCurrentReplayCandle,
  selectContractSize,
  (positions, candle, contractSize): number | null => {
    if (!positions.length || !candle) return null;
    return positions.reduce((sum, p) => sum + floatingPnl(p, candle.close, contractSize), 0);
  },
);
