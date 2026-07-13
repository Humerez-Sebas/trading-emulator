import { createFeature, createReducer, on } from '@ngrx/store';
import { PlaybookActions } from './playbook.actions';
import { PlaybookState } from './playbook.models';

const initialState: PlaybookState = { rules: [], loaded: false };

export const playbookFeature = createFeature({
  name: 'playbook',
  reducer: createReducer(
    initialState,
    on(PlaybookActions.hydrated, (state, { rules }): PlaybookState => ({ rules, loaded: true })),
    on(PlaybookActions.createRule, (state, { id, title, statement, createdAt }): PlaybookState => ({
      ...state,
      rules: [
        ...state.rules,
        {
          id, title, statement, createdAt,
          status: 'active', shortcutSlot: null,
          sortOrder: state.rules.length, amendments: [],
        },
      ],
    })),
    on(PlaybookActions.updateRule, (state, { id, title, statement }): PlaybookState => {
      const target = state.rules.find((r) => r.id === id);
      if (!target) return state;
      return {
        ...state,
        rules: state.rules.map((r) =>
          r.id === id
            ? { ...r, title: title ?? r.title, statement: statement ?? r.statement }
            : r,
        ),
      };
    }),
    on(PlaybookActions.setRuleStatus, (state, { id, status }): PlaybookState => {
      const target = state.rules.find((r) => r.id === id);
      if (!target) return state;
      return {
        ...state,
        rules: state.rules.map((r) =>
          r.id === id
            ? { ...r, status, shortcutSlot: status === 'retired' ? null : r.shortcutSlot }
            : r,
        ),
      };
    }),
    on(PlaybookActions.assignSlot, (state, { id, slot }): PlaybookState => {
      const target = state.rules.find((r) => r.id === id);
      if (!target) return state;
      return {
        ...state,
        rules: state.rules.map((r) => {
          if (r.id === id) return { ...r, shortcutSlot: slot };
          // one owner per slot: free the previous holder
          if (slot !== null && r.shortcutSlot === slot) return { ...r, shortcutSlot: null };
          return r;
        }),
      };
    }),
    on(PlaybookActions.reorderRule, (state, { id, sortOrder }): PlaybookState => {
      const target = state.rules.find((r) => r.id === id);
      if (!target) return state;
      return {
        ...state,
        rules: state.rules.map((r) => (r.id === id ? { ...r, sortOrder } : r)),
      };
    }),
    on(PlaybookActions.rulesSynced, (state, { stamps }): PlaybookState => ({
      ...state,
      rules: state.rules.map((r) => {
        const s = stamps.find((x) => x.id === r.id);
        return s ? { ...r, clientUpdatedAt: s.clientUpdatedAt, syncedAt: s.syncedAt } : r;
      }),
    })),
  ),
});
