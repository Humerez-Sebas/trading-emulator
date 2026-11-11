import { createSelector } from '@ngrx/store';
import { lessonsFeature } from './lessons.reducer';
import { Lesson } from './lessons.models';

export const selectLessons = lessonsFeature.selectLessons;
export const selectLessonsLoaded = lessonsFeature.selectLoaded;

/**
 * ONE memoized map: sessionRef → Lesson[] for that session (J-5 seed).
 * No per-session factory selectors (D8 ban); this single selector handles
 * all session lookups via indexing into the shared map.
 */
export const selectLessonsBySession = createSelector(selectLessons, (lessons) => {
  const bySession: Record<string, Lesson[]> = {};
  for (const lesson of lessons) {
    if (!bySession[lesson.sessionRef]) {
      bySession[lesson.sessionRef] = [];
    }
    bySession[lesson.sessionRef].push(lesson);
  }
  return bySession;
});

/**
 * ONE memoized map: tradeRef → Lesson (resolves trade reference to its lesson).
 * If a trade ref appears in multiple lessons' tradeRefs arrays, last-write-wins:
 * the last lesson in the array order wins (the map key is unique, so the last
 * lesson encountered for that trade ref replaces earlier ones). This is a
 * simplification; lessons should link DISTINCT trades. Documented for auditing.
 * No per-trade factory selectors (D8 ban); this single selector handles all
 * trade lookups via indexing into the shared map.
 */
export const selectLessonByTradeRef = createSelector(selectLessons, (lessons) => {
  const byTradeRef: Record<string, Lesson> = {};
  for (const lesson of lessons) {
    for (const tradeRef of lesson.tradeRefs) {
      byTradeRef[tradeRef] = lesson;
    }
  }
  return byTradeRef;
});
