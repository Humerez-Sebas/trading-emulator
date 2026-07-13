import type { Drawing } from '../drawings/drawings.models';
import type { DrawingSnapshotEntry } from './telemetry.models';

/**
 * G3 frozen vector photo (copy-on-write): maps live `Drawing`s to their
 * `DrawingSnapshot` telemetry shape, DEEP-COPYING every field so a later
 * mutation (or deletion) of the source `drawings.items` array/objects can
 * never alter an already-captured snapshot.
 *
 * `styleToken` mapping decision: `drawings.models.ts`'s `Drawing` carries NO
 * separate style/color field today — every drawing renders with the SAME
 * theme-derived accent color, keyed only by `kind`
 * (`domain/chart/capabilities/drawings-primitive.ts`: `ctx.strokeStyle =
 * this.colors.accent` for every drawing type, no per-instance override
 * anywhere). `kind` is therefore the only compact, stable, style-relevant
 * identifier the domain model has right now, so `styleToken = kind`. If a
 * per-drawing style/color field is ever added to `Drawing`, this is the one
 * place to update the mapping — nothing else in the telemetry layer depends
 * on `styleToken` being distinct from `type`.
 */
export function toDrawingSnapshotEntry(d: Drawing): DrawingSnapshotEntry {
  return {
    type: d.kind,
    anchorPoints: [
      { time: d.p1.time, price: d.p1.price },
      { time: d.p2.time, price: d.p2.price },
    ],
    styleToken: d.kind,
  };
}

/** Maps a live drawings array to a frozen, independent snapshot array (see {@link toDrawingSnapshotEntry}). */
export function snapshotDrawings(items: readonly Drawing[]): DrawingSnapshotEntry[] {
  return items.map(toDrawingSnapshotEntry);
}
