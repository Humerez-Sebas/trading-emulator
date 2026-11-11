# RFC-015 Playbook & Rule Adherence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the trader's rule set a durable, opaque, maximum-ceremony home (the Playbook) and let a single keystroke (`1`–`9`) tag the active trade with the rule it was training — declaration as fact, never as score.

**Architecture:** New `playbook` NgRx feature slice + dedicated `emulador-playbook` IndexedDB database (local source of truth) + `playbook_rules` Supabase table with per-row LWW (audited `folders` pattern). An additive, opaque `declaredRuleId` rides the existing order → position → closed-trade identity chain; a window-level digit-hotkey directive dispatches a pure `tagTrade` reducer action; the chart tag `[R{slot}]` is composed in the per-panel `ChartModelMapper` (engine untouched).

**Tech Stack:** Angular 21 standalone + NgRx (createFeature/createActionGroup), IndexedDB (raw, following `telemetry-db.service.ts`), Supabase (RLS + `lww_guard()` trigger), Vitest via `ng test` ONLY.

## Global Constraints

- Spec of record: `docs/architecture/rfcs/015-playbook-adherencia-reglas.md` (G2, D15.A–E, P-1..P-7) + `docs/superpowers/specs/2026-07-12-rfc-015-playbook-rules-design.md`. On conflict, the RFC governs.
- **STOP rule (absolute):** pre-existing spec files (develop, incl. everything shipped by RFC-014) are NEVER modified and must pass green as-is. New tests go in NEW spec files. Baseline at branch start: 1278 tests / 102 files green (verify fresh before Task 1).
- **Gates per task**, run from `emulador/` (all four; fresh output only): `npx tsc -p tsconfig.app.json --noEmit` · `npx tsc -p tsconfig.spec.json --noEmit` · `npx ng test --watch=false` (NEVER bare `npx vitest run` — it always fails, no TestBed env) · `npm run lint` (0 problems). `npm run build` additionally at branch finalization (the ~623 kB budget warning is known-accepted; watch for NEW chunk types).
- **isolate:false discipline:** any new spec using `overrideSelector` calls `store.resetSelectors()` in `afterEach`.
- **Purity:** reducers/domain modules import no IO/clock/random; `crypto.randomUUID()` only in components/effects, never reducers. Engine (`fill-engine.ts`) changes limited to threading `declaredRuleId` (two copy points); everything else arrives as data.
- **D8:** no shared parameterized factory selectors (`selectX(id)` returning `createSelector`). Per-panel derivation stays in the per-instance mapper.
- **NgRx createFeature rejects optional feature-state properties** (verified TS2769 in RFC-014): feature-state fields are required; optionals live inside row objects (`PlaybookRule`).
- **Additive data model only:** `declaredRuleId?: string | null` optional on `PendingOrder`/`Position`/`ClosedTrade`; absent = undeclared; no destructive migrations. No new runtime dependencies.
- **Vocabulary (N-1/P-5):** no `hesitation|honesty|discipline|cheat|score` (or Spanish equivalents as normative vocabulary) in any identifier, comment, test name, SQL, or UI copy. UI copy Spanish; identifiers/comments English.
- **Candle-free (P-6/N-5):** import the EXISTING `assertNoCandles` (exported from `emulador/src/app/services/session-sync.mapping.ts`) — never duplicate it.
- **Commits:** conventional, task-scoped, pathspec only (`git commit <files> -m "..."`), trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Never commit `.superpowers/sdd/progress.md` from an implementer.
- Hotkey namespace `1`–`9` verified free at plan time (no digit bindings, no page-level keydown listeners in `emulador/src/app`). Re-verify in Task 5 Step 1 before wiring.

---

### Task 1: Playbook domain model + NgRx feature slice

**Files:**
- Create: `emulador/src/app/state/playbook/playbook.models.ts`
- Create: `emulador/src/app/state/playbook/playbook.actions.ts`
- Create: `emulador/src/app/state/playbook/playbook.reducer.ts`
- Create: `emulador/src/app/state/playbook/playbook.selectors.ts`
- Modify: `emulador/src/app/app.config.ts` (register the feature next to the existing `provideState`/feature registrations — inspect how `tradingFeature` is registered and mirror it)
- Test: `emulador/src/app/state/playbook/playbook.reducer.spec.ts`, `emulador/src/app/state/playbook/playbook.selectors.spec.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `PlaybookRule`, `PlaybookState`, `playbookFeature` (with `selectRules`, `selectLoaded`), `PlaybookActions` (`hydrate`, `hydrated`, `createRule`, `updateRule`, `setRuleStatus`, `assignSlot`, `reorderRule`, `rulesSynced`), selectors `selectActiveRules`, `selectRuleBySlot: Record<number, PlaybookRule>`. Exact shapes below — later tasks rely on these names verbatim.

- [ ] **Step 1: Write the failing reducer spec**

```ts
// playbook.reducer.spec.ts
import { describe, expect, it } from 'vitest';
import { playbookFeature } from './playbook.reducer';
import { PlaybookActions } from './playbook.actions';
import { PlaybookRule } from './playbook.models';

const { reducer } = playbookFeature;
const initial = reducer(undefined, { type: '@@init' } as never);

