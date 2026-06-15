import { createFeature, createReducer, on } from '@ngrx/store';
import { UserSymbolsActions } from './user-symbols.actions';

export interface UserSymbolsState {
  /** Symbol names the user curated (sorted). */
  symbols: string[];
  /** Whether the selection has been fetched at least once. */
  loaded: boolean;
}

const initialState: UserSymbolsState = { symbols: [], loaded: false };

export const userSymbolsFeature = createFeature({
  name: 'userSymbols',
  reducer: createReducer(
    initialState,
    on(
      UserSymbolsActions.loaded,
      (_state, { symbols }): UserSymbolsState => ({
        symbols: [...symbols].sort(),
        loaded: true,
      }),
    ),
    // optimistic toggle: the UI updates instantly; the effect persists and
    // reconciles from the server response (or reverts on failure)
    on(UserSymbolsActions.toggle, (state, { symbol }): UserSymbolsState => {
      const has = state.symbols.includes(symbol);
      const symbols = has
        ? state.symbols.filter((s) => s !== symbol)
        : [...state.symbols, symbol].sort();
      return { ...state, symbols };
    }),
  ),
});
