import { describe, it, expect } from 'vitest';
import {
  migrateV1ToV2,
  migrateV2ToV3,
  isSessionPayloadV3,
  parseSessionPayload,
} from './session-migration';
import {
  SESSION_PAYLOAD_VERSION,
  SESSION_PAYLOAD_VERSION_2,
  SESSION_PAYLOAD_VERSION_3,
  type SessionPayloadV1,
  type SessionPayloadV2,
  type SessionPayloadV3,
  type DrawingCollection,
} from './session-sync.models';
import { toPayload, fromPayload } from './session-sync.mapping';
import { defaultTradingData } from '../state/trading/trading.models';
import type { Drawing } from '../state/drawings/drawings.models';
import type { WorkspaceLayout, PanelDescriptor } from '../state/layout/layout.models';
import type { LinkGroup } from '../state/link-groups/link-groups.models';

/**
 * A two-panel layout: p1 shows GBPUSD, p2 shows EURUSD. Neither shows
 * USDJPY, so it exercises the "no panel matches" fallback; EURUSD is shown
 * only by the SECOND panel, so it exercises the "not just the first panel"
 * rule.
 */
function twoPanelLayout(): { layout: WorkspaceLayout; panels: Record<string, PanelDescriptor> } {
  const layout: WorkspaceLayout = {
    tabs: [
      {
        id: 'tab-1',
        name: 'Uno',
        template: '2h',
        cells: [
          { panelIds: ['p1'], activePanelId: 'p1' },
          { panelIds: ['p2'], activePanelId: 'p2' },
        ],
      },
    ],
    activeTabId: 'tab-1',
  };
  const panels: Record<string, PanelDescriptor> = {
    p1: { id: 'p1', symbol: 'GBPUSD', timeframe: 'M1', linkGroupId: null },
    p2: { id: 'p2', symbol: 'EURUSD', timeframe: 'M1', linkGroupId: null },
  };
  return { layout, panels };
}

/**
 * A legacy V2 item, deliberately built as a full (already owner-tagged)
 * `Drawing` with WRONG symbol/owner/zIndex/locked/visible — every fidelity
 * assertion that expects these fields to come out re-derived (not merely
 * copied) would fail if the migration read them off the item instead of
 * deriving them fresh.
 */
function legacyItem(id: string, seed: number): Drawing {
  return {
    id,
    symbol: 'WRONG-SYMBOL',
    owner: { type: 'panel', id: 'stale-owner' },
    kind: 'line',
    p1: { time: seed, price: 1 + seed / 1000 },
    p2: { time: seed + 100, price: 1.5 + seed / 1000 },
    zIndex: 999,
    locked: true,
    visible: false,
  };
}

function v2Fixture(
  drawings: Record<string, DrawingCollection>,
  layoutPanels = twoPanelLayout(),
): SessionPayloadV2 {
  const trading = defaultTradingData(7500);
  trading.riskPct = 4;
  trading.sessionName = 'Fixture Session';
  return {
    schemaVersion: SESSION_PAYLOAD_VERSION_2,
    trading,
    currentTime: 1700060000,
    activeTf: 'H1',
    customTfMinutes: null,
    playbackSpeed: 3,
    replayResolution: 15,
    drawings,
    notes: ['fixture note'],
    selectedTfs: ['M1', 'H1'],
    startRange: 1699500000,
    endRange: 1700600000,
    requiredDatasets: [{ symbol: 'EURUSD', timeframe: 'H1' }],
    layout: layoutPanels.layout,
    panels: layoutPanels.panels,
    linkGroups: [],
  };
}

function sampleV1(): SessionPayloadV1 {
  const trading = defaultTradingData(5000);
  trading.riskPct = 3;
  return {
    schemaVersion: SESSION_PAYLOAD_VERSION,
    trading,
    currentTime: 1700050000,
    activeTf: 'H1',
    customTfMinutes: null,
    playbackSpeed: 2,
    replayResolution: 5,
    drawings: [legacyItem('d1', 1), legacyItem('d2', 2)],
    notes: [],
    selectedTfs: ['M1', 'H1'],
    startRange: 1699000000,
    endRange: 1700200000,
    requiredDatasets: [{ symbol: 'EURUSD', timeframe: 'H1' }],
  };
}

function v3Fixture(): SessionPayloadV3 {
  const { layout, panels } = twoPanelLayout();
  const trading = defaultTradingData(9000);
  trading.riskPct = 1.5;
  return {
    schemaVersion: SESSION_PAYLOAD_VERSION_3,
    trading,
    currentTime: 1700070000,
    activeTf: 'M1',
    customTfMinutes: null,
    playbackSpeed: 2,
    replayResolution: 5,
    drawings: {
      version: 2,
      items: [
        {
          id: 'd1',
          symbol: 'EURUSD',
          owner: { type: 'panel', id: 'p2' },
          kind: 'line',
          p1: { time: 0, price: 1.1 },
          p2: { time: 10, price: 1.2 },
          zIndex: 0,
          locked: false,
          visible: true,
        },
      ],
    },
    notes: [],
    selectedTfs: ['M1'],
    startRange: 1699000000,
    endRange: 1700200000,
    requiredDatasets: [],
    layout,
    panels,
    linkGroups: [],
  };
}

