import { createSelector } from '@ngrx/store';
import { marketFeature } from './market/market.reducer';
import { replayFeature } from './replay/replay.reducer';
import { settingsFeature } from './settings/settings.reducer';
import { drawingsFeature } from './drawings/drawings.reducer';
import { workspacesFeature } from './workspaces/workspaces.reducer';
import { tradingFeature } from './trading/trading.reducer';
import { Candle, derivePointSize, TIMEFRAME_ORDER, TIMEFRAME_SECONDS, Timeframe } from '../models';
import { Drawing } from './drawings/drawings.models';
import {
  contractSizeFor,
  OrderSide,
  pickTradingData,
  Position,
  SavedSession,
  TradingData,
} from './trading/trading.models';
import { computeSessionStats } from './trading/fill-engine';

export const selectActiveTf = marketFeature.selectActiveTf;
export const selectSeries = marketFeature.selectSeries;
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
  (files, activeTf, selectedTfs, currentTime, drawings, trading, sessions) => ({
    files,
    activeTf,
    selectedTfs: selectedTfs ?? undefined,
    currentTime,
    drawings,
    trading,
    sessions,
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

/** Candles of the active timeframe (all of them, including the future). */
export const selectActiveCandles = createSelector(
  selectSeries,
  selectActiveTf,
  (series, tf): Candle[] => (tf ? (series[tf] ?? []) : []),
);

/**
 * Index (in the active TF) of the last visible candle according to the replay
 * cursor: the last candle whose OPEN is <= currentTime. -1 if none.
 */
export const selectVisibleIndex = createSelector(
  selectActiveCandles,
  selectCurrentTime,
  (candles, t): number => {
    if (!candles.length || t <= 0) return -1;
    // binary search of the last time <= t
    let lo = 0,
      hi = candles.length - 1,
      ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (candles[mid].time <= t) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  },
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
export const selectChartView = createSelector(
  selectActiveTf,
  selectActiveCandles,
  selectVisibleIndex,
  selectUtcOffset,
  (tf, candles, idx, utcOffset) => ({ tf, candles, idx, utcOffset }),
);

// ============ trading ============

/** Contract size (units per lot) of the active asset. */
export const selectContractSize = createSelector(selectCurrentAsset, (symbol) =>
  contractSizeFor(symbol ?? ''),
);

/** Last candle revealed by the replay (null before the start). */
export const selectCurrentCandle = createSelector(
  selectActiveCandles,
  selectVisibleIndex,
  (candles, idx): Candle | null => (idx >= 0 ? candles[idx] : null),
);

/** Minimum price increment of the active series (for points display). */
export const selectPointSize = createSelector(selectActiveCandles, (candles) =>
  candles.length ? derivePointSize(candles) : 0.01,
);

function floatingPnl(p: Position, price: number, contractSize: number): number {
  const dir = p.side === 'buy' ? 1 : -1;
  return (price - p.entryPrice) * dir * p.lots * contractSize;
}

/**
 * Everything the order panel needs, in ONE consistent emission: trading
 * state, current price, per-position floating P/L and equity.
 */
export const selectTradePanelView = createSelector(
  tradingFeature.selectTradingState,
  selectCurrentCandle,
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

export const selectSessionEnd = tradingFeature.selectSessionEnd;

/** Floating P/L of all open positions (null when there are none). */
export const selectFloatingPnl = createSelector(
  tradingFeature.selectPositions,
  selectCurrentCandle,
  selectContractSize,
  (positions, candle, contractSize): number | null => {
    if (!positions.length || !candle) return null;
    return positions.reduce((sum, p) => sum + floatingPnl(p, candle.close, contractSize), 0);
  },
);

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

/** Context the fill effect needs to evaluate a freshly revealed candle. */
export const selectFillContext = createSelector(
  selectActiveCandles,
  selectVisibleIndex,
  selectSeries,
  selectActiveTf,
  selectContractSize,
  tradingFeature.selectTradingState,
  (candles, idx, series, tf, contractSize, trading) => ({
    candles,
    idx,
    series,
    tf,
    contractSize,
    trading,
  }),
);

/** Lowest loaded TF strictly below `tf`, to disambiguate SL-vs-TP. */
export function lowerSeriesFor(
  series: Partial<Record<Timeframe, Candle[]>>,
  tf: Timeframe | null,
): Candle[] | null {
  if (!tf) return null;
  const tfSecs = TIMEFRAME_SECONDS[tf];
  for (const lower of TIMEFRAME_ORDER) {
    if (TIMEFRAME_SECONDS[lower] >= tfSecs) break;
    const candles = series[lower];
    if (candles?.length) return candles;
  }
  return null;
}
