import { describe, expect, it } from 'vitest';
import { snapshotDrawings, toDrawingSnapshotEntry } from './telemetry-drawings';
import type { Drawing } from '../drawings/drawings.models';

const rect = (): Drawing => ({
  id: 'd1',
  kind: 'rect',
  p1: { time: 100, price: 1.1 },
  p2: { time: 200, price: 1.2 },
});

describe('telemetry-drawings (RFC-014 T5b-ii) — G3 frozen snapshot mapping', () => {
  describe('toDrawingSnapshotEntry', () => {
    it('maps kind/p1/p2 into type/anchorPoints/styleToken', () => {
      const entry = toDrawingSnapshotEntry(rect());
      expect(entry).toEqual({
        type: 'rect',
        anchorPoints: [
          { time: 100, price: 1.1 },
          { time: 200, price: 1.2 },
        ],
        styleToken: 'rect',
      });
    });

    it('styleToken currently mirrors kind (no separate style field on Drawing)', () => {
      const line: Drawing = { id: 'd2', kind: 'line', p1: { time: 0, price: 0 }, p2: { time: 1, price: 1 } };
      expect(toDrawingSnapshotEntry(line).styleToken).toBe('line');
    });

    it('is a DEEP copy: mutating the source drawing after capture does not alter the snapshot', () => {
      const source = rect();
      const entry = toDrawingSnapshotEntry(source);

      source.p1.price = 999;
      source.p2.time = 999;
      (source as { kind: string }).kind = 'line';

      expect(entry.anchorPoints[0].price).toBe(1.1);
      expect(entry.anchorPoints[1].time).toBe(200);
      expect(entry.type).toBe('rect');
    });
  });

  describe('snapshotDrawings', () => {
    it('maps every item in the array', () => {
      const items: Drawing[] = [
        rect(),
        { id: 'd2', kind: 'fib', p1: { time: 10, price: 1 }, p2: { time: 20, price: 2 } },
      ];
      const snapshot = snapshotDrawings(items);
      expect(snapshot).toHaveLength(2);
      expect(snapshot[1]).toEqual({
        type: 'fib',
        anchorPoints: [
          { time: 10, price: 1 },
          { time: 20, price: 2 },
        ],
        styleToken: 'fib',
      });
    });

    it('is a frozen copy of the ARRAY too: deleting from the source afterward does not shrink the snapshot', () => {
      const items: Drawing[] = [rect()];
      const snapshot = snapshotDrawings(items);
      items.splice(0, 1); // delete the only drawing from the live source
      expect(snapshot).toHaveLength(1);
      expect(snapshot[0].type).toBe('rect');
    });

    it('mutating a point on a source item after snapshotting does not alter the captured entry', () => {
      const items: Drawing[] = [rect()];
      const snapshot = snapshotDrawings(items);
      items[0].p1.price = -1;
      expect(snapshot[0].anchorPoints[0].price).toBe(1.1);
    });
  });
});