// ---------------------------------------------------------------------------
// migrateV2ToV3 — the fidelity table
// ---------------------------------------------------------------------------

describe('migrateV2ToV3 — fidelity table', () => {
  it('symbol comes from the record key, never from a pre-existing item.symbol', () => {
    const v2 = v2Fixture({ EURUSD: { version: 1, items: [legacyItem('d1', 1)] } });
    const v3 = migrateV2ToV3(v2);
    expect(v3.drawings.items[0].symbol).toBe('EURUSD');
  });

  it('owner resolves to the first panel in layout order whose symbol matches, even when that is not the first panel', () => {
    // EURUSD is shown only by p2 (the SECOND panel in twoPanelLayout).
    const v2 = v2Fixture({ EURUSD: { version: 1, items: [legacyItem('d1', 1)] } });
    const v3 = migrateV2ToV3(v2);
    expect(v3.drawings.items[0].owner).toEqual({ type: 'panel', id: 'p2' });
  });

  it("falls back to the layout's first panel when no panel shows that symbol", () => {
    // USDJPY is shown by neither p1 (GBPUSD) nor p2 (EURUSD).
    const v2 = v2Fixture({ USDJPY: { version: 1, items: [legacyItem('d1', 1)] } });
    const v3 = migrateV2ToV3(v2);
    expect(v3.drawings.items[0].owner).toEqual({ type: 'panel', id: 'p1' });
  });

  it('a single-panel V2 session reduces exactly to that one panel (panel-migrated-1)', () => {
    const v2 = migrateV1ToV2(sampleV1(), 'EURUSD');
    const v3 = migrateV2ToV3(v2);
    const panelId = v3.layout.tabs[0].cells[0].panelIds[0];
    expect(panelId).toBe('panel-migrated-1');
    expect(v3.drawings.items).toHaveLength(2);
    for (const item of v3.drawings.items) {
      expect(item.owner).toEqual({ type: 'panel', id: 'panel-migrated-1' });
    }
  });

  it('zIndex preserves paint order across the WHOLE payload, not per symbol', () => {
    const v2 = v2Fixture({
      EURUSD: { version: 1, items: [legacyItem('d1', 1), legacyItem('d2', 2)] },
      GBPUSD: { version: 1, items: [legacyItem('d3', 3)] },
    });
    const v3 = migrateV2ToV3(v2);
    const zOf = (id: string) => v3.drawings.items.find((d) => d.id === id)!.zIndex;
    expect(zOf('d1')).toBe(0);
    expect(zOf('d2')).toBe(1);
    expect(zOf('d3')).toBe(2); // continues past the first symbol's bucket, does not restart
  });

  it('stamps locked:false and visible:true on every lifted item, overriding any pre-existing flags', () => {
    const v2 = v2Fixture({ EURUSD: { version: 1, items: [legacyItem('d1', 1)] } }); // pre-set locked:true, visible:false
    const v3 = migrateV2ToV3(v2);
    expect(v3.drawings.items[0].locked).toBe(false);
    expect(v3.drawings.items[0].visible).toBe(true);
  });

  it('preserves id/kind/p1/p2 verbatim, by reference', () => {
    const item = legacyItem('d1', 1);
    const v2 = v2Fixture({ EURUSD: { version: 1, items: [item] } });
    const v3 = migrateV2ToV3(v2);
    const lifted = v3.drawings.items[0];
    expect(lifted.id).toBe(item.id);
    expect(lifted.kind).toBe(item.kind);
    expect(lifted.p1).toBe(item.p1);
    expect(lifted.p2).toBe(item.p2);
  });

  it('every V2 field other than schemaVersion/drawings survives verbatim', () => {
    const v2 = v2Fixture({ EURUSD: { version: 1, items: [legacyItem('d1', 1)] } });
    const v3 = migrateV2ToV3(v2);
    expect(v3.trading).toEqual(v2.trading);
    expect(v3.currentTime).toBe(v2.currentTime);
    expect(v3.activeTf).toBe(v2.activeTf);
    expect(v3.customTfMinutes).toBe(v2.customTfMinutes);
    expect(v3.playbackSpeed).toBe(v2.playbackSpeed);
    expect(v3.replayResolution).toBe(v2.replayResolution);
    expect(v3.notes).toEqual(v2.notes);
    expect(v3.selectedTfs).toEqual(v2.selectedTfs);
    expect(v3.startRange).toBe(v2.startRange);
    expect(v3.endRange).toBe(v2.endRange);
    expect(v3.requiredDatasets).toEqual(v2.requiredDatasets);
    expect(v3.layout).toEqual(v2.layout);
    expect(v3.panels).toEqual(v2.panels);
    expect(v3.linkGroups).toEqual(v2.linkGroups);
  });

  it('is deterministic: running it twice on the same input yields deeply equal results', () => {
    const v2 = v2Fixture({
      EURUSD: { version: 1, items: [legacyItem('d1', 1)] },
      GBPUSD: { version: 1, items: [legacyItem('d2', 2)] },
    });
    expect(migrateV2ToV3(v2)).toEqual(migrateV2ToV3(v2));
  });

  it('a linkGroup missing the composition flags (predates them) normalizes to syncDrawings:false and drops any legacy syncTrades key (D18.A)', () => {
    const legacyGroup = {
      id: 'g1',
      color: '#f00',
      syncCrosshair: true,
      syncTimeRange: true,
    } as unknown as LinkGroup;
    const v2 = v2Fixture({});
    const v3 = migrateV2ToV3({ ...v2, linkGroups: [legacyGroup] });
    expect(v3.linkGroups[0].syncDrawings).toBe(false);
    expect('syncTrades' in v3.linkGroups[0]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseSessionPayload — chaining, idempotence, defensive fallback
// ---------------------------------------------------------------------------

describe('parseSessionPayload — V3 chain', () => {
  it('chains V1 -> V2 -> V3', () => {
    const v1 = sampleV1();
    const v3 = parseSessionPayload(v1, 'EURUSD');
    expect(v3.schemaVersion).toBe(SESSION_PAYLOAD_VERSION_3);
    expect(v3.drawings.items).toHaveLength(v1.drawings.length);
    expect(v3.drawings.version).toBe(2);
  });

  it('a malformed payload (no recognizable version/shape) still gets the defensive single-panel fallback, now as V3, without throwing', () => {
    const malformed: Record<string, unknown> = { unexpected: 'shape' };
    let v3!: SessionPayloadV3;
    expect(() => {
      v3 = parseSessionPayload(malformed, 'EURUSD');
    }).not.toThrow();
    expect(v3.schemaVersion).toBe(SESSION_PAYLOAD_VERSION_3);
    const panelId = v3.layout.tabs[0].cells[0].panelIds[0];
    expect(panelId).toBe('panel-migrated-1');
    expect(v3.drawings).toEqual({ version: 2, items: [] });
  });

  it('a corrupt-layout V2 payload: drawings end up owned by a panel that exists in the REPLACED layout', () => {
    const v2 = v2Fixture({ EURUSD: { version: 1, items: [legacyItem('d1', 1)] } });
    const corrupt = {
      ...v2,
      layout: {
        ...v2.layout,
        tabs: [
          {
            ...v2.layout.tabs[0],
            cells: [{ panelIds: ['ghost-panel'], activePanelId: 'ghost-panel' }],
          },
        ],
      },
    };
    const v3 = parseSessionPayload(corrupt, 'EURUSD');
    const panelId = v3.layout.tabs[0].cells[0].panelIds[0];
    expect(panelId).toBe('panel-migrated-1');
    expect(v3.panels[panelId]).toBeDefined();
    expect(v3.drawings.items[0].owner).toEqual({ type: 'panel', id: panelId });
  });

  it('a V3 payload passes through unchanged (idempotent)', () => {
    const v3 = v3Fixture();
    expect(parseSessionPayload(v3, 'EURUSD')).toBe(v3);
  });
});

// ---------------------------------------------------------------------------
// V3 round-trip
// ---------------------------------------------------------------------------

describe('V3 round trip', () => {
  it('V3 -> fromPayload -> store shape -> toPayload -> V3, deeply equal', () => {
    const v3 = v3Fixture();
    const restored = fromPayload(v3, 'EURUSD');
    const reencoded = toPayload({
      trading: restored.trading,
      currentTime: restored.cursor,
      activeTf: restored.activeTf,
      customTfMinutes: restored.customTfMinutes,
      playbackSpeed: restored.playbackSpeed,
      replayResolution: restored.replayResolution,
      drawings: restored.drawings,
      notes: restored.notes,
      selectedTfs: restored.selectedTfs,
      startRange: restored.startRange,
      endRange: restored.endRange,
      requiredDatasets: restored.requiredDatasets,
      layout: restored.layout,
      panels: restored.panels,
      linkGroups: restored.linkGroups,
    });
    expect(reencoded).toEqual(v3);
  });
});

// ---------------------------------------------------------------------------
// isSessionPayloadV3
// ---------------------------------------------------------------------------

describe('isSessionPayloadV3', () => {
  it('true for a migrated V3 payload', () => {
    const v2 = v2Fixture({});
    expect(isSessionPayloadV3(migrateV2ToV3(v2))).toBe(true);
  });

  it('false for a V2 payload (drawings is a per-symbol record, not {items: []})', () => {
    expect(isSessionPayloadV3(v2Fixture({}))).toBe(false);
  });
});
