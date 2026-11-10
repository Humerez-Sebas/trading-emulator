import type { Lesson } from '../../state/lessons/lessons.models';

/**
 * J-1 raster guard predicate — the ONE place the rule lives. The system never
 * stores pixels (TKM §2.1, RFC-016 §4). Shared by `LessonsDbService` (refuses the
 * write), the Reflection Cabin (refuses the save before any dispatch) and
 * `SessionSyncService.pushLessons` (never sends it to the cloud).
 *
 * Scope: `evidence` is scanned for any raster pattern (`data:image`, `base64`,
 * `blob:`). The trader's free text (`whatHappened`/`repeat`/`avoid`) is opaque
 * (D16.G, J-2) and is NOT scanned for those words — a lesson that merely
 * mentions "base64" is valid prose — but a complete pasted image data URI
 * (`data:image/…;base64,`) is still a violation there, since that would be pixels.
 */
export type RasterViolation = 'evidence' | 'free-text';

const EVIDENCE_PATTERN = /data:image|base64|blob:/i;
const DATA_URI_PATTERN = /data:image\/[a-z0-9.+-]+;base64,/i;

export function findRasterViolation(
  lesson: Pick<Lesson, 'whatHappened' | 'repeat' | 'avoid' | 'evidence'>,
): RasterViolation | null {
  if (EVIDENCE_PATTERN.test(JSON.stringify(lesson.evidence))) return 'evidence';
  const text = JSON.stringify([lesson.whatHappened, lesson.repeat, lesson.avoid]);
  if (DATA_URI_PATTERN.test(text)) return 'free-text';
  return null;
}
