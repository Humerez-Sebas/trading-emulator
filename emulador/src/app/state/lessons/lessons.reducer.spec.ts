import { describe, expect, it } from 'vitest';
import { lessonsFeature } from './lessons.reducer';
import { LessonsActions } from './lessons.actions';
import { Lesson } from './lessons.models';

const { reducer } = lessonsFeature;
const initial = reducer(undefined, { type: '@@init' } as never);

function lesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: 'l1',
    authoredAt: 1,
    whatHappened: 'something happened',
    repeat: 'repeat this',
    avoid: 'avoid that',
    linkedRuleIds: [],
    evidence: [],
    tradeRefs: [],
    sessionRef: 'sess1',
    ...over,
  };
}

describe('lessons reducer', () => {
  it('starts empty and not loaded', () => {
    expect(initial.lessons).toEqual([]);
    expect(initial.loaded).toBe(false);
  });

  it('hydrated replaces lessons and marks loaded', () => {
    const s = reducer(initial, LessonsActions.hydrated({ lessons: [lesson()] }));
    expect(s.lessons).toHaveLength(1);
    expect(s.loaded).toBe(true);
  });

  it('createLesson appends a fully-stamped row', () => {
    const s = reducer(
      initial,
      LessonsActions.createLesson({
        lesson: lesson({ id: 'l2', authoredAt: 5, clientUpdatedAt: 5 }),
      }),
    );
    expect(s.lessons).toHaveLength(1);
    expect(s.lessons[0]).toMatchObject({
      id: 'l2',
      authoredAt: 5,
      clientUpdatedAt: 5,
    });
  });

  it('createLesson with existing id is an idempotence guard (no-op same-reference)', () => {
    const s0 = reducer(
      initial,
      LessonsActions.createLesson({
        lesson: lesson({ id: 'l1', authoredAt: 1, clientUpdatedAt: 1 }),
      }),
    );
    const s = reducer(
      s0,
      LessonsActions.createLesson({
        lesson: lesson({ id: 'l1', authoredAt: 1, clientUpdatedAt: 1 }),
      }),
    );
    expect(s).toBe(s0);
    expect(s.lessons).toHaveLength(1);
  });

  it('updateLesson merges defined fields and stamps clientUpdatedAt', () => {
    const s0 = reducer(
      initial,
      LessonsActions.createLesson({
        lesson: lesson({ id: 'l1', whatHappened: 'v1', clientUpdatedAt: 10 }),
      }),
    );
    const s = reducer(
      s0,
      LessonsActions.updateLesson({
        id: 'l1',
        whatHappened: 'v2',
        clientUpdatedAt: 100,
      }),
    );
    expect(s.lessons[0].whatHappened).toBe('v2');
    expect(s.lessons[0].clientUpdatedAt).toBe(100);
    expect(s.lessons[0].repeat).toBe(lesson().repeat);
  });

  it('updateLesson on unknown id is a no-op same-reference', () => {
    const s0 = reducer(
      initial,
      LessonsActions.createLesson({
        lesson: lesson({ id: 'l1', clientUpdatedAt: 1 }),
      }),
    );
    const s = reducer(
      s0,
      LessonsActions.updateLesson({
        id: 'unknown',
        whatHappened: 'x',
        clientUpdatedAt: 1,
      }),
    );
    expect(s).toBe(s0);
  });

  it('lessonsSynced advances ONLY syncedAt — clientUpdatedAt is never rewritten', () => {
    const s0 = reducer(
      initial,
      LessonsActions.createLesson({
        lesson: lesson({ id: 'l1', clientUpdatedAt: 500, syncedAt: undefined }),
      }),
    );
    const s = reducer(
      s0,
      LessonsActions.lessonsSynced({ stamps: [{ id: 'l1', syncedAt: 500 }] }),
    );
    expect(s.lessons[0].clientUpdatedAt).toBe(500);
    expect(s.lessons[0].syncedAt).toBe(500);
  });

  it('a mid-flight edit after sync snapshot stays dirty: lessonsSynced with a stale syncedAt does not erase newer clientUpdatedAt', () => {
    const s0 = reducer(
      initial,
      LessonsActions.createLesson({
        lesson: lesson({ id: 'l1', clientUpdatedAt: 900, syncedAt: undefined }),
      }),
    );
    const s = reducer(
      s0,
      LessonsActions.lessonsSynced({ stamps: [{ id: 'l1', syncedAt: 500 }] }),
    );
    expect(s.lessons[0].clientUpdatedAt).toBe(900);
    expect(s.lessons[0].syncedAt).toBe(500);
    expect(s.lessons[0].clientUpdatedAt! > s.lessons[0].syncedAt!).toBe(true);
  });

  it('hydrated sets loaded to true', () => {
    const s = reducer(initial, LessonsActions.hydrated({ lessons: [] }));
    expect(s.loaded).toBe(true);
  });
});
