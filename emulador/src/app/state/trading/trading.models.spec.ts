import { describe, expect, it } from 'vitest';
import {
  contractSizeFor,
  defaultTradingData,
  lotsForRisk,
  pickTradingData,
  DEFAULT_BALANCE,
} from './trading.models';
import { tradingState } from '../../testing/fixtures';

describe('contractSizeFor', () => {
  it('XAUUSD → 100', () => {
    expect(contractSizeFor('XAUUSD')).toBe(100);
  });

  it('XAGUSD → 5000', () => {
    expect(contractSizeFor('XAGUSD')).toBe(5000);
  });

  it('EURUSD (6 letters) → 100000', () => {
    expect(contractSizeFor('EURUSD')).toBe(100000);
  });

  it('GBPJPY (6 letters) → 100000', () => {
    expect(contractSizeFor('GBPJPY')).toBe(100000);
  });

  it('US30 → 1', () => {
    expect(contractSizeFor('US30')).toBe(1);
  });

  it('NAS100 → 1 (7 chars, not 6)', () => {
    expect(contractSizeFor('NAS100')).toBe(1);
  });

  it('handles lowercase input', () => {
    expect(contractSizeFor('xauusd')).toBe(100);
    expect(contractSizeFor('eurusd')).toBe(100000);
    expect(contractSizeFor('us30')).toBe(1);
  });
});

describe('lotsForRisk', () => {
  it('returns 0 when distance is zero', () => {
    expect(lotsForRisk(10000, 1, 4000, 4000, 100)).toBe(0);
  });

  it('returns 0 when balance is zero', () => {
    expect(lotsForRisk(0, 1, 4000, 3990, 100)).toBe(0);
  });

  it('returns 0 when riskPct is zero', () => {
    expect(lotsForRisk(10000, 0, 4000, 3990, 100)).toBe(0);
  });

  it('rounds to 0.01 step', () => {
    // 10000 * 1% = 100 riskUsd; distance=10, contractSize=100 → 100/(10*100)=0.1
    const lots = lotsForRisk(10000, 1, 4000, 3990, 100);
    expect(lots).toBe(0.1);
    expect(lots % 0.01).toBeCloseTo(0, 8);
  });

  it('enforces minimum 0.01 floor', () => {
    // Very large distance → raw lots < 0.01
    const lots = lotsForRisk(10000, 1, 4000, 1, 100);
    expect(lots).toBe(0.01);
  });
});

describe('pickTradingData', () => {
  it('returns exactly the persistable keys, drops summaryOpen and savedSessions', () => {
    const s = tradingState({ summaryOpen: true });
    const picked = pickTradingData(s);
    expect('summaryOpen' in picked).toBe(false);
    expect('savedSessions' in picked).toBe(false);
    expect(picked.balance).toBeDefined();
    expect(picked.initialBalance).toBeDefined();
    expect(picked.orders).toBeDefined();
    expect(picked.positions).toBeDefined();
    expect(picked.history).toBeDefined();
    expect(picked.lastProcessedTime).toBeDefined();
    expect(picked.sessionEnded).toBeDefined();
    expect(picked.riskPct).toBeDefined();
    expect(picked.sessionEnd).toBeDefined();
    expect(picked.sessionName).toBeDefined();
  });
});

describe('defaultTradingData', () => {
  it('balance equals initialBalance (default)', () => {
    const d = defaultTradingData();
    expect(d.balance).toBe(d.initialBalance);
    expect(d.balance).toBe(DEFAULT_BALANCE);
  });

  it('accepts a custom initialBalance', () => {
    const d = defaultTradingData(5000);
    expect(d.balance).toBe(5000);
    expect(d.initialBalance).toBe(5000);
  });

  it('starts with empty books', () => {
    const d = defaultTradingData();
    expect(d.orders).toHaveLength(0);
    expect(d.positions).toHaveLength(0);
    expect(d.history).toHaveLength(0);
  });
});
