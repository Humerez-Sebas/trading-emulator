# RFC-018 — Dev Log

Run ledger for `feature/rfc-018-trade-visibility-refinement` (off `develop` @ `4e005d6`,
the RFC-017 merge / PR #45).

Artifact language per `CLAUDE.md` §Conventions: English here, Spanish in the RFC.

---

## 2026-07-26 — Design phase (this entry): artifacts generated, no implementation

Produced:

| Artifact | Path |
| :--- | :--- |
| RFC-018 (Spanish) | `docs/architecture/rfcs/018-trade-visibility-refinement.md` |
| Implementation plan (English) | `docs/superpowers/plans/2026-07-26-rfc-018-implementation-plan.md` |
| TEDS plan amendments (English) | `docs/superpowers/teds-plan-amendments.md` |
| This log | `.superpowers/rfc-018/dev-log.md` |

No source file under `emulador/` was touched. Verification gates were **not** run —
there is nothing to verify yet; they gate the implementation commits, not the design
commit.

---

## 1. Origin of the decisions

An architectural review (Opus 5, 2026-07-26) was commissioned on the semantics of
`syncTrades` and on whether the domain requires an "execution panel". The review was
explicitly authorized to reject the framing. It did.

Its central finding, adopted verbatim as the premise of this RFC:

> **Propagation presupposes a source. There is no source.** No panel originates the trade
> layer; every panel derives it independently and identically from the singleton
> `TradingBook` (D1). To make "propagation" coherent you must *invent* an origin — and
> that invention **is** `executionPanelId`, subsequently offered as the solution to the
> problem the invention created. The chain is circular.

Everything below follows from dropping that framing.

---

## 2. Decision ledger

### D18.A — Retire `syncTrades` as a LinkGroup channel

**Rationale.** RFC-017 D17.K filed `syncTrades` in the *composition* family ("shared
state by construction"). For `syncDrawings` that is literally true — the group **is** an
ownership namespace (`owner: {type:'group'}`), and membership changes what data exists in
the panel's layer. For `syncTrades` it is false and cannot be true: one `TradingBook` per
session, no group-owned trades, no namespace to resolve. Every panel on the primary
symbol already composes an identical set, so the flag could only ever **subtract**.

RFC-017 contradicted itself on this point — §5's table says composition, §5.1 and the
model's own JSDoc say "visibility resolver, not a data channel". The JSDoc was right.

**Additional evidence for removal (F5):** the flag has a live "Trades" checkbox in the
link-groups menu that no production code reads. That is strictly worse than
`syncPriceScale`'s honest reservation — a reserved field is invisible; a dead toggle is a
false promise in the UI. If the field had been kept "reserved", the checkbox would have
had to go anyway.

**Alternative considered and rejected:** keep the field reserved like `syncPriceScale`.
Rejected because a reserved field must earn its future; RFC-018 shows the concept has no
future in this shape, so reserving it preserves only the modelling error.

### D18.B — `hideTrades` on `PanelDescriptor`

**Rationale.** The review's alternative E, which the original brief had dismissed
("does not solve the 'origin panel always shows trades' problem"). That problem is an
artifact of the propagation framing; once propagation is dropped, E has nothing left to
fail at. E is symmetric with `hideSharedDrawings` (D17.H), needs no new global state, and
is the only candidate that serves the actual user story:

> *"My H4 context panel should be clean of trade ink, but stay crosshair- and
> range-synced with my execution panels."*

Under the group model that story is **impossible without breaking sync** — the trader has
to leave the group or split it. The group flag coupled two unrelated preferences.

**Naming.** `hideTrades`, not `showTrades`, to match `hideSharedDrawings` exactly —
including the reducer idiom where toggling off `delete`s the key rather than writing an
explicit `false`. Consistency with the neighbouring field beats abstract preference for
positive booleans; one idiom means one thing to learn.

### D18.C — Split the §5.1 predicate into an invariant and a preference

**Rationale.** The original predicate fused two clauses of different natures:

```
panel.symbol === primarySymbol  ∧  (unlinked ∨ group.syncTrades)
└────────── invariant ──────────┘  └────────── preference ──────────┘
```

Painting US30's levels on NASDAQ's price axis is not an unwanted view — it is a **false
statement about the market**. Fusing it with a togglable flag is what made both clauses
look like the same kind of thing. T-1 now lives where it cannot be switched off; T-2 is
explicitly a preference.

### D18.D — T-3 execution guard

**Rationale.** The single most consequential finding of the review, and it was not in
the original question. RFC-017 §5.1 *declares* that no order placement exists on a panel
whose symbol differs from `primarySymbol` — nothing enforces it. `finishPlacing` takes
the price from whichever pane was clicked (`series.coordinateToPrice`) and the contract
size from the **global** asset. Today it is latent only because no UI creates a non-`''`
panel symbol; the moment the symbol picker RFC-017 §5.1 blesses ships, it is a wrong-price
order on the wrong instrument.

That is a **fill-fidelity** defect, and fill fidelity is the product's declared central
trust asset (`UBIQUITOUS_LANGUAGE.md`). It ships first and independently.

### D18.E — Selection origin: registered as T-4, excluded from scope

**Rationale.** The review found that a legitimate per-workspace "which panel" singleton
*does* exist — but it is about **selection**, not execution, and TEDS already ruled on it
(TEDS-D18 origin+witness; INV-11 global per Q2). It belongs to the Conversation domain:
derived, ephemeral, zero loss cost, never persisted (X-1 / INV-12).

Excluded from RFC-018 for three reasons: (1) domain boundary — RFC-018 operates on
Presentation and the Trading command boundary; (2) persistence boundary — `PanelDescriptor`
is persisted wholesale (F7), so the concept cannot live anywhere RFC-018 already touches;
(3) no coupling — the witness set is `{p : panelRendersTrades(p)} \ {origin}`, expressible
with no new state, so RFC-018 does not block TEDS.

T-4 is nevertheless **registered** in RFC-018 §3 as a boundary marker: without it, a
future reader hitting TEDS-D18's requirement would plausibly re-invent an execution panel
to satisfy it.

---

## 3. Alternatives discarded (with reasons, so they are not re-litigated)

| Candidate | Reason for rejection |
| :--- | :--- |
| `executionPanelId` (explicit, persisted) | Persists a concept the domain lacks. Needs cascade rules on panel close, tab close, park, template shrink — and the only sane cascade is *reassignment*, exactly the implicit ownership mutation RFC-017 Invariant 1 bans for drawings. With the execution panel parked or on an inactive tab, trades vanish from every visible surface while "showing" on an invisible one. |
| `tradingOriginPanelId` (auto-tracked, ephemeral) | Right shape, wrong verb. Trading verbs need no origin; **selection** does. Also non-deterministic to the user: the rendered layer would depend on which panel last received a trading gesture, and a reload would silently change what is shown. |
| `preferredTradingPanelId` (settings) | All of the above, plus a bounded-context violation: a global settings key holding a session-scoped panel UUID. Settings outlive sessions; panel ids do not. Guaranteed dangling references. |
| Derive from `focusedPanelId` | Focus changes on **every** click inside a panel, including clicks that draw. Trade ink flickering panel-to-panel while drawing a trendline is disqualifying. `focusedPanelId` keeps its existing jobs (keyboard routing, global-TF proxy). |
| Group-scoped bulk toggle (keep `syncTrades` for ergonomics) | The only real benefit was bulk toggling — 1 click vs N. That is a **UI affordance** (a group menu action writing N panel flags), not a reason for the group to *own* the state. Recorded as a No-goal in RFC-018 §11 with the escape hatch named. |

---

## 4. UI design discussion — the panel eye

**Problem.** RFC-018 adds a second panel-local layer preference. Two loose header buttons
would spend attention budget on chrome that `PRODUCT_PRINCIPLES.md` §1 says to minimize,
and the existing eye is conditional (`@if linkGroupId !== null`), so it disappears exactly
when a trader with an unlinked panel would want the new Trades toggle.

**Resolution (owner design decisions, recorded):**

1. The eye becomes **unconditional** and **opens a popover** instead of toggling directly.
2. The popover carries two independent rows: `Dibujos compartidos` and `Trades`.
3. The drawings row is active only when `linkGroupId !== null && group.syncDrawings` —
   otherwise dimmed with the Spanish hint *"Vincula el panel a un grupo para compartir
   dibujos"*. It explains its own inertness rather than vanishing, which is the difference
   between a control that teaches and one that confuses.
4. The Trades row is **always** active: T-2 depends on no group, by construction.
5. The header eye becomes a **combined** state indicator (dimmed when any layer is hidden).
6. Mechanism reuses `link-chip-menu` verbatim (RFC-013 Task 4): plain DOM, no CDK, no new
   runtime dependency (kernel invariant 8).

**Deliberate side-effects to record at implementation time:**

- **Esc-close is new behavior.** `ChartPanelComponent` has no key handling today;
  `onDocClick` closes only `linkChipMenuOpen`. The new `document:keydown.escape` host
  binding closes the eye popover **and** the link-chip menu — extending Esc to the older
  menu is a free consistency win, but it is a behavior change and is logged as such.
- **Inert-row mechanism — RESOLVED as R18-7 (Option B), owner-confirmed 2026-07-26.**
  See §6 for the ruling and §4.1 below for the reasoning.
- **`hideTrades: true` also retires the pane's order verbs — CONFIRMED AS BINDING**
  (owner, 2026-07-26). No longer "registered, revocable": RFC-018 §8 now states it as a
  binding UI rule and the plan enforces it at all four guard points.

### 4.1 — Inert drawings row: why Option B (R18-7)

Three mechanisms were on the table for the "Dibujos compartidos" row when no group
shares drawings:

| Option | Mechanism | Verdict |
| :--- | :--- | :--- |
| A | Native `disabled` + `pointer-events: none` | **Rejected.** `disabled` suppresses the element's `title` tooltip entirely, removes it from the accessibility tree as an interactive control, and behaves inconsistently across browsers. `pointer-events: none` independently kills hover. The row would go silent exactly when it has something to say. |
| **B** | `aria-disabled="true"` + `tabindex="-1"` + click guard, no `pointer-events` change | **Adopted.** Full manual control of visual and interactive state; the native tooltip works because the element stays hoverable; `aria-disabled` carries the semantics for assistive tech; the click guard (`canHideDrawings() && toggle($event)`) is what actually prevents the action. |
| C | Hide the row entirely when inapplicable | **Rejected earlier in design.** A row that vanishes teaches nothing; a row that explains its own inertness teaches the group/drawings relationship. This is why the tooltip exists at all — killing it (Option A) would have quietly reduced C's rejection to a lie. |

Styling follows from the mechanism: `opacity: 0.45; cursor: default;` — `default`, not
`not-allowed`, because the row is not an error state but a control awaiting a
precondition. Hover highlight is suppressed on the inert row so visual feedback does not
promise interactivity the click guard will refuse.

### 4.2 — Why the §8 rule is binding but still not an invariant

Confirming the rule as binding raised the question of whether it should be promoted into
`panelMayExecute`. It should not, and the plan says so explicitly:

- `panelMayExecute` is a **domain** predicate (T-3): symbol-only, amended by RFC.
- The §8 rule is a **presentation** rule: amended by a UI decision.
- They **compose** in `ChartComponent` (`tradeVerbsEnabled = mayExecute && !hideTrades`),
  they do not merge.

This is the same principle RFC-018 §2.3 applied to RFC-017's §5.1 predicate — fusing an
invariant with a preference in one expression is precisely the modelling error this RFC
exists to correct. Repeating it one layer up, in the opposite direction, would be ironic
and wrong. "Binding" describes how firmly the rule holds, not which layer owns it.

The consistency clause is what makes it binding in practice: menu and dispatch must
agree. Offering less than you execute is a trap; executing less than you offer is a
silent failure. All four guard points therefore use the composed signal, never the bare
domain predicate.

---

## 5. Briefing corrections (verified against the tree at `4e005d6`)

The task brief was written from the review, not from the code. Five assumptions do not
hold; all are carried into the plan's §0 so implementers follow the tree, not the brief.

| # | Brief | Reality |
| :--- | :--- | :--- |
| C1 | Modify `link-groups.effects.ts` | No such file exists |
| C2 | Update `produceLinkGroupWire` / `normalizeLinkGroupWire` in `session-sync.mapping.ts` | Neither function exists; `linkGroups` passes through `toPayload`/`fromPayload` wholesale, and the only normalization point is `parseSessionPayload` → `normalizeLinkGroup` |
| C3 | Field deletion is sufficient | `normalizeLinkGroup` uses a **spread**; after deletion a legacy `syncTrades` key would be copied into runtime state and re-serialized into every future V3 payload. Must be rewritten field-by-field |
| C4 | `chart.component.ts` receives `panelId` via input | `ChartComponent` has **no** panel input; identity comes from `this.mapper.descriptor()` |
| C5 | Task 1 is small | Field removal breaks **12 spec files** on TS excess-property checks |

C3 is the one that would have shipped a silent data defect. Recorded prominently.

---

## 6. Rulings minted during planning (not in the brief, decided here)

| Id | Ruling | Rationale |
| :--- | :--- | :--- |
| **R18-1** | An unconfigured mapper (`descriptor() == null`) gates the trade layer **closed**. | T-1 is a correctness invariant; one frame of trade ink on an as-yet-unidentified pane is a false statement about the market. A one-frame delay before ink appears is harmless; the inverse is not. |
| **R18-2** | Same rule for `panelMayExecute`: a null descriptor refuses. | A command is even less forgiving than a render. |
| **R18-3** | The gate-closed emission is a **shared frozen empty view**, never a fresh literal. | A new object per tick defeats the engine's referential short-circuit and reintroduces per-frame allocation on the unchanged path (RFC-017 §4, "cero asignaciones en el camino sin cambios"). |
| **R18-4** | `chart-model-mapper.service.spec.ts`'s `tradeChartView$` block gets `configurePanel` added to its setup — a **declared spec touch**. | Under R18-1 those specs would observe zero emissions. This is *added required setup*, not a weakened assertion: every reference-stability expectation stays byte-identical. RFC-017's run held a "never touch existing specs" rule; this exception is declared rather than silent. |
| **R18-5** | F3 (Task 5) sequences **after** Task 3. | Both edit `chart-model-mapper.service.ts`; sequencing avoids an intra-tree conflict. |
| **R18-6** | The plan lives at `docs/superpowers/plans/<date>-<slug>.md`, not the brief's suggested path. | The brief offered a choice; repo convention (`CLAUDE.md` §Conventions, matching `2026-07-16-rfc-017-implementation-plan.md`) is the stronger signal. The dev log uses the brief's path as given. |
| **R18-7** | The inert drawings row uses `aria-disabled` + `tabindex="-1"` + a click guard. **Never** the native `disabled` attribute; **never** `pointer-events: none`. | Owner-confirmed 2026-07-26 (Option B). Native `disabled` suppresses the `title` tooltip and behaves inconsistently across browsers; `pointer-events: none` kills hover independently. The tooltip is the reason the row stays visible instead of disappearing, so any mechanism that suppresses it defeats the design. Full comparison in §4.1. |
| **R18-8** | `anyLayerHidden` includes a `canHideDrawings()` term: `hideTrades() \|\| (canHideDrawings() && hideSharedDrawings())`. | `hideSharedDrawings` is persisted and is **not** cleared on unlink (`setPanelLinkGroup` does not touch it, and D17.H says nothing about it). Without the term, unlinking a panel that had hidden its shared layer leaves the header eye permanently dimmed with nothing hidden and no enabled control to un-dim it — a dead-end state reachable in two clicks. The indicator must report reality, not stored intent. |
| **R18-9** | `hideTrades` flipping true mid-placement cancels the in-progress placement. | Guard point 2 catches the commit, but preview price lines would otherwise stay painted on a pane that no longer shows trades. Covered by an `effect` and a test. |

---

## 7. Cross-plan findings sent to TEDS

Recorded in full in `docs/superpowers/teds-plan-amendments.md`. Two are load-bearing:

- **A2 — the gate must migrate to `tradeObjects$`.** TEDS Phase 4 Task 6 deletes
  `tradeChartView$`. Deleting it without carrying `panelRendersTrades` forward would
  **silently repeal T-1 and T-2**: observation panels would resume painting the primary
  symbol's trades on a foreign price axis, and `hideTrades` would become dead state. The
  amendment adds an acceptance gate to Task 6.
- **A5 — `TradeAnchor` needs `originPanelId`.** Verified gap: the TEDS plan's anchor is
  `{ tradeId, kind }`, carrying no panel identity, so **TEDS-D18 (origin vs witness)
  cannot be implemented as planned**. This is where D18.E lands.

Also: F3 becomes a Phase 2 entry condition (A3) — TEDS renders Nodes at price-time
coordinates, so wrong-grid coordinates would propagate the error into the whole grammar.

---

## 8. Implementation run — ledger

### 8.0 Run header

| Field | Value |
| :--- | :--- |
| **Branch** | `feature/rfc-018-trade-visibility-refinement` |
| **Base** | `develop` @ `4e005d6` (RFC-017 merge / PR #45) — branch verified **0 behind, 2 ahead** of `origin/develop` at run start; no merge needed |
| **Design commits** | `33a068c` (RFC + plan + amendments + log), `a87645a` (§8 binding + R18-7) |
| **Plan** | `docs/superpowers/plans/2026-07-26-rfc-018-implementation-plan.md` |
| **RFC** | `docs/architecture/rfcs/018-trade-visibility-refinement.md` |
| **Run mode** | **TIERED** — per-task Opus audit on Task 3 and Task 5 (the two correctness/complexity risks); Tasks 1, 2, 4, 6 batched (orchestrator mechanical verification only) and covered by the single final whole-branch Opus audit that gates the PR. |
| **PR target** | `develop` (RFC track — never `main`) |

### 8.1 Baseline (orchestrator-run, fresh raw output, 2026-07-26)

All four gates from `emulador/`, raw, unpiped:

| Gate | Result |
| :--- | :--- |
| `npx tsc -p tsconfig.app.json --noEmit` | exit **0** |
| `npx tsc -p tsconfig.spec.json --noEmit` | exit **0** |
| `npx ng test --watch=false` | exit **0** — **156 files / 1936 tests passed** |
| `npm run lint` | exit **0** — "All files pass linting" |

`1936` matches the count RFC-017 closed at, confirming the branch baseline is the merged
RFC-017 state and nothing has drifted.

### 8.2 Run decisions (orchestrator)

| Id | Decision | Rationale |
| :--- | :--- | :--- |
| **R18-10** | **Sequential dispatch in one working tree** — Tasks 1, 2 and 4 are *not* dispatched in parallel, despite being independent by file. | Plan Risk Register: Task 1 deliberately leaves `tsc -p tsconfig.spec.json` **red** until all its spec files land. Any implementer running concurrently in the same tree would read that red as its own failure. True isolation would need one git worktree per task, each requiring its own `npm ci` — which carries the known npm 11.x optional-dep lockfile-prune hazard (`docs/engineering/testing.md`) for zero architectural gain on mechanical work. Order: **1 → 2 → 4 → 3 ⟨audit⟩ → 6 → 5 ⟨audit⟩ → docs → final audit**, which respects every dependency in plan §1. |
| **R18-11** | Task 4 is sequenced **after** Task 2, not alongside it. | The orchestration brief listed Task 4 as depending on nothing; plan §1 states it depends on Task 2 (`panelMayExecute` must exist). The plan is the authority (`CLAUDE.md`: repo docs win). |
| **C6** | **The Task 1 spec fan-out is 14 files, not the 12 the plan lists.** Adds `services/session-migration.v3.spec.ts` and `pages/sesiones/sesiones-page.component.spec.ts`. | Verified by `grep -rln "syncTrades" emulador/src/` → 17 files (3 production + 14 spec). Both omitted files carry **behavioral** assertions on the `syncTrades: true` migration default (`session-migration.v3.spec.ts:251-262`, `sesiones-page.component.spec.ts:768`), not inert literals, so each needs a rewrite rather than a line deletion. `migrateV2ToV3` normalizes through `normalizeLinkGroup` (`session-migration.ts:133`), so this is the same C3 boundary the plan already identified — a completeness correction to the plan's file list, **not** a change of approach. Carried into `task-1-brief.md`; classified *inert* (mechanical, no design consequence). |

### 8.3 Task log

#### Task 1 — Retire `syncTrades` from `LinkGroup` (D18.A) — **COMPLETE**

| Field | Value |
| :--- | :--- |
| Commit | `62effac` — `feat(rfc-018): retire syncTrades as a LinkGroup channel (D18.A)` |
| Base | `e0eec96` |
| Scope | 18 files: 4 production (`link-groups.models.ts`, `link-groups.actions.ts`, `link-groups.reducer.ts`, `link-groups-menu.component.ts`) + 14 spec |
| Gates | tsc app **0**, tsc spec **0**, lint **0 problems**, `ng test` **156 files / 1935 tests** exit 0 |
| Tests | 1936 → **1935** (net −1) |
| Audit | Batched (no per-task audit) — orchestrator mechanical verification only |

**Orchestrator verification (mechanical, not an audit):**
- `git show --stat 62effac` — every path is on the brief's list; no unrelated file swept in;
  working tree clean apart from untracked run artifacts.
- Test arithmetic checked against the diff itself: `+10` / `−11` `it(` cases = net **−1**,
  matching 1936 → 1935 exactly.
- Live-channel probes all clean: `grep -rn "Set Sync Trades\|setSyncTrades"` → empty;
  `grep -rn "sync-trades\|toggleTrades"` → only a spec asserting the control's **absence**;
  no production property read of `.syncTrades` survives.
- Production diff read line by line: the reducer case, the action, and the UI `<label>` +
  `toggleTrades()` are deleted and nothing adjacent is touched. `normalizeLinkGroup` is now
  built field by field (C3 discharged). The pre-existing stray `</button>` was correctly
  left alone.

**Deviations:**

| # | Deviation | Class |
| :--- | :--- | :--- |
| 1 | **C6 was one file short.** `state/link-groups/link-groups.reducer.spec.ts` was on the brief's *literal-only* list but held two full behavioral tests asserting the retired `syncTrades: true` normalization default. The implementer applied the already-blessed C6 rewrite pattern (keep `syncDrawings === false`, retitle, swap the stale assertion for the anti-leak `'syncTrades' in … === false`). | **Inert.** Same mechanical class, third application, no design judgment. Final fan-out: 4 production + 14 spec files. |
| 2 | The `syncTrades` invariant grep is **non-empty**, and cannot be empty — see R18-12 below. | **Requires attention** (owner-facing; resolved as a plan-text defect, not a code defect). |

#### R18-12 — the `syncTrades` invariant grep is refined to the *live-channel* form

**The plan contradicts itself.** Task 1 Step 2 mandates, verbatim, that `LinkGroupWire`
declare `syncTrades?: boolean` as a `@deprecated` legacy-only optional, and the plan's own
"Tests to add" mandate anti-leak assertions of the form `expect('syncTrades' in x).toBe(false)`.
Both make the literal string appear in `emulador/src/`. Yet plan §3 and DoD §5 both demand
`grep -rn "syncTrades" emulador/src/` return **zero**. Those cannot both hold.

**RFC-018 §10 is the higher authority and settles it:** *«`LinkGroupWire` lo mantiene como
opcional para tolerancia de lectura»* — the wire-level tolerance is required by the design,
by name. The grep-zero line in the plan is shorthand for *no live channel*, written before
Step 2's legacy-tolerance type existed on paper.

**Ruling:** the binding invariant is **zero live `syncTrades` channel** — no action, no reducer
case, no UI control, no production read site. Verified:

```
grep -rn "Set Sync Trades\|setSyncTrades" emulador/src/   → empty
grep -rn "sync-trades\|toggleTrades"      emulador/src/   → only an absence assertion in a spec
grep -rnE "\.syncTrades" emulador/src/                    → empty
```

Every surviving textual hit is exactly one of: the `LinkGroupWire` deprecated optional, its
JSDoc, or a test asserting the key's **absence**. That is the RFC's design, not a leak.

**Owner-facing:** plan §3 and DoD §5 should be corrected to the live-channel grep. Filed for
the documentation pass; the code is correct as it stands.

> **R18-12 — ACCEPTED BY OWNER, 2026-07-27.** Ruling confirmed verbatim: *"El invariante
> vinculante es «zero live channel»: cero acciones, cero reducer cases, cero UI controls, cero
> production reads de `syncTrades`. El `LinkGroupWire.syncTrades?: boolean` de read-tolerance y
> los assertions de los anti-leak tests son correctos y deben quedarse."*
>
> The DoD bullet in plan §5 now carries the owner's exact replacement wording. The stale
> "3 memo inputs" clause in the D18.C bullet was corrected in the same edit — Task 5/F3 grew the
> key to 7 under R18-13, and the surviving constraint is that `groups` never enters it.

#### Task 2 — `hideTrades` model + predicates (D18.B) — **COMPLETE**

| Field | Value |
| :--- | :--- |
| Commit | `658fc76` — `feat(rfc-018): add hideTrades and the trade-visibility predicates (D18.B)` |
| Base | `a3a0aa0` |
| Scope | 5 files, **purely additive** (169 insertions, 0 deletions): `layout.models.ts`, `layout.actions.ts`, `layout.reducer.ts`, + 2 new specs |
| Gates | tsc app **0**, tsc spec **0**, lint **0 problems**, `ng test` **158 files / 1948 tests** exit 0 |
| Tests | 1935 → **1948** (+13: 7 hide-trades reducer + 6 predicate truth-table) |
| Audit | Batched — orchestrator mechanical verification only |

**Orchestrator verification (mechanical):**
- `git show --stat 658fc76` — exactly the five briefed files; zero deletions, so no pre-existing
  behavior could have been altered.
- Test arithmetic: +13 declared, 1935 + 13 = 1948 observed. Exact.
- **T-1 invariant detector confirmed present** (`layout.trade-predicates.spec.ts:51-55`):
  `symbol:'NAS100'`, `hideTrades:false`, primary `'US30'` ⇒ `panelRendersTrades` false. T-1 is
  not overridable by T-2, as the plan requires.
- **`panelMayExecute` read line by line: it does not reference `hideTrades`.** The domain
  predicate stays symbol-only (RFC-018 §4.2); the §8 UI rule composes over it in Task 4.
- Reducer case matches the plan verbatim, including the delete-on-false idiom and both identity
  returns (`layout.reducer.ts:238-250`).

**Deviations:** none. Zero consumers of the new predicates outside their specs, which is the
correct end state for this task — Tasks 3, 4 and 6 wire them up.

#### Task 4 — T-3 execution guard (D18.D) — **COMPLETE**

| Field | Value |
| :--- | :--- |
| Commit | `d4ddfd8` — `feat(rfc-018): guard pane-originated trading verbs with T-3 (D18.D)` |
| Base | `475d19e` |
| Scope | 2 files: `chart.component.ts` (+58/−2) and the new `chart.component.trade-guard.spec.ts` (+337) |
| Gates | tsc app **0**, tsc spec **0**, lint **0 problems**, `ng test` **159 files / 1961 tests** exit 0 |
| Tests | 1948 → **1961** (+13) |
| Audit | Batched — orchestrator mechanical verification only |

**Orchestrator verification (mechanical):**
- Production diff read line by line. All four guard points read the **composed**
  `tradeVerbsEnabled()` signal — none reads the bare `mayExecute()`. Menu and dispatch agree,
  which was the specific failure mode this task had to avoid.
  - `handleContextMenu:914` — guards only the `options` array; the menu still opens, and Fit /
    date verbs / closed-box hide-delete survive.
  - `finishPlacing:1113` — early return through `clearPlacing()`, no orphan preview lines.
  - `dragTradeLine:1177` — early return **before** the `modifyPosition`/`modifyOrder` dispatch.
  - cancel/close in `handleMouseDown:1417` — early return before both dispatches.
- The three signals are kept **separate and named** (`mayExecute` / `hideTrades` /
  `tradeVerbsEnabled`), so the invariant-vs-preference boundary stays legible (RFC-018 §4.2).
- **`git diff` of `state/layout/layout.models.ts` against Task 2 is empty** — `panelMayExecute`
  was not modified. The UI rule composes over the domain predicate; it was not fused into it.
- No Dock / trade-panel file touched; `package.json` and the lockfile untouched.
- R18-9 discharged by `cancelPlacingOnGuardLoss`, an `effect()` that cancels an in-flight
  placement when the guard drops.

**Deviations / judgment calls:**

| # | Item | Class | Disposition |
| :--- | :--- | :--- | :--- |
| 1 | The commit initially swept in `.superpowers/rfc-018/task-4-report.md`. Amended out (`3570f74` → `d4ddfd8`); code content byte-identical. A `.superpowers/rfc-018/.gitignore` now keeps briefs/reports local while `dev-log.md` stays tracked, per `sdd-orchestration.md` §Artifacts. | **Inert** | Fixed. |
| 2 | The guarded cancel/close path calls `e.preventDefault()` before returning, consuming the click so it cannot fall through into the drawing hit-tests below. The brief left this implicit. | **Inert** | Correct as written — without it, an ×-button click on a guarded pane would be reinterpreted as a drawing gesture. Flagged to the final audit. |
| 3 | `effect()` used as a **field initializer** — the first such use in the app. | **Inert** | Orchestrator-checked: `@ViewChild('container', { static: true })` (`chart.component.ts:327`) resolves before first change detection, so the effect's `cancelPlacing()` → `clearPlacing()` path cannot touch an undefined `container`. Field initializers run in an injection context, so the `effect()` call is legal. No crash risk. |
| 4 | The new spec had to invent a harness: no prior spec exercises `ChartComponent` directly (parents stub it, because `ngAfterViewInit` builds a real `lightweight-charts` engine jsdom cannot host). It stubs `ChartComponent.prototype.ngAfterViewInit` via `vi.spyOn`. | **Requires attention** | Novel test pattern likely to become precedent. **FINAL-AUDIT ATTENTION:** verify the harness does not neuter what it claims to test, and that it interacts safely with the vitest `isolate:false` module-state leakage documented in `docs/engineering/testing.md`. |

#### Task 3 — Gate `tradeChartView$` in the mapper (D18.C) — **COMPLETE ⟨AUDITED: PASS⟩**

| Field | Value |
| :--- | :--- |
| Commit | `c259316` — `feat(rfc-018): gate the pane trade layer with panelRendersTrades (D18.C)` |
| Base | `74fcee1` |
| Scope | 3 files: `chart-model-mapper.service.ts` (+128/−14), the R18-4 setup touch in `chart-model-mapper.service.spec.ts` (**+12/−0**), new `chart-model-mapper.trade-gating.spec.ts` (+211) |
| Gates | tsc app **0**, tsc spec **0**, lint **0 problems**, `ng test` **160 files / 1968 tests** exit 0 |
| Tests | 1961 → **1968** (+7) |
| Audit | **Per-task Opus audit — PASS ("Ship it"), zero Critical/High/Medium, 2 Lows ruled no-fix** |

**Implementation shape:** `combineLatest([panelDescriptor$.pipe(startWith(null)), selectTradeChartView, selectCurrentAsset])`, memo slot keyed on **exactly 3** references, `panelRendersTrades` applied inside the `map`, `this.gated()` last — the `panelDrawings$` house idiom. Gate-closed emissions return the module-level, deeply-frozen `EMPTY_TRADE_CHART_VIEW` by reference (R18-3).

**Audit evidence (auditor re-ran everything personally — reports were treated as claims):**
- All four gates re-run raw: confirmed **160 / 1968**, exit 0. The auditor additionally ran
  `npm run build` ahead of schedule given the risk tier: exit 0, **648.36 kB**, the known-accepted
  budget warning, **no new chunk types**, and `grep -rl vitest` over the built bundle → empty
  (no vitest sentinel).
- **Mutation probes** — the decisive evidence that the new tests are real detectors, not
  passengers. Each mutation was applied, the suite re-run, then reverted:

  | Probe | Mutation | Result |
  | :--- | :--- | :--- |
  | 1 | gate replaced with `true` | **5 of 7 fail** (T-1, T-2, flip, R18-3, R18-1) |
  | 2 | shared constant → fresh literal | **exactly 1 fails — R18-3** |
  | 3 | `startWith(null)` removed | **exactly 1 fails — R18-1** |
  | 4 | T-1 symbol clause dropped, `hideTrades` kept | **exactly 2 fail**; T-2 correctly still passes |

  Each test fails for its **own** reason rather than as collateral. Tree confirmed clean and HEAD
  unchanged after the probes.
- **R18-4 discharged structurally:** the pre-existing spec diff is **+12/−0**. A weakened assertion
  is impossible — it would have to appear as a deletion. No `it(` block was added there either.
- Memo key verified as 3; `linkGroupsFeature.selectGroups` appears only in `panelDrawings$`, never
  on the trade path (RFC-018 §4.3 honoured).
- D8 ban intact: `selectTradeChartView` remains a single param-free `createSelector`; gating lives
  in the per-panel-provided mapper instance. Engine boundary uncrossed (`domain/chart/**` still has
  zero Angular/NgRx imports).
- The `frozenEmptyArray<T>()` `readonly T[] → T[]` cast was traced to **every** consumer:
  `pushTrading()` (`chart.component.ts:1154`) is the only site feeding `trading:` into the engine,
  and all downstream capability code is read-only (`.map()` before `setMarkers`, iteration only in
  `trade-boxes-primitive.ts`). **No legitimate path can throw.** The freeze in fact converts a
  previously-silent memo-corruption bug class into a loud throw.
- `isolate: false` leakage assessed and cleared: the constant is deeply frozen with no mutation
  path, and both spec files reset forced selectors in `afterEach` per `docs/engineering/testing.md`.

**Deviations:**

| # | Item | Class | Disposition |
| :--- | :--- | :--- | :--- |
| 1 | The implementer's first R18-3 test asserted two emissions on one live subscription and failed — `distinctUntilChanged()` correctly suppresses a second identical-reference emission. Rewritten to use two independent subscriptions with a forced memo miss between. | **Inert** | Auditor examined this specifically for a test weakened into passing and ruled the opposite: probe 2 shows the rewritten test fails **exactly and only** when the shared constant is replaced. The original test could never have passed against a *correct* implementation — the rewrite fixed a wrong test, it did not soften a right one. |

**Lows ruled no-fix (written reasons, so they are not re-litigated):**
- **L-1** — no `currentAsset === null` case in the gating spec. The null branch lives in
  `panelRendersTrades` and already carries its own detector in Task 2's 6-case truth table; the
  mapper only delegates on that path, so a duplicate would test the predicate twice, not the gate.
- **L-2** — the spec helper `latest()` returns `view!`, so a non-emitting stream fails with a
  `TypeError` rather than an assertion diff. Probe 3 confirms the detector *does* fire; only the
  failure message is less legible. Test-only ergonomics (PHILOSOPHY §3.5).

#### Task 6 — Panel eye popover (RFC-018 §8) — **COMPLETE**

| Field | Value |
| :--- | :--- |
| Commit | `9c2f3cb` — `feat(rfc-018): unify the panel layer toggles under an eye popover (§8)` |
| Base | `f6b9b2f` |
| Scope | 2 files: `chart-panel.component.ts` (+203/−15), `chart-panel.component.spec.ts` (**+173/−0**) |
| Gates | tsc app **0**, tsc spec **0**, lint **0 problems**, `ng test` **160 files / 1984 tests** exit 0 |
| Tests | 1968 → **1984** (+16) |
| Audit | Batched — orchestrator mechanical verification only |

**Orchestrator verification (mechanical):**
- **The spec diff is +173/−0.** No pre-existing test was weakened or deleted; the link-chip menu
  coverage passes untouched, as required.
- `it(` delta = **+16**, matching 1968 → 1984 exactly.
- `grep -rn "panel-hide-shared" emulador/src/` → **none**: the rename to `.panel-eye` left no
  stale reference behind.
- **R18-7 verified in the template:** the inert row carries `[attr.aria-disabled]`,
  `[attr.tabindex]="… ? 0 : -1"`, `[attr.title]`, and the click guard
  `(click)="canHideDrawings() && toggleHideSharedDrawings($event)"`. The native `disabled`
  attribute is **absent**, and the styles carry `opacity: 0.45; cursor: default` plus
  `.eye-menu-item.disabled:hover { background: none; }` with **no** `pointer-events: none`.
  The row stays hoverable, so its tooltip is reachable — the whole point of the design.
- **R18-8 verified:** `anyLayerHidden = hideTrades() || (canHideDrawings() && hideSharedDrawings())`.
- Esc host binding `'(document:keydown.escape)': 'onEscape()'` added; `onDocClick` extended to the
  eye menu. `stopPropagation()` preserved on the popover buttons, so the host `(click)` →
  `setFocusedPanel` behavior is unchanged.
- Popover mechanism is plain DOM copied from `link-chip-menu` — no CDK, no new dependency.

**Cross-task acceptance (RFC-018 §8) — confirmed by tracing the chain:** `toggleHideTrades()` →
`LayoutActions.setPanelHideTrades` → reducer `layout.reducer.ts:238-250` → `PanelDescriptor` →
`ChartModelMapper.configurePanel()` → `ChartComponent.hideTrades` (`chart.component.ts:398`) →
`tradeVerbsEnabled()`, which Task 4 (`d4ddfd8`) already applies at all four guard points. The
state half and the enforcement half now meet.

**Deviations / judgment calls:**

| # | Item | Class | Disposition |
| :--- | :--- | :--- | :--- |
| 1 | `drawingsRowTitle()`'s *active* string reuses the existing `hideSharedLabel()` computed verbatim rather than inventing new copy. | **Inert** | The plan specified the inert-state string exactly but left the active-state wording as "the flip action". Reusing the established idiom is the conservative reading. |
| 2 | Added a new `.eye-menu-item:hover { background: var(--surface-2); }` rule — the copied `.link-chip-menu-item` had no hover rule of its own. | **Inert** | Required for coherence: the plan mandates `.disabled:hover { background: none; }`, which suppresses nothing unless an enabled hover state exists. |
| 3 | Clicking the **inert** row dispatches no layer action (test-verified) but still bubbles to the host `(click)` → `onPanelClick()` → `setFocusedPanel`, because the click guard short-circuits before reaching `stopPropagation()`. | **Inert** | Orchestrator-checked and ruled correct: focusing a panel on click is the panel's ambient behavior, identical to clicking any inert header area, and `onDocClick`'s host-containment test means the popover correctly stays open. "Dispatches nothing" in the brief means no *layer toggle*. **FINAL-AUDIT ATTENTION** anyway, as the implementer requested a second look. |

#### Task 5 / F3 — Per-panel trade geometry — **COMPLETE ⟨AUDITED: FAIL → fixed → PASS⟩**

| Field | Value |
| :--- | :--- |
| Commits | `74e17ef` — `fix(rfc-018): derive trade geometry from each panel's own candles (F3)`; `51836a9` — `test(rfc-018): cover the global-eye-off rule on the per-panel trade path` (audit fix) |
| Base | `de668e2` |
| Scope | `chart-model-mapper.service.ts`, `state/selectors.ts` (export `snapToCandle` + `selectTradeMarkers`, bodies byte-identical), 2 rewired specs, 1 new geometry spec |
| Gates | tsc app **0**, tsc spec **0**, lint **0 problems**, `ng test` **161 files / 1989 tests** exit 0; `npm run build` **0** — 648.37 kB, no new chunk types, no vitest sentinel |
| Tests | 1984 → 1988 (+4 geometry) → **1989** (+1 audit fix) |
| Audit | **Per-task Opus audit: FAIL (1 Medium) → fix → re-review PASS ("Ship it")**, zero Critical/High/Medium |

**What F3 fixed:** `selectTradeMarkers` snapped markers against `selectActiveCandles` — the
**global** timeframe's series — so a panel on H4 received markers snapped to the global TF's grid
(typically M1). Geometry was wrong per panel, in production. The mapper now resolves **this
panel's own** candles via a shared per-instance `resolvePanelCandles` memo and derives markers and
boxes from the raw trading slices against that array.

**Final memo key (7, as R18-13 sanctions):** `descriptor`, `candles`, `positions`, `orders`,
`history`, `boxesVisible`, `currentAsset`. **`groups` correctly excluded** (RFC-018 §4.3) —
auditor-verified: `selectGroups` appears exactly once in the mapper, inside `panelDrawings$`.

**Audit round 1 — FAIL, one Medium (F1):** F3 relocated the toolbar-eye rule (`boxesVisible`
false ⇒ no trade boxes) out of `selectTradeChartView` and into the mapper. The behavior was
correct, but the auditor's **mutation probe deleted the entire rule and all 1988 tests stayed
green** — every mapper spec pinned `selectTradeBoxesVisible` to `true`. The old detector in
`selectors.spec.ts` survived but now guards a selector with **zero production consumers**, so the
coverage state actively misled. With TEDS Phase 4 Task 6 chartered to dismantle `tradeChartView$`
(`teds-plan-amendments.md` A2), that refactor could have silently repealed the toolbar eye on every
panel. Ruled Medium, not Low: an unprotected *production* path created by this task is not
test-pragmatism (`decision-frameworks.md` §6).

**Fix (`51836a9`)** — one test, gate **OPEN**, `boxesVisible` flipped `false` *after* the mapper is
live, asserting `boxes` empty **while `markers`/`positions`/`orders` keep flowing** (the clause that
distinguishes "the eye blanked the boxes" from "the gate closed everything"). Re-review re-ran the
probe independently: **exactly one test fails, the new one**, all 7 pre-existing gating tests green.
Spec diff **+21/−0** — structural proof that none of Task 3's seven gating guarantees was altered.

**F2 (Low, fixed in the same commit):** the doc comment justifying the fine-grained memo helpers
claimed `.projector` "bypasses NgRx's own memoization." **False** — `createSelector` returns
`memoizedProjector.memoized` (`ngrx-store.mjs:883`). The caches are still right, for the real
reason now recorded: NgRx's projector memo is **one module-global slot shared by every caller**, so
at N panels it thrashes at ~0% — precisely the D8 pathology. The false claim in the task report was
struck through, not erased.

**Auditor's independent findings beyond the brief:**
- **Both re-triggered assertions ruled legitimate, not weakened.** The originals had become *false
  premises*: post-F3 a `positions` change necessarily invalidates markers *and* boxes, so the old
  expectations would assert something untrue. Keeping the old trigger and relaxing to "1 of 4
  stable" would have been the actual weakening R18-13b forbids. A probe dropping `candles` from
  `resolveMarkers`'s key fails **exactly** the re-triggered test — it is a live detector.
- **The `panelChartView$` refactor is a net improvement, not just behavior-preserving.** Pre-F3,
  `generateCustomSeries` ran on **every** emission for a custom `M*` timeframe and returned a fresh
  array, so the memo could never hit and the panel view recomputed on every replay tick. The shared
  `(series, timeframe)`-keyed cache fixes both, and being *keyed* (not a bare last-value slot) means
  no stale entry can be returned under a different key regardless of subscriber ordering — no
  diamond-glitch window.
- Nesting `panelChartView$` inside `tradeChartView$` was correctly ruled out: it has no
  `startWith(null)`, so nesting would have made `tradeChartView$` silent before `configurePanel` and
  broken R18-1.
- `generateCustomSeries` call sites: **2 before, 2 after** — unchanged.
- **R18-14 honoured:** `selectTradeMarkers`, `selectTradeBoxes`, `selectTradeChartView` all kept,
  bodies byte-identical. `selectTradeChartView` now has **zero production consumers** — declared,
  and TEDS Phase 4 Task 6 owns its removal.

**Lows ruled no-fix (written reasons):**
- **F3-L** — the fine-grained memo helpers have no detector. Performance property, not correctness:
  a global slot would still return correct results, only slower. The correctness-bearing half (the
  candle cache) is guarded by four tests. A call-count spy on two private methods is test-only
  machinery for a non-correctness property (PHILOSOPHY §3.5).
- **F4-L** — geometry-spec `seedAndRead` never unsubscribes; gating-spec expectations are computed
  with the same `.projector` the SUT calls. Per-test mapper instances plus `resetSelectors()` in
  `afterEach` close the `isolate: false` leakage vector, and the gating spec's charter is the gate,
  not the snapping arithmetic — which `selectors.spec.ts` and the geometry spec own.

---

#### Documentation pass (plan §2) — **COMPLETE**

| Field | Value |
| :--- | :--- |
| Commits | `55c4b71` — `docs(rfc-018): re-point the trade-gating references and supersede RFC-017 §5/§5.1` (7 files, +166/−21); `dbdebcc` — `docs(rfc-018): supersede RFC-017 §6 and §13 on the trade-gating predicate` (1 file, +22) |
| Base | `5c3c3d8` |
| Gates | Re-run raw after the edits: all four exit 0, **161 files / 1989 tests** — unchanged, as a docs-only change requires |
| Audit | Covered by the final whole-branch audit |

**Both commits are docs-only.** Verified mechanically:
`git diff --stat 51836a9 HEAD -- emulador/` is **empty** — the code tree is byte-identical to the
state the Task 5 re-review audited (161/1989, `npm run build` green, no new chunk types).

**Landed:**
- `docs/engineering/domain/workspace-panels.md` — composition family reduced to `syncDrawings`
  alone; `hideTrades` added beside `hideSharedDrawings`; T-1/T-2/T-3 summary added, including the
  note that the §8 UI rule composes over T-3 in `ChartComponent` without changing `panelMayExecute`.
- `docs/architecture/TEDS_INTERACTION.md` §7, `EXPERIENCE_DOMAINS.md` §7, `TEDS_GRAMMAR.md` §10 —
  all three `syncTrades`-gating references re-pointed to the RFC-018 T-1/T-2 predicate.
- `docs/architecture/UBIQUITOUS_LANGUAGE.md` — new **Trade Layer Gating** entry (T-1/T-2/T-3).
- `docs/architecture/rfcs/017-compositional-panel-sync.md` — **six** supersession notes (§5, §5.1,
  D17.I, D17.K, plus §6 and §13 item 2 — see the deviation table).
- `docs/superpowers/plans/2026-07-26-rfc-018-implementation-plan.md` — **R18-12** (grep corrected to
  the live-channel form) and **C6** (12 → 14 spec files) landed, at every recurrence.

**Deviations:**

| # | Item | Class | Disposition |
| :--- | :--- | :--- | :--- |
| 1 | **Two RFC-017 sites beyond the plan's four needed notes.** §6's supersession note still described the surviving gate as `symbol === primarySymbol ∧ syncTrades` with its implementation "migrating to the TEDS plan"; §13 item 2 stated outright that the predicate "NO se implementó en este run… es responsabilidad del plan TEDS". | **Requires attention → resolved** | Both were **load-bearing falsehoods** after RFC-018, not stale phrasing: the predicate's clauses changed (D18.C) *and* RFC-018 took the implementation back from TEDS — it shipped here as Task 3 (`c259316`). A reader following either would have rebuilt the gate inside the TEDS plan, duplicating working code. `teds-plan-amendments.md` A1 already records the hand-back from the TEDS side; RFC-017 asserting the opposite from this side is exactly the silent drift the supersession mechanism exists to prevent. The implementer correctly flagged rather than decided; the orchestrator ruled them in scope and they landed in `dbdebcc`. |
| 2 | The plan asked to "drop `syncTrades`" from the `Link Group` glossary entry, but that entry **never listed it** (`git log` confirms RFC-017 never touched it). | **Inert** | Nothing to drop. Entry left unchanged and cross-referenced from the new **Trade Layer Gating** entry. Backfilling `syncDrawings` (also absent) is pre-existing RFC-017 documentation debt and does not belong in an RFC-018 commit. |
| 3 | C6 and R18-12 each appeared in one more place in the plan than the brief's line pointers named; all recurrences were fixed. | **Inert** | Leaving one stale instance beside a corrected one would have reintroduced the exact defect the pass exists to remove. |

---

#### FINAL WHOLE-BRANCH OPUS AUDIT — **PASS ("Ship it")**, 2026-07-27

Audited `4e005d6..e5d2ef8` — 20 commits, 42 files, +4070/−249.
**Zero Critical / High / Medium. Three Lows, all ruled no-fix with written reasons.**

**Gates re-run personally by the auditor on the clean tree:**

| Gate | Result |
| :--- | :--- |
| `npx tsc -p tsconfig.app.json --noEmit` | exit **0** |
| `npx tsc -p tsconfig.spec.json --noEmit` | exit **0** |
| `npm run lint` | exit **0** — "All files pass linting" |
| `npx ng test --watch=false` | exit **0** — **161 files / 1989 tests** |
| `npm run build` | exit **0** — 648.37 kB, known-accepted budget warning, **no new chunk types**; `grep -rl vitest dist/` and `grep -rl spec-util dist/` both **empty** (no sentinel) |

**Ledger arithmetic verified independently** from per-commit `it(`/`test(` deltas, not from the
reports: 1936 −1 → 1935 +13 → 1948 +13 → 1961 +7 → 1968 +16 → 1984 +4 → 1988 +1 → **1989**. All
seven hashes exist with the claimed scopes. Tasks 2/3/4/6 and the audit fix are **+N/−0** —
structural proof no pre-existing assertion was weakened. Task 5 is the only commit with
substantive spec deletions and was re-derived line by line (see below).

**Invariants:** R18-12 live-channel form clean — all 16 surviving `syncTrades` hits are exactly
the exempt categories (the `LinkGroupWire` deprecated optional, its JSDoc, anti-leak assertions).
`syncPriceScale` still zero read sites. Kernel 1, 5, 7, 8 all hold; `package.json`/lockfile
**zero-diff**; `session-sync.mapping.ts` and `domain/` zero-diff; `assertNoCandles` intact;
**no `schemaVersion` bump**; `link-groups.effects.ts` correctly never created (C1).

**12 mutation probes, each reverted, tree certified clean afterward** — every guarantee the
branch claims has a live detector: removing each of the four guard points fails 2-3 tests each;
dropping the `hideTrades` term from `tradeVerbsEnabled` fails **5**; repealing the render gate
fails 5; repealing T-1 fails 4, T-2 fails 3; neutering the R18-9 effect, breaking the D17.H
delete-on-false idiom, dropping `candles` from the marker memo key, and staling `memoizeMap` each
fail **exactly 1**.

**All four FINAL-AUDIT ATTENTION flags resolved with no finding:**
1. The `vi.spyOn(…, 'ngAfterViewInit')` harness **does not neuter what it tests** — it stubs only
   engine construction; the real `tradeVerbsEnabled → mayExecute → panelMayExecute` composition
   runs against the real `selectCurrentAsset`. It carries a positive control, and probes 1-6 prove
   the guard points are live. `isolate: false` safe: `vi.restoreAllMocks()` in `afterEach`, and the
   only sibling specs touching `ChartComponent` remove it via `TestBed.overrideComponent`. **Sound
   as precedent.**
2. `e.preventDefault()` on the guarded cancel/close path mirrors the ungated path exactly; without
   it an ×-button click would fall through into the drawing hit-tests. Defense in depth — the path
   is in fact unreachable (gate closed ⇒ empty arrays ⇒ `hitTestDelete` finds nothing).
3. Inert-row focus bubbling → **L-1**, no-fix.
4. `selectTradeChartView` orphan → **L-3**, no-fix. Auditor swept for others: `snapToCandle`,
   `selectTradeMarkers`, `selectTradeBoxes` all retain live mapper consumers. Nothing else orphaned.

**Cross-cutting findings (the whole-branch view's real value):**
- **The six tasks compose.** Traced end to end: `toggleHideTrades()` → `setPanelHideTrades` →
  reducer → `PanelDescriptor` → `ChartPanelComponent`'s `effect` → `configurePanel` →
  **one `panelDescriptor$` feeding both** the Task 3 render gate and the Task 4 command guard.
- **The render gate and the command guard cannot disagree — provably.** Both expand to the identical
  conjunction `d != null ∧ asset != null ∧ effectivePanelSymbol(d, asset) === asset ∧ !d.hideTrades`,
  over the same descriptor emission and the same selector, propagating inside one synchronous
  `.next()` — so there is no transient window either. A second independent barrier exists: gate
  closed ⇒ `EMPTY_TRADE_CHART_VIEW` ⇒ nothing rendered ⇒ every hit-test finds no target, making the
  guarded paths unreachable rather than merely refused. All **five** book-mutating verbs are
  covered; the three unguarded dispatches are visual/date verbs, correctly out of scope.
- **Persistence holds end to end.** `panels` travels by reference through `session-sync.mapping.ts`
  (no field-by-field reconstruction), so `hideTrades` round-trips exactly as `hideSharedDrawings`
  already does. Probe 10 is the D17.H detector.
- **A point stronger than this ledger claimed:** at `4e005d6`, `syncTrades` had **no render or
  gating read site at all** — only the checkbox binding and its own storage plumbing. It was a
  genuinely dead toggle, so D18.A is behavior-preserving for **every** value, not merely the `true`
  default RFC-018 §5.2 argues from.
- **TEDS A2 unobstructed** — the gate is an exported pure predicate applied at a single site plus a
  frozen constant; carrying it to `tradeObjects$` is a straight port. F3's exports of `snapToCandle`
  and `selectTradeMarkers` are a net help to A3.
- **All six RFC-017 supersession notes verified against the shipped code.** None misstates what
  shipped.

**Lows ruled NO-FIX (written reasons, not to be re-litigated):**
- **L-1** — the inert eye row bubbles to `setFocusedPanel` while enabled rows do not. Focusing a
  panel on an interior click is that panel's ambient behavior; `setFocusedPanel` returns state
  identity when already focused; the popover correctly stays open. No failure scenario — the
  asymmetry is cosmetic, and "dispatches nothing" meant no *layer* action, which holds.
- **L-2** — three of the four guard points have only negative assertions (no gate-open positive
  control), so a future harness change could render them vacuously green. Test-robustness against a
  hypothetical future edit, not an unprotected production path: probes 2-4 supply exactly the
  evidence a positive control would, today (PHILOSOPHY §3.5).
- **L-3** — `selectTradeChartView` retained with zero production consumers. Deliberate under R18-14;
  zero runtime cost (a lazy selector nothing subscribes to); its doc comment warns against
  re-pointing the pane render at it; TEDS Phase 4 Task 6 owns removal and A2 still relies on its
  `selectors.spec.ts` coverage.

---

## 9. Run status (2026-07-27)

**The run is complete.** All six implementation tasks, the documentation pass, and the final
whole-branch Opus audit are done. The audit returned **PASS** with zero Critical/High/Medium,
clearing the branch for its PR to `develop`.

| Step | State |
| :--- | :--- |
| Task 1 — retire `syncTrades` (D18.A) | ✅ `62effac` |
| Task 2 — `hideTrades` + predicates (D18.B) | ✅ `658fc76` |
| Task 4 — T-3 execution guard (D18.D) | ✅ `d4ddfd8` |
| Task 3 — gate `tradeChartView$` (D18.C) | ✅ `c259316` — **Opus audit PASS** |
| Task 6 — eye popover (§8) | ✅ `9c2f3cb` |
| Task 5 / F3 — per-panel geometry | ✅ `74e17ef` + `51836a9` — **Opus audit FAIL → fixed → PASS** |
| Documentation (§2) | ✅ `55c4b71` + `dbdebcc` |
| R18-12 owner acceptance | ✅ `e5d2ef8` |
| **Final whole-branch Opus audit** | ✅ **PASS** — 0 Critical/High/Medium, 3 Lows no-fix, 12 mutation probes |
| **PR to `develop`** | ✅ opened (see §9.2) |

**Verified state at HEAD `dbdebcc`:** working tree clean; branch **0 behind** `origin/develop`;
42 files changed vs `develop` (+4070/−249); tests **1936 → 1989**; all four gates exit 0 and
`npm run build` green (648.37 kB, no new chunk types, no vitest sentinel) as of `51836a9`, and the
code tree is byte-identical since then.

### 9.2 PR

**[PR #46](https://github.com/Humerez-Sebas/trading-emulator/pull/46) → `develop`** (RFC track —
never `main`), opened 2026-07-27 after the final audit PASS. Branch pushed to `origin` at that
point and not before, per the owner's instruction. The PR body carries the fresh gate evidence,
the audit results, and the invariant checks — **CI does not run on PRs to `develop`**, so that
evidence is the record.

### 9.1 History — how this run was resumed mid-flight

1. `git checkout feature/rfc-018-trade-visibility-refinement` and confirm HEAD is `dbdebcc`,
   tree clean, and the branch is not behind `origin/develop`.
2. Re-run the four gates from `emulador/` raw for a fresh baseline.
3. Dispatch the **final whole-branch Opus audit** (`branch-auditor`) over `4e005d6..HEAD`. Point it
   at the FINAL-AUDIT ATTENTION flags collected in §8.3:
   - **Task 4 dev. 4** — the novel `vi.spyOn(ChartComponent.prototype, 'ngAfterViewInit')` harness
     in `chart.component.trade-guard.spec.ts` (first spec to exercise `ChartComponent` directly);
     verify it does not neuter what it claims to test and is safe under `isolate: false`.
   - **Task 4 dev. 2** — `e.preventDefault()` on the guarded cancel/close path.
   - **Task 6 dev. 3** — the inert eye row still bubbling to `setFocusedPanel`.
   - **Task 5** — `selectTradeChartView` now has **zero production consumers** (kept per R18-14;
     TEDS Phase 4 Task 6 owns its removal).
   - Ledger arithmetic: 1936 → 1935 → 1948 → 1961 → 1968 → 1984 → 1988 → 1989.
   - Invariant greps: live-`syncTrades` channel (R18-12 form, **not** the plain grep — see §8.3),
     `syncPriceScale` zero read sites, no factory selectors, no new dependencies, engine boundary.
4. On **PASS** with zero Critical/High/Medium, push and open the PR **to `develop`** via the GitHub
   MCP — **never to `main`** (RFC track). CI does **not** run on PRs to `develop` (RFC-017 run
   finding), so the gate evidence in the PR body is the record.

## 10. Next actions

- [x] Owner review of RFC-018 §5 (D18.A–D) and §8 (UI rules) — **done 2026-07-26**
- [x] §8 rule (hidden layer ⇒ no order verbs) — **decided: yes, binding.** Enforced at all four guard points via `tradeVerbsEnabled()`; `panelMayExecute` stays symbol-only (§4.2)
- [x] Inert-row mechanism — **decided: Option B (R18-7)**, `aria-disabled` + click guard
- [ ] Execute the plan task-by-task; commit per task with pathspec `git add`
- [ ] Record R18-1..R18-9 outcomes and any deviations in this log as they happen
- [ ] Land the RFC-017 supersession notes (§5, §5.1, D17.I, D17.K) on this branch
- [ ] PR to `develop` (never to `main` — RFC track)
