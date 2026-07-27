# RFC-018 Implementation Plan — Trade Visibility Refinement

| Field | Value |
| :--- | :--- |
| **RFC** | `docs/architecture/rfcs/018-trade-visibility-refinement.md` |
| **Branch** | `feature/rfc-018-trade-visibility-refinement` (off `develop` @ `4e005d6`) |
| **PR target** | `develop` (architectural/RFC track) |
| **Date** | 2026-07-26 |
| **Decisions implemented** | D18.A, D18.B, D18.C, D18.D + F3 (parallel) |
| **Explicitly out of scope** | D18.E (selection origin — TEDS) |

> **Path note.** The brief proposed `docs/superpowers/rfc-018-implementation-spec.md`
> *or* `.superpowers/rfc-018/`. This plan uses the repo's established convention
> (`docs/superpowers/plans/<date>-<slug>.md`, matching
> `2026-07-16-rfc-017-implementation-plan.md`) per `CLAUDE.md` §Conventions. The dev
> log lives at `.superpowers/rfc-018/dev-log.md` as requested.

---

## 0. Corrections to the briefing (verified against the code at `4e005d6`)

The task brief was written from the architectural review, not from the tree. Five of
its assumptions do not hold. **Implementers must follow this section, not the brief.**

| # | Brief says | Reality | Consequence |
| :--- | :--- | :--- | :--- |
| C1 | Modify `link-groups.effects.ts` | **No such file exists.** `emulador/src/app/state/link-groups/` holds only `actions`, `models`, `reducer` (+ specs) | Drop it from Task 1's file list |
| C2 | Update `produceLinkGroupWire` / `normalizeLinkGroupWire` in `session-sync.mapping.ts` | **Neither function exists.** `toPayload`/`fromPayload` pass `linkGroups` through wholesale; the only normalization point is `parseSessionPayload` → `normalizeLinkGroup` (`session-migration.ts:133`) | Task 1 touches `session-sync.mapping.ts` **not at all**; the wire work is entirely in `link-groups.models.ts` |
| C3 | `hideTrades` removal is a pure field deletion | `normalizeLinkGroup` returns `{ ...g, ... }` — a **spread**. After deleting the field, a legacy `syncTrades` key would be copied into runtime state and re-serialized into the next V3 payload forever | `normalizeLinkGroup` must be rewritten to construct the group **field by field** (see Task 1, Step 3) |
| C4 | `chart.component.ts` "receives panelId via input" | `ChartComponent` has **no panel input**. It reads its identity from the injected per-panel mapper: `this.mapper.descriptor()` (see `chart.component.ts:512`) | Task 4 resolves the descriptor from the mapper signal, not an input |
| C5 | Task 1 is a small change | Removing the field breaks **14 spec files** (corrected from 12 by C6, landed in the docs pass) that build `LinkGroup` object literals (TS excess-property checks fire) | Task 1 carries a mechanical fan-out; full file list in Task 1, Step 6 |

Additional verified facts that shape the plan:

- **No existing spec covers the panel eye button.** `chart-panel.component.spec.ts`
  tests the header label, TF select, and the link-chip menu (lines 226-290) but never
  `hideSharedDrawings` or `.panel-hide-shared`. Task 6 has freedom to restructure, and
  **must add the missing coverage**.
- **No Esc-close exists on the panel today.** `onDocClick` closes only
  `linkChipMenuOpen`. Task 6 adds Esc handling as new behavior.
- **`tradeChartView$` specs subscribe without calling `configurePanel`**
  (`chart-model-mapper.service.spec.ts:320-375`). Task 3 changes that contract; see its
  Step 4 for the deliberate, declared spec touch.

---

## 1. Task ordering and parallelism

```
Task 1 (retire syncTrades) ──┐
Task 2 (hideTrades model)  ──┼──► Task 3 (gate the mapper) ──► Task 6 (eye popover)
                             │
                             └──► Task 4 (T-3 execution guard)   [independent, shippable alone]

Task 5 / F3 (per-panel geometry)  [independent of 1-4; same file as Task 3 — sequence after it]
```

- **Tasks 1 and 2 are independent** of each other and may be done in either order.
- **Task 3 depends on Task 2** (`panelRendersTrades` must exist).
- **Task 4 depends on Task 2** only (`panelMayExecute`) — it is the highest-value change
  and can ship without any of the others.
- **Task 6 depends on Tasks 1 and 2** (needs `hideTrades` and the removed group toggle).
- **Task 5 (F3) touches the same file as Task 3** (`chart-model-mapper.service.ts`).
  Sequence it after Task 3 to avoid a merge conflict inside one working tree.

Commit per task, pathspec-scoped (`git add <paths>`, never `-A`), conventional message.

---

## Task 1 — Retire `syncTrades` from `LinkGroup` (D18.A)

### Goal
Remove the field, its action, its reducer case, its normalization default, and its UI
toggle. Reading a legacy payload that still carries the key must succeed and must not
propagate the key back out.

### Files

| File | Change |
| :--- | :--- |
| `state/link-groups/link-groups.models.ts` | Field, `LinkGroupWire`, `normalizeLinkGroup`, `createLinkGroup` |
| `state/link-groups/link-groups.actions.ts` | Delete `'Set Sync Trades'` |
| `state/link-groups/link-groups.reducer.ts` | Delete the `setSyncTrades` `on(...)` case |
| `components/workspace/link-groups-menu.component.ts` | Delete the "Trades" `<label>` + `toggleTrades()` |
| *(14 spec files — corrected from 12, C6)* | Remove `syncTrades` from object literals; rewrite the channel specs |

