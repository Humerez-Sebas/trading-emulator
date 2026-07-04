import { describe, it, expect } from 'vitest';
import { migrateV1ToV2, parseSessionPayload, singlePanelLayoutFor, isSessionPayloadV2 } from './session-migration';
import { SESSION_PAYLOAD_VERSION, SESSION_PAYLOAD_VERSION_2, type SessionPayloadV1 } from './session-sync.models';
import { defaultTradingData } from '../state/trading/trading.models';
import type { Drawing } from '../state/drawings/drawings.models';

const drawing = (id: string): Drawing => ({
  id,
  kind: 'line',
  p1: { time: 100, price: 1.1 },
  p2: { time: 200, price: 1.2 },
});

function sampleV1(): SessionPayloadV1 {
  const trading = defaultTradingData(5000);
  trading.riskPct = 3;
  trading.sessionName = 'My Session';
  return {
    schemaVersion: SESSION_PAYLOAD_VERSION,
    trading,
    currentTime: 1700050000,
    activeTf: 'H1',
    customTfMinutes: null,
    playbackSpeed: 2,
    replayResolution: 5,
    drawings: [drawing('d1'), drawing('d2')],
    notes: ['a note'],
    selectedTfs: ['M1', 'H1'],
    startRange: 1699000000,
    endRange: 1700200000,
    requiredDatasets: [{ symbol: 'EURUSD', timeframe: 'H1' }],
  };
}

describe('singlePanelLayoutFor', () => {
  it('produces one tab, one cell, one panel for the given symbol+timeframe, unlinked', () => {
    const { layout, panels } = singlePanelLayoutFor('EURUSD', 'H1');
    expect(layout.tabs).toHaveLength(1);
    expect(layout.tabs[0].template).toBe('1');
    expect(layout.tabs[0].cells).toHaveLength(1);
    const panelId = layout.tabs[0].cells[0].panelIds[0];
    expect(layout.tabs[0].cells[0].activePanelId).toBe(panelId);
    expect(panels[panelId]).toEqual({ id: panelId, symbol: 'EURUSD', timeframe: 'H1', linkGroupId: null });
    expect(layout.activeTabId).toBe(layout.tabs[0].id);
  });
});

describe('migrateV1ToV2', () => {
  it('preserves every V1 field verbatim except drawings/schemaVersion', () => {
    const v1 = sampleV1();
    const v2 = migrateV1ToV2(v1, 'EURUSD');
    expect(v2.schemaVersion).toBe(SESSION_PAYLOAD_VERSION_2);
    expect(v2.trading).toEqual(v1.trading);
    expect(v2.currentTime).toBe(v1.currentTime);
    expect(v2.activeTf).toBe(v1.activeTf);
    expect(v2.customTfMinutes).toBe(v1.customTfMinutes);
    expect(v2.playbackSpeed).toBe(v1.playbackSpeed);
    expect(v2.replayResolution).toBe(v1.replayResolution);
    expect(v2.notes).toEqual(v1.notes);
    expect(v2.selectedTfs).toEqual(v1.selectedTfs);
    expect(v2.startRange).toBe(v1.startRange);
    expect(v2.endRange).toBe(v1.endRange);
    expect(v2.requiredDatasets).toEqual(v1.requiredDatasets);
  });

  it('assigns every V1 drawing to the primarySymbol under version 1, losing none', () => {
    const v1 = sampleV1();
    const v2 = migrateV1ToV2(v1, 'EURUSD');
    expect(v2.drawings).toEqual({ EURUSD: { version: 1, items: v1.drawings } });
  });

  it('synthesizes a single-panel layout of the primarySymbol + V1 activeTf, with empty linkGroups', () => {
    const v1 = sampleV1();
    const v2 = migrateV1ToV2(v1, 'EURUSD');
    const panelId = v2.layout.tabs[0].cells[0].panelIds[0];
    expect(v2.panels[panelId]).toEqual({ id: panelId, symbol: 'EURUSD', timeframe: 'H1', linkGroupId: null });
    expect(v2.linkGroups).toEqual([]);
  });

  it('a null V1 activeTf still produces a valid single panel (defaults to M1)', () => {
    const v1 = { ...sampleV1(), activeTf: null };
    const v2 = migrateV1ToV2(v1, 'EURUSD');
    const panelId = v2.layout.tabs[0].cells[0].panelIds[0];
    expect(v2.panels[panelId].timeframe).toBe('M1');
  });

  it('round-trip: migrating, JSON-serializing, and re-parsing produces a structurally identical V2', () => {
    const v1 = sampleV1();
    const migrated = migrateV1ToV2(v1, 'EURUSD');
    const reparsed = JSON.parse(JSON.stringify(migrated));
    expect(reparsed).toEqual(migrated);
  });

  it('is idempotent: migrating an already-V2 payload via parseSessionPayload is a no-op passthrough', () => {
    const v1 = sampleV1();
    const v2 = migrateV1ToV2(v1, 'EURUSD');
    const again = parseSessionPayload(v2, 'EURUSD');
    expect(again).toEqual(v2);
  });
});

