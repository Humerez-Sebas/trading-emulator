import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { Subscription, Subject, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOT_EFFECTS_INIT } from '@ngrx/effects';
import { PlaybookEffects } from './playbook.effects';
import { PlaybookActions } from './playbook.actions';
import { PlaybookDbService } from '../../services/playbook-db.service';
import { PlaybookRule } from './playbook.models';
import { selectPlaybookRules } from './playbook.selectors';

function rule(id: string, over: Partial<PlaybookRule> = {}): PlaybookRule {
  return {
    id,
    title: 't',
    statement: 's',
    createdAt: 1,
    status: 'active',
    shortcutSlot: null,
    sortOrder: 0,
    amendments: [],
    ...over,
  };
}

describe('PlaybookEffects', () => {
  let actions$: Subject<any>;
  let store: MockStore;
  let effects: PlaybookEffects;
  let dbService: { loadAll: ReturnType<typeof vi.fn>; upsertMany: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    actions$ = new Subject();
    dbService = {
      loadAll: vi.fn().mockResolvedValue([]),
      upsertMany: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        PlaybookEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        { provide: PlaybookDbService, useValue: dbService },
      ],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(PlaybookEffects);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  function subscribeAll(): Subscription {
    const sub = new Subscription();
    sub.add(effects.bootstrapHydrate$.subscribe());
    sub.add(effects.hydrate$.subscribe());
    sub.add(effects.persist$.subscribe());
    return sub;
  }

  describe('bootstrapHydrate$', () => {
    it('dispatches hydrate on ROOT_EFFECTS_INIT', async () => {
      const p = firstValueFrom(effects.bootstrapHydrate$);
      actions$.next({ type: ROOT_EFFECTS_INIT });
      expect(await p).toEqual(PlaybookActions.hydrate());
    });
  });

  describe('hydrate$', () => {
    it('dispatches hydrated with rules from the DB on hydrate action', async () => {
      const rules = [rule('a'), rule('b')];
      (dbService.loadAll as any).mockResolvedValue(rules);

      const results: any[] = [];
      effects.hydrate$.subscribe((a) => results.push(a));

      actions$.next(PlaybookActions.hydrate());

      await Promise.resolve();

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(PlaybookActions.hydrated({ rules }));
    });

    it('survives a DB load error and still emits hydrated with empty rules', async () => {
      (dbService.loadAll as any).mockRejectedValue(new Error('DB error'));

      const results: any[] = [];
      effects.hydrate$.subscribe((a) => results.push(a));

      actions$.next(PlaybookActions.hydrate());

      await Promise.resolve();

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(PlaybookActions.hydrated({ rules: [] }));
    });
  });

  describe('persist$', () => {
    it('calls upsertMany with current rules on createRule', async () => {
      const currentRules = [rule('a'), rule('b')];
      store.overrideSelector(selectPlaybookRules, currentRules);
      subscribeAll();

      actions$.next(PlaybookActions.createRule({ id: 'c', title: 't', statement: 's', createdAt: 1 }));

      await Promise.resolve();

      expect(dbService.upsertMany).toHaveBeenCalledWith(currentRules);
    });

    it('calls upsertMany with current rules on updateRule', async () => {
      const currentRules = [rule('a', { title: 'updated' })];
      store.overrideSelector(selectPlaybookRules, currentRules);
      subscribeAll();

      actions$.next(PlaybookActions.updateRule({ id: 'a', title: 'updated' }));

      await Promise.resolve();

      expect(dbService.upsertMany).toHaveBeenCalledWith(currentRules);
    });

    it('calls upsertMany with current rules on setRuleStatus', async () => {
      const currentRules = [rule('a', { status: 'retired' })];
      store.overrideSelector(selectPlaybookRules, currentRules);
      subscribeAll();

      actions$.next(PlaybookActions.setRuleStatus({ id: 'a', status: 'retired' }));

      await Promise.resolve();

      expect(dbService.upsertMany).toHaveBeenCalledWith(currentRules);
    });

    it('calls upsertMany with current rules on assignSlot', async () => {
      const currentRules = [rule('a', { shortcutSlot: 1 })];
      store.overrideSelector(selectPlaybookRules, currentRules);
      subscribeAll();

      actions$.next(PlaybookActions.assignSlot({ id: 'a', slot: 1 }));

      await Promise.resolve();

      expect(dbService.upsertMany).toHaveBeenCalledWith(currentRules);
    });

    it('calls upsertMany with current rules on reorderRule', async () => {
      const currentRules = [rule('a', { sortOrder: 5 })];
      store.overrideSelector(selectPlaybookRules, currentRules);
      subscribeAll();

      actions$.next(PlaybookActions.reorderRule({ id: 'a', sortOrder: 5 }));

      await Promise.resolve();

      expect(dbService.upsertMany).toHaveBeenCalledWith(currentRules);
    });

    it('calls upsertMany with current rules on rulesSynced', async () => {
      const currentRules = [rule('a', { syncedAt: 123 })];
      store.overrideSelector(selectPlaybookRules, currentRules);
      subscribeAll();

      actions$.next(PlaybookActions.rulesSynced({ stamps: [{ id: 'a', clientUpdatedAt: 100, syncedAt: 123 }] }));

      await Promise.resolve();

      expect(dbService.upsertMany).toHaveBeenCalledWith(currentRules);
    });

    it('survives a DB error and keeps the stream alive for the next action', async () => {
      const currentRules = [rule('a')];
      store.overrideSelector(selectPlaybookRules, currentRules);
      (dbService.upsertMany as any).mockRejectedValue(new Error('DB error'));
      subscribeAll();

      actions$.next(PlaybookActions.createRule({ id: 'b', title: 't', statement: 's', createdAt: 1 }));

      await Promise.resolve();

      // Stream should be alive, so we can send another action
      store.overrideSelector(selectPlaybookRules, [rule('a'), rule('b')]);
      (dbService.upsertMany as any).mockResolvedValue(undefined);
      actions$.next(PlaybookActions.updateRule({ id: 'b', title: 'updated' }));

      await Promise.resolve();

      // Should have called upsertMany twice (once failed, once succeeded)
      expect(dbService.upsertMany).toHaveBeenCalledTimes(2);
    });
  });
});