**Do NOT touch** `session-sync.mapping.ts` (C2) and **do not create**
`link-groups.effects.ts` (C1).

### Step 1 — `LinkGroup`

```typescript
export interface LinkGroup {
  id: string;
  color: string;
  syncCrosshair: boolean;
  syncTimeRange: boolean;
  /** Composition channel (sole member, RFC-018 §5.1): group members compose the same drawing ownership namespace (`group:<id>`). */
  syncDrawings: boolean;
  /** (R3) RESERVED — accepted and stored, never read/applied by any code. */
  syncPriceScale?: boolean;
}
```

### Step 2 — `LinkGroupWire` keeps legacy tolerance

`syncTrades` is no longer a member of `LinkGroup`, so it can no longer be expressed via
`Omit`/`Pick`. Declare it as an explicit legacy-only optional:

```typescript
/**
 * Wire/legacy shape of a hydrated link group. Payloads created before RFC-017
 * predate `syncDrawings`; payloads created between RFC-017 and RFC-018 additionally
 * carry `syncTrades`, retired by RFC-018 (D18.A). Both are tolerated on read and
 * neither is written back.
 */
export type LinkGroupWire = Omit<LinkGroup, 'syncDrawings'> &
  Partial<Pick<LinkGroup, 'syncDrawings'>> & {
    /** @deprecated RFC-018 D18.A — read-tolerated, never applied, never re-emitted. */
    syncTrades?: boolean;
  };
```

### Step 3 — `normalizeLinkGroup` must stop spreading (C3)

The current body is `return { ...g, syncDrawings: ..., syncTrades: ... }`. The spread is
what would carry a legacy `syncTrades` into runtime state and back into the next V3
payload. Replace with explicit construction:

```typescript
/**
 * Hydration normalization: a group missing `syncDrawings` defaults to `false`
 * (no pre-RFC-017 schema ever shared drawings across a group). Built field by
 * field — NOT by spread — so retired/unknown wire keys (`syncTrades`, RFC-018
 * D18.A) are dropped at the boundary and never re-enter a payload.
 */
export function normalizeLinkGroup(g: LinkGroupWire): LinkGroup {
  const normalized: LinkGroup = {
    id: g.id,
    color: g.color,
    syncCrosshair: g.syncCrosshair,
    syncTimeRange: g.syncTimeRange,
    syncDrawings: g.syncDrawings ?? false,
  };
  // `syncPriceScale` stays reserved: carried only when present, never defaulted.
  if (g.syncPriceScale !== undefined) normalized.syncPriceScale = g.syncPriceScale;
  return normalized;
}
```

`createLinkGroup` drops `syncTrades: true` and is otherwise unchanged.

### Step 4 — Actions and reducer

- `link-groups.actions.ts`: delete the `'Set Sync Trades'` event.
- `link-groups.reducer.ts`: delete the `on(LinkGroupsActions.setSyncTrades, ...)` block.
  Every other case is untouched. **Note:** `createGroup` inserts the supplied group
  without normalization — unchanged and still correct, since `createLinkGroup` is the
  only producer.

### Step 5 — UI

In `link-groups-menu.component.ts`, delete the `<label class="group-toggle">` block
holding `class="sync-trades"` and the `toggleTrades()` method. Leave Crosshair, Rango,
and Dibujos untouched.

> There is a pre-existing markup oddity in this template — a stray `</button>` closing
> the group row after the toggles. Leave it alone; it is out of scope and touching it
> would put an unrelated diff in an RFC commit.

### Step 6 — Spec fan-out (mechanical, unavoidable)

TypeScript excess-property checks fire on every `LinkGroup` object literal still
carrying `syncTrades`. **`tsc -p tsconfig.spec.json` stays red until all 14 are done.**

