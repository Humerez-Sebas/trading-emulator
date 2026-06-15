import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const UserSymbolsActions = createActionGroup({
  source: 'UserSymbols',
  events: {
    /** Fetch the user's curated selection from the backend. */
    Load: emptyProps(),
    /** Selection resolved (from GET or reconciled from a PUT response). */
    Loaded: props<{ symbols: string[] }>(),
    /** Optimistically add/remove one symbol, then persist (replace-all PUT). */
    Toggle: props<{ symbol: string }>(),
  },
});
