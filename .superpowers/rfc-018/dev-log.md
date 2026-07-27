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

*(appended as tasks complete)*

---

## 9. Next actions

- [x] Owner review of RFC-018 §5 (D18.A–D) and §8 (UI rules) — **done 2026-07-26**
- [x] §8 rule (hidden layer ⇒ no order verbs) — **decided: yes, binding.** Enforced at all four guard points via `tradeVerbsEnabled()`; `panelMayExecute` stays symbol-only (§4.2)
- [x] Inert-row mechanism — **decided: Option B (R18-7)**, `aria-disabled` + click guard
- [ ] Execute the plan task-by-task; commit per task with pathspec `git add`
- [ ] Record R18-1..R18-9 outcomes and any deviations in this log as they happen
- [ ] Land the RFC-017 supersession notes (§5, §5.1, D17.I, D17.K) on this branch
- [ ] PR to `develop` (never to `main` — RFC track)
