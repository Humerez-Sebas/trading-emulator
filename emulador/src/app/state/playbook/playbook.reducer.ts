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
          // D15.F: a rule has never been edited at creation, so its LWW clock
          // starts at its own creation time (no clock read here — the value
          // is just `createdAt`, already payload data).
          clientUpdatedAt: createdAt,
        },
      ],
    })),
    on(PlaybookActions.updateRule, (state, { id, title, statement, clientUpdatedAt }): PlaybookState => {
      const target = state.rules.find((r) => r.id === id);
      if (!target) return state;
      return {
        ...state,
        rules: state.rules.map((r) =>
          r.id === id
            ? { ...r, title: title ?? r.title, statement: statement ?? r.statement, clientUpdatedAt }
            : r,
        ),
      };
    }),
    on(PlaybookActions.setRuleStatus, (state, { id, status, clientUpdatedAt }): PlaybookState => {
      const target = state.rules.find((r) => r.id === id);
      if (!target) return state;
      return {
        ...state,
        rules: state.rules.map((r) =>
          r.id === id
            ? { ...r, status, shortcutSlot: status === 'retired' ? null : r.shortcutSlot, clientUpdatedAt }
            : r,
        ),
      };
    }),
    on(PlaybookActions.assignSlot, (state, { id, slot, clientUpdatedAt }): PlaybookState => {
      const target = state.rules.find((r) => r.id === id);
      if (!target) return state;
      return {
        ...state,
        rules: state.rules.map((r) => {
          if (r.id === id) return { ...r, shortcutSlot: slot, clientUpdatedAt };
          // one owner per slot: free the previous holder. It is touched too
          // (its shortcutSlot changed), so it gets the SAME clientUpdatedAt
          // stamp — otherwise the freed rule's cleared slot would never be
          // recognized as dirty and would never sync to the cloud.
          if (slot !== null && r.shortcutSlot === slot) {
            return { ...r, shortcutSlot: null, clientUpdatedAt };
          }
          return r;
        }),
      };
    }),
    on(PlaybookActions.reorderRule, (state, { id, sortOrder, clientUpdatedAt }): PlaybookState => {
      const target = state.rules.find((r) => r.id === id);
      if (!target) return state;
      return {
        ...state,
        rules: state.rules.map((r) => (r.id === id ? { ...r, sortOrder, clientUpdatedAt } : r)),
      };
    }),
    // D15.F: sync advances ONLY syncedAt — clientUpdatedAt is never rewritten
    // here, so an edit that lands after a push was snapshotted (but before
    // this action is dispatched) keeps the rule dirty for the next cycle.
    on(PlaybookActions.rulesSynced, (state, { stamps }): PlaybookState => ({
      ...state,
      rules: state.rules.map((r) => {
        const s = stamps.find((x) => x.id === r.id);
        return s ? { ...r, syncedAt: s.syncedAt } : r;
      }),
    })),
    on(PlaybookActions.amendRule, (state, { ruleId, lessonId, clientUpdatedAt }): PlaybookState => {
      const target = state.rules.find((r) => r.id === ruleId);
      if (!target) return state;
      // Idempotence: if this lessonId is already in amendments, return state
      // unchanged (same reference) — do not add a duplicate.
      if (target.amendments.includes(lessonId)) return state;
      return {
        ...state,
        rules: state.rules.map((r) =>
          r.id === ruleId
            ? { ...r, amendments: [...r.amendments, lessonId], clientUpdatedAt }
            : r,
        ),
      };
    }),
  ),
});
