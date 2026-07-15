import { createFeature, createReducer, on } from '@ngrx/store';
import { LessonsActions } from './lessons.actions';
import { LessonsState } from './lessons.models';

const initialState: LessonsState = { lessons: [], loaded: false };

export const lessonsFeature = createFeature({
  name: 'lessons',
  reducer: createReducer(
    initialState,
    on(LessonsActions.hydrated, (state, { lessons }): LessonsState => ({
      lessons,
      loaded: true,
    })),
    on(LessonsActions.createLesson, (state, { lesson }): LessonsState => {
      // Idempotence guard: if a lesson with this id already exists, return
      // state unchanged (same reference) — do not add a duplicate.
      if (state.lessons.find((l) => l.id === lesson.id)) return state;
      return {
        ...state,
        lessons: [...state.lessons, lesson],
      };
    }),
    on(LessonsActions.updateLesson, (state, { id, whatHappened, repeat, avoid, linkedRuleIds, clientUpdatedAt }): LessonsState => {
      const target = state.lessons.find((l) => l.id === id);
      if (!target) return state;
      return {
        ...state,
        lessons: state.lessons.map((l) =>
          l.id === id
            ? {
                ...l,
                whatHappened: whatHappened !== undefined ? whatHappened : l.whatHappened,
                repeat: repeat !== undefined ? repeat : l.repeat,
                avoid: avoid !== undefined ? avoid : l.avoid,
                linkedRuleIds: linkedRuleIds !== undefined ? linkedRuleIds : l.linkedRuleIds,
                clientUpdatedAt,
              }
            : l,
        ),
      };
    }),
    on(LessonsActions.lessonsSynced, (state, { stamps }): LessonsState => ({
      ...state,
      lessons: state.lessons.map((l) => {
        const s = stamps.find((x) => x.id === l.id);
        return s ? { ...l, syncedAt: s.syncedAt } : l;
      }),
    })),
  ),
});
