import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { firstValueFrom } from 'rxjs';
import { tradingFeature } from './trading/trading.reducer';
import {
  lowerSeriesForSeconds,
  selectActiveCandles,
  selectAvailableResolutions,
  selectCandleCountdown,
  selectChartStyle,
  selectChartView,
  selectClosedTradeBoxes,
  formatCountdown,
  selectContractSize,
  selectCurrentReplayCandle,
  selectDataRange,
  selectFillContext,
  selectFloatingPnl,
  selectActiveTfShortfall,
  selectFormingCandle,
  selectLoadedTfs,
  selectPointSize,
  selectProgress,
  selectReplayIndex,
  selectReplaySeries,
  selectResolutionProgress,
  selectSessionStats,
  selectSessionTfs,
  selectTfLastTimes,
  selectTradePanelView,
  selectTradingData,
  selectTradeBoxes,
  selectTradeChartView,
  selectVisibleIndex,
  selectWorkspaceMetaSnapshot,
  selectWorkspaceSnapshot,
} from './selectors';
import { DARK_CHART_COLORS, DARK_TRADE_BOX_OPACITY } from './settings/settings.models';
import { defaultTradingData } from './trading/trading.models';
import { candle, closed, order, position, series } from '../testing/fixtures';
import { TIMEFRAME_ORDER } from '../models';

// ---- selectChartStyle ----
describe('selectChartStyle', () => {
  it('bundles colors/gridVisible/gridOpacity/tradeBoxOpacity', () => {
    const result = selectChartStyle.projector(DARK_CHART_COLORS, true, 0.8, DARK_TRADE_BOX_OPACITY);
    expect(result.colors).toBe(DARK_CHART_COLORS);
    expect(result.gridVisible).toBe(true);
    expect(result.gridOpacity).toBe(0.8);
    expect(result.tradeBoxOpacity).toBe(DARK_TRADE_BOX_OPACITY);
  });
});

// ---- selectTradingData ----
describe('selectTradingData', () => {
  it('returns pickTradingData result (no summaryOpen, no savedSessions)', () => {
    const state = {
      ...defaultTradingData(),
      summaryOpen: true,
      savedSessions: [],
      activeSessionId: null,
    };
    const result = selectTradingData.projector(state);
    expect('summaryOpen' in result).toBe(false);
    expect('savedSessions' in result).toBe(false);
    expect(result.balance).toBe(state.balance);
  });
});

// ---- selectWorkspaceSnapshot ----
describe('selectWorkspaceSnapshot', () => {
  it('bundles all workspace keys including series', () => {
    const candles = series(2);
    const trading = defaultTradingData();
    const result = selectWorkspaceSnapshot.projector(
      { H1: candles },
      { H1: 'file.csv' },
      'H1',
      3600,
      [],
      trading,
      [],
    );
    expect(result.series).toEqual({ H1: candles });
    expect(result.files).toEqual({ H1: 'file.csv' });
    expect(result.activeTf).toBe('H1');
    expect(result.currentTime).toBe(3600);
    expect(result.drawings).toEqual([]);
    expect(result.trading).toBe(trading);
    expect(result.sessions).toEqual([]);
  });
});

// ---- selectWorkspaceMetaSnapshot ----
describe('selectWorkspaceMetaSnapshot', () => {
  it('bundles correct keys (incl. selectedTfs + activeSessionId) and has NO series field', () => {
    const trading = defaultTradingData();
    const result = selectWorkspaceMetaSnapshot.projector(
      { H1: 'file.csv' },
      'H1',
      ['M5', 'H1'],
      3600,
      [],
      trading,
      [],
      'sess-42',
    );
    expect('series' in result).toBe(false);
    expect(result.files).toEqual({ H1: 'file.csv' });
    expect(result.activeTf).toBe('H1');
    expect(result.selectedTfs).toEqual(['M5', 'H1']);
    expect(result.currentTime).toBe(3600);
    expect(result.activeSessionId).toBe('sess-42');
  });

  it('carries a null activeSessionId through', () => {
    const result = selectWorkspaceMetaSnapshot.projector(
      {},
      null,
      null,
      0,
      [],
      defaultTradingData(),
      [],
      null,
    );
    expect(result.activeSessionId).toBeNull();
  });

  it('maps a null selection to undefined (legacy sessions)', () => {
    const result = selectWorkspaceMetaSnapshot.projector(
      {},
      null,
      null,
      0,
      [],
      defaultTradingData(),
      [],
      null,
    );
    expect(result.selectedTfs).toBeUndefined();
  });
});

