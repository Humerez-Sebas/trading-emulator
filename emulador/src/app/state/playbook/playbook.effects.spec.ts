import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import type { Action } from '@ngrx/store';
import { Subscription, Subject, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOT_EFFECTS_INIT } from '@ngrx/effects';
import { PlaybookEffects } from './playbook.effects';
import { PlaybookActions } from './playbook.actions';
import { playbookFeature } from './playbook.reducer';
import { PlaybookDbService } from '../../services/playbook-db.service';
import { SessionSyncService } from '../../services/session-sync.service';
import { PlaybookRule } from './playbook.models';
import { selectPlaybookRules } from './playbook.selectors';
import { AuthActions } from '../auth/auth.actions';
import { authFeature } from '../auth/auth.reducer';

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

/**
 * `Store.dispatch` is overloaded (plain `Action` vs. a `() => Action` thunk
 * form), which makes `vi.spyOn(store, 'dispatch').mock.calls[n][0]` infer as
 * the thunk overload in some contexts. Every call site in this file only
 * ever dispatches plain `Action` objects, so this narrows that safely rather
 * than reading `.type` off a union that includes a bare function type.
 */
function dispatchedAction(call: unknown[]): Action {
  return call[0] as Action;
}

describe('PlaybookEffects', () => {
  let actions$: Subject<any>;
  let store: MockStore;
  let effects: PlaybookEffects;
  let dbService: { loadAll: ReturnType<typeof vi.fn>; upsertMany: ReturnType<typeof vi.fn> };
  let syncService: {
    pushPlaybookRules: ReturnType<typeof vi.fn>;
    pullPlaybookRules: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    actions$ = new Subject();
    dbService = {
      loadAll: vi.fn().mockResolvedValue([]),
      upsertMany: vi.fn().mockResolvedValue(undefined),
    };
    syncService = {
      pushPlaybookRules: vi.fn().mockResolvedValue(undefined),
      pullPlaybookRules: vi.fn().mockResolvedValue([]),
    };
    TestBed.configureTestingModule({
      providers: [
        PlaybookEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        { provide: PlaybookDbService, useValue: dbService },
        { provide: SessionSyncService, useValue: syncService },
      ],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(PlaybookEffects);
  });

  afterEach(() => {
    store.resetSelectors();
    vi.useRealTimers();
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

      actions$.next(
        PlaybookActions.updateRule({ id: 'a', title: 'updated', clientUpdatedAt: 100 }),
      );

      await Promise.resolve();

      expect(dbService.upsertMany).toHaveBeenCalledWith(currentRules);
    });

    it('calls upsertMany with current rules on setRuleStatus', async () => {
      const currentRules = [rule('a', { status: 'retired' })];
      store.overrideSelector(selectPlaybookRules, currentRules);
      subscribeAll();

      actions$.next(
        PlaybookActions.setRuleStatus({ id: 'a', status: 'retired', clientUpdatedAt: 100 }),
      );

      await Promise.resolve();

      expect(dbService.upsertMany).toHaveBeenCalledWith(currentRules);
    });

    it('calls upsertMany with current rules on assignSlot', async () => {
      const currentRules = [rule('a', { shortcutSlot: 1 })];
      store.overrideSelector(selectPlaybookRules, currentRules);
      subscribeAll();

      actions$.next(PlaybookActions.assignSlot({ id: 'a', slot: 1, clientUpdatedAt: 100 }));

      await Promise.resolve();

      expect(dbService.upsertMany).toHaveBeenCalledWith(currentRules);
    });

    it('calls upsertMany with current rules on reorderRule', async () => {
      const currentRules = [rule('a', { sortOrder: 5 })];
      store.overrideSelector(selectPlaybookRules, currentRules);
      subscribeAll();

      actions$.next(PlaybookActions.reorderRule({ id: 'a', sortOrder: 5, clientUpdatedAt: 100 }));

      await Promise.resolve();

      expect(dbService.upsertMany).toHaveBeenCalledWith(currentRules);
    });

    it('calls upsertMany with current rules on rulesSynced', async () => {
      const currentRules = [rule('a', { syncedAt: 123 })];
      store.overrideSelector(selectPlaybookRules, currentRules);
      subscribeAll();

      actions$.next(PlaybookActions.rulesSynced({ stamps: [{ id: 'a', syncedAt: 123 }] }));

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
      actions$.next(
        PlaybookActions.updateRule({ id: 'b', title: 'updated', clientUpdatedAt: 200 }),
      );

      await Promise.resolve();

      // Should have called upsertMany twice (once failed, once succeeded)
      expect(dbService.upsertMany).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------
  // RFC-015 Task 4 (D15.F review): sync orchestration. Uses vi.useFakeTimers
  // to drive `auditTime(2000)` deterministically (mirrors
  // SessionSyncEffects.flushOnEdit$'s spec pattern for debounceTime).
  // ---------------------------------------------------------------------

  describe('pushDirty$', () => {
    function setupAuthenticated(rules: PlaybookRule[]): void {
      store.overrideSelector(selectPlaybookRules, rules);
      store.overrideSelector(authFeature.selectStatus, 'authenticated');
      store.refreshState();
    }

    it('pushes exactly the dirty subset (clientUpdatedAt > syncedAt), excluding clean rows', async () => {
      vi.useFakeTimers();
      const clean = rule('clean', { clientUpdatedAt: 1000, syncedAt: 1000 });
      const dirty = rule('dirty', { clientUpdatedAt: 2000, syncedAt: 1000 });
      setupAuthenticated([clean, dirty]);

      const sub = effects.pushDirty$.subscribe();
      actions$.next(PlaybookActions.createRule({ id: 'x', title: 't', statement: 's', createdAt: 1 }));
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();

      expect(syncService.pushPlaybookRules).toHaveBeenCalledTimes(1);
      expect(syncService.pushPlaybookRules).toHaveBeenCalledWith([dirty]);
    });

    it('dispatches rulesSynced stamping ONLY syncedAt (to the pushed clientUpdatedAt), no clientUpdatedAt in the payload', async () => {
      vi.useFakeTimers();
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const dirty = rule('a', { clientUpdatedAt: 3000, syncedAt: 1000 });
      setupAuthenticated([dirty]);

      const sub = effects.pushDirty$.subscribe();
      actions$.next(PlaybookActions.createRule({ id: 'x', title: 't', statement: 's', createdAt: 1 }));
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();

      expect(dispatchSpy).toHaveBeenCalledWith(
        PlaybookActions.rulesSynced({ stamps: [{ id: 'a', syncedAt: 3000 }] }),
      );
    });

    it('does nothing when no rule is dirty', async () => {
      vi.useFakeTimers();
      setupAuthenticated([rule('clean', { clientUpdatedAt: 1000, syncedAt: 1000 })]);

      const sub = effects.pushDirty$.subscribe();
      actions$.next(PlaybookActions.createRule({ id: 'x', title: 't', statement: 's', createdAt: 1 }));
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();

      expect(syncService.pushPlaybookRules).not.toHaveBeenCalled();
    });

    it('does not push when the auth status is not "authenticated"', async () => {
      vi.useFakeTimers();
      store.overrideSelector(selectPlaybookRules, [rule('a', { clientUpdatedAt: 2000, syncedAt: 1000 })]);
      store.overrideSelector(authFeature.selectStatus, 'anonymous');
      store.refreshState();

      const sub = effects.pushDirty$.subscribe();
      actions$.next(PlaybookActions.createRule({ id: 'x', title: 't', statement: 's', createdAt: 1 }));
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();

      expect(syncService.pushPlaybookRules).not.toHaveBeenCalled();
    });

    it('swallows a push rejection (no rulesSynced dispatched, no throw)', async () => {
      vi.useFakeTimers();
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      syncService.pushPlaybookRules.mockRejectedValue(new Error('offline'));
      setupAuthenticated([rule('a', { clientUpdatedAt: 2000, syncedAt: 1000 })]);

      const sub = effects.pushDirty$.subscribe();
      await expect(
        (async () => {
          actions$.next(
            PlaybookActions.createRule({ id: 'x', title: 't', statement: 's', createdAt: 1 }),
          );
          vi.advanceTimersByTime(2000);
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
        })(),
      ).resolves.toBeUndefined();

      sub.unsubscribe();

      expect(syncService.pushPlaybookRules).toHaveBeenCalledTimes(1);
      expect(
        dispatchSpy.mock.calls.some(
          (c) => dispatchedAction(c).type === PlaybookActions.rulesSynced.type,
        ),
      ).toBe(false);
    });

    it('mid-flight edit stays dirty: an edit landing after the push snapshot survives the resulting rulesSynced (real reducer)', async () => {
      vi.useFakeTimers();
      const dispatchSpy = vi.spyOn(store, 'dispatch');
      const pushedSnapshot = rule('a', { clientUpdatedAt: 500, syncedAt: undefined });
      setupAuthenticated([pushedSnapshot]);

      const sub = effects.pushDirty$.subscribe();
      actions$.next(PlaybookActions.updateRule({ id: 'a', title: 't2', clientUpdatedAt: 500 }));
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();

      const rulesSyncedCall = dispatchSpy.mock.calls.find(
        (c) => dispatchedAction(c).type === PlaybookActions.rulesSynced.type,
      );
      expect(rulesSyncedCall).toBeDefined();
      const rulesSyncedAction = dispatchedAction(rulesSyncedCall!);

      // Simulate, through the REAL reducer, an edit that bumps clientUpdatedAt
      // to 900 AFTER the push above snapshotted 500, but BEFORE rulesSynced
      // (still carrying syncedAt: 500) is applied.
      const stateAfterMidFlightEdit = playbookFeature.reducer(
        { rules: [pushedSnapshot], loaded: true },
        PlaybookActions.updateRule({ id: 'a', title: 't3', clientUpdatedAt: 900 }),
      );
      const stateAfterSync = playbookFeature.reducer(stateAfterMidFlightEdit, rulesSyncedAction);

      const finalRule = stateAfterSync.rules[0];
      expect(finalRule.clientUpdatedAt).toBe(900);
      expect(finalRule.syncedAt).toBe(500);
      expect(finalRule.clientUpdatedAt! > finalRule.syncedAt!).toBe(true); // still dirty
    });
  });

  describe('pullOnAuth$', () => {
    it('pull -> LWW merge -> local upsert -> hydrated dispatch -> post-merge dirty flush (push-after-pull)', async () => {
      const keptLocalNewer = rule('kept-local-newer', { clientUpdatedAt: 3000, syncedAt: 1000 });
      const staleRemoteCounterpart = rule('kept-local-newer', {
        clientUpdatedAt: 2000,
        syncedAt: 2000,
      });
      const cloudOnly = rule('cloud-only', { clientUpdatedAt: 5000, syncedAt: 5000 });

      dbService.loadAll.mockResolvedValue([keptLocalNewer]);
      syncService.pullPlaybookRules.mockResolvedValue([staleRemoteCounterpart, cloudOnly]);
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      const sub = effects.pullOnAuth$.subscribe();
      actions$.next(AuthActions.sessionResolved({ user: { id: 'u1', email: 'a@b.com' } }));

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();

      // remote-missing local-newer row is NOT written locally (already there);
      // only the cloud-only insert is.
      expect(dbService.upsertMany).toHaveBeenCalledTimes(1);
      expect(dbService.upsertMany).toHaveBeenCalledWith([cloudOnly]);

      const hydratedCall = dispatchSpy.mock.calls.find(
        (c) => dispatchedAction(c).type === PlaybookActions.hydrated.type,
      );
      expect(hydratedCall).toBeDefined();
      expect(dispatchedAction(hydratedCall!)).toEqual(
        PlaybookActions.hydrated({ rules: [keptLocalNewer, cloudOnly] }),
      );

      // post-merge flush pushes exactly the still-dirty local-newer survivor
      // (cloud-only is clientUpdatedAt === syncedAt, not dirty)
      expect(syncService.pushPlaybookRules).toHaveBeenCalledTimes(1);
      expect(syncService.pushPlaybookRules).toHaveBeenCalledWith([keptLocalNewer]);

      const rulesSyncedCall = dispatchSpy.mock.calls.find(
        (c) => dispatchedAction(c).type === PlaybookActions.rulesSynced.type,
      );
      expect(dispatchedAction(rulesSyncedCall!)).toEqual(
        PlaybookActions.rulesSynced({ stamps: [{ id: 'kept-local-newer', syncedAt: 3000 }] }),
      );
    });

    it('a null user (anonymous) does not pull', async () => {
      const sub = effects.pullOnAuth$.subscribe();

      actions$.next(AuthActions.sessionResolved({ user: null }));
      await Promise.resolve();
      await Promise.resolve();

      sub.unsubscribe();

      expect(syncService.pullPlaybookRules).not.toHaveBeenCalled();
    });

    it('swallows a pull rejection (no throw, nothing dispatched)', async () => {
      syncService.pullPlaybookRules.mockRejectedValue(new Error('offline'));
      const dispatchSpy = vi.spyOn(store, 'dispatch');

      const sub = effects.pullOnAuth$.subscribe();
      await expect(
        (async () => {
          actions$.next(AuthActions.sessionResolved({ user: { id: 'u1', email: 'a@b.com' } }));
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
        })(),
      ).resolves.toBeUndefined();

      sub.unsubscribe();

      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });
});
