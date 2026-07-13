import { describe, expect, it } from 'vitest';
import { toPayload, fromPayload, flattenWorkspace, reconstructWorkspaces } from './session-sync.mapping';
import type {
  PayloadInput,
  SessionPayloadV1,
  FlattenInput,
  FlattenSession,
  CloudSessionRow,
} from './session-sync.models';
import { singlePanelLayoutFor } from './session-migration';
import { defaultTradingData, type TradingData } from '../state/trading/trading.models';
import { costPresetFor } from '../state/trading/execution-costs';

// RFC-014 Task 2: `TradingData.executionCosts` must survive every round trip
// that already carries `TradingData` wholesale (D5 in the task report: no
// code changes were needed for these paths — `trading: TradingData` is typed
// generically throughout session-sync.mapping.ts/session-migration.ts, so the
// new field threads through for free; these specs PROVE that, following the
// existing round-trip idiom in session-sync.mapping.spec.ts).

function tradingWithCosts(): TradingData {
  const t = defaultTradingData(10000);
  t.executionCosts = costPresetFor('XAUUSD');
  // flattenWorkspace only includes an active session when isRealSession() is
  // true (has activity or a name) — an open position makes this one "real".
  t.positions = [
    {
      id: 'p1',
      side: 'buy',
      entryPrice: 2000,
      sl: 1990,
      tp: 2020,
      lots: 0.1,
      riskPct: 1,
      riskUsd: 100,
      openTime: 1700000000,
      origin: 'market',
    },
  ];
  return t;
}

function payloadInputWithCosts(): PayloadInput {
  const { layout, panels } = singlePanelLayoutFor('XAUUSD', 'H1');
  return {
    trading: tradingWithCosts(),
    currentTime: 1700050000,
    activeTf: 'H1',
    customTfMinutes: null,
    playbackSpeed: 1,
    drawings: {},
    notes: [],
    selectedTfs: ['M1', 'H1'],
    startRange: 1699000000,
    endRange: 1700200000,
    requiredDatasets: [{ symbol: 'XAUUSD', timeframe: 'H1' }],
    layout,
    panels,
    linkGroups: [],
  };
}

describe('toPayload / fromPayload — executionCosts round trip', () => {
  it('survives a plain toPayload -> fromPayload round trip', () => {
    const input = payloadInputWithCosts();
    const back = fromPayload(toPayload(input), 'XAUUSD');
    expect(back.trading.executionCosts).toEqual(input.trading.executionCosts);
  });

  it('survives a JSON serialization round trip (storage-faithful)', () => {
    const input = payloadInputWithCosts();
    const stored = JSON.parse(JSON.stringify(toPayload(input))) as SessionPayloadV1;
    const back = fromPayload(stored, 'XAUUSD');
    expect(back.trading.executionCosts).toEqual(input.trading.executionCosts);
  });

  it('absent costs (null, the legacy default) parse back as null, not lost or defaulted to a preset', () => {
    const input = payloadInputWithCosts();
    input.trading = defaultTradingData(10000); // executionCosts: null
    const back = fromPayload(toPayload(input), 'XAUUSD');
    expect(back.trading.executionCosts).toBeNull();
  });
});

describe('flattenWorkspace / reconstructWorkspaces — executionCosts round trip', () => {
  function activeSession(): FlattenSession {
    const { layout, panels } = singlePanelLayoutFor('XAUUSD', 'H1');
    return {
      id: null,
      name: null,
      createdAt: 1_700_000_000_000,
      cursor: 1700050000,
      trading: tradingWithCosts(),
      view: {
        cursor: 1700050000,
        activeTf: 'H1',
        customTfMinutes: null,
        playbackSpeed: 1,
        drawings: {},
        notes: [],
        selectedTfs: ['M1', 'H1'],
        startRange: 1699000000,
        endRange: 1700200000,
        layout,
        panels,
        linkGroups: [],
      },
      clientUpdatedAt: 1_700_050_000_000,
      lastOpenedAt: 1_700_050_000_000,
    };
  }

  it('the active session round-trips executionCosts losslessly', () => {
    const active = activeSession();
    const input: FlattenInput = { symbol: 'XAUUSD', active, archived: [] };
    const { rows } = flattenWorkspace(input);

    const stored = JSON.parse(JSON.stringify(rows)) as CloudSessionRow[];
    const workspaces = reconstructWorkspaces(stored);
    const ws = workspaces.get('XAUUSD')!;
    expect(ws.active.trading.executionCosts).toEqual(active.trading.executionCosts);
  });

  it('an archived session round-trips executionCosts losslessly', () => {
    const active = activeSession();
    const archived: FlattenSession = {
      id: 'a1',
      name: 'Plan A',
      createdAt: 1_690_000_000_000,
      cursor: 1680005000,
      trading: tradingWithCosts(),
      clientUpdatedAt: 1_680_005_000_000,
      lastOpenedAt: null,
    };
    const input: FlattenInput = { symbol: 'XAUUSD', active, archived: [archived] };
    const { rows } = flattenWorkspace(input);

    const workspaces = reconstructWorkspaces(rows);
    const ws = workspaces.get('XAUUSD')!;
    expect(ws.sessions).toHaveLength(1);
    expect(ws.sessions[0].trading.executionCosts).toEqual(archived.trading.executionCosts);
  });
});