// ---- selectLoadedTfs ----
describe('selectLoadedTfs', () => {
  it('filters and orders loaded tfs by TIMEFRAME_ORDER', () => {
    const tfs = selectLoadedTfs.projector({ H1: series(2), H4: series(2), D1: undefined });
    expect(tfs).toEqual(['H1', 'H4']);
    // Must be in TIMEFRAME_ORDER order
    const idxH1 = TIMEFRAME_ORDER.indexOf('H1');
    const idxH4 = TIMEFRAME_ORDER.indexOf('H4');
    expect(idxH1).toBeLessThan(idxH4);
  });

  it('returns empty array when nothing is loaded', () => {
    expect(selectLoadedTfs.projector({})).toEqual([]);
  });

  it('excludes timeframes whose stored series is empty', () => {
    expect(selectLoadedTfs.projector({ H1: series(2), H4: [] })).toEqual(['H1']);
  });
});

// ---- selectSessionTfs ----
describe('selectSessionTfs', () => {
  it('intersects loaded TFs with the session selection (order preserved)', () => {
    expect(selectSessionTfs.projector(['M1', 'M5', 'H1'], ['H1', 'M1'])).toEqual(['M1', 'H1']);
  });

  it('falls back to all loaded TFs when the selection is null (legacy)', () => {
    expect(selectSessionTfs.projector(['M1', 'M5'], null)).toEqual(['M1', 'M5']);
  });

  it('falls back to all loaded TFs when the selection is empty', () => {
    expect(selectSessionTfs.projector(['M1', 'M5'], [])).toEqual(['M1', 'M5']);
  });
});

// ---- selectTfLastTimes ----
describe('selectTfLastTimes', () => {
  it('returns the last candle time per loaded TF', () => {
    const m5 = series(3, 0, 300); // last at 600
    const h1 = series(2, 0, 3600); // last at 3600
    expect(selectTfLastTimes.projector({ M5: m5, H1: h1, D1: [] })).toEqual({ M5: 600, H1: 3600 });
  });
});

// ---- selectActiveTfShortfall ----
describe('selectActiveTfShortfall', () => {
  it('returns null when the cursor is within the active TF coverage', () => {
    const candles = series(5, 0, 3600); // last at 14400
    expect(selectActiveTfShortfall.projector(candles, 7200)).toBeNull();
  });

  it('returns the last candle time when the cursor is beyond it', () => {
    const candles = series(5, 0, 3600); // last at 14400
    expect(selectActiveTfShortfall.projector(candles, 20000)).toBe(14400);
  });

  it('returns null for empty candles or no cursor', () => {
    expect(selectActiveTfShortfall.projector([], 100)).toBeNull();
    expect(selectActiveTfShortfall.projector(series(3), 0)).toBeNull();
  });
});

// ---- selectActiveCandles ----
describe('selectActiveCandles', () => {
  it('returns [] when tf is null', () => {
    expect(selectActiveCandles.projector({}, null, null, [])).toEqual([]);
  });

  it('returns [] when tf is set but missing from series', () => {
    expect(selectActiveCandles.projector({ H4: series(2) }, 'H1', null, [])).toEqual([]);
  });

  it('returns the candle array when present', () => {
    const candles = series(3);
    expect(selectActiveCandles.projector({ H1: candles }, 'H1', null, [])).toBe(candles);
  });

  it('returns the custom series (ignoring the standard tf) when a custom tf is active', () => {
    const standard = series(3);
    const custom = series(2);
    expect(selectActiveCandles.projector({ H1: standard }, 'H1', 45, custom)).toBe(custom);
  });
});

// ---- selectVisibleIndex ----
describe('selectVisibleIndex', () => {
  it('returns -1 when candles are empty', () => {
    expect(selectVisibleIndex.projector([], 3600)).toBe(-1);
  });

  it('returns -1 when t <= 0', () => {
    expect(selectVisibleIndex.projector(series(5, 0, 3600), 0)).toBe(-1);
    expect(selectVisibleIndex.projector(series(5, 0, 3600), -1)).toBe(-1);
  });

  it('binary-searches the last candle <= cursor', () => {
    // candles at 0, 3600, 7200, 10800, 14400
    const candles = series(5, 0, 3600);
    expect(selectVisibleIndex.projector(candles, 3 * 3600)).toBe(3);
  });

  it('exact-boundary: cursor equals last candle time', () => {
    const candles = series(5, 0, 3600);
    expect(selectVisibleIndex.projector(candles, 4 * 3600)).toBe(4);
  });

  it('cursor before first candle returns -1', () => {
    const candles = series(5, 3600, 3600);
    expect(selectVisibleIndex.projector(candles, 1800)).toBe(-1);
  });
});

