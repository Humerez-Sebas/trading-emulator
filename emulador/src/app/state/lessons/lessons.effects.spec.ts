import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subject, firstValueFrom, Subscription } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROOT_EFFECTS_INIT } from '@ngrx/effects';
import { LessonsEffects } from './lessons.effects';
import { LessonsActions } from './lessons.actions';
import { Lesson } from './lessons.models';
import { LessonsDbService } from '../../services/lessons-db.service';
import { selectLessons } from './lessons.selectors';

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

describe('LessonsEffects', () => {
  let actions$: Subject<any>;
  let store: MockStore;
  let effects: LessonsEffects;
  let db: LessonsDbService;

  beforeEach(async () => {
    actions$ = new Subject();
    await TestBed.configureTestingModule({
      providers: [
        LessonsEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        LessonsDbService,
      ],
    }).compileComponents();

    store = TestBed.inject(MockStore);
    effects = TestBed.inject(LessonsEffects);
    db = TestBed.inject(LessonsDbService);
    await db.clear();
  });

  afterEach(() => {
    store.resetSelectors();
  });

  it('bootstrapHydrate$ dispatches hydrate on ROOT_EFFECTS_INIT', async () => {
    const p = firstValueFrom(effects.bootstrapHydrate$);
    actions$.next({ type: ROOT_EFFECTS_INIT });
    expect(await p).toEqual(LessonsActions.hydrate());
  });

  it('hydrate$ loads from DB and dispatches hydrated', async () => {
    await db.upsert(lesson('l1'));
    await db.upsert(lesson('l2'));
    const p = firstValueFrom(effects.hydrate$);
    actions$.next(LessonsActions.hydrate());
    const result = await p;
    expect(result.lessons).toHaveLength(2);
    expect(result.lessons.map((l: Lesson) => l.id)).toContain('l1');
  });

  it('hydrate$ DB failure → hydrated([]) (stream alive)', async () => {
    indexedDB.deleteDatabase('emulador-lessons');
    const p = firstValueFrom(effects.hydrate$);
    actions$.next(LessonsActions.hydrate());
    const result = await p;
    expect(result.lessons).toEqual([]);
  });

  it('persist$ upserts current lessons on createLesson', async () => {
    const currentLessons = [lesson('l1'), lesson('l2')];
    store.overrideSelector(selectLessons, currentLessons);
    const sub = new Subscription();
    sub.add(effects.persist$.subscribe());
    actions$.next(LessonsActions.createLesson({ lesson: lesson('l3') }));
    await Promise.resolve();
    const stored = await db.loadAll();
    expect(stored).toHaveLength(2);
    sub.unsubscribe();
  });

  it('persist$ error is swallowed (stream survives)', async () => {
    const currentLessons = [lesson('l1')];
    store.overrideSelector(selectLessons, currentLessons);
    const sub = new Subscription();
    sub.add(effects.persist$.subscribe());
    actions$.next(LessonsActions.createLesson({ lesson: lesson('l2') }));
    actions$.next(
      LessonsActions.updateLesson({ id: 'l1', whatHappened: 'x', clientUpdatedAt: 100 }),
    );
    await Promise.resolve();
    sub.unsubscribe();
  });
});