describe('isSessionPayloadV2', () => {
  it('true for a migrated payload', () => {
    expect(isSessionPayloadV2(migrateV1ToV2(sampleV1(), 'EURUSD'))).toBe(true);
  });
  it('false for a raw V1 payload (schemaVersion 1)', () => {
    expect(isSessionPayloadV2(sampleV1())).toBe(false);
  });
  it('false for schemaVersion absent (pre-versioning legacy)', () => {
    const rest: Record<string, unknown> = { ...sampleV1() };
    delete rest['schemaVersion'];
    expect(isSessionPayloadV2(rest)).toBe(false);
  });
});

describe('parseSessionPayload defensive fallback', () => {
  it('migrates a V1 payload', () => {
    const v1 = sampleV1();
    const parsed = parseSessionPayload(v1, 'EURUSD');
    expect(parsed.schemaVersion).toBe(SESSION_PAYLOAD_VERSION_2);
    expect(parsed.drawings).toEqual({ EURUSD: { version: 1, items: v1.drawings } });
  });

  it('passes through a well-formed V2 payload unchanged', () => {
    const v2 = migrateV1ToV2(sampleV1(), 'EURUSD');
    expect(parseSessionPayload(v2, 'EURUSD')).toEqual(v2);
  });

  it('falls back to the single-panel default when layout/panels are inconsistent (orphan panelId)', () => {
    const v2 = migrateV1ToV2(sampleV1(), 'EURUSD');
    const corrupt = { ...v2, layout: { ...v2.layout, tabs: [{ ...v2.layout.tabs[0], cells: [{ panelIds: ['ghost-panel'], activePanelId: 'ghost-panel' }] }] } };
    const parsed = parseSessionPayload(corrupt, 'EURUSD');
    const panelId = parsed.layout.tabs[0].cells[0].panelIds[0];
    expect(parsed.panels[panelId]).toEqual({ id: panelId, symbol: 'EURUSD', timeframe: v2.activeTf ?? 'M1', linkGroupId: null });
  });

  it('falls back to the single-panel default when layout/panels are structurally malformed, instead of throwing', () => {
    const v2 = migrateV1ToV2(sampleV1(), 'EURUSD');
    const malformed: Record<string, unknown>[] = [
      { ...v2, layout: null },
      { ...v2, layout: {} },
      { ...v2, layout: { tabs: null } },
      { ...v2, layout: { tabs: 'x' } },
      { ...v2, layout: { ...v2.layout, tabs: [{ id: 't', name: 't', template: '1', cells: null }] } },
      { ...v2, panels: null },
    ];
    for (const corrupt of malformed) {
      const parsed = parseSessionPayload(corrupt, 'EURUSD');
      const panelId = parsed.layout.tabs[0].cells[0].panelIds[0];
      expect(parsed.panels[panelId]).toEqual({ id: panelId, symbol: 'EURUSD', timeframe: 'H1', linkGroupId: null });
      expect(parsed.trading).toEqual(v2.trading); // non-layout fields survive the fallback
    }
  });

  it('falls back to the single-panel default when panels references a linkGroupId with no matching LinkGroup entry is NOT itself invalid (linkGroups only gate ChartSyncRouter behavior, not layout consistency) — sanity check this does NOT trigger a fallback', () => {
    const v2 = migrateV1ToV2(sampleV1(), 'EURUSD');
    const panelId = Object.keys(v2.panels)[0];
    const withDanglingGroup = { ...v2, panels: { ...v2.panels, [panelId]: { ...v2.panels[panelId], linkGroupId: 'nonexistent-group' } } };
    const parsed = parseSessionPayload(withDanglingGroup, 'EURUSD');
    expect(parsed.panels[panelId].linkGroupId).toBe('nonexistent-group'); // preserved: not layout's job to validate group refs
  });
});
