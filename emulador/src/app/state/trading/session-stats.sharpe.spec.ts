import { ClosedTrade } from './trading.models';
import { computeSessionStats } from './fill-engine';

describe('SessionStats.sharpe (RFC-016 §5, D16.C.3)', () => {
  const initialBalance = 10000;

  const baseClosedTrade: ClosedTrade = {
    id: 'trade-1',
    side: 'buy',
    origin: 'market',
    entryPrice: 1.0850,
    exitPrice: 1.0870,
    sl: 1.0800,
    tp: 1.0900,
    lots: 1,
    riskPct: 2,
    riskUsd: 100,
    openTime: 1000,
    closeTime: 2000,
    outcome: 'tp',
    profit: 200,
    rMultiple: 2,
    ambiguous: false,
    grossProfit: 200,
    commission: 0,
  };

  describe('sharpe computation', () => {
    it('Returns null when n = 0 (empty history)', () => {
      const stats = computeSessionStats([], initialBalance);
      expect(stats.sharpe).toBeNull();
    });

    it('Returns null when n = 1 (single trade, cannot compute stddev)', () => {
      const history: ClosedTrade[] = [baseClosedTrade];
      const stats = computeSessionStats(history, initialBalance);
      expect(stats.sharpe).toBeNull();
    });

    it('Returns null when stddev = 0 (all trades identical R)', () => {
      const trades: ClosedTrade[] = [
        { ...baseClosedTrade, id: 'trade-1', rMultiple: 2, profit: 200 },
        { ...baseClosedTrade, id: 'trade-2', rMultiple: 2, profit: 200 },
        { ...baseClosedTrade, id: 'trade-3', rMultiple: 2, profit: 200 },
      ];
      const stats = computeSessionStats(trades, initialBalance);
      expect(stats.sharpe).toBeNull();
    });

    it('Computes sharpe = mean(R) / sampleStdDev(R) with n >= 2 and stddev > 0', () => {
      // Hand-computed example: R = [1, 2, 3]
      // mean = 2
      // sample variance = ((1-2)^2 + (2-2)^2 + (3-2)^2) / (3-1) = 2 / 2 = 1
      // sample stddev = sqrt(1) = 1
      // sharpe = 2 / 1 = 2
      const trades: ClosedTrade[] = [
        { ...baseClosedTrade, id: 'trade-1', rMultiple: 1, profit: 100 },
        { ...baseClosedTrade, id: 'trade-2', rMultiple: 2, profit: 200 },
        { ...baseClosedTrade, id: 'trade-3', rMultiple: 3, profit: 300 },
      ];
      const stats = computeSessionStats(trades, initialBalance);
      expect(stats.sharpe).toBe(2);
    });

    it('Handles negative R values correctly', () => {
      // R = [-1, 0, 1]
      // mean = 0
      // variance = (1 + 0 + 1) / 2 = 1
      // stddev = 1
      // sharpe = 0 / 1 = 0
      const trades: ClosedTrade[] = [
        { ...baseClosedTrade, id: 'trade-1', rMultiple: -1, profit: -100 },
        { ...baseClosedTrade, id: 'trade-2', rMultiple: 0, profit: 0 },
        { ...baseClosedTrade, id: 'trade-3', rMultiple: 1, profit: 100 },
      ];
      const stats = computeSessionStats(trades, initialBalance);
      expect(stats.sharpe).toBe(0);
    });

    it('Uses sample stddev with n-1 denominator (not population stddev)', () => {
      // R = [0, 2]
      // mean = 1
      // sample variance = ((0-1)^2 + (2-1)^2) / (2-1) = 2 / 1 = 2
      // sample stddev = sqrt(2) ≈ 1.414
      // sharpe = 1 / 1.414 ≈ 0.707
      const trades: ClosedTrade[] = [
        { ...baseClosedTrade, id: 'trade-1', rMultiple: 0, profit: 0 },
        { ...baseClosedTrade, id: 'trade-2', rMultiple: 2, profit: 200 },
      ];
      const stats = computeSessionStats(trades, initialBalance);
      expect(Math.abs(stats.sharpe! - 0.7071067811865476)).toBeLessThan(0.0001);
    });

    it('Includes ALL trades in history (not just decided trades)', () => {
      // Session-end expired trades should be included in the Sharpe calculation
      const trades: ClosedTrade[] = [
        { ...baseClosedTrade, id: 'trade-1', rMultiple: 1, profit: 100, outcome: 'tp' },
        { ...baseClosedTrade, id: 'trade-2', rMultiple: 2, profit: 200, outcome: 'session-end' },
        { ...baseClosedTrade, id: 'trade-3', rMultiple: 3, profit: 300, outcome: 'sl' },
      ];
      const stats = computeSessionStats(trades, initialBalance);
      // mean(R) = (1 + 2 + 3) / 3 = 2
      // variance = ((1-2)^2 + (2-2)^2 + (3-2)^2) / (3-1) = 2 / 2 = 1
      // stddev = 1
      // sharpe = 2 / 1 = 2
      expect(stats.sharpe).toBe(2);
    });

    it('Computes sharpe as per-trade ratio (no annualization)', () => {
      // RFC-016 D16.C.3: "por-trade, sin anualizar"
      const trades: ClosedTrade[] = [
        { ...baseClosedTrade, id: 'trade-1', rMultiple: 1, profit: 100 },
        { ...baseClosedTrade, id: 'trade-2', rMultiple: 2, profit: 200 },
      ];
      const stats = computeSessionStats(trades, initialBalance);
      const mean = 1.5;
      const stddev = Math.sqrt(((1 - 1.5) ** 2 + (2 - 1.5) ** 2) / 1);
      const expectedSharpe = mean / stddev;
      expect(Math.abs(stats.sharpe! - expectedSharpe)).toBeLessThan(0.0001);
    });
  });

  describe('SessionStats additivity (sharpe is new, other fields unchanged)', () => {
    it('sharpe field is present and other fields are unchanged', () => {
      const trades: ClosedTrade[] = [
        { ...baseClosedTrade, id: 'trade-1', rMultiple: 1, profit: 100, outcome: 'tp' },
        { ...baseClosedTrade, id: 'trade-2', rMultiple: -1, profit: -100, outcome: 'sl' },
      ];
      const stats = computeSessionStats(trades, initialBalance);

      // Spot-check existing fields
      expect(stats.totalTrades).toBe(2);
      expect(stats.won).toBe(1);
      expect(stats.lost).toBe(1);
      expect(stats.winRate).toBe(0.5);
      expect(stats.totalR).toBe(0); // 1 + (-1)
      expect(stats.netProfit).toBe(0); // 100 + (-100)

      // New field exists
      expect(stats.sharpe).toBeDefined();
      expect(typeof stats.sharpe === 'number' || stats.sharpe === null).toBe(true);
    });

    it('maxDrawdown and profitFactor are computed alongside sharpe', () => {
      const trades: ClosedTrade[] = [
        { ...baseClosedTrade, id: 'trade-1', rMultiple: 2, profit: 200, outcome: 'tp' },
        { ...baseClosedTrade, id: 'trade-2', rMultiple: -1, profit: -100, outcome: 'sl' },
        { ...baseClosedTrade, id: 'trade-3', rMultiple: 1, profit: 100, outcome: 'tp' },
      ];
      const stats = computeSessionStats(trades, initialBalance);

      // Existing metrics still computed
      expect(stats.maxDrawdown).toBeGreaterThanOrEqual(0);
      expect(stats.profitFactor).toBeGreaterThan(0);

      // Sharpe is new but coexists
      expect(stats.sharpe).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('Handles fractional R values', () => {
      const trades: ClosedTrade[] = [
        { ...baseClosedTrade, id: 'trade-1', rMultiple: 0.5, profit: 50 },
        { ...baseClosedTrade, id: 'trade-2', rMultiple: 1.5, profit: 150 },
      ];
      const stats = computeSessionStats(trades, initialBalance);
      expect(stats.sharpe).toBeDefined();
      expect(typeof stats.sharpe).toBe('number');
      expect(stats.sharpe).toBeGreaterThan(0);
    });

    it('Handles very small stddev (non-zero but close to zero)', () => {
      // R = [0.9, 1.0, 1.1]
      // mean = 1.0
      // variance = (0.01 + 0 + 0.01) / 2 = 0.01
      // stddev = 0.1
      // sharpe = 1.0 / 0.1 = 10
      const trades: ClosedTrade[] = [
        { ...baseClosedTrade, id: 'trade-1', rMultiple: 0.9, profit: 90 },
        { ...baseClosedTrade, id: 'trade-2', rMultiple: 1.0, profit: 100 },
        { ...baseClosedTrade, id: 'trade-3', rMultiple: 1.1, profit: 110 },
      ];
      const stats = computeSessionStats(trades, initialBalance);
      expect(stats.sharpe).toBeCloseTo(10, 4);
    });

    it('Large number of trades', () => {
      const trades: ClosedTrade[] = Array.from({ length: 100 }, (_, i) => ({
        ...baseClosedTrade,
        id: `trade-${i}`,
        rMultiple: i % 3 === 0 ? 1 : i % 3 === 1 ? 2 : 3,
        profit: (i % 3 === 0 ? 1 : i % 3 === 1 ? 2 : 3) * 100,
      }));
      const stats = computeSessionStats(trades, initialBalance);
      expect(stats.sharpe).toBeDefined();
      expect(typeof stats.sharpe).toBe('number');
    });
  });
});
