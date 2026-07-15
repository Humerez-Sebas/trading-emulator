import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_EVIDENCE_SCENES } from '../domain/reflection/scene-spec';
import { LessonsDbService } from './lessons-db.service';
import { Lesson } from '../state/lessons/lessons.models';

function lesson(id: string, over: Partial<Lesson> = {}): Lesson {
  return {
    id,
    authoredAt: 1,
    whatHappened: 'text',
    repeat: 'text',
    avoid: 'text',
    linkedRuleIds: [],
    evidence: [],
    tradeRefs: [],
    sessionRef: 'sess1',
    ...over,
  };
}

describe('LessonsDbService', () => {
  let svc: LessonsDbService;
  beforeEach(async () => {
    svc = new LessonsDbService();
    await svc.clear();
  });

  it('round-trips upsert → loadAll', async () => {
    await svc.upsert(lesson('l1'));
    await svc.upsertMany([lesson('l2'), lesson('l3')]);
    const all = await svc.loadAll();
    expect(all.map((l) => l.id).sort()).toEqual(['l1', 'l2', 'l3']);
  });

  it('upsert overwrites by id (no duplicates)', async () => {
    await svc.upsert(lesson('l1', { whatHappened: 'v1' }));
    await svc.upsert(lesson('l1', { whatHappened: 'v2' }));
    const all = await svc.loadAll();
    expect(all).toHaveLength(1);
    expect(all[0].whatHappened).toBe('v2');
  });

  it('rejects a candle-poisoned payload (P-6, assertNoCandles reused)', async () => {
    const poisoned = {
      ...lesson('bad'),
      candles: [{ time: 1, open: 1, high: 1, low: 1, close: 1 }],
    };
    await expect(svc.upsert(poisoned as never)).rejects.toThrow();
  });

  it('rejects lesson with rasterized content (J-1 guard)', async () => {
    const withRaster = {
      ...lesson('raster'),
      evidence: [
        {
          symbol: 'EURUSD',
          datasetRefs: [],
          window: { t0: 1, t1: 2 },
          cursorTime: 1,
          orderGeometry: { side: 'buy', entryPrice: 1, sl: 1, tp: null, lots: 1 },
          drawingSet: [],
          telemetryMarkers: {},
        },
      ] as any,
    };
    // Manually inject a data:image URL into the serialized form to trigger the guard
    const withDataUrl = {
      ...withRaster,
      whatHappened: 'data:image/png;base64,ABC123',
    };
    await expect(svc.upsert(withDataUrl as never)).rejects.toThrow(/raster guard/);
  });

  it('rejects lesson with evidence > MAX_EVIDENCE_SCENES (J-2 evidence cap)', async () => {
    const tooManyScenes = lesson('overcap', {
      evidence: Array(MAX_EVIDENCE_SCENES + 1)
        .fill(null)
        .map((_, i) => ({
          symbol: 'EURUSD',
          datasetRefs: [],
          window: { t0: i, t1: i + 1 },
          cursorTime: i,
          orderGeometry: { side: 'buy', entryPrice: 1, sl: 1, tp: null, lots: 1 },
          drawingSet: [],
          telemetryMarkers: {},
        })),
    });
    await expect(svc.upsert(tooManyScenes)).rejects.toThrow(/evidence cap/);
  });

  it('accepts lesson with exactly MAX_EVIDENCE_SCENES (J-2: 5 is ok)', async () => {
    const maxScenes = lesson('max', {
      evidence: Array(MAX_EVIDENCE_SCENES)
        .fill(null)
        .map((_, i) => ({
          symbol: 'EURUSD',
          datasetRefs: [],
          window: { t0: i, t1: i + 1 },
          cursorTime: i,
          orderGeometry: { side: 'buy', entryPrice: 1, sl: 1, tp: null, lots: 1 },
          drawingSet: [],
          telemetryMarkers: {},
        })),
    });
    await expect(svc.upsert(maxScenes)).resolves.toBeUndefined();
    const all = await svc.loadAll();
    expect(all).toHaveLength(1);
  });

  it('survives deletion of the OTHER databases (P-3, J-4)', async () => {
    await svc.upsert(lesson('keep'));
    indexedDB.deleteDatabase('emulador-workspaces');
    indexedDB.deleteDatabase('emulador-telemetry');
    indexedDB.deleteDatabase('emulador-playbook');
    await new Promise((r) => setTimeout(r, 100));
    expect((await svc.loadAll()).map((l) => l.id)).toEqual(['keep']);
  });

  it('accepts 0-length evidence (J-2: no minimum)', async () => {
    const emptyEvidence = lesson('empty', { evidence: [] });
    await expect(svc.upsert(emptyEvidence)).resolves.toBeUndefined();
    const all = await svc.loadAll();
    expect(all[0].evidence).toHaveLength(0);
  });
});