// ---- selectDataRange ----
describe('selectDataRange', () => {
  it('returns null when candles are empty', () => {
    expect(selectDataRange.projector([])).toBeNull();
  });

  it('returns {from, to} from first/last candle time', () => {
    const candles = series(5, 1000, 3600);
    const result = selectDataRange.projector(candles);
    expect(result).toEqual({ from: 1000, to: 1000 + 4 * 3600 });
  });
});

// ---- selectProgress ----
describe('selectProgress', () => {
  it('returns {shown: idx+1, total: candles.length}', () => {
    const candles = series(10);
    const result = selectProgress.projector(candles, 4);
    expect(result).toEqual({ shown: 5, total: 10 });
  });

  it('shown is 0 when idx is -1', () => {
    const result = selectProgress.projector(series(5), -1);
    expect(result.shown).toBe(0);
  });
});

// ---- selectFormingCandle ----
describe('selectFormingCandle', () => {
  const res = [
    // velas M30 dentro de la H1 09:00-10:00
    { time: 9 * 3600, open: 10, high: 12, low: 9, close: 11 },
    { time: 9 * 3600 + 1800, open: 11, high: 15, low: 8, close: 14 },
  ];

  it('agrega las velas de resolución reveladas hasta el cursor', () => {
    const cursor = 9 * 3600 + 1800; // ambas M30 reveladas
    const out = selectFormingCandle.projector(res, 3600, cursor, 30);
    expect(out).toEqual({ time: 9 * 3600, open: 10, high: 15, low: 8, close: 14 });
  });

  it('solo la primera M30 cuando el cursor está a mitad de hora', () => {
    const cursor = 9 * 3600; // solo la primera revelada
    const out = selectFormingCandle.projector(res, 3600, cursor, 30);
    expect(out).toEqual({ time: 9 * 3600, open: 10, high: 12, low: 9, close: 11 });
  });

  it('null en vela completa', () => {
    expect(selectFormingCandle.projector(res, 3600, 9 * 3600, null)).toBeNull();
  });
});

// ---- formatCountdown ----
describe('formatCountdown', () => {
  it('formats MM:SS under an hour', () => {
    expect(formatCountdown(6 * 60 + 58)).toBe('06:58');
    expect(formatCountdown(59)).toBe('00:59');
  });
  it('formats HH:MM:SS for an hour or more', () => {
    expect(formatCountdown(3 * 3600 + 4 * 60 + 5)).toBe('03:04:05');
    expect(formatCountdown(3600)).toBe('01:00:00');
  });
  it('clamps to 00:00 at or below zero', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-10)).toBe('00:00');
  });
});

// ---- selectCandleCountdown ----
describe('selectCandleCountdown', () => {
  it('returns the time left until the active candle closes', () => {
    // H1 (3600s) bucket 09:00-10:00, cursor at 09:37 → 23:00 left
    const cursor = 9 * 3600 + 37 * 60;
    expect(selectCandleCountdown.projector(3600, cursor)).toBe('23:00');
  });
  it('formats HH:MM:SS for a D1 candle', () => {
    // D1 (86400s), cursor 1s past the day start → 23:59:59 left
    expect(selectCandleCountdown.projector(86400, 86401)).toBe('23:59:59');
  });
  it('returns null before the replay starts or with no TF', () => {
    expect(selectCandleCountdown.projector(3600, 0)).toBeNull();
    expect(selectCandleCountdown.projector(0, 1000)).toBeNull();
  });
});

// ---- selectChartView ----
describe('selectChartView', () => {
  it('bundles tf/candles/idx/utcOffset/countdown', () => {
    const candles = series(3);
    const result = selectChartView.projector('H1', candles, 2, -4, null, null, '12:00');
    expect(result.tf).toBe('H1');
    expect(result.candles).toBe(candles);
    expect(result.idx).toBe(2);
    expect(result.utcOffset).toBe(-4);
    expect(result.countdown).toBe('12:00');
  });
});