function rule(over: Partial<PlaybookRule> = {}): PlaybookRule {
  return {
    id: 'r1', title: 'Ruptura de rango', statement: 'texto opaco',
    createdAt: 1, status: 'active', shortcutSlot: null, sortOrder: 0,
    amendments: [], ...over,
  };
}

describe('playbook reducer', () => {
  it('starts empty and not loaded', () => {
    expect(initial.rules).toEqual([]);
    expect(initial.loaded).toBe(false);
  });

  it('hydrated replaces rules and marks loaded', () => {
    const s = reducer(initial, PlaybookActions.hydrated({ rules: [rule()] }));
    expect(s.rules).toHaveLength(1);
    expect(s.loaded).toBe(true);
  });

  it('createRule appends with the given id and next sortOrder', () => {
    const s0 = reducer(initial, PlaybookActions.hydrated({ rules: [rule()] }));
    const s = reducer(
      s0,
      PlaybookActions.createRule({ id: 'r2', title: 'Pullback', statement: '', createdAt: 5 }),
    );
    expect(s.rules[1]).toMatchObject({
      id: 'r2', title: 'Pullback', status: 'active', shortcutSlot: null,
      sortOrder: 1, amendments: [],
    });
  });

  it('assignSlot gives the slot to the rule and frees any previous owner', () => {
    const s0 = reducer(
      initial,
      PlaybookActions.hydrated({
        rules: [rule({ id: 'a', shortcutSlot: 1 }), rule({ id: 'b', sortOrder: 1 })],
      }),
    );
    const s = reducer(s0, PlaybookActions.assignSlot({ id: 'b', slot: 1 }));
    expect(s.rules.find((r) => r.id === 'a')!.shortcutSlot).toBeNull();
    expect(s.rules.find((r) => r.id === 'b')!.shortcutSlot).toBe(1);
  });

  it('setRuleStatus retired keeps the rule and releases its slot', () => {
    const s0 = reducer(initial, PlaybookActions.hydrated({ rules: [rule({ shortcutSlot: 3 })] }));
    const s = reducer(s0, PlaybookActions.setRuleStatus({ id: 'r1', status: 'retired' }));
    expect(s.rules[0].status).toBe('retired');
    expect(s.rules[0].shortcutSlot).toBeNull();
  });

  it('updateRule on an unknown id is a reference-identity no-op', () => {
    const s0 = reducer(initial, PlaybookActions.hydrated({ rules: [rule()] }));
    const s = reducer(s0, PlaybookActions.updateRule({ id: 'nope', title: 'x' }));
    expect(s).toBe(s0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd emulador && npx ng test --watch=false 2>&1 | tail -20`
Expected: FAIL — module `./playbook.reducer` not found (build error listing this spec).

- [ ] **Step 3: Implement models, actions, reducer, selectors**

```ts
// playbook.models.ts
export type PlaybookRuleStatus = 'active' | 'retired';

/** A trader-authored rule. `statement` is OPAQUE to the system (P-2). */
export interface PlaybookRule {
  id: string;
  title: string;
  statement: string;
  createdAt: number;
  status: PlaybookRuleStatus;
  /** Hotkey slot 1..9; null = none. Unique among ACTIVE rules. */
  shortcutSlot: number | null;
  sortOrder: number;
  /** RESERVED for RFC-016 (P-7): persisted empty, zero read sites. */
  amendments: string[];
  clientUpdatedAt?: number;
  syncedAt?: number;
}

export interface PlaybookState {
  rules: PlaybookRule[];
  loaded: boolean;
}
```

```ts
// playbook.actions.ts
import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { PlaybookRule, PlaybookRuleStatus } from './playbook.models';

export const PlaybookActions = createActionGroup({
  source: 'Playbook',
  events: {
    Hydrate: emptyProps(),
    Hydrated: props<{ rules: PlaybookRule[] }>(),
    'Create Rule': props<{ id: string; title: string; statement: string; createdAt: number }>(),
    'Update Rule': props<{ id: string; title?: string; statement?: string }>(),
    'Set Rule Status': props<{ id: string; status: PlaybookRuleStatus }>(),
    'Assign Slot': props<{ id: string; slot: number | null }>(),
    'Reorder Rule': props<{ id: string; sortOrder: number }>(),
    'Rules Synced': props<{ stamps: { id: string; clientUpdatedAt: number; syncedAt: number }[] }>(),
  },
});
```

```ts
// playbook.reducer.ts
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
```

```ts
// playbook.selectors.ts
import { createSelector } from '@ngrx/store';
import { playbookFeature } from './playbook.reducer';
import { PlaybookRule } from './playbook.models';

export const selectPlaybookRules = playbookFeature.selectRules;
export const selectPlaybookLoaded = playbookFeature.selectLoaded;

/** Active rules in Dock order. */
export const selectActiveRules = createSelector(selectPlaybookRules, (rules) =>
  rules.filter((r) => r.status === 'active').sort((a, b) => a.sortOrder - b.sortOrder),
);

/** slot (1..9) → active rule. ONE memoized map; no per-slot factory selectors (D8). */
export const selectRuleBySlot = createSelector(selectActiveRules, (rules) => {
  const bySlot: Record<number, PlaybookRule> = {};
  for (const r of rules) if (r.shortcutSlot !== null) bySlot[r.shortcutSlot] = r;
  return bySlot;
});
```

Register in `app.config.ts`: add `provideState(playbookFeature)` alongside the existing feature registrations (match the file's exact idiom — inspect first).

- [ ] **Step 4: Write the failing selector spec, then run the suite**

```ts
// playbook.selectors.spec.ts
import { describe, expect, it } from 'vitest';
import { selectActiveRules, selectRuleBySlot } from './playbook.selectors';
import { PlaybookRule } from './playbook.models';

function rule(over: Partial<PlaybookRule>): PlaybookRule {
  return {
    id: 'x', title: 't', statement: '', createdAt: 0, status: 'active',
    shortcutSlot: null, sortOrder: 0, amendments: [], ...over,
  };
}

describe('playbook selectors', () => {
  it('selectActiveRules filters retired and sorts by sortOrder', () => {
    const rules = [
      rule({ id: 'b', sortOrder: 1 }),
      rule({ id: 'dead', status: 'retired' }),
      rule({ id: 'a', sortOrder: 0 }),
    ];
    expect(selectActiveRules.projector(rules).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('selectRuleBySlot maps only slotted active rules', () => {
    const active = [rule({ id: 'a', shortcutSlot: 1 }), rule({ id: 'b', sortOrder: 1 })];
    const map = selectRuleBySlot.projector(active);
    expect(map[1].id).toBe('a');
    expect(Object.keys(map)).toHaveLength(1);
  });
});
```

Run: `cd emulador && npx ng test --watch=false 2>&1 | tail -6`
Expected: PASS (all files; count grows by the new specs).

- [ ] **Step 5: Run the remaining gates and commit**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.spec.json --noEmit && npm run lint`
Expected: clean, clean, 0 problems.

```bash
git commit emulador/src/app/state/playbook/playbook.models.ts emulador/src/app/state/playbook/playbook.actions.ts emulador/src/app/state/playbook/playbook.reducer.ts emulador/src/app/state/playbook/playbook.selectors.ts emulador/src/app/app.config.ts -m "feat(playbook): domain model + NgRx feature slice (RFC-015 T1)"
git commit emulador/src/app/state/playbook/playbook.reducer.spec.ts emulador/src/app/state/playbook/playbook.selectors.spec.ts -m "test(playbook): reducer + selector coverage (RFC-015 T1)"
```

---

### Task 2: `declaredRuleId` on the identity chain + `tagTrade` action

**Files:**
- Modify: `emulador/src/app/state/trading/trading.models.ts` (three optional fields)
- Modify: `emulador/src/app/state/trading/fill-engine.ts` (two copy points)
- Modify: `emulador/src/app/state/trading/trading.actions.ts` (+`Tag Trade` event)
- Modify: `emulador/src/app/state/trading/trading.reducer.ts` (+`on(tagTrade)`)
- Test: `emulador/src/app/state/trading/trading.declared-rule.spec.ts` (NEW file only)

**Interfaces:**
- Consumes: `PendingOrder`/`Position`/`ClosedTrade` (existing), `processCandle`/`closeTrade` (existing signatures — unchanged).
- Produces: `declaredRuleId?: string | null` on all three models; `TradingActions.tagTrade({ ruleId: string })`. Task 5's directive dispatches exactly `TradingActions.tagTrade`.

- [ ] **Step 1: Write the failing spec (identity chain + D15.A semantics)**

```ts
// trading.declared-rule.spec.ts — uses existing fixtures from '../../testing/fixtures'
import { describe, expect, it } from 'vitest';
import { processCandle, closeTrade } from './fill-engine';
import { tradingFeature } from './trading.reducer';
import { TradingActions } from './trading.actions';
import { order, position } from '../../testing/fixtures';

const { reducer } = tradingFeature;
const init = reducer(undefined, { type: '@@init' } as never);

describe('declaredRuleId identity chain (P-4)', () => {
  it('order → position → closed trade keeps the stamp through the real engine', () => {
    const o = { ...order({ id: 'o1', createdAt: 0 }), declaredRuleId: 'rule-1' };
    const book = { balance: 10000, orders: [o], positions: [], history: [] };
    // fills (limit buy at entry; candle after createdAt touching entry then SL)
    const fill = processCandle(
      book,
      { time: 60, open: 4000, high: 4001, low: o.entryPrice - 1, close: 4000 },
      null,
      100,
    );
    expect(fill.book.positions[0]?.declaredRuleId ?? fill.book.history[0]?.declaredRuleId).toBe('rule-1');
    const closedAll = [...fill.book.history];
    if (fill.book.positions.length) {
      closedAll.push(closeTrade(fill.book.positions[0], 3990, 120, 'manual', 100));
    }
    expect(closedAll[0].declaredRuleId).toBe('rule-1');
  });

  it('undeclared placement stays undeclared end to end (P-1)', () => {
    const o = order({ id: 'o1', createdAt: 0 });
    const book = { balance: 10000, orders: [o], positions: [], history: [] };
    const fill = processCandle(
      book,
      { time: 60, open: 4000, high: 4001, low: o.entryPrice - 1, close: 4000 },
      null,
      100,
    );
    const carrier = fill.book.positions[0] ?? fill.book.history[0];
    expect(carrier.declaredRuleId ?? null).toBeNull();
  });
});

describe('tagTrade (G2 + D15.A)', () => {
  it('tags the MOST RECENT active entity (position vs older order)', () => {
    const s0 = {
      ...init,
      orders: [{ ...order({ id: 'o-old', createdAt: 10 }) }],
      positions: [{ ...position({ id: 'p-new', openTime: 50 }) }],
    };
    const s = reducer(s0 as never, TradingActions.tagTrade({ ruleId: 'r1' }));
    expect(s.positions[0].declaredRuleId).toBe('r1');
    expect(s.orders[0].declaredRuleId ?? null).toBeNull();
  });

  it('same rule twice toggles the tag off', () => {
    const s0 = { ...init, positions: [{ ...position({ id: 'p1' }), declaredRuleId: 'r1' }] };
    const s = reducer(s0 as never, TradingActions.tagTrade({ ruleId: 'r1' }));
    expect(s.positions[0].declaredRuleId).toBeNull();
  });

  it('a different rule overwrites the tag', () => {
    const s0 = { ...init, positions: [{ ...position({ id: 'p1' }), declaredRuleId: 'r1' }] };
    const s = reducer(s0 as never, TradingActions.tagTrade({ ruleId: 'r2' }));
    expect(s.positions[0].declaredRuleId).toBe('r2');
  });

  it('no active entities ⇒ reference-identity no-op', () => {
    const s = reducer(init, TradingActions.tagTrade({ ruleId: 'r1' }));
    expect(s).toBe(init);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd emulador && npx ng test --watch=false 2>&1 | tail -20`
Expected: FAIL — `tagTrade` not a member of `TradingActions`; `declaredRuleId` not on the model types.

- [ ] **Step 3: Implement**

`trading.models.ts` — add to each of the three interfaces (same doc comment):

```ts
  /** Opaque Playbook rule declared for this trade (RFC-015). Absent/null = undeclared. */
  declaredRuleId?: string | null;
```

`fill-engine.ts` — copy point 1 (inside `processCandle`, where the filled order becomes a `Position`, next to the other field copies): `declaredRuleId: o.declaredRuleId ?? null,`. Copy point 2 (inside `closeTrade`, the single close funnel, next to the other sealed fields): `declaredRuleId: p.declaredRuleId ?? null,`.

`trading.actions.ts` — add to the action group events: `'Tag Trade': props<{ ruleId: string }>(),`.

`trading.reducer.ts` — new handler (place after `modifyPosition`):

```ts
    on(TradingActions.tagTrade, (state, { ruleId }): TradingState => {
      // G2/D15.A: tag the MOST RECENTLY placed active entity; toggle on repeat;
      // absolute no-op (reference identity) when nothing is active.
      const lastOrder = state.orders.reduce<PendingOrder | null>(
        (m, o) => (m === null || o.createdAt >= m.createdAt ? o : m), null);
      const lastPos = state.positions.reduce<Position | null>(
        (m, p) => (m === null || p.openTime >= m.openTime ? p : m), null);
      if (!lastOrder && !lastPos) return state;
      const target =
        lastOrder && lastPos
          ? lastPos.openTime >= lastOrder.createdAt ? { kind: 'pos' as const, id: lastPos.id }
                                                    : { kind: 'ord' as const, id: lastOrder.id }
          : lastPos ? { kind: 'pos' as const, id: lastPos.id }
                    : { kind: 'ord' as const, id: lastOrder!.id };
      const next = (cur: string | null | undefined) => (cur === ruleId ? null : ruleId);
      return target.kind === 'pos'
        ? { ...state,
            positions: state.positions.map((p) =>
              p.id === target.id ? { ...p, declaredRuleId: next(p.declaredRuleId) } : p) }
        : { ...state,
            orders: state.orders.map((o) =>
              o.id === target.id ? { ...o, declaredRuleId: next(o.declaredRuleId) } : o) };
    }),
```

- [ ] **Step 4: Run tests, verify pass AND pre-existing suites untouched-green**

Run: `cd emulador && npx ng test --watch=false 2>&1 | tail -6`
Expected: PASS, count grows only by the new file's tests (1278 + new). If ANY pre-existing spec reddens, stop and re-check the two engine copy points (they must be additive; no signature change).

- [ ] **Step 5: Gates and commit**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.spec.json --noEmit && npm run lint` → clean.

```bash
git commit emulador/src/app/state/trading/trading.models.ts emulador/src/app/state/trading/fill-engine.ts emulador/src/app/state/trading/trading.actions.ts emulador/src/app/state/trading/trading.reducer.ts -m "feat(trading): opaque declaredRuleId on the identity chain + tagTrade (RFC-015 T2)"
git commit emulador/src/app/state/trading/trading.declared-rule.spec.ts -m "test(trading): declaredRuleId chain + tagTrade semantics (RFC-015 T2)"
```

---

### Task 3: Local persistence — `emulador-playbook` DB + hydrate/persist effects

**Files:**
- Create: `emulador/src/app/services/playbook-db.service.ts`
- Create: `emulador/src/app/state/playbook/playbook.effects.ts`
- Modify: `emulador/src/app/app.config.ts` (register `PlaybookEffects` exactly like the existing `provideEffects` entries)
- Test: `emulador/src/app/services/playbook-db.service.spec.ts`, `emulador/src/app/state/playbook/playbook.effects.spec.ts`

**Interfaces:**
- Consumes: `PlaybookRule` (Task 1), `assertNoCandles` (existing, from `services/session-sync.mapping.ts`), `PlaybookActions`.
- Produces: `PlaybookDbService { loadAll(): Promise<PlaybookRule[]>; upsert(rule: PlaybookRule): Promise<void>; upsertMany(rules: PlaybookRule[]): Promise<void>; remove(id: string): Promise<void> }` — Task 4's sync consumes `loadAll`/`upsertMany`/`remove`.

- [ ] **Step 1: Read the two precedents ONCE**

Read `emulador/src/app/services/telemetry-db.service.ts` (dedicated-DB open/upgrade idiom, D15.B) and `emulador/src/app/services/telemetry-db.service.spec.ts` + `workspace-db.service.spec.ts` (which IndexedDB fake the suite uses — `fake-indexeddb/auto` — and its reset idiom). Reuse both idioms verbatim.

- [ ] **Step 2: Write the failing service spec**

```ts
// playbook-db.service.spec.ts (import the same fake the telemetry spec imports)
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PlaybookDbService } from './playbook-db.service';
import { PlaybookRule } from '../state/playbook/playbook.models';

function rule(id: string, over: Partial<PlaybookRule> = {}): PlaybookRule {
  return { id, title: 't', statement: 's', createdAt: 1, status: 'active',
           shortcutSlot: null, sortOrder: 0, amendments: [], ...over };
}

describe('PlaybookDbService', () => {
  let svc: PlaybookDbService;
  beforeEach(async () => {
    indexedDB.deleteDatabase('emulador-playbook'); // fresh DB per test (fake resets)
    svc = new PlaybookDbService();
  });

  it('round-trips upsert → loadAll', async () => {
    await svc.upsert(rule('a'));
    await svc.upsertMany([rule('b'), rule('c')]);
    const all = await svc.loadAll();
    expect(all.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('upsert overwrites by id (no duplicates)', async () => {
    await svc.upsert(rule('a', { title: 'v1' }));
    await svc.upsert(rule('a', { title: 'v2' }));
    const all = await svc.loadAll();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('v2');
  });

  it('remove deletes the row (LWW pull reconciliation only)', async () => {
    await svc.upsert(rule('a'));
    await svc.remove('a');
    expect(await svc.loadAll()).toEqual([]);
  });

  it('rejects a candle-poisoned payload (P-6, assertNoCandles reused)', async () => {
    const poisoned = { ...rule('bad'), candles: [{ time: 1, open: 1, high: 1, low: 1, close: 1 }] };
    await expect(svc.upsert(poisoned as never)).rejects.toThrow();
  });

  it('playbook survives deletion of the OTHER databases (P-3)', async () => {
    await svc.upsert(rule('keep'));
    indexedDB.deleteDatabase('emulador-workspaces');
    indexedDB.deleteDatabase('emulador-telemetry');
    expect((await svc.loadAll()).map((r) => r.id)).toEqual(['keep']);
  });
});
```

- [ ] **Step 3: Run to verify it fails** — same runner command; expected: module not found.

- [ ] **Step 4: Implement the service**

```ts
// playbook-db.service.ts
import { Injectable } from '@angular/core';
import { assertNoCandles } from './session-sync.mapping';
import { PlaybookRule } from '../state/playbook/playbook.models';

/**
 * Dedicated IndexedDB database for the Playbook (RFC-015, D15.B).
 * Dedicated (not a store inside `emulador-workspaces`): joining the shared DB
 * requires bumping its version, which a STOP-protected spec pins (RFC-014
 * precedent, `emulador-telemetry`). Survival tier: highest (P-3/N-4) — this DB
 * is never touched by session/workspace/telemetry deletion paths.
 */
const DB_NAME = 'emulador-playbook';
const DB_VERSION = 1;
const STORE = 'rules';

@Injectable({ providedIn: 'root' })
export class PlaybookDbService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private tx(db: IDBDatabase, mode: IDBTransactionMode) {
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  async loadAll(): Promise<PlaybookRule[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = this.tx(db, 'readonly').getAll();
      req.onsuccess = () => resolve(req.result as PlaybookRule[]);
      req.onerror = () => reject(req.error);
    });
  }

  async upsert(rule: PlaybookRule): Promise<void> {
    return this.upsertMany([rule]);
  }

  async upsertMany(rules: PlaybookRule[]): Promise<void> {
    assertNoCandles(rules); // P-6/N-5: candle-free by construction
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const store = this.tx(db, 'readwrite');
      for (const r of rules) store.put(r);
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
    });
  }

  async remove(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const store = this.tx(db, 'readwrite');
      store.delete(id);
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
    });
  }
}
```

(If `assertNoCandles`'s real signature differs — it may take a single payload object — adapt the call site, not the helper: e.g. `assertNoCandles({ rules })`. Check its export before wiring.)

- [ ] **Step 5: Effects — failing spec, then implementation**

Spec (`playbook.effects.spec.ts`, MockStore + provideMockActions idiom from `trading.effects.spec.ts`; `store.resetSelectors()` in `afterEach`): (a) `hydrate$` maps `PlaybookActions.hydrate` → `hydrated({ rules })` with rules from a mocked `PlaybookDbService.loadAll`; (b) `persist$` is `dispatch: false` and calls `upsertMany` with the CURRENT rules on each of `createRule`/`updateRule`/`setRuleStatus`/`assignSlot`/`reorderRule`/`rulesSynced` (use `concatLatestFrom(select(selectPlaybookRules))`); (c) persistence errors are swallowed with a `catchError` that keeps the stream alive (assert the effect survives a rejected promise and processes the next action).

Implementation (`playbook.effects.ts`): standard `createEffect` class; `hydrate$` uses `switchMap(() => from(this.db.loadAll()))`; `persist$` uses `concatMap` + `from(this.db.upsertMany(rules)).pipe(catchError(() => EMPTY))`. Dispatch `PlaybookActions.hydrate` from the effect's `ngrxOnInitEffects` (or an `OnInitEffects` equivalent — mirror how existing effects bootstrap, inspect `app.config.ts` registrations first).

- [ ] **Step 6: Gates and commit**

All four gates → green.

```bash
git commit emulador/src/app/services/playbook-db.service.ts emulador/src/app/state/playbook/playbook.effects.ts emulador/src/app/app.config.ts -m "feat(playbook): dedicated emulador-playbook DB + hydrate/persist effects (RFC-015 T3)"
git commit emulador/src/app/services/playbook-db.service.spec.ts emulador/src/app/state/playbook/playbook.effects.spec.ts -m "test(playbook): DB round-trips + survival P-3 + effects (RFC-015 T3)"
```

---

### Task 4: Cloud sync — `playbook_rules` SQL + per-row LWW cycle

**Files:**
- Create: `supabase/playbook_rules.sql` (the exact SQL from the design spec §3 — copy it verbatim)
- Modify: `supabase/verify_session_rls.sql` (append a `playbook_rules` verification block following the file's existing two-JWT `sub` simulation pattern)
- Modify: `emulador/src/app/services/session-sync.service.ts` (playbook push/pull functions, mirroring the `folders` functions at lines ~143-169 — same client, same error idiom)
- Modify: `emulador/src/app/state/playbook/playbook.effects.ts` (sync effects: push dirty rows on mutation debounce, pull on auth/session start — mirror how folder sync effects are triggered; inspect the existing folder-sync wiring FIRST and copy its trigger topology)
- Test: `emulador/src/app/services/playbook-sync.spec.ts` (NEW)

**Interfaces:**
- Consumes: `PlaybookRule` (Task 1), `PlaybookDbService` (Task 3), the existing Supabase client wrapper in `session-sync.service.ts`, `PlaybookActions.rulesSynced`.
- Produces: `pushPlaybookRules(rules: PlaybookRule[]): Promise<void>` and `pullPlaybookRules(): Promise<PlaybookRule[]>` on the sync service; row mapping `ruleToDbRow`/`dbRowToRule` (snake_case ⇄ camelCase, epoch ms ⇄ timestamptz ISO).

- [ ] **Step 1: Write `supabase/playbook_rules.sql`** — verbatim from the design spec §3 (table, 4 RLS policies, `lww_guard` trigger). Confirm the trigger function name by grepping the existing SQL in `supabase/` (`lww_guard`); if the repo's function has a different name, use the repo's.
- [ ] **Step 2: Failing mapping/round-trip spec** — `playbook-sync.spec.ts`: `ruleToDbRow(dbRowToRule(row))` is identity on a fixture row; `dirty` predicate (`clientUpdatedAt > (syncedAt ?? 0)`) selects exactly the mutated rules; LWW merge on pull: remote newer wins, local newer survives, remote-missing local-dirty row is kept (never deleted by pull), remote row absent locally is inserted. Write the merge as a PURE exported function `mergePlaybookPull(local: PlaybookRule[], remote: PlaybookRule[]): { rules: PlaybookRule[]; toUpsertLocally: PlaybookRule[] }` so the spec needs no network.
- [ ] **Step 3: Implement mapping + merge + service functions** — mirror `folders` (`.from('playbook_rules')`, `upsert(dbRow, { onConflict: 'id' })`); push stamps `rulesSynced` on success. Pull applies `mergePlaybookPull`, upserts locally via `PlaybookDbService.upsertMany`, dispatches `hydrated` with the merged set.
- [ ] **Step 4: Effects wiring** — a debounced (`auditTime(2000)`) push of dirty rules after any mutation action; a pull chained to the same auth/bootstrap trigger the folders pull uses (inspect and reuse; do NOT invent a new trigger). Both `dispatch: false` except the merge dispatch.
- [ ] **Step 5: Extend `verify_session_rls.sql`** with the `playbook_rules` block (owner sees own rows; the second `sub` sees none; cross-user update rejected).
- [ ] **Step 6: Gates green; commit**

```bash
git commit supabase/playbook_rules.sql supabase/verify_session_rls.sql -m "feat(playbook): playbook_rules table, RLS + lww_guard, verification (RFC-015 T4)"
git commit emulador/src/app/services/session-sync.service.ts emulador/src/app/state/playbook/playbook.effects.ts -m "feat(playbook): per-row LWW push/pull cycle, folders pattern (RFC-015 T4)"
git commit emulador/src/app/services/playbook-sync.spec.ts -m "test(playbook): mapping identity + LWW merge round-trips (RFC-015 T4)"
```

**Coordination note (put in the task report):** applying `playbook_rules.sql` to the live Supabase project is done via the Supabase MCP (`apply_migration`) by the orchestrator, or by the owner in the dashboard — never assumed applied by CI.

---

### Task 5: Digit hotkeys + chart tag `[R{slot}]`

**Files:**
- Create: `emulador/src/app/state/playbook/playbook-hotkeys.directive.ts`
- Modify: the emulador page host template (locate the chart layout host — the component that hosts the workspace viewport; attach the directive there)
- Modify: the label-composition site in the per-panel mapper (`grep -n "label" emulador/src/app/state/chart/chart-model-mapper.ts` — or wherever order/position labels are composed into the RenderModel; INSPECT FIRST, this is the one integration point this plan cannot pin to a line)
- Test: `emulador/src/app/state/playbook/playbook-hotkeys.directive.spec.ts`, plus a NEW mapper spec file for the tag suffix

**Interfaces:**
- Consumes: `selectRuleBySlot`, `selectPlaybookLoaded` (Task 1), `TradingActions.tagTrade` (Task 2), the mapper's existing label inputs.
- Produces: the visible behavior of G2/D15.D/D15.E. No new exports consumed by later tasks.

- [ ] **Step 1: Re-verify the digit namespace is still free**

Run: `grep -rnE "key === '[1-9]'|Digit[1-9]|keydown\.[1-9]" emulador/src/app` → expected: no matches. If matches appear, STOP and report the collision (RFC risk R1).

- [ ] **Step 2: Failing directive spec**

```ts
// playbook-hotkeys.directive.spec.ts (TestBed host component + MockStore)
// Cases (each dispatch asserted via a vi.spyOn(store, 'dispatch')):
// 1. '3' with rule in slot 3 and loaded=true → dispatches tagTrade({ ruleId })
// 2. '5' with empty slot → no dispatch
// 3. any digit with loaded=false → no dispatch
// 4. modifier held (ctrlKey) → no dispatch
// 5. event.repeat → no dispatch
// 6. focus inside an <input> (event.target) → no dispatch
// 7. 'a' → no dispatch
// afterEach: store.resetSelectors()
```

Write these as real TestBed tests with a host `<div appPlaybookHotkeys></div>` and `window.dispatchEvent(new KeyboardEvent('keydown', {...}))`; assert with `toHaveBeenCalledWith(TradingActions.tagTrade({ ruleId: 'r1' }))` / `not.toHaveBeenCalled()`.

- [ ] **Step 3: Implement the directive**

```ts
// playbook-hotkeys.directive.ts
import { Directive, HostListener, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { TradingActions } from '../trading/trading.actions';
import { selectPlaybookLoaded, selectRuleBySlot } from './playbook.selectors';

/** G2/D15.D: digits 1..9 tag the most recent active trade with the slotted rule. */
@Directive({ selector: '[appPlaybookHotkeys]', standalone: true })
export class PlaybookHotkeysDirective {
  private store = inject(Store);
  private bySlot: ReturnType<typeof Object> = {};
  private loaded = false;
  private subs = [
    this.store.select(selectRuleBySlot).subscribe((m) => (this.bySlot = m)),
    this.store.select(selectPlaybookLoaded).subscribe((l) => (this.loaded = l)),
  ];

  @HostListener('window:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent): void {
    if (!this.loaded || ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (ev.key < '1' || ev.key > '9') return;
    const t = ev.target as HTMLElement | null;
    if (t && (t.closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]'))) return;
    const rule = (this.bySlot as Record<string, { id: string }>)[ev.key];
    if (!rule) return;
    this.store.dispatch(TradingActions.tagTrade({ ruleId: rule.id }));
  }
}
```

(Convert the two manual subscriptions to `toSignal`/`store.selectSignal` if that is the codebase's prevailing idiom — inspect a sibling directive/component first; add `ngOnDestroy` unsubscription if manual subscriptions stay.)

- [ ] **Step 4: Mapper tag — inspect, failing spec, implement**

Inspect where order/position labels are composed (the per-panel mapper). Add: given a `ruleId → slot` map input, suffix the label text with ` [R{slot}]` when the entity carries a `declaredRuleId` that resolves, ` [R]` when it carries one that has no slot, and NO suffix when the id dangles (rule deleted remotely). New spec file asserts the three cases plus: closed trades never get the suffix (labels only exist for active entities — assert via the mapper's actual input shape). Thread the map from the page/panel input the same way other cross-slice inputs reach the mapper (per-instance input, NOT a shared factory selector — D8).

- [ ] **Step 5: Attach the directive to the chart page host** (one-line template change on the emulador page host element).

- [ ] **Step 6: Gates green; commit**

```bash
git commit emulador/src/app/state/playbook/playbook-hotkeys.directive.ts <page-host-file> <mapper-file> -m "feat(playbook): digit hotkeys tag the active trade + [R{slot}] chart label (RFC-015 T5)"
git commit emulador/src/app/state/playbook/playbook-hotkeys.directive.spec.ts <new-mapper-spec-file> -m "test(playbook): hotkey gating + label tag composition (RFC-015 T5)"
```

---

### Task 6: Playbook panel in the side dock + export

**Files:**
- Create: `emulador/src/app/components/playbook-panel/playbook-panel.component.ts` (+ `.html`, `.css`)
- Modify: `emulador/src/app/components/side-dock/side-dock.component.ts` / `.html` (mount the panel as a new dock section — inspect the dock's existing section idiom FIRST and mirror it exactly)
- Test: `emulador/src/app/components/playbook-panel/playbook-panel.component.spec.ts`

**Interfaces:**
- Consumes: `selectActiveRules`, `selectPlaybookRules`, `PlaybookActions` (Task 1). Component generates ids with `crypto.randomUUID()` and stamps `createdAt: Date.now()` (IO stays in the component, reducers stay pure).
- Produces: user-facing CRUD + export. Nothing consumed by later tasks.

- [ ] **Step 1: Failing component spec** — TestBed + MockStore (`resetSelectors` in afterEach): renders the active rules with their slot badge (`R1`); create form dispatches `createRule` with non-empty title (empty title → no dispatch); slot select dispatches `assignSlot`; retire button dispatches `setRuleStatus`; export button builds `{ version: 1, exportedAt, rules }` (spy on a small injected `downloadJson(filename, payload)` helper — assert filename matches `/^playbook-\d{4}-\d{2}-\d{2}\.playbook\.json$/` and payload contains ALL rules incl. retired).
- [ ] **Step 2: Implement the component** — Spanish copy: title "Playbook", empty state "Sin reglas todavía. Crea la primera regla que vas a entrenar.", fields "Título" / "Regla" (textarea), actions "Crear regla" / "Retirar" / "Reactivar" / "Exportar playbook", slot select label "Atajo" with options "—, 1..9". `tabular-nums` on numeric badges; DESIGN.md tokens (`--surface-2`, `--text-muted`, `--radius` — match the sibling dock sections' classes). NO counters, NO percentages, NO judgment copy (RFC no-objetivo 5; N-1 binds UI copy).
- [ ] **Step 3: Mount in the side dock** following its existing section pattern.
- [ ] **Step 4: Gates green; commit**

```bash
git commit emulador/src/app/components/playbook-panel/ emulador/src/app/components/side-dock/side-dock.component.ts emulador/src/app/components/side-dock/side-dock.component.html -m "feat(ui): Playbook dock panel — CRUD, slots, export (RFC-015 T6)"
git commit emulador/src/app/components/playbook-panel/playbook-panel.component.spec.ts -m "test(ui): Playbook panel coverage (RFC-015 T6)"
```

---

### Task 7: Invariant detectors + documentation closure

**Files:**
- Create: `emulador/src/app/state/playbook/playbook-invariants.spec.ts`
- Modify: `docs/architecture/DOMAIN_MODEL.md` (new subsection: P-1..P-7 invariants with their detectors, in the I-14/I-15 style; `declaredRuleId` noted on the §3.1 identity chain)
- Modify: `docs/architecture/UBIQUITOUS_LANGUAGE.md` (entries: Playbook, PlaybookRule, declaredRuleId / declaración, slot de atajo, `emulador-playbook`)
- Modify: `docs/architecture/rfcs/015-playbook-adherencia-reglas.md` (Estado → Implementado (fecha) + desviaciones si las hubo)
- Test: the invariants spec IS the deliverable; docs carry no gates beyond lint-neutrality.

**Interfaces:** consumes everything; produces the DoD evidence.

- [ ] **Step 1: Write the invariants spec** — executable detectors that don't fit earlier files: P-3 cross-DB survival (already in Task 3 — extend here with the telemetry+workspaces purge composite if Task 3's version was narrower); P-4 full fold round-trip through payload mapping (`toPayload → parse → fromPayload` keeps `declaredRuleId` on history trades); P-7 grep-style assertion via a small file-reading test is NOT possible in vitest — instead document the grep commands + output in the task report and RFC closure: `grep -rn "\.amendments" emulador/src/app --include=*.ts` (expected: models + persistence/export only) and `grep -rn "\.statement" emulador/src/app --include=*.ts` (expected: panel display/edit + export + sync mapping only).
- [ ] **Step 2: Docs edits** (match each doc's language — DOMAIN_MODEL/UL English body with Spanish terms where the UL glosses them; RFC Spanish).
- [ ] **Step 3: Full gates + `npm run build`; commit**

```bash
git commit emulador/src/app/state/playbook/playbook-invariants.spec.ts -m "test(playbook): P-invariant detectors (RFC-015 T7)"
git commit docs/architecture/DOMAIN_MODEL.md docs/architecture/UBIQUITOUS_LANGUAGE.md docs/architecture/rfcs/015-playbook-adherencia-reglas.md -m "docs(architecture): RFC-015 closure — P-invariants, UL entries, RFC status (RFC-015 T7)"
```

---

## Verification at branch end (orchestrator)

1. All four gates + `npm run build` fresh (auditor re-runs personally).
2. Invariant greps: P-2/P-5/P-7 outputs recorded; digit-namespace grep still clean; no new deps (`git diff <base>..HEAD -- emulador/package.json` empty); STOP check (`git diff <base>..HEAD --name-only -- '*.spec.ts'` → only NEW files).
3. Browser walkthrough: create rule → assign slot 1 → place order → press `1` → `[R1]` on the label → close trade → tag gone, `declaredRuleId` in history → purge sessions → rules intact → export downloads.
4. PR to `develop`; `playbook_rules.sql` applied via Supabase MCP before merge.
