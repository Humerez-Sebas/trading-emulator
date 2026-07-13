import { afterEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { firstValueFrom } from 'rxjs';
import { tradingFeature } from './trading/trading.reducer';
import {
  selectContractSize,
  selectCurrentReplayCandle,
  selectCurrentTime,
  selectExecutionSeries,
  selectFloatingEquity,
  selectReplayTfSeconds,
} from './selectors';
import { ExecutionCosts } from './trading/execution-costs';
import { candle, position } from '../testing/fixtures';

// ---- RFC-014 Task 3: selectFloatingEquity ----
// balance + Σ floatingPnL(open positions), valuing longs at the current base
// candle's Bid close and shorts at its derived Ask close (close + s). Direct
// `.projector()` calls characterize the pure combiner; the last describe
// block wires it through a real MockStore to prove the composition.

const SPREAD: ExecutionCosts = {
  spreadPoints: 5,
  commissionPerLot: 0,
  slippagePoints: 0,
  pointSize: 1,
};

describe('selectFloatingEquity.projector', () => {
  it('empty positions ⇒ balance, regardless of any candle being available', () => {
    expect(selectFloatingEquity.projector(10000, [], null, null, 0, 0, null, 100)).toBe(10000);
    expect(
      selectFloatingEquity.projector(10000, [], null, [candle(0, 100, 101, 99, 100)], 0, 60, null, 100),
    ).toBe(10000);
  });

  it('long position: valued at the current base candle Bid close (no spread effect)', () => {
    const base = [candle(0, 100, 101, 99, 100), candle(60, 110, 111, 109, 110)];
    const pos = position({ side: 'buy', entryPrice: 100, lots: 1 });
    // bucket [60, 120): reveal horizon = 60+60-1 = 119 → last base candle at/under it is t=60 (close=110)
    const result = selectFloatingEquity.projector(10000, [pos], null, base, 60, 60, null, 100);
    // floatingPnL = (110 - 100) * 1 * 100 = 1000
    expect(result).toBeCloseTo(11000);
  });

  it('short position: valued at the derived Ask close (close + s)', () => {
    const base = [candle(0, 100, 101, 99, 90)];
    const pos = position({ side: 'sell', entryPrice: 100, lots: 1 });
    const result = selectFloatingEquity.projector(10000, [pos], SPREAD, base, 0, 60, null, 100);
    // val = 90 + 5*1 = 95; floatingPnL = (95 - 100) * -1 * 1 * 100 = 500
    expect(result).toBeCloseTo(10500);
  });

  it('null executionCosts ⇒ s=0, so a short is valued at the raw Bid close', () => {
    const base = [candle(0, 100, 101, 99, 90)];
    const pos = position({ side: 'sell', entryPrice: 100, lots: 1 });
    const result = selectFloatingEquity.projector(10000, [pos], null, base, 0, 60, null, 100);
    // val = 90 (unchanged); floatingPnL = (90 - 100) * -1 * 1 * 100 = 1000
    expect(result).toBeCloseTo(11000);
  });

  it('prefers the base-series candle over the fallback candle when both are available', () => {
    const base = [candle(0, 100, 101, 99, 120)]; // base close = 120
    const fallback = candle(0, 100, 101, 99, 999); // deliberately different — must be ignored
    const pos = position({ side: 'buy', entryPrice: 100, lots: 1 });
    const result = selectFloatingEquity.projector(10000, [pos], null, base, 0, 60, fallback, 100);
    // floatingPnL = (120 - 100) * 1 * 100 = 2000, NOT the fallback's 999
    expect(result).toBeCloseTo(12000);
  });

  it('falls back to selectCurrentReplayCandle when no base series is loaded', () => {
    const fallback = candle(0, 100, 101, 99, 108);
    const pos = position({ side: 'buy', entryPrice: 100, lots: 1 });
    const result = selectFloatingEquity.projector(10000, [pos], null, null, 0, 60, fallback, 100);
    // floatingPnL = (108 - 100) * 1 * 100 = 800
    expect(result).toBeCloseTo(10800);
  });

  it('falls back when tfSeconds <= 0 (no replay-resolution context yet)', () => {
    const base = [candle(0, 100, 101, 99, 200)];
    const fallback = candle(0, 100, 101, 99, 105);
    const pos = position({ side: 'buy', entryPrice: 100, lots: 1 });
    const result = selectFloatingEquity.projector(10000, [pos], null, base, 0, 0, fallback, 100);
    // tfSeconds<=0 → currentBaseCandle is null → uses the fallback (105), not the base (200)
    expect(result).toBeCloseTo(10500);
  });

  it('with positions but no candle available at all (no base, no fallback), returns balance untouched', () => {
    const pos = position({ side: 'buy', entryPrice: 100, lots: 1 });
    expect(selectFloatingEquity.projector(10000, [pos], null, null, 0, 60, null, 100)).toBe(10000);
  });

  it('sums floating P/L across multiple open positions, long and short mixed', () => {
    const base = [candle(0, 100, 101, 99, 105)];
    const positions = [
      position({ id: 'p1', side: 'buy', entryPrice: 100, lots: 1 }),
      position({ id: 'p2', side: 'sell', entryPrice: 110, lots: 1 }),
    ];
    const result = selectFloatingEquity.projector(10000, positions, null, base, 0, 60, null, 100);
    // long: (105-100)*1*100 = 500; short: (105-110)*-1*1*100 = 500
    expect(result).toBeCloseTo(11000);
  });
});

describe('selectFloatingEquity — wired through a real store', () => {
  afterEach(() => {
    TestBed.inject(MockStore).resetSelectors();
  });

  it('composes selectExecutionSeries + selectCurrentTime + selectReplayTfSeconds for the base candle', async () => {
    TestBed.configureTestingModule({ providers: [provideMockStore()] });
    const store = TestBed.inject(MockStore);
    store.overrideSelector(tradingFeature.selectBalance, 10000);
    store.overrideSelector(tradingFeature.selectPositions, [
      position({ side: 'buy', entryPrice: 100, lots: 1 }),
    ]);
    store.overrideSelector(tradingFeature.selectExecutionCosts, null);
    store.overrideSelector(selectExecutionSeries, [
      candle(0, 100, 101, 99, 100),
      candle(60, 100, 101, 99, 115),
    ]);
    store.overrideSelector(selectCurrentTime, 60);
    store.overrideSelector(selectReplayTfSeconds, 60);
    store.overrideSelector(selectCurrentReplayCandle, null);
    store.overrideSelector(selectContractSize, 100);
    store.refreshState();
    const equity = await firstValueFrom(store.select(selectFloatingEquity));
    // base candle at t=60 (close=115): floatingPnL = (115-100)*1*100 = 1500
    expect(equity).toBeCloseTo(11500);
  });
});
