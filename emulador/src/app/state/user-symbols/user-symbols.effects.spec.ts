import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserSymbolsEffects } from './user-symbols.effects';
import { UserSymbolsActions } from './user-symbols.actions';
import { userSymbolsFeature } from './user-symbols.reducer';
import { BackendApiService } from '../../services/backend-api.service';

describe('UserSymbolsEffects', () => {
  let actions$: Subject<unknown>;
  let store: MockStore;
  let api: { getUserSymbols: ReturnType<typeof vi.fn>; putUserSymbols: ReturnType<typeof vi.fn> };
  let effects: UserSymbolsEffects;

  beforeEach(() => {
    actions$ = new Subject();
    api = { getUserSymbols: vi.fn(), putUserSymbols: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        UserSymbolsEffects,
        provideMockActions(() => actions$),
        provideMockStore(),
        { provide: BackendApiService, useValue: api },
      ],
    });
    store = TestBed.inject(MockStore);
    effects = TestBed.inject(UserSymbolsEffects);
  });

  describe('load$', () => {
    it('maps GET to loaded', async () => {
      api.getUserSymbols.mockReturnValue(of({ symbols: ['US30'], total: 1 }));
      const p = firstValueFrom(effects.load$);
      actions$.next(UserSymbolsActions.load());
      expect(await p).toEqual(UserSymbolsActions.loaded({ symbols: ['US30'] }));
    });

    it('falls back to an empty selection on error (offline)', async () => {
      api.getUserSymbols.mockReturnValue(throwError(() => new Error('offline')));
      const p = firstValueFrom(effects.load$);
      actions$.next(UserSymbolsActions.load());
      expect(await p).toEqual(UserSymbolsActions.loaded({ symbols: [] }));
    });
  });

  describe('persist$', () => {
    it('PUTs the post-toggle list and reconciles from the response', async () => {
      store.overrideSelector(userSymbolsFeature.selectSymbols, ['EURUSD', 'US30']);
      store.refreshState();
      api.putUserSymbols.mockReturnValue(of({ symbols: ['EURUSD', 'US30'], total: 2 }));

      const p = firstValueFrom(effects.persist$);
      actions$.next(UserSymbolsActions.toggle({ symbol: 'EURUSD' }));

      expect(api.putUserSymbols).toHaveBeenCalledWith(['EURUSD', 'US30']);
      expect(await p).toEqual(UserSymbolsActions.loaded({ symbols: ['EURUSD', 'US30'] }));
    });

    it('reverts by reloading on a failed PUT', async () => {
      store.overrideSelector(userSymbolsFeature.selectSymbols, ['US30']);
      store.refreshState();
      api.putUserSymbols.mockReturnValue(throwError(() => new Error('500')));

      const p = firstValueFrom(effects.persist$);
      actions$.next(UserSymbolsActions.toggle({ symbol: 'US30' }));
      expect(await p).toEqual(UserSymbolsActions.load());
    });
  });
});