// ---- selectContractSize ----
describe('selectContractSize', () => {
  it('XAUUSD → 100', () => {
    expect(selectContractSize.projector('XAUUSD')).toBe(100);
  });

  it('null symbol → 1 (contractSizeFor(""))', () => {
    expect(selectContractSize.projector(null)).toBe(1);
  });

  it('EURUSD → 100000', () => {
    expect(selectContractSize.projector('EURUSD')).toBe(100000);
  });
});

// ---- selectCurrentReplayCandle ----
describe('selectCurrentReplayCandle', () => {
  it('returns null when idx < 0', () => {
    expect(selectCurrentReplayCandle.projector(series(3), -1)).toBeNull();
  });

  it('returns the replay-series candle at idx (the live sub-TF candle in resolution mode)', () => {
    const candles = series(3, 0, 3600);
    const c = selectCurrentReplayCandle.projector(candles, 1);
    expect(c).toEqual(candles[1]);
  });
});

// ---- selectPointSize ----
describe('selectPointSize', () => {
  it('returns 0.01 when candles are empty', () => {
    expect(selectPointSize.projector([])).toBe(0.01);
  });

  it('returns derivePointSize for a non-empty array', () => {
    // Candles with integer close prices → derivePointSize returns 1
    const candles = Array.from({ length: 5 }, (_, i) => ({
      time: i * 3600,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
    }));
    const result = selectPointSize.projector(candles);
    expect(result).toBeGreaterThan(0);
  });
});

// ---- selectTradePanelView ----
describe('selectTradePanelView', () => {
  it('price is null when there is no current candle', () => {
    const trading = {
      ...defaultTradingData(),
      summaryOpen: false,
      savedSessions: [],
      activeSessionId: null,
    };
    const result = selectTradePanelView.projector(trading, null, 100, 0.01);
    expect(result.price).toBeNull();
  });

  it('computes floating P/L per position', () => {
    const pos = position({ side: 'buy', entryPrice: 4000, lots: 0.1 });
    const trading = {
      ...defaultTradingData(),
      positions: [pos],
      summaryOpen: false,
      savedSessions: [],
      activeSessionId: null,
    };
    const c = candle(3600, 4010, 4020, 3990, 4010);
    const result = selectTradePanelView.projector(trading, c, 100, 0.01);
    // buy at 4000, close 4010, lots 0.1, contractSize 100 → profit = 10 * 0.1 * 100 = 100
    expect(result.positions[0].pnl).toBeCloseTo(100, 4);
    expect(result.equity).toBeCloseTo(result.balance + 100, 4);
    expect(result.floating).toBeCloseTo(100, 4);
  });

  it('passes through orders/history/flags', () => {
    const trading = {
      ...defaultTradingData(),
      orders: [order()],
      history: [closed()],
      sessionEnded: true,
      summaryOpen: true,
      savedSessions: [],
      activeSessionId: null,
    };
    const c = candle(3600, 100, 101, 99, 100);
    const result = selectTradePanelView.projector(trading, c, 1, 0.01);
    expect(result.orders).toHaveLength(1);
    expect(result.history).toHaveLength(1);
    expect(result.sessionEnded).toBe(true);
    expect(result.summaryOpen).toBe(true);
  });
});