> **Post-hoc correction (C6, landed in the docs pass).** This section originally
> listed **12** files; the real fan-out was **14**
> (`grep -rln "syncTrades" emulador/src/` → 17 files: 3 production + 14 spec).
> Two files were missing entirely — `services/session-migration.v3.spec.ts` and
> `pages/sesiones/sesiones-page.component.spec.ts` — both carrying **behavioral**
> assertions on the `syncTrades: true` migration default
> (`session-migration.v3.spec.ts:251-262`, `sesiones-page.component.spec.ts:768`),
> not inert literals, so each needed a rewrite rather than a line deletion
> (`migrateV2ToV3` normalizes through `normalizeLinkGroup`,
> `session-migration.ts:133` — the same C3 boundary this plan already
> identified). A third file, `state/link-groups/link-groups.reducer.spec.ts`,
> was on the original literal-only list below but itself held two full
> behavioral tests asserting the retired `syncTrades: true` normalization
> default — reclassified below to the behavioral-rewrites bucket. See
> `dev-log.md` §8.2 (C6) and §8.3 (Task 1 deviation #1) for the full ruling.

*Literal-only removals (delete the `syncTrades: …` line):*
- `components/chart/chart-model-mapper.composition.spec.ts`
- `components/workspace/chart-panel.component.spec.ts`
- `components/workspace/chart-sync-router.spec.ts`
- `services/session-sync.service.spec.ts`
- `services/workspace-db.service.spec.ts`
- `state/drawings/drawing-ownership.spec.ts`
- `state/workspaces/session-persistence.e2e.spec.ts`
- `state/workspaces/workspaces.effects.spec.ts`
- `components/workspace/link-groups-menu.component.spec.ts`

*Behavioral rewrites:*
- **`state/link-groups/link-groups.channels.spec.ts`** — its describe block is
  `'LinkGroup composition channels (syncDrawings / syncTrades)'`. Delete the
  `setSyncTrades` case and the `syncTrades` default assertions. **Add** the new legacy
  cases below.
- **`components/workspace/link-groups-menu.component.channels.spec.ts`** — delete
  `'renders a Spanish "Trades" toggle reflecting group.syncTrades'` and the
  `dispatched.group.syncTrades` assertion. **Add** an assertion that no `.sync-trades`
  control renders.
- **`state/link-groups/link-groups.reducer.spec.ts`** (C6) — held two full
  behavioral tests asserting the retired `syncTrades: true` normalization
  default, not an inert literal as originally filed. Keep the
  `syncDrawings === false` assertions, retitle, and swap the stale `syncTrades`
  assertion for the anti-leak `expect('syncTrades' in x).toBe(false)`.
- **`services/session-migration.v3.spec.ts`** (C6) — rewrite the `syncTrades: true`
  migration-default assertion (originally lines 251-262) through
  `normalizeLinkGroup`, asserting the key's absence rather than its value.
- **`pages/sesiones/sesiones-page.component.spec.ts`** (C6) — same rewrite for
  the `syncTrades` assertion originally at line 768.

### Tests to add

In `link-groups.channels.spec.ts`:

1. `normalizeLinkGroup` accepts a legacy wire object carrying `syncTrades: false` and
   **does not throw**.
2. The normalized result **has no `syncTrades` key**:
   `expect('syncTrades' in normalized).toBe(false)` — the anti-leak assertion for C3.
3. `syncDrawings` defaults to `false` when absent (D17.I preserved).
4. `syncPriceScale` is carried through when present and stays absent when not (R3
   reserved-field discipline preserved).
5. `createLinkGroup` produces no `syncTrades` key.

In `link-groups-menu.component.channels.spec.ts`:

6. The menu renders Crosshair, Rango and Dibujos toggles and **no** trades toggle.

### Verification

```bash
cd emulador && npx tsc -p tsconfig.spec.json --noEmit
```

> **Post-hoc correction (R18-12, landed in the docs pass).** The line below
> originally demanded `grep -rn "syncTrades" emulador/src/` return zero, which
> directly contradicts Step 2 above (the `LinkGroupWire` legacy-tolerance
> optional) and the anti-leak assertions this same section mandates
> (`expect('syncTrades' in normalized).toBe(false)`) — both make the literal
> string appear in `emulador/src/` by design. RFC-018 §10 settles it: the wire
> tolerance is required. The binding invariant is **zero live `syncTrades`
> channel**, verified by the live-channel greps below (see `dev-log.md` §8,
> R18-12, for the full ruling).

```bash
grep -rn "Set Sync Trades\|setSyncTrades" emulador/src/   # must be empty
grep -rn "sync-trades\|toggleTrades"      emulador/src/   # only an absence assertion in a spec
grep -rnE "\.syncTrades" emulador/src/                    # must be empty
```

---

## Task 2 — Add `hideTrades` to the layout model (D18.B)

### Files
`state/layout/layout.models.ts`, `state/layout/layout.actions.ts`,
`state/layout/layout.reducer.ts`

### Step 1 — `PanelDescriptor`

```typescript
  /** Per-panel local toggle (T-2): drops the trade layer from THIS panel only. Absent = false; never persisted as an explicit `false`. */
  hideTrades?: boolean;
```

### Step 2 — Predicates in `layout.models.ts`

Place both immediately after `effectivePanelSymbol` (they are its only consumers, and
co-location keeps the symbol-resolution rule in one file).

```typescript
/**
 * RFC-018 (T-1 ∧ T-2): where the Trade domain may speak. T-1 (the symbol clause) is a
 * correctness invariant and is NOT user-togglable — painting one instrument's levels on
 * another's price axis is a false statement about the market. T-2 (`hideTrades`) is a
 * panel-local preference. Mirrors `composePanelDrawings`: symbol filter + local opt-out.
 */
export function panelRendersTrades(
  descriptor: PanelDescriptor,
  primarySymbol: string | null,
): boolean {
  if (primarySymbol == null) return false;
  if (effectivePanelSymbol(descriptor, primarySymbol) !== primarySymbol) return false;
  return !descriptor.hideTrades;
}

/**
 * RFC-018 (T-3): may a trading verb originate from this pane? Deliberately ignores
 * `hideTrades` — hiding the layer is a visual preference, not a trading lockout. The
 * UI rule that a hidden-layer panel also retires its order verbs lives in the component
 * (RFC-018 §8), not in this predicate.
 */
export function panelMayExecute(
  descriptor: PanelDescriptor,
  primarySymbol: string | null,
): boolean {
  return (
    primarySymbol != null &&
    effectivePanelSymbol(descriptor, primarySymbol) === primarySymbol
  );
}
```

### Step 3 — Action

In `layout.actions.ts`, directly after `'Set Panel Hide Shared Drawings'`:

```typescript
    /** Toggles the panel-local trade-layer visibility filter (T-2). No-op if panelId is unknown or the value is unchanged. */
    'Set Panel Hide Trades': props<{ panelId: string; hidden: boolean }>(),
```

### Step 4 — Reducer

Replicate `setPanelHideSharedDrawings` **exactly** — including the delete-on-false idiom
and the identity return:

```typescript
    on(LayoutActions.setPanelHideTrades, (state, { panelId, hidden }): LayoutState => {
      const panel = state.panels[panelId];
      if (!panel || (panel.hideTrades ?? false) === hidden) return state;
      // absent means false: toggling off CLEARS the field rather than writing
      // `false` explicitly, so descriptors that never toggled stay untouched by shape.
      const next = { ...panel };
      if (hidden) {
        next.hideTrades = true;
      } else {
        delete next.hideTrades;
      }
      return { ...state, panels: { ...state.panels, [panelId]: next } };
    }),
```

### Tests — `state/layout/layout.hide-trades.spec.ts`

Mirror `layout.hide-shared.spec.ts` one-for-one (7 cases): sets true; toggling off
clears the key; unknown panelId is an identity return; same-value is an identity return;
`hidden:false` on a never-toggled panel is an identity return; the flag is absent (not
`false`) by default; every other descriptor field survives.

### Tests — `state/layout/layout.trade-predicates.spec.ts` (new)

| Case | Expectation |
| :--- | :--- |
| `primarySymbol === null` | both predicates `false` |
| `symbol: ''` (sentinel), primary `'US30'` | both `true` |
| `symbol: 'US30'`, primary `'US30'` | both `true` |
| `symbol: 'NAS100'`, primary `'US30'` | both `false` (T-1 / T-3) |
| `symbol: 'US30'`, primary `'US30'`, `hideTrades: true` | `panelRendersTrades` **false**, `panelMayExecute` **true** (T-2 is not a trading lockout) |
| `symbol: 'NAS100'`, `hideTrades: false` | `panelRendersTrades` false — **T-1 is not overridable by T-2** |

That last case is the invariant detector for T-1; it must exist.

---

## Task 3 — Gate `tradeChartView$` inside the mapper (D18.C)

### File
`components/chart/chart-model-mapper.service.ts`

### Step 1 — Current shape

```typescript
readonly tradeChartView$ = this.store.select(selectTradeChartView).pipe(
  map((data) => ({ positions: …, orders: …, markers: …, boxes: … })),
  this.gated(),
);
```

One store input, no panel awareness.

### Step 2 — Target shape

`combineLatest([panelDescriptor$, selectTradeChartView, selectCurrentAsset])`, with the
predicate applied inside the `map`. Follow the **`panelDrawings$` pattern exactly**
(reference-keyed memo slot, `this.gated()` last):

- Gating decision: `panelRendersTrades(descriptor, currentAsset)`.
- When the predicate is `false`, emit a **stable frozen empty view** held in a module- or
  instance-level constant — never a fresh `{ positions: [], … }` literal per emission.
  A new object each tick would defeat the engine's referential short-circuit and
  reintroduce per-frame allocation on the unchanged path (RFC-017 §4).
- When `true`, the existing four `memoizeMap` calls run unchanged, so today's reference
  stability guarantees survive verbatim.

Memo key: **3 inputs** (`descriptor`, the trade view, `currentAsset`). Do not add
`groups`. Do not introduce a parameterized selector — the D8 ban is absolute; gating
lives in the mapper instance, never in the store and never in the engine.

### Step 3 — Unconfigured-mapper contract (decide explicitly, document in code)

`panelDescriptor$` is a `ReplaySubject(1)` that emits only after `configurePanel`.
`chartView$` handles this with `startWith(null)` and falls back to the global view.

**Ruling for trades: gate CLOSED until configured.** Use `startWith(null)` and treat a
`null` descriptor as "no trade layer". Rationale: T-1 is a correctness invariant, and a
single frame of trade ink on an as-yet-unidentified pane is a false statement about the
market. A one-frame delay before ink appears is harmless; the inverse is not.

### Step 4 — Declared spec touch

`chart-model-mapper.service.spec.ts` (the `tradeChartView$` describe block, ~lines
320-375) subscribes **without** calling `configurePanel`, so under Step 3 it would
observe zero emissions.

Add `mapper.configurePanel({ id: 'p1', symbol: '', timeframe: 'M1', linkGroupId: null })`
plus a `selectCurrentAsset` override to that block's setup. This is **added required
setup, not a weakened assertion** — every existing reference-stability expectation stays
byte-identical. Record it in the dev log as a deliberate spec touch.

### Tests to add — `chart-model-mapper.trade-gating.spec.ts` (new)

| Case | Expectation |
| :--- | :--- |
| Panel `symbol: ''`, asset `'US30'` | full trade view emitted |
| Panel `symbol: 'NAS100'`, asset `'US30'` | empty view (T-1) |
| Panel `symbol: 'US30'`, `hideTrades: true`, asset `'US30'` | empty view (T-2) |
| Flip `hideTrades` true → false | layer returns without a store change to trading data |
| Two consecutive emissions, gate closed both times | the **same** empty-view reference (no per-tick allocation) |
| Gate open, unchanged upstream references | all four arrays reference-stable (regression guard on the existing memo) |
| Mapper never configured | no trade layer (Step 3 contract) |

---

## Task 4 — T-3 execution guard (D18.D)

> **Highest-value change in the RFC.** RFC-017 §5.1 *declares* that no order placement
> exists on a panel whose symbol differs from `primarySymbol`; nothing enforces it. Today
> `finishPlacing` takes the price off whichever pane was clicked
> (`series.coordinateToPrice`) and the contract size off the **global** asset
> (`selectTradePanelView` / `selectContractSize`). This is latent only because no UI
> creates a non-`''` panel symbol (F2). The moment the symbol picker RFC-017 §5.1
> blesses ships, it is a wrong-price order on the wrong instrument — a fill-fidelity
> defect, the product's declared central trust asset.

### File
`components/chart/chart.component.ts`

### Step 1 — Resolve identity (C4)

`ChartComponent` has **no panel input**. It already reads its descriptor from the
injected per-panel mapper — the exact idiom is at line ~512:

```typescript
const panelId = this.mapper.descriptor()?.id;
```

Add a component-local computed:

```typescript
/** RFC-018 (T-3): may trading verbs originate from THIS pane? A pane whose symbol is not the book's is view-only w.r.t. trades. */
private readonly mayExecute = computed(() => {
  const d = this.mapper.descriptor();
  return d != null && panelMayExecute(d, this.currentAsset());
});
```

`this.currentAsset` already exists (line ~470, `selectCurrentAsset`). No new store
subscription is required.

**Unconfigured-mapper ruling (R18-2):** `descriptor() == null` ⇒ `mayExecute` is `false`
(refuse). Same reasoning as Task 3 Step 3 — a command is even less forgiving than a
render.

### Step 1b — The UI rule layered on top (RFC-018 §8, **binding**)

A panel with `hideTrades: true` offers **and executes** no order verbs. This is a
presentation rule composed *over* the domain predicate — it does **not** change
`panelMayExecute`, which stays symbol-only (T-3).

Keep the two concerns as two named signals so the split is legible in the code, and
guard every site with the composed one:

```typescript
/** T-3 (domain): symbol-only. Never consults hideTrades. */
private readonly mayExecute = computed(() => {
  const d = this.mapper.descriptor();
  return d != null && panelMayExecute(d, this.currentAsset());
});

/** RFC-018 §8 (UI rule, binding): a pane the trader asked to keep clean is not an order-entry surface. */
private readonly hideTrades = computed(() => this.mapper.descriptor()?.hideTrades ?? false);

/** The condition every pane-originated trading verb is guarded by. */
private readonly tradeVerbsEnabled = computed(() => this.mayExecute() && !this.hideTrades());
```

**Consistency requirement (RFC-018 §8):** all four guard points use
`tradeVerbsEnabled()`, never `mayExecute()` alone. Offering less than you execute is a
trap; executing less than you offer is a silent failure. Do not guard the menu with the
composed condition and the dispatch with the bare one.

**Do not fold `hideTrades` into `panelMayExecute`.** The predicate in `layout.models.ts`
is a domain invariant; this is a UI rule with a different amendment path (a UI decision,
not an RFC). RFC-018 §4.2 states the composition rule: *un invariante y una preferencia
se componen, no se funden*.

### Step 2 — Four guard points

All four use `tradeVerbsEnabled()`.

1. **`handleContextMenu`** (~line 862): keep the placing-flow early return and the box
   hit-test intact. Guard only the **order options**: when `tradeVerbsEnabled()` is
   false, leave `options` empty so no Buy/Sell Limit/Stop entries are offered. "Fit",
   "Ir a fecha…", "Programar fin…" and the closed-box hide/delete verbs remain available
   — they are not trading verbs, and the closed-box verbs act on the *record*, not the
   book.
2. **`finishPlacing`** (~line 1068): early return routed through `clearPlacing()` (so no
   orphan preview price lines survive) when `tradeVerbsEnabled()` is false.
3. **`dragTradeLine`** (~line 1131): early return before the `modifyPosition` /
   `modifyOrder` dispatch when `tradeVerbsEnabled()` is false.
4. **Cancel / close** (~lines 1373-1376, `cancelOrder` / `closePosition`): same guard.
   These are trading verbs originating from the pane and fall under the same rule.

**Edge case to handle deliberately:** a panel may acquire `hideTrades: true` *while* an
order placement is in progress (the trader flips the toggle mid-placement). Guard point 2
already catches the commit, but `clearPlacing()` should also run when the flag flips, so
no preview lines are left painted on a pane that no longer shows trades. Add an `effect`
that calls `cancelPlacing()` when `tradeVerbsEnabled()` goes false, and cover it with a
test.

### Step 3 — Defense in depth, not UI-only

Guard both the *offer* (menu) and the *act* (dispatch). A guard that only hides menu
entries leaves the drag and keyboard paths open.

### Tests to add — `chart.component.trade-guard.spec.ts` (new)

| Case | Expectation |
| :--- | :--- |
| Panel symbol `''`, asset `'US30'`, right-click | order options present (regression guard: the happy path still works) |
| Panel symbol `'NAS100'`, asset `'US30'`, right-click | `menu().options` is empty; "Fit" / date verbs still available |
| Same, `finishPlacing` invoked directly | no `TradingActions.placeOrder` dispatched; placing state cleared |
| Same, `dragTradeLine` invoked | no `modifyPosition` / `modifyOrder` dispatched |
| Same, cancel / close invoked | no `cancelOrder` / `closePosition` dispatched |
| Mapper never configured | no order options, no dispatch |
| **T-1/UI split** — symbol `'US30'`, asset `'US30'`, `hideTrades: true`, right-click | `menu().options` is empty (§8 UI rule) |
| Same, `finishPlacing` / `dragTradeLine` / cancel / close | no dispatch — menu and dispatch agree |
| Same descriptor | `panelMayExecute(d, 'US30')` still returns **true** — the domain predicate is untouched by `hideTrades` |
| `hideTrades` flips true during an in-progress placement | placing state cleared, no orphan preview price lines |

---

## Task 5 (parallel) — Per-panel trade geometry (F3)

### The defect
`selectTradeMarkers` derives from `selectActiveCandles` — the **global active TF**
series — and calls `snapToCandle` against it. `selectTradeBoxes` shares the same global
provenance. Consequence today, with no observation panels needed: **a panel on H1
receives markers snapped to the global TF's grid** (typically M1). The trade layer's
geometry is wrong per panel, in production, right now.

### Files
`components/chart/chart-model-mapper.service.ts`, `state/selectors.ts`

### Direction

1. Move `snapToCandle` (currently a private helper in `selectors.ts`) into a shared pure
   module importable by the mapper, or export it. It must stay a pure function — no
   store awareness.
2. In the mapper, derive markers from **this panel's** candles. The panel's candle array
   is already computed by `panelChartView$`; reuse that source rather than re-deriving
   (`generateCustomSeries` on a second path would double the cost per panel).
3. Feed the mapper from the **raw trading slices** (`selectPositions`, `selectOrders`,
   `selectHistory`) plus the panel's candles, instead of the pre-snapped global
   `selectTradeMarkers`.
4. `selectTradeBoxes` needs no snapping (it carries raw `openTime`/`closeTime`) but its
   consumption must be routed through the per-panel path so both marks share one
   provenance. Keep `selectTradeBoxesVisible` gating where it is.
5. **Keep the global selectors alive** while non-panel consumers exist —
   `selectClosedTradeBoxes` feeds the toolbar eye dropdown, and `selectTradeBoxesVisible`
   is a settings flag. Do not delete them; stop feeding the *pane render* from them.

### Memoization
Same reference-keyed discipline as `panelDrawings$`: memo on
`[panelCandles, positions, orders, history, boxesVisible]`. A replay tick that does not
change any of those references must not allocate.

### Tests
- Panel on H4 with global TF M1 → markers snapped to H4 bar opens, not M1.
- Two panels at different TFs, same trade → each snaps to its **own** grid.
- Unchanged references → identical output references.
- A trade whose `openTime` precedes the panel's first candle degrades without throwing.

### Ordering note
Touches the same file as Task 3. Sequence **after** Task 3 lands.

---

## Task 6 — The panel eye popover (RFC-018 §8)

### File
`components/workspace/chart-panel.component.ts`

### Step 1 — Unconditional eye

Remove the `@if (descriptor().linkGroupId !== null)` wrapper around the eye button. The
eye is now always present, sits in a `position: relative` anchor (mirroring
`.link-chip-anchor`), and **opens a popover instead of toggling directly**.

### Step 2 — Template

```html
<div class="eye-anchor">
  <button
    type="button"
    class="panel-eye"
    [class.active]="anyLayerHidden()"
    [attr.aria-label]="eyeLabel()"
    [attr.title]="eyeLabel()"
    [attr.aria-expanded]="eyeMenuOpen()"
    (click)="toggleEyeMenu($event)"
  >
    <!-- existing eye SVG, with the slash path shown when anyLayerHidden() -->
  </button>
  @if (eyeMenuOpen()) {
    <div class="eye-menu" role="menu">
      <button
        type="button"
        class="eye-menu-item"
        role="menuitemcheckbox"
        [class.disabled]="!canHideDrawings()"
        [attr.aria-disabled]="!canHideDrawings()"
        [attr.tabindex]="canHideDrawings() ? 0 : -1"
        [attr.aria-checked]="!hideSharedDrawings()"
        [title]="drawingsRowTitle()"
        (click)="canHideDrawings() && toggleHideSharedDrawings($event)"
      >
        <!-- eye / eye-off SVG --> Dibujos compartidos
      </button>
      <button
        type="button"
        class="eye-menu-item"
        role="menuitemcheckbox"
        [attr.aria-checked]="!hideTrades()"
        [attr.title]="tradesRowTitle()"
        (click)="toggleHideTrades($event)"
      >
        <!-- eye / eye-off SVG --> Trades
      </button>
    </div>
  }
</div>
```

### Step 3 — Component members

```typescript
readonly eyeMenuOpen = signal(false);

readonly hideTrades = computed(() => this.descriptor().hideTrades ?? false);

/** The shared-drawings row is meaningful only when a group actually shares drawings. */
readonly canHideDrawings = computed(() => {
  const id = this.descriptor().linkGroupId;
  return id !== null && this.linkGroups()[id]?.syncDrawings === true;
});

/**
 * Combined header indicator: dimmed when ANY layer is ACTUALLY suppressed.
 * `hideSharedDrawings` only counts when a shared layer exists to suppress — a stale
 * `true` left on a panel that has since been unlinked hides nothing, and the indicator
 * must report reality, not stored intent.
 */
readonly anyLayerHidden = computed(
  () => this.hideTrades() || (this.canHideDrawings() && this.hideSharedDrawings()),
);
```

> The `canHideDrawings()` term is deliberate. `hideSharedDrawings` is persisted and is
> **not** cleared when a panel leaves its group (D17.H says nothing about unlink, and
> `setPanelLinkGroup` does not touch it). Without the term, unlinking a panel that had
> hidden its shared layer would leave the header eye permanently dimmed with no layer
> hidden and no enabled control to un-dim it — a dead-end state reachable in two clicks.

> **Inert-row mechanism — ruled (R18-7, Option B).** The disabled drawings row uses
> `aria-disabled="true"` + `tabindex="-1"` + a click guard, and **never** the native
> `disabled` attribute. Rationale: native `disabled` suppresses the element's `title`
> tooltip, removes it from the accessibility tree as an interactive control, and
> behaves inconsistently across browsers. The row must stay hoverable — a tooltip that
> explains why the control is inert is the entire point (RFC-018 §8), and an
> unreachable tooltip explains nothing. The click guard
> (`canHideDrawings() && toggle($event)`) is what actually prevents the action; the
> attributes carry the semantics.
>
> The `Trades` row is never inert, so it needs none of this: plain `tabindex` default,
> no `aria-disabled`.

Spanish labels, following the existing `hideSharedLabel` idiom (the label names the
action that flips the current state):

- `eyeLabel()` → `'Capas visibles del panel'`
- `drawingsRowTitle()` → when `!canHideDrawings()`:
  `'Vincula el panel a un grupo para compartir dibujos'`; otherwise the flip action.
- `tradesRowTitle()` → `'Ocultar trades'` / `'Mostrar trades'`.

`toggleHideTrades` mirrors `toggleHideSharedDrawings`: `event.stopPropagation()`, then
dispatch `LayoutActions.setPanelHideTrades({ panelId, hidden: !this.hideTrades() })`.
Neither row closes the popover — the trader may flip both in one visit.

### Step 4 — Open/close mechanism

Reuse the `linkChipMenuOpen` pattern verbatim: `signal`, `stopPropagation` on the
opener, and outside-click close via the existing host `(document:click)` binding. Extend
`onDocClick` to close `eyeMenuOpen` under the same host-containment test.

**Esc close is new behavior** — nothing on this component handles keys today. Add a host
binding:

```typescript
host: {
  '(document:click)': 'onDocClick($event)',
  '(document:keydown.escape)': 'onEscape()',
  '(click)': 'onPanelClick()',
},
```

`onEscape()` closes both `eyeMenuOpen` and `linkChipMenuOpen` (closing the link-chip
menu on Esc is a free consistency win; declare it in the dev log as a deliberate
side-effect of this task).

> Beware the host `(click)` → `onPanelClick()` binding: it dispatches `setFocusedPanel`
> on **every** click inside the panel. The popover buttons already `stopPropagation()`,
> which preserves today's behavior. Do not remove those calls.

### Step 5 — Styles

Add `.eye-anchor` (copy of `.link-chip-anchor`), `.eye-menu` (copy of `.link-chip-menu`:
absolute, `top: calc(100% + 4px)`, `left: 0`, `z-index: 20`, surface bg, border, radius,
column flex, 4px padding, `min-width: 150px` for the two Spanish labels), and
`.eye-menu-item` (copy of `.link-chip-menu-item`, plus:)

```css
.eye-menu-item.disabled {
  opacity: 0.45;
  cursor: default;
}
```

> **No `pointer-events: none`** (R18-7). The row must keep receiving hover so its native
> `title` tooltip renders — that tooltip is the whole reason the row stays visible
> instead of disappearing. `cursor: default` (not `not-allowed`) signals inertness
> without the "you did something wrong" tone; the row is not an error state, it is a
> control awaiting a precondition.
>
> Also add `.eye-menu-item.disabled:hover { background: none; }` so the inert row does
> not pick up the hover highlight that `.link-chip-menu-item` siblings use — visual
> feedback must not promise interactivity the click guard will refuse.

Keep the eye SVG inline (matching `.panel-hide-shared` today). Do **not** extract an icon
component in this task — that is unrelated refactoring inside an RFC commit.

Rename `.panel-hide-shared` → `.panel-eye`, preserving the existing hover/active rules.

### Step 6 — UI rule from RFC-018 §8 (binding)

When `hideTrades()` is true, the panel offers **and executes** no order verbs. Enforced
in `ChartComponent` via `tradeVerbsEnabled()` at all four guard points (Task 4, Steps 1b
and 2) — **not** by changing `panelMayExecute`, which stays symbol-only.

This is binding for RFC-018, not an optional polish item: a pane whose trade layer is
hidden must not be an order-entry surface, and the menu and the dispatch must agree.
Task 6 owns only the *state* (`hideTrades` on the descriptor, flipped from this popover);
Task 4 owns the *enforcement*. If Task 6 lands first, the toggle is inert with respect to
order verbs until Task 4 lands — acceptable mid-branch, **not** acceptable at PR.

Cross-task acceptance: the branch is not done until a panel toggled to `hideTrades: true`
from this popover demonstrably stops offering Buy/Sell in its context menu.

### Tests — extend `chart-panel.component.spec.ts`

| Case | Expectation |
| :--- | :--- |
| Unlinked panel | the eye button **renders** (regression on the removed `@if`) |
| Click the eye | popover opens with exactly two rows |
| Unlinked panel | the "Dibujos compartidos" row is `.disabled` and carries the Spanish hint |
| Linked panel, `syncDrawings: false` | the row is still `.disabled` |
| Linked panel, `syncDrawings: true` | the row is enabled; clicking dispatches `setPanelHideSharedDrawings` with THIS panel id |
| Any panel | the "Trades" row is always enabled; clicking dispatches `setPanelHideTrades` with THIS panel id |
| **Inert row (R18-7)** | carries `aria-disabled="true"` and `tabindex="-1"`, and does **not** carry the native `disabled` attribute |
| **Inert row, clicked** | dispatches **nothing** (the click guard holds even though the element is clickable) |
| **Inert row** | keeps a non-empty `title` — the tooltip stays reachable |
| Enabled row | `aria-disabled` is `false`/absent and `tabindex` is `0` |
| `hideTrades: true` | the header eye carries `.active` |
| Linked + `syncDrawings: true` + `hideSharedDrawings: true` | the header eye carries `.active` |
| **Unlinked + stale `hideSharedDrawings: true`** | the header eye does **not** carry `.active` (no layer is actually suppressed) |
| Click outside | popover closes |
| Esc | popover closes |
| Esc | also closes the link-chip menu (declared side-effect, Step 4) |
| Link-chip menu tests (lines 226-290) | **still pass untouched** |

---

## 2. Documentation updates (part of the branch, not a separate task)

| File | Change |
| :--- | :--- |
| `docs/engineering/domain/workspace-panels.md` | §"Two sync families (D17.K)": composition family = `syncDrawings` only. Add `hideTrades` beside `hideSharedDrawings`. Add the T-1/T-2/T-3 summary. |
| `docs/architecture/TEDS_INTERACTION.md` §7 | Re-point "the `syncTrades` gating" → "the RFC-018 T-1/T-2 gating". |
| `docs/architecture/EXPERIENCE_DOMAINS.md` §7 | Same re-point in the RFC-017 bullet. |
| `docs/architecture/TEDS_GRAMMAR.md` §10 | The "what survives" list cites `syncTrades` composition — update to the RFC-018 predicate. |
| `docs/architecture/UBIQUITOUS_LANGUAGE.md` | Add **Trade Layer Gating** (T-1/T-2/T-3); update **Link Group** to drop `syncTrades`. |
| `docs/architecture/rfcs/017-compositional-panel-sync.md` | Add a *Nota de supersesión* to §5, §5.1 and the D17.I/D17.K rows pointing at RFC-018 — the same never-silent mechanism RFC-017 §6 used for TEDS. |

---

## 3. Verification gates

Run from `emulador/`, raw, never piped through `tail`/`head`:

```bash
npx tsc -p tsconfig.app.json --noEmit
```
```bash
npx tsc -p tsconfig.spec.json --noEmit
```
```bash
npx ng test --watch=false
```
```bash
npm run lint
```

At branch finalization additionally:

```bash
npm run build
```

Plus the RFC-018 invariant greps:

> **Post-hoc correction (R18-12).** This originally read
> `grep -rn "syncTrades" emulador/src/` (must be empty) — self-contradicting
> Task 1 Step 2's `LinkGroupWire` legacy-tolerance optional and its own mandated
> anti-leak assertions. RFC-018 §10 settles it in favor of the wire tolerance;
> corrected here to the live-channel form that actually shipped and passed
> (`dev-log.md` §8, R18-12).

```bash
grep -rn "Set Sync Trades\|setSyncTrades" emulador/src/   # empty
grep -rn "sync-trades\|toggleTrades"      emulador/src/   # only an absence assertion in a spec
grep -rnE "\.syncTrades" emulador/src/                    # empty
```

No `npm install` is expected; if one happens, `npm ci --dry-run` before committing the
lockfile.

---

## 4. Risk register

| Risk | Severity | Mitigation |
| :--- | :--- | :--- |
| Legacy `syncTrades` leaks back into V3 payloads via the spread (C3) | **High** — silently immortal | Explicit field-by-field `normalizeLinkGroup` + the `'syncTrades' in normalized === false` test |
| Spec fan-out leaves `tsc -p tsconfig.spec.json` red mid-task | Medium | Task 1 is atomic: field removal and all 14 spec files (C6 — corrected from 12, see Task 1 Step 6) in **one** commit |
| Task 3's closed-until-configured gate silently blanks a legitimate panel | Medium | The mapper is configured by an `effect` in `ChartPanelComponent`'s constructor, so configuration precedes first paint; covered by the "never configured" test |
| Empty-view allocation per tick defeats the engine short-circuit | Medium | Frozen shared constant + the reference-identity test in Task 3 |
| The inert drawings row loses its tooltip or becomes silently clickable | Low | **Resolved by R18-7** (Option B): `aria-disabled` + `tabindex="-1"` + click guard, no native `disabled`, no `pointer-events: none`. Four dedicated tests in Task 6 |
| Menu and dispatch disagree under the §8 UI rule (one guarded, the other not) | Medium | Single composed signal `tradeVerbsEnabled()` used at all four guard points; paired menu/dispatch tests for the `hideTrades` case |
| Stale `hideSharedDrawings` on an unlinked panel dims the eye with nothing hidden | Low | `anyLayerHidden` includes the `canHideDrawings()` term; dedicated test |
| Cloud sessions written by a pre-RFC-018 client keep re-adding `syncTrades` | Low | Read-side normalization drops it every time; no data loss, self-healing on the next write |
| Task 5 double-derives custom timeframes per panel | Low | Reuse `panelChartView$`'s candle array; do not call `generateCustomSeries` a second time |

---

## 5. Definition of Done

- [ ] D18.A — zero LIVE `syncTrades` channel (no action, reducer case, UI control, or
      production read site — the `LinkGroupWire` legacy-tolerance optional is exempt by
      design, R18-12); legacy payloads read clean and do not re-emit the key
- [ ] D18.B — `hideTrades` + both predicates exist; reducer follows the D17.H idiom exactly
- [ ] D18.C — `tradeChartView$` gated inside the mapper instance; 3 memo inputs; no store/engine gating; no factory selector
- [ ] D18.D — all four trading-verb entry points guarded; menu **and** dispatch
- [ ] §8 UI rule (binding) — `hideTrades: true` retires the order verbs at all four points via `tradeVerbsEnabled()`; `panelMayExecute` remains symbol-only
- [ ] F3 — per-panel marker/box geometry derived from the panel's own candles
- [ ] Eye popover ships with both rows, outside-click and Esc close
- [ ] R18-7 — inert row uses `aria-disabled` + `tabindex="-1"` + click guard; no native `disabled`, no `pointer-events: none`; tooltip verified reachable
- [ ] RFC-017 carries supersession notes for §5, §5.1, D17.I, D17.K
- [ ] TEDS/EXPERIENCE_DOMAINS/UBIQUITOUS_LANGUAGE references re-pointed
- [ ] All four gates green with fresh raw output, plus `npm run build`
