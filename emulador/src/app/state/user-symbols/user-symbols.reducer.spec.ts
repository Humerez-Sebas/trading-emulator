import { describe, expect, it } from 'vitest';
import { userSymbolsFeature } from './user-symbols.reducer';
import { UserSymbolsActions } from './user-symbols.actions';

const reducer = userSymbolsFeature.reducer;

describe('userSymbols reducer', () => {
  it('starts empty and not loaded', () => {
    const s = reducer(undefined, { type: '@@init' } as never);
    expect(s).toEqual({ symbols: [], loaded: false });
  });

  it('loaded sets a sorted list and the loaded flag', () => {
    const s = reducer(undefined, UserSymbolsActions.loaded({ symbols: ['XAUUSD', 'EURUSD'] }));
    expect(s.symbols).toEqual(['EURUSD', 'XAUUSD']);
    expect(s.loaded).toBe(true);
  });

  it('toggle adds a missing symbol (kept sorted)', () => {
    const base = reducer(undefined, UserSymbolsActions.loaded({ symbols: ['US30'] }));
    const next = reducer(base, UserSymbolsActions.toggle({ symbol: 'EURUSD' }));
    expect(next.symbols).toEqual(['EURUSD', 'US30']);
  });

  it('toggle removes a present symbol', () => {
    const base = reducer(undefined, UserSymbolsActions.loaded({ symbols: ['US30', 'EURUSD'] }));
    const next = reducer(base, UserSymbolsActions.toggle({ symbol: 'US30' }));
    expect(next.symbols).toEqual(['EURUSD']);
  });
});