// ---- selectFloatingPnl ----
describe('selectFloatingPnl', () => {
  it('returns null when there are no positions', () => {
    expect(selectFloatingPnl.projector([], candle(0, 100, 101, 99, 100), 100)).toBeNull();
  });

  it('returns null when there is no candle', () => {
    expect(selectFloatingPnl.projector([position()], null, 100)).toBeNull();
  });

  it('sums floating P/L for buy direction', () => {
    const pos = position({ side: 'buy', entryPrice: 4000, lots: 0.1 });
    const c = candle(3600, 4010, 4020, 3990, 4020);
    // profit = (4020 - 4000) * 0.1 * 100 = 200
    const result = selectFloatingPnl.projector([pos], c, 100);
    expect(result).toBeCloseTo(200, 4);
  });

  it('sums floating P/L for sell direction', () => {
    const pos = position({ side: 'sell', entryPrice: 4020, lots: 0.1 });
    const c = candle(3600, 4000, 4001, 3990, 4000);
    // profit = (4000 - 4020) * -1 * 0.1 * 100 = 200
    const result = selectFloatingPnl.projector([pos], c, 100);
    expect(result).toBeCloseTo(200, 4);
  });

  // Bug 4: in resolution mode the live price must come from the latest revealed
  // sub-TF (replay) candle, NOT the display candle's (future) close.
  it('prices off the replay-series candle (live sub-TF), not the display candle', async () => {
    TestBed.configureTestingModule({ providers: [provideMockStore()] });
    const store = TestBed.inject(MockStore);
    store.overrideSelector(selectReplaySeries, [candle(0, 100, 105, 99, 105)]); // sub-TF close = 105
    store.overrideSelector(selectReplayIndex, 0);
    store.overrideSelector(tradingFeature.selectPositions, [
      position({ side: 'buy', entryPrice: 100, lots: 0.1 }),
    ]);
    store.overrideSelector(selectContractSize, 100);
    store.refreshState();
    const pnl = await firstValueFrom(store.select(selectFloatingPnl));
    // (105 - 100) * 0.1 * 100 = 50 → derived from the resolution candle's close
    expect(pnl).toBeCloseTo(50, 6);
  });
});

// ---- selectTradeBoxes ----
describe('selectTradeBoxes', () => {
  it('maps positions as open, orders as pending, history as closed', () => {
    const pos = position({ id: 'p1', side: 'buy', entryPrice: 4000, openTime: 0 });
    const ord = order({ id: 'o1', side: 'sell', entryPrice: 3980, createdAt: 0 });
    const hist = closed({ id: 't1', side: 'buy', openTime: 0, closeTime: 3600 });
    const result = selectTradeBoxes.projector([pos], [ord], [hist]);
    const open = result.find((b) => b.id === 'p1');
    expect(open?.status).toBe('open');
    expect(open?.to).toBeNull();
    const pending = result.find((b) => b.id === 'o1');
    expect(pending?.status).toBe('pending');
    const closedBox = result.find((b) => b.id === 't1');
    expect(closedBox?.status).toBe('closed');
    expect(closedBox?.to).toBe(3600);
  });

  it('filters out boxDeleted history entries', () => {
    const hist = closed({ id: 't1', boxDeleted: true });
    const result = selectTradeBoxes.projector([], [], [hist]);
    expect(result.find((b) => b.id === 't1')).toBeUndefined();
  });

  it('sets hidden from boxHidden', () => {
    const hist = closed({ id: 't1', boxHidden: true });
    const result = selectTradeBoxes.projector([], [], [hist]);
    expect(result.find((b) => b.id === 't1')?.hidden).toBe(true);
  });
});

// ---- selectTradeChartView ----
describe('selectTradeChartView', () => {
  it('boxesVisible:false → boxes:[]', () => {
    const boxes = [
      {
        id: 'p1',
        status: 'open' as const,
        side: 'buy' as const,
        entry: 4000,
        sl: 3990,
        tp: 4020,
        from: 0,
        to: null,
        hidden: false,
      },
    ];
    const result = selectTradeChartView.projector([], [], [], boxes, false);
    expect(result.boxes).toEqual([]);
  });

  it('boxesVisible:true → boxes passed through', () => {
    const boxes = [
      {
        id: 'p1',
        status: 'open' as const,
        side: 'buy' as const,
        entry: 4000,
        sl: 3990,
        tp: 4020,
        from: 0,
        to: null,
        hidden: false,
      },
    ];
    const result = selectTradeChartView.projector([], [], [], boxes, true);
    expect(result.boxes).toBe(boxes);
  });
});

// ---- selectClosedTradeBoxes ----
describe('selectClosedTradeBoxes', () => {
  it('maps history and filters out boxDeleted', () => {
    const t1 = closed({ id: 't1', boxDeleted: true });
    const t2 = closed({ id: 't2', boxHidden: true });
    const result = selectClosedTradeBoxes.projector([t1, t2]);
    expect(result.find((b) => b.id === 't1')).toBeUndefined();
    const b2 = result.find((b) => b.id === 't2');
    expect(b2?.hidden).toBe(true);
    expect(b2?.profit).toBe(t2.profit);
  });
});

// ---- selectSessionStats (smoke) ----
describe('selectSessionStats', () => {
  it('delegates to computeSessionStats: empty history → zeroes', () => {
    const stats = selectSessionStats.projector([], 10000);
    expect(stats).toBeDefined();
    expect(stats.totalTrades).toBe(0);
  });
});

// ---- selectReplaySeries / selectReplayIndex ----
describe('selectReplaySeries / selectReplayIndex', () => {
  const active = [{ time: 0, open: 1, high: 1, low: 1, close: 1 }];
  const resolution = [
    { time: 0, open: 1, high: 1, low: 1, close: 1 },
    { time: 300, open: 1, high: 1, low: 1, close: 1 },
  ];

  it('usa la serie activa en vela completa', () => {
    expect(selectReplaySeries.projector(active, null)).toBe(active);
  });
  it('usa la serie de resolución cuando está activa', () => {
    expect(selectReplaySeries.projector(active, resolution)).toBe(resolution);
  });
  it('índice del último candle de resolución <= cursor', () => {
    expect(selectReplayIndex.projector(resolution, 300)).toBe(1);
    expect(selectReplayIndex.projector(resolution, 299)).toBe(0);
  });
});

// ---- selectFillContext ----
describe('selectFillContext', () => {
  it('bundles candles/idx/tfSeconds/lower/contractSize/trading', () => {
    const candles = series(3);
    const trading = {
      ...defaultTradingData(),
      summaryOpen: false,
      savedSessions: [],
      activeSessionId: null,
    };
    const lower = series(3, 0, 300);
    const result = selectFillContext.projector(candles, 2, 3600, lower, 100, trading);
    expect(result.candles).toBe(candles);
    expect(result.idx).toBe(2);
    expect(result.tfSeconds).toBe(3600);
    expect(result.lower).toBe(lower);
    expect(result.contractSize).toBe(100);
    expect(result.trading).toBe(trading);
  });
});

// ---- selectTradeChartView markers (exercise via positions + history) ----
describe('selectTradeChartView: trade markers', () => {
  it('empty candles → markers: []', () => {
    const result = selectTradeChartView.projector(
      [position()],
      [order()],
      [], // markers computed from empty candles → []
      [],
      true,
    );
    expect(result.markers).toEqual([]);
  });
});

// ---- lowerSeriesForSeconds ----
describe('lowerSeriesForSeconds', () => {
  it('returns null when the active duration is 0 (no active tf)', () => {
    expect(lowerSeriesForSeconds({ H1: series(3) }, 0)).toBeNull();
  });

  it('returns the lowest loaded TF strictly below the active duration', () => {
    const m5 = series(3, 0, 300);
    const result = lowerSeriesForSeconds({ M5: m5, H1: series(3, 0, 3600) }, 3600); // H1 = 3600s
    expect(result).toBe(m5);
  });

  it('returns null when no lower TF is loaded', () => {
    expect(lowerSeriesForSeconds({ H1: series(3) }, 3600)).toBeNull();
  });

  it('returns null when series is empty', () => {
    expect(lowerSeriesForSeconds({}, 14400)).toBeNull(); // H4 = 14400s
  });
});

// ---- selectAvailableResolutions ----
describe('selectAvailableResolutions', () => {
  it('lista divisores válidos del TF mostrado con datos (H1 con M1)', () => {
    const series = { M1: [{ time: 0, open: 1, high: 1, low: 1, close: 1 }] };
    const out = selectAvailableResolutions.projector(series, 3600); // H1
    const mins = out.map((r) => r.minutes);
    expect(mins).toEqual([1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30]);
    expect(out.find((r) => r.minutes === 5)!.label).toBe('M5');
  });

  it('vacío cuando no hay serie base para generar', () => {
    const series = { H1: [{ time: 0, open: 1, high: 1, low: 1, close: 1 }] };
    expect(selectAvailableResolutions.projector(series, 3600)).toEqual([]); // sin M-data < H1
  });
});

// ---- selectResolutionProgress ----
describe('selectResolutionProgress', () => {
  it('devuelve el cursor y el fin del bucket actual del TF mostrado', () => {
    // cursor 09:37 dentro de la H1 09:00-10:00 → bucketEnd 10:00
    const cursor = 9 * 3600 + 37 * 60;
    const out = selectResolutionProgress.projector(3600, cursor, 5);
    expect(out).toEqual({ cursorTime: cursor, bucketEndTime: 10 * 3600 });
  });

  it('null en vela completa', () => {
    expect(selectResolutionProgress.projector(3600, 1000, null)).toBeNull();
  });
});
