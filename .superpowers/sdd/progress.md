# SDD Run Ledger — RFC-017 Compositional Panel Sync & Layer Composition

- **RFC (spec):** `docs/architecture/rfcs/017-compositional-panel-sync.md` (D17.A–L)
- **Technical spec:** `docs/superpowers/specs/2026-07-16-rfc-017-compositional-panel-sync-design.md`
  (§4 pipeline diagram = rendering contract).
- **Plan:** `docs/superpowers/plans/2026-07-16-rfc-017-implementation-plan.md` (9 tasks)
- **Branch:** `feature/rfc-017-compositional-panel-sync` @ base `af3d8ca` (origin/develop,
  post TEDS-consolidation PR #43). Freshly re-cut 2026-07-24; the prior run's stale base
  (`64f19b3`) is preserved as local branch `feature/rfc-017-stale-backup-64f19b3`.
- **SCOPE CHANGE (TEDS supersession):** Tasks **7 and 8 are OUT OF SCOPE** — the
  trade-visualization layer (Ghost Rails geometry, corner Position HUD) was superseded by
  the TEDS grammar (`TEDS_GRAMMAR.md` §10) and re-planned into the separate
  `docs/superpowers/specs/2026-07-TEDS-implementation-plan.md`. **This run = Tasks 1–6 + 9.**
- **Run mode (decision-frameworks §8): TIERED** — per-task `branch-auditor` review on the
  high-risk tasks (Task 3 store restructure/cutover; Task 6 persistence/migration),
  batched (no per-task audit) on the additive tasks (2, 4, 5), ONE final whole-branch
  audit gating the PR. Implementer = `sdd-implementer`.
- **Baseline evidence (fresh, 2026-07-24, on this branch):** tsc app ✓, tsc spec ✓,
  `ng test` **1798/1798 green (148 files)**, lint 0 problems.
- **Baseline RE-VERIFIED by the orchestrator at run resume** (2026-07-24, HEAD `17c378c`,
  clean tree): all four gates run raw in one chained command, **exit 0** — tsc app ✓,
  tsc spec ✓, lint 0 problems, `ng test` **148 files / 1798 tests passed**. This is the
  arithmetic origin for every task's test-count progression below.
- **New standing rules (2026-07-22 tooling, PR #43):** consult the `context7` MCP before
  writing Angular 21 code; never mask gate exit codes with `| tail`/`| head`.
- **Run decisions:**
  - **STOP exception class (declared in plan Global Constraints):** pre-existing specs
    asserting the superseded V2 drawings shape/API (flat `items[]` slice,
    `restoreDrawingsForSymbol`, global `selectedId`, per-symbol `DrawingCollection`
    internals) MAY be adapted preserving intent; every edit is enumerated per task below.
    All other pre-existing specs remain untouchable (STOP/BLOCKED).
  - **Task 1 carried over:** implemented in the prior (stale-based) run and preserved by
    cherry-pick onto the fresh develop base — re-verified green here (commits
    `b8493d7`, `e0b2b48`, `213f6b5`, `257fdea`). The run RESUMES at Task 2.

## Tasks

- [x] Task 1: LinkGroup composition channels (`syncDrawings`, `syncTrades`) — cherry-picked, re-verified 2026-07-24
- [x] Task 2: Drawing schema expansion + target resolution + pure migration functions — DONE 2026-07-24
- [x] Task 3: Entity store + owner index + per-panel selection + mapper composition + chart cutover ⟨per-task audit⟩ — DONE; audited TWICE (both FAIL), all findings fixed, closure verified
- [x] Task 4: Panel-scoped undo/redo with revision guard (D17.F) — DONE 2026-07-24
- [x] Task 5: Clipboard (D17.G) + per-panel shared-layer toggle (D17.H) — DONE 2026-07-24
- [x] Task 6: SessionPayloadV3 + migration chain + IndexedDB lift (D17.J) ⟨per-task audit⟩ — DONE; audited (FAIL on M1 legacy-import data loss), fixed, closure verified
- [ ] ~~Task 7: Trade layer gating + Ghost Rails primitives~~ — SUPERSEDED by TEDS (out of scope)
- [ ] ~~Task 8: Position HUD chip + Design System token registration~~ — SUPERSEDED by TEDS (out of scope)
- [x] Task 9: Finalization — invariant greps, build, docs closure — DONE 2026-07-25

**Run status: all in-scope tasks complete.** Final whole-branch audit #1 returned FAIL
(1 High, 1 Medium, 4 Low); the fix wave landed (`f2d8a4a`, `102b97e`, `9e0c744`,
`b84f5a4`). The scoped re-audit of that fix wave then returned **FAIL on one Medium
(M-1)**, caused by an error in the orchestrator's own fix brief. **RUN PAUSED here at the
owner's request (session limit).** Next step: the M-1 fix, brief ready at
`.superpowers/sdd/m1-fix-brief.md`. Then a narrow re-audit, then the PR to `develop`.

### FINAL WHOLE-BRANCH AUDIT #1: **FAIL** (1 High, 1 Medium, 4 Low) — 2026-07-25

The auditor re-ran all five gates plus the dist sentinel, **twice** (once on a freshly
reinstalled dependency tree), with identical results: 156 files / 1922 tests, lint 0,
build `647.21 kB`, no new chunk types, sentinel clean. It also ran `npm ci` (exit 0),
confirming the committed lockfile installs cleanly — the npm-11 EUSAGE trap is not armed.

**It verified the ledger's arithmetic to the unit at every milestone** by counting
`it()`/`test()` across `emulador/src/**/*.spec.ts` at each commit: base `af3d8ca` 1787/146
→ baseline 1798/148 → T2 1809 → T3 1843 → T3 fix 1861 → T3 re-fix 1862 → T4 1882 → T5 1905
→ T6 1921 → T6 fix 1922 → HEAD 1922. **Every delta matches; the ledger is honest.**
Commit counts confirmed (47 on the branch). All eleven invariant greps re-run plus four of
its own; **all eight I-18 detectors grep verbatim against real spec files — none invented.**

**Bundle attribution, measured not assumed:** it built base `af3d8ca` in a throwaway
worktree — **639.07 kB** vs HEAD **647.21 kB**, so this branch adds **+8.14 kB (+1.3 %)**,
all first-party TypeScript, zero new dependencies, no new chunk types.

Verified correct adversarially: engine purity and closed core; `assertNoCandles` on every
write path; D8 with no factory selectors repo-wide; **the zero-allocation contract end to
end** (unchanged references produce NO emission at all, because `gated()` appends
`distinctUntilChanged()`, so `pushDrawings()` never even runs); `combineLatest` cannot
re-fire per replay tick (a `history`- or `clipboard`-only mutation never reaches the
composition); Invariant 1 holds by construction; the clipboard is runtime-only and both
hydration paths reset every runtime slice consistently; all 008-012 frozen non-goals
intact.

Findings:
- **H1 (High)** — the exact **mirror** of Task 6's M1: `liftLegacyDrawings` lifted
  owner-LESS items but passed owner-TAGGED items through **unvalidated**. Since
  `SessionFileV1` carries no layout/panels/linkGroups, the canonical backup/restore case
  (export → cleared IndexedDB or another machine → import) installs
  `singlePanelLayoutFor`'s `panel-migrated-1` while every drawing still points at
  `panel:panel-1` → composed nowhere. UI reports success, **every drawing gone from the
  screen**, persisted onward with dead owner keys, unrecoverable in-app. The existing spec
  locked the bug in by asserting byte-for-byte passthrough rather than the outcome.
- **M1 (Medium)** — Task 5's `hideSharedDrawings` added a **third** way for a drawing to
  leave a panel's composition without the stale-selection invalidation Task 3's audit had
  established for the other two, so the toolbar (which reads the RAW selection, unlike the
  keyboard path which reads the composed one) could globally delete a drawing that looked
  unselected.
- **L1** undo of a `delete` after `removeGroup` resurrects into a dead namespace;
  **L2** `normalizeLinkGroup` ran on only one of three hydration paths, so `syncTrades`
  did not default to `true` per D17.I (inert today, live the moment TEDS implements the
  gate); **L3** `workspace-panels.md` stated the wrong drawings wire version.
- **Rulings requested by the ledger, both ACCEPTED:** the `ChartComponent` keyboard-wiring
  coverage gap is **non-blocking** (structural and pre-existing; what is untested is a thin
  declarative key→dispatch mapping whose semantics are covered by 20 history + 13 clipboard
  specs) — **but the auditor notes it is no longer free: M1 is exactly the defect class it
  hides**, and recommends closing it before a fourth task adds keyboard surface. The bundle
  overage is accepted; `CLAUDE.md`'s "~609 kB" was **already ~30 kB stale on `develop`**
  before this branch.
- **Environment note:** while measuring the base bundle the auditor's temp worktree removal
  followed a junction and deleted `emulador/node_modules`. It restored it with `npm ci`
  (exit 0) and re-ran all five gates plus the sentinel on the fresh tree — identical
  results. Orchestrator confirmed afterwards: tree clean, `node_modules` present, the seven
  pre-existing worktrees untouched, no temp worktree left.

### FINAL FIX WAVE — DONE (re-audit pending)

- **Commits:** `f2d8a4a` (H1 owner re-homing), `102b97e` (M1 + L1), `9e0c744` (L2),
  `b84f5a4` (L3 doc). Range `83b6ca1..b84f5a4`.
- **Evidence (implementer, raw, exit 0 on all five):** tsc app ✓, tsc spec ✓, lint 0,
  `ng test` **156 files / 1934 tests passed**, build `648.33 kB`, sentinel clean.
- **Arithmetic (orchestrator-verified):** +13 `it()` / −1 = net **+12**; 1922 → 1934 ✓;
  files unchanged at 156 (all additions extend existing spec files).
- **Scope (orchestrator diff-scan):** 12 files, +476/−30, every file traceable to a named
  finding.
- **DEVIATION — the implementer overrode the fix brief on L1, and was right to.** The brief
  said to clear `revisions[id]` for the ids in `removeGroup`'s purge set. The implementer
  wrote the repro, ran it against that literal fix, and **empirically showed it does not
  close the scenario**: `deleteSelected` splices the id out of `ownerIndex` *before* the
  group is ever removed, so the deleted drawing is never in the purge set and its revision
  survives untouched. **Orchestrator verified this reasoning against the reducer and
  confirms the brief was wrong.** The landed fix scans every panel's undo/redo stack for
  commands whose `before`/`after` owner key matches the removed group and clears those
  revisions too, so the existing staleness guard rejects them — closing the orphan path
  while preserving technical spec §5's ruling that undoing a delete restores `before`
  verbatim. Classified **inert and superior**; flagged for the re-audit precisely because
  it departed from explicit instructions.
- **Orchestrator spot-check of H1:** re-homing keys on **each item's own `symbol`** (not
  the workspace's), carries every other field verbatim, preserves array-reference
  stability, and is gated behind an OPTIONAL `resolvableGroupIds` parameter that the
  IndexedDB read path deliberately omits — so that path's behavior is provably unchanged.
  Group owners resolve against `thenRestore.linkGroups` when present, else the store's
  live groups, so re-importing into the same still-open workspace does not flatten its
  shared layer.
- **Two disclosed consequences:** landing H1's tests surfaced a genuine **pre-existing**
  `isolate:false` selector leak in `workspaces.effects.spec.ts` (missing
  `store.resetSelectors()` in `afterEach`) that broke 6 unrelated tests in another file
  until fixed per `testing.md`'s mandatory pattern. And one pre-existing spec
  (`sesiones-page.component.spec.ts:765`) had an assertion corrected because L2's fix
  changes real output on the exact path it tests — **orchestrator verified this is a
  strengthening, not a weakening**: it now expects the normalized group
  (`syncDrawings: false, syncTrades: true`) instead of the un-normalized fixture.

### FINAL FIX-WAVE RE-AUDIT: **FAIL** (1 Medium) — 2026-07-25

All six gates re-run personally: tsc app ✓, tsc spec ✓, `ng test` **156 files / 1934
tests**, lint 0, build `648.33 kB` with no new chunk types, dist vitest sentinel clean.
Arithmetic re-derived independently (`git grep` at both endpoints): 1922 → 1934 = **+12**,
with +13 `it(` / −1 (the −1 is `2r` **renamed in place**, its ordered-action-list assertion
surviving verbatim), and `--diff-filter=A|D` both empty → 156 files correct. Every branch
invariant re-run and clean after the fix wave.

**Four of the five findings confirmed genuinely closed**, each by adversarial reading:
- **H1 closed.** Re-homing keys on each item's **own** `symbol` (cached per distinct
  symbol); the legacy branch still correctly uses the workspace symbol since legacy items
  carry none; reference stability asserted with `.toBe`; **the IndexedDB read path is
  provably unchanged** (it omits the optional parameter and the check short-circuits before
  running); the rewritten specs assert the OUTCOME, replacing the byte-for-byte passthrough
  assertion that had locked the bug in.
- **M1 closed, and NO fourth path exists** — the auditor enumerated every gate in
  `composePanelDrawings` (owner membership, `hideSharedDrawings`, `group.syncDrawings`,
  `linkGroupId`, symbol, `visible`), confirmed there is no `Set Panel Symbol` action, that
  asset switch resets `selection: {}`, and that `setDrawingVisible` has **no dispatcher
  anywhere in app code**.
- **L1 closed and the deviation ruled sound and superior to the brief.** It re-derived the
  implementer's empirical claim and confirmed the literal brief would not have closed the
  scenario. It also specifically hunted the revision-reuse hazard (clearing a **live**
  drawing's revision, letting it re-bump from 0 into a value that falsely re-validates an
  old command) and proved it **unreachable**: since no action mutates an existing drawing's
  owner, every command in a history epoch references the same owner key, so
  `staleIds \ liveIds` contains only ids whose entity is already gone. Technical spec §5's
  rulings all preserved; cost bounded (panels × 2 × `HISTORY_LIMIT`, on an explicit user
  action).
- **L2 closed** — `linkGroupsFeature` has exactly two state entry points and both normalize;
  `createGroup` is exempt because `createLinkGroup` sets both flags explicitly; the
  cloud-open write reaches `migrateV2ToV3` too. **L3 closed** — verified against all three
  producers.
- Both disclosed consequences check out: the `resetSelectors()` addition is verbatim
  `testing.md`'s mandatory pattern and fixes the leak **at its source** (no victim spec
  adapted, no assertion relaxed), and the `sesiones-page` assertion change is a
  strengthening.

**M-1 (Medium, blocking) — caused by an ERROR IN THE ORCHESTRATOR'S OWN FIX BRIEF.**
The brief specified "the groups currently in the store" as the fallback source for
`resolvableGroupIds` (`workspaces.effects.ts:363-367`). That is the **outgoing** workspace's
groups: nothing in `doSwitch` is dispatched until the action array is returned, and
`restoreGroups` is never dispatched on this path (`sesiones-page.component.ts:734-740` is
the only `thenRestore` construction site and sets no `linkGroups`), so the store branch is
the **only live branch in production**, not a fallback. The panel branch reads `ws.panels`
(the incoming workspace) — the group branch should read `ws.linkGroups` and does not.
**Empirically reproduced** by the auditor against the real effect: a shared drawing owned by
a live group is **flattened to a local panel owner** on a cross-workspace `.session.json`
import, then persisted — and since no action changes an existing drawing's owner, it is
irreversible in-app. This is a regression the fix wave introduced and is precisely the
automatic reassignment RFC-017 §7 forbids; the addendum §6 licenses re-homing only for an
owner that does **not** resolve, and here it does. Guard spec `2r7` missed it by encoding a
state that cannot arise (`selectCurrentAsset: null` with groups already in the store).
**Fix + the three specs it needs: `.superpowers/sdd/m1-fix-brief.md`.**

Informational, recorded so it is not rediscovered as new: `ownerPanelFor` returns `''` for
a panel-less layout, so a corrupted record could mint `owner: {type:'panel', id:''}` —
identical exposure existed on the legacy-lift branch before this fix wave; layout
invariants make it unreachable.

### M-1 FIX — DONE, closure orchestrator-verified (re-audit pending)

**Commit `e4d8928`** `fix(workspaces): resolve group-owned drawing ownership against the
incoming workspace` — 2 files (`workspaces.effects.ts`, `workspaces.effects.spec.ts`),
+114/−13. Brief: `.superpowers/sdd/m1-fix-brief.md`.

`resolvableGroupIds` now reads `(thenRestore.linkGroups ?? ws?.linkGroups ?? [])`. `ws` is
the **incoming** workspace (`await this.db.getWorkspace(symbol)`), and `workspaceRestored({
workspace: ... ws ?? emptyWorkspace(symbol) })` is pushed as the **first** action in the
array — so `ws.linkGroups` is exactly what this restore leaves installed. This restores
source symmetry with the panel branch, which already resolves against `ws?.layout`/
`ws?.panels` via `resolveOwnerLayout`. The now-dead `firstValueFrom` and `linkGroupsFeature`
imports were removed (the two surviving `linkGroupsFeature` mentions in the file are prose
in unrelated doc comments, not imports — orchestrator-checked by grep).

**The stale comment was rewritten too** (an addition to the brief made at dispatch): the
block at `:355-362` explicitly *argued for* the store read — "the ones already active in the
store, so re-importing back into the SAME still-open workspace keeps resolving against its
own live groups". That was the error written down as rationale and would have outlived the
code fix as an actively misleading justification. It now states the real rule.

**TDD honoured and observed, this time.** Guard spec `2r7` (which encoded an unreachable
state) was replaced by three specs, run against the **unfixed** code first: 37 passed /
**1 failed**, with `2r7b` failing exactly as predicted — owner flattened from
`{type:'group', id:'g1'}` to `{type:'panel', id:'panel-migrated-1'}`. 38/38 after the fix.

- `2r7` **same-workspace** — store and the target workspace's own persisted `linkGroups`
  both hold `g1`; the group-owned drawing arrives untouched, asserted by `toEqual` **and**
  by reference identity (`toBe(drawings)`), so it pins the no-change path as well.
- `2r7b` **cross-workspace (the regression)** — the store holds the outgoing workspace's
  `{g2}` while the incoming `ws` holds `g1`. Orchestrator-checked that this genuinely
  discriminates: under a store read, `resolvableGroupIds = {g2}`, `g1` is judged
  unresolvable, and the drawing flattens. It cannot pass against the old code.
- `2r7c` **genuinely dead group** — `ghost-group` in neither source; re-homed to
  `panel-migrated-1`. (Does not discriminate store-vs-`ws`; it is a completeness guard for
  the re-homing path, which is what the brief asked of it.)
- Pre-existing `2r8` (group absent from both sources, `getWorkspace → undefined`) survives
  untouched.

**Gates re-run by the orchestrator, raw, exit status read — not taken from the report:**
tsc app `0` · tsc spec `0` · `ng test` `0`, **156 files / 1936 tests passed** · lint `0`
problems · `npm run build` `0`, `Initial total 648.07 kB`, only the known-accepted budget
warning, no new chunk types, `grep -rl vitest dist/emulador/browser` empty.

**Arithmetic:** 1934 → 1936 = net **+2** — one `it()` removed (`2r7` as it stood), three
added. ✓ Bundle 648.33 → **648.07 kB** (−0.26 kB, the removed store read). File count
unchanged at 156.

**Root cause is recorded as the orchestrator's, not the implementer's:** this is the second
brief error of the run (the first being L1's literal fix, which the implementer disproved
empirically). Both are documented rather than smoothed over, because the pattern — a brief
asserting *which state* a value should be read from without checking dispatch ordering — is
the one worth catching earlier next time.

### PR body — what the auditor requires it to disclose (once M-1 is closed and re-audited)

Owner re-anchoring at the `.session.json` hydration boundary (RFC addendum §6): what
re-homes, what does not, and that the IndexedDB read path is deliberately excluded · the
panel/tab close cascade (owner decision, RFC §13.1) · `SessionPayloadV3` + V2→V3 migration
+ IndexedDB lift, with the same-symbol-multi-panel residual limitation (§13.5) · the two
persistence limitations ruled no-fix (§13.4) · the RFC-014 G3 `DrawingSnapshot` fidelity
caveat (§13.3) · Tasks 7–8 out of scope, §5.1 trade gating not implemented this run
(§13.2) · the L1 deviation and why the brief's literal fix was empirically insufficient ·
`normalizeLinkGroup` on all three hydration paths, `syncTrades` defaulting true per D17.I
(inert until TEDS) · the pre-existing `isolate:false` selector leak fixed in
`workspaces.effects.spec.ts` · bundle 639.07 → **648.07 kB**, no new dependencies, no new
chunk types, `CLAUDE.md`'s "~609 kB" stale independently of this branch · the `ChartComponent`
keyboard-wiring coverage gap, accepted and non-blocking, with the standing recommendation
to close it before more keyboard surface lands.

## Task entries

### Task 1 — LinkGroup composition channels (`syncDrawings`, `syncTrades`) — DONE (carried over)
- Adds `syncDrawings` / `syncTrades` composition-channel flags to LinkGroup (defaults per
  RFC-017 §5). Implemented in the prior run; cherry-picked onto base `af3d8ca` with zero
  conflicts and re-verified: tsc ✓, `ng test` 1798/1798, lint 0. New tests:
  `state/link-groups/link-groups.channels.spec.ts`,
  `components/workspace/link-groups-menu.component.channels.spec.ts` + widened LinkGroup fixtures.

### Task 2 — Drawing schema expansion + target resolution + pure migration — DONE

- **Commits:** `4112b1f` (models + pure modules), `f66c52b` (new specs), `ed9a7cb`
  (chart construction site + mapper `descriptor()`), `5420613` (STOP-exception fixture
  widening). Range `ddf7537..5420613`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0
  problems, `ng test` **150 files / 1809 tests passed**.
- **Test-count arithmetic (orchestrator-verified):** 1798 → 1809 = **+11**, matching
  6 `it()` in `drawing-ownership.spec.ts` + 5 in `drawings-migration.spec.ts`;
  files 148 → 150 = the two new spec files. Consistent.
- **Scope actually touched (orchestrator diff-scan, `git diff --stat ddf7537..HEAD`):**
  15 files, +357/−8. In-scope app code: `drawings.models.ts` (+11),
  `drawing-ownership.ts` (new, 27), `drawings-migration.ts` (new, 60),
  `chart-model-mapper.service.ts` (+8), `chart.component.ts` (+24/−8). New specs:
  `drawing-ownership.spec.ts` (55), `drawings-migration.spec.ts` (96). No out-of-scope
  file touched; `package.json`/`package-lock.json` untouched; `domain/chart/render-model.ts`
  zero-diff (the DTO stayed `{id,kind,p1,p2}` as required).
- **STOP-exception spec edits (8 files, all enumerated, all verified additive by the
  orchestrator — no assertion deleted, weakened, or repurposed; every edit only adds the
  five now-required `Drawing` fields to an existing fixture):**
  1. `services/session-migration.spec.ts` — `drawing()` factory (+5)
  2. `services/session-sync.mapping.spec.ts` — `activeDrawings()` fixture (+5)
  3. `state/drawings/drawings.reducer.spec.ts` — `drawing()` factory + the
     `restoreDrawingsForSymbol` inline fixture (+10)
  4. `state/telemetry/telemetry-drawings.spec.ts` — `rect()` factory + two inline
     fixtures (+22/−1)
  5. `state/telemetry/telemetry.trading.jump-50-profile.spec.ts` — the 8-drawing
     generated array (+5)
  6. `state/telemetry/telemetry.trading.spec.ts` — three inline fixtures (+15)
  7. `state/workspaces/session-persistence.e2e.spec.ts` — two inline fixtures (+10)
  8. `state/workspaces/workspaces.effects.spec.ts` — one inline fixture (+12/−1)
- **Deviations:** one, classified **inert** — at the `chart.component.ts` construction
  site the draft-clearing assignments (`draftP1`/`draft` → null) were moved ABOVE the
  defensive `descriptor == null` early return, so the no-descriptor path also clears the
  in-progress draft instead of leaving it stuck on screen. Strictly better behavior on a
  path that cannot occur in a configured panel; no dispatch and no owner fabricated,
  exactly as the brief required.
- **FINAL-AUDIT ATTENTION:**
  - `chart.component.ts` `handleClick` is the one place every new `Drawing` field is
    populated at once, and this repo has **no `chart.component.spec.ts`** — the
    construction site is covered only indirectly. Pre-existing coverage gap, not
    introduced here, but it is the highest-risk unverified line of this task.
  - `chart-model-mapper.service.ts` uses a `toSignal(...)` field initializer for the new
    `descriptor` signal (implementer verified the API against the `context7` Angular
    docs). Worth an eyeball for injection-context correctness at final audit.
  - Legacy persisted records (IndexedDB `Workspace.drawings`, `SessionPayloadV2`
    collections) now claim the new required fields at the type level while lacking them
    at runtime. This is the **planned, deliberate gap** closed by Task 6's read-time
    lift — flagged so the auditor does not read it as an escape.

### Task 3 — Entity store + ownerIndex + per-panel selection + composition + cutover — IMPLEMENTED (audit pending)

- **Commits:** `ee95bfb` (store restructure), `9e1bdc7` (mapper composition), `6633e28`
  (chart + toolbar cutover), `887629f` (persistence bridge), `04d92f2` (`selectItems`
  consumer migration), `5bdd809` (STOP-exception spec adaptations).
  Range `d4d054c..5bdd809`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0,
  `ng test` **152 files / 1843 tests passed**.
- **Test-count arithmetic (orchestrator-verified):** 1809 → 1843 = **+34**; files
  150 → 152 = `drawings.reducer.entity.spec.ts` (306 lines) +
  `chart-model-mapper.composition.spec.ts` (235 lines). Consistent.
- **Scope actually touched (orchestrator diff-scan):** 24 files, +1004/−206. This is the
  largest diff of the run.
- **Deviations — inert (5, per report):** `pickTool` no longer clears a selection (the
  action carries no `panelId` and selection is per-panel now); `restoreDrawings` resets
  `activeTool` where `clearDrawings` did not (pre-authorized in the brief);
  `groupDrawingsBySymbol` takes a flat array (pre-authorized interface refinement);
  `pushDrawings()` gained a small O(k) per-call DTO `.map()` (outside the §4.1
  zero-allocation contract, which binds the mapper memo only); the cloud-restore flatten
  in `sesiones-page.component.ts` dropped a now-unreachable `?? meta.drawings` fallback.
- **Deviations — REQUIRES ATTENTION (3, all forwarded to the per-task audit):**
  1. **Scope expanded past the brief's file list**, forced by retiring
     `drawingsFeature.selectItems`/`selectSelectedId` (a hard compile-time dependency):
     `components/session-summary/session-summary.component.ts` and
     `state/telemetry/telemetry.effects.ts` (+ 5 specs) now read the new
     `selectAllDrawings`. **Both are behavior widenings** — the `.session.json` export and
     the RFC-014 `DrawingSnapshot` telemetry fact now cover the WHOLE session's drawings
     (every panel/symbol) instead of the previously-current symbol's slice. The
     implementer did not review this against RFC-014's own telemetry invariants.
  2. `state/workspaces/session-persistence.e2e.spec.ts` adapted (it drove the retired
     `restoreDrawingsForSymbol` directly) — inside the declared STOP-exception class by
     content, but not named in the brief's file inventory.
  3. Composition memo keys on the WHOLE `selection` record reference (as the technical
     spec §4.1 specifies), so any panel's `selectDrawing` invalidates every other panel's
     memo. Inherent to the specified 5-reference tuple; narrowing it would need a
     per-panel-parameterized store derivation, which D8 forbids.
- **STOP-exception specs adapted (report §"Pre-existing specs adapted"):**
  `drawings.reducer.spec.ts` (the big one — every describe ported to the entity API;
  the `restoreDrawingsForSymbol` block **removed with no replacement**, the action being
  fully retired with zero app call sites; the `clearDrawings` block re-expressed through
  `restoreDrawings({drawings: []})`), `session-persistence.e2e.spec.ts`,
  `session-summary.component.spec.ts`, and four `state/telemetry/*.spec.ts` fixture
  re-pointings. `drawings-migration.spec.ts` gained 3 new `groupDrawingsBySymbol` cases
  (pure addition, not an adaptation).
- **FINAL-AUDIT ATTENTION:** largest diff of the branch; the telemetry/export widening
  above; the reducer's `ownerIndex` incremental maintenance and the mapper's
  reference-stability memo are the two correctness cores.

### Task 3 — PER-TASK AUDIT #1: **FAIL** (1 High, 3 Medium, 4 Low) — 2026-07-24

`branch-auditor` (Opus) re-ran all four gates personally and confirmed them green
(152 files / 1843 tests, lint 0) and **independently verified the ledger arithmetic**
(counted `it()` deltas per file: +22 entity spec, +11 composition spec, +3 migration spec,
−2 reducer spec = **+34**, 1809 → 1843 ✓). It also verified as CORRECT: the zero-allocation
memo (returns the previous array by reference; the spec asserts `toBe` identity), the §4
diagram stage order, `entities`/`ownerIndex` agreement on every path, genuine
identity-return rejections, ownership immutability, D8 compliance, and every
STOP-exception spec adaptation (intent preserved, no assertion weakened).

Findings requiring fixes:
- **H1** — `chart-model-mapper.service.ts` filtered `d.symbol === descriptor.symbol`, but
  `PanelDescriptor.symbol` uses `''` as a live sentinel meaning "the active asset"
  (`layout.models.ts:23`). Every hot-added panel/tab AND the cold-start `panel-1` carry
  `''`, there is no `setPanelSymbol` action, and nothing resolved it — so those panels
  composed ZERO drawings and **the shared group layer never rendered**. Orchestrator
  independently confirmed the sentinel before acting.
- **M1** — nothing invalidated `selection[panelId]` when composition stopped including the
  selected drawing, so the toolbar trash stayed enabled over an invisible selection and
  permanently deleted it (no undo until Task 4).
- **M2** — closing a panel orphaned its drawings forever (UUID panel ids ⇒ the owner key
  is unreclaimable); they stayed in every payload, unrenderable and undeletable.
- **M3** — the RFC-014 G3 `DrawingSnapshot` fact captured the whole session's drawings
  while the trading panel now paints a composed subset, so reflection scenes would show
  analysis the trader never had on screen.
- **L1** — decision/RFC ids in new code comments (branch convention, cf. `257fdea`).
- Ruled **no-fix** by the auditor with written reasons: `pickTool` no longer clearing a
  selection (no interaction hazard; a global clear is worse under per-panel semantics);
  the memo keying on the whole `selection` record (accepted by technical spec §4.1 —
  `selectDrawing` fires per click, never per frame, so the 16 ms budget is untouched, and
  narrowing it would need a D8-banned parameterized derivation); the report's off-by-one
  test-count breakdown (net +34 is correct).

**OWNER DECISION (escalated and answered during the run):** closing a panel
**cascade-deletes that panel's own drawings, disclosed in the UI** — mirroring D17.L.
Group-owned drawings survive; the Spanish copy reads "…y sus dibujos locales", where
"locales" is load-bearing. Auto-reassignment stays banned (Invariant 1). This is a new
product decision RFC-017 never made — **Task 9 must record it in the RFC's deviations
section.**

### Task 3 — FIX WAVE (all audit findings) — DONE

- **Commits:** `afd3c7b` (H1 sentinel resolution), `396398e` (M1 selection invalidation +
  M2 reducer cascade + L1), `a8db521` (M2 tab-close wiring + UI disclosure),
  `1ea48a1` (M3 telemetry scoping). Range `c542d9b..1ea48a1`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0,
  `ng test` **152 files / 1861 tests passed**.
- **Test-count arithmetic (orchestrator-verified):** 1843 → 1861 = **+18**; file count
  unchanged at 152 because every new case extended an existing spec file. Consistent.
- **Scope (orchestrator diff-scan):** 14 files, +479/−29 — every file traceable to a
  named finding.
- **Fixes as landed:** `effectivePanelSymbol()` in `layout.models.ts` + `selectCurrentAsset`
  added as a 6th memo reference in the composition (H1); reducer handlers on
  `setSyncDrawings(false)` / `setPanelLinkGroup` clearing stale group-owned selections
  (M1); `purgePanelDrawings({panelIds})` + `on(LayoutActions.removePanel)` sharing one
  purge helper, with `closeTab()` dispatching the purge for its tab's panels (M2);
  a parameterless active-asset+visible selector feeding both telemetry capture sites (M3).
- **Disclosed deviations:** the tab-close path is **two dispatches in one gesture**, not
  one atomic action, because the tab→panels mapping lives only in the layout slice (the
  single-panel `removePanel` path IS atomic). `drawings.reducer.ts` carries three
  unrelated fixes across two commits at file granularity — read `396398e`'s full diff
  rather than assuming a 1:1 message-to-hunk mapping. L1's second cited "I-14" location
  never existed (only one citation was in the file) — inert.
- **FINAL-AUDIT ATTENTION:** H1's `chart.component.ts` stamping half has no dedicated
  spec (this repo has no `chart.component.spec.ts` at all — pre-existing gap); the M3
  spec adaptations lean on a specific NgRx `MockStore` `overrideSelector` behavior for
  nested-selector resolution (implementer verified it against `node_modules` source).

### Task 3 — PER-TASK AUDIT #2: **FAIL** (1 Medium, 4 Low) — 2026-07-24

`branch-auditor` (Opus) re-ran all four gates **plus `npm run build`** personally: tsc app
✓, tsc spec ✓, lint 0, `ng test` **152 files / 1861 tests**, build exit 0 with
`Initial total 642.43 kB` — **no new chunk types**, and `grep -rl vitest dist/…` empty
(the vitest-sentinel check is clean). It re-derived the arithmetic for BOTH ranges
independently (fix wave +18 with 0 removed and no new files → 1861; Task 3 itself
44 added − 10 removed = +34 → 1843) and re-ran every invariant grep.

**Every audit-#1 finding confirmed genuinely closed**, each by adversarial reading rather
than by trusting the report:
- **H1 CLOSED** — the auditor swept every `descriptor.symbol` read repo-wide; the only
  other one (`PanelChartView.symbol`) has zero consumers. The zero-allocation contract
  still holds at six references: `Store.select` carries `distinctUntilChanged` and
  `selectCurrentAsset` only changes at boot or on `workspaceRestored`, so `combineLatest`
  does not re-fire per replay tick.
- **M1 CLOSED** — it enumerated every path that can drop a drawing out of a panel's
  composition and confirmed each is handled or unreachable (`setDrawingVisible` has zero
  dispatch sites; there is no `setPanelSymbol`; `workspaceRestored` resets `selection`).
- **M2 CLOSED on state** — `purgePanelIds` provably touches only `panel:` owner keys;
  group-owned drawings survive; the tab path's panel ids match exactly what the layout
  reducer removes, parked cells included. **The tab path's non-atomicity was RULED
  ACCEPTABLE**: both dispatches are synchronous in one call stack, and the only observer
  (`persistMeta$`) is `debounceTime(300)`, collapsing the pair into one write.
- **M3 CLOSED** — the auditor verified the spec is genuinely sensitive rather than a mock
  artifact: with 3 fixtures it fails under every wrong implementation (old selector → 3,
  symbol-only → 2, visible-only → 2, non-flowing override → 0), and `resetSelectors()` in
  `afterEach` prevents `isolate:false` leakage.
- **L1 CLOSED** — the one remaining citation is pre-existing code merely re-indented.
- It also read `396398e` in full and confirmed no unmentioned fourth change was hiding at
  file granularity.

New findings:
- **M-1 (Medium)** — the panel/tab close cascade was disclosed **only via `aria-label`**,
  which renders nothing for a sighted user, so a trader could lose drawings with no
  warning they could see (and no undo until Task 4). The repo's own precedent added by
  this same task (`link-groups-menu.component.ts:75-76`) sets BOTH `aria-label` and
  `title`; the mirror was half-built, and the two specs asserted only `aria-label`,
  locking in the incomplete version.
- **L-1 (Low, not ruled no-fix)** — `closeTab()` dispatched the irreversible purge BEFORE
  `LayoutActions.closeTab`, which the layout reducer no-ops on the last tab; only a
  template guard ~350 lines away made it unreachable.
- Ruled **no-fix** with written reasons: **L-2** — active-asset scoping still is not
  literally "what was on screen" for RFC-014 G3 (a drawing in an inactive tab or behind a
  cell sibling counts; a secondary-symbol panel's drawings do not), but it restores exact
  pre-RFC-017 semantics and strictly narrows audit #1's over-capture, so it is a repair,
  not a regression — **exact composed-panel fidelity is a new RFC-017/RFC-014 design
  question, and the selector's doc comment overclaims and should be softened → Task 9**.
  **L-3** — an unreachable defensive branch in `purgePanelIds` is untested (revisit if
  Task 4/5 make cross-panel selection of a local drawing possible). **L-4** — a stale
  "five composition inputs" comment in the composition spec → Task 9 docs sweep.
- **Doc drift noted for Task 9:** `CLAUDE.md` cites the accepted bundle overage as
  "~609 kB"; the real figure is now **642.43 kB**.

### Task 3 — RE-AUDIT FIX WAVE — DONE, closure orchestrator-verified

- **Commit:** `4cb80f8` (2 files, +31/−2). Range `1ea48a1..4cb80f8`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0,
  `ng test` **152 files / 1862 tests passed** (1861 → 1862 = +1, a new last-tab guard
  spec; the two M-1 specs were widened in place, adding assertions without adding cases).
- **Orchestrator verification (mechanical diff-read against the auditor's own acceptance
  criteria, both findings being attribute-presence/statement-order facts):**
  M-1 — `[attr.title]` now present on BOTH close controls, carrying strings identical to
  their `aria-label`s (`'Cerrar ' + tab.name + ' y sus dibujos locales'` and
  `'Cerrar ' + panelLabel(pid) + ' y sus dibujos locales'`); no `TooltipDirective`
  introduced, matching the precedent. **CLOSED.**
  L-1 — `if (this.workspace().tabs.length <= 1) return;` now sits immediately after
  `event.stopPropagation()`, ahead of the purge dispatch; both dispatches remain in one
  synchronous call stack. Implementer used `<= 1` rather than `=== 1` deliberately
  (fail-safe, stricter than the reducer). **CLOSED.**
- **Decision (recorded, not improvised):** a third full `branch-auditor` dispatch was NOT
  spent on a two-attribute/one-statement change. Both findings are mechanically
  verifiable facts, verified above, and **the mandatory final whole-branch Opus audit
  re-reviews this diff along with everything else.** Task 3 is treated as PASSED for the
  purpose of proceeding to Task 4; the final audit remains the true gate.

### Task 4 — Panel-scoped undo/redo with revision guard (D17.F) — DONE

- **Commits:** `f76efee` (models + actions + reducer), `71bb34a` (focused-panel keyboard
  gating), `328d7fd` (edge-rulings specs). Range `d72a970..328d7fd`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0,
  `ng test` **153 files / 1882 tests passed**.
- **Test-count arithmetic (orchestrator-verified):** 1862 → 1882 = **+20**, matching
  exactly 20 `it()` in the new `drawings.history.spec.ts`; files 152 → 153 = that one new
  file. Consistent.
- **Scope (orchestrator diff-scan):** 5 files, +634/−8 — exactly the brief's file list,
  nothing else. Additive task: **no pre-existing spec needed adapting**, as predicted.
- **Grep (orchestrator):** zero RFC/decision/task ids in NEW non-spec comments.
- **In-scope extension, deliberate and disclosed:** the brief also directed a fix to the
  pre-existing `Delete` key handler. `chart.component.ts`'s `onKeyDown` is a **window-level
  listener registered once per panel**, so with two panels each holding a selection of a
  *different* drawing (explicitly allowed by per-panel selection, D17.E) a single Delete
  keypress deleted in BOTH panels. Delete is now gated on `focusedPanelId` and guarded
  against input focus, the same idiom undo/redo establishes. Same defect class the idiom
  exists to prevent.
- **Deviation — requires attention (coverage, pre-existing):** the focused-panel keyboard
  specs (Ctrl+Z on an unfocused panel; the input-focus guard suppressing undo and Delete)
  were **not written**, using the brief's own escape hatch. There is no
  `chart.component.spec.ts` in this repo and no harness for one: every spec touching
  `ChartComponent` (`chart-panel.component.spec.ts`) replaces it with a template-only stub
  because the real component boots a live `ChartEngine`/lightweight-charts canvas in
  `ngAfterViewInit`. The sibling component using the identical input-focus-guard idiom
  (`drawing-toolbar.component.ts`) also has no spec — a pre-existing gap in this class of
  components, not one introduced here. The dispatched actions are fully covered by the 20
  reducer specs; only the DOM-event→dispatch wiring is unverified, at the same coverage
  level the pre-existing `Delete` handler already had.
- **FINAL-AUDIT ATTENTION:** the undo/redo reducer mechanics are the correctness core —
  in particular the load-bearing difference between the **stale** path (command DROPPED,
  pop continues within the same action) and the **locked** path (command RETAINED, identity
  return, no further popping). Also worth a read: that undo restores `owner` verbatim from
  the recorded command rather than recomputing it, and that recreate/delete undos keep
  `entities` and `ownerIndex` in agreement. This is the third consecutive task whose
  keyboard wiring is unverified by automation — the accumulated `ChartComponent` coverage
  gap is worth a ruling at final audit.

### Task 5 — Clipboard (D17.G) + per-panel shared-layer toggle (D17.H) — DONE

- **Commits:** `995fdc8` (clipboard state), `e278857` (layout toggle + composition),
  `57a20d4` (keyboard + panel-header control). Range `0dd3ae8..57a20d4`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0,
  `ng test` **155 files / 1905 tests passed**.
- **Test-count arithmetic (orchestrator-verified):** 1882 → 1905 = **+23** = 13 `it()` in
  the new `drawings.clipboard.spec.ts` + 7 in the new `layout.hide-shared.spec.ts` + 3
  added to the existing composition spec; files 153 → 155 = the two new files. Consistent.
- **Scope (orchestrator diff-scan):** 12 files, +652/−25 — exactly the brief's file list.
  **No pre-existing spec touched**, as an additive task should manage.
- **Grep (orchestrator):** zero RFC/decision/task ids in NEW non-spec comments.
- **Orchestrator spot-check of the two risky hunks:** the composition change is a
  one-condition guard (`!descriptor.hideSharedDrawings && …`) on the shared union only —
  entities untouched, other panels unaffected, and the descriptor was already one of the
  six memoized references so no seventh input was added. The `applyNewDrawing` extraction
  is verbatim-identical to the previous `addDrawing` body; `addDrawing` still resets
  `activeTool: 'none'` while paste deliberately does not (commented distinction).
- **Deviations — inert (3):** Ctrl+C/Ctrl+V wired into `chart.component.ts`'s existing
  keyboard surface rather than `chart-panel.component.ts` as the plan sketched (the brief
  mandated this — Task 4 made `chart.component` the single focused-panel-gated keyboard
  surface, and a second surface would reintroduce the multi-panel defect Task 4 fixed);
  `addDrawing`'s body extracted into a shared `applyNewDrawing` helper reused by paste, so
  the two creation paths cannot drift (behavior-preserving, pre-existing assertions
  unchanged); a defensive selected/clipboard-presence guard added on the Ctrl+C/Ctrl+V
  interception beyond the brief's literal text.
- **FINAL-AUDIT ATTENTION:** paste is the ONLY new drawing-creating path and it routes
  through `resolveDrawingTarget` — the same rule as hand-drawing — so RFC Invariant 1
  (zero *implicit* copying) holds by construction; worth confirming no other path clones.
  Also worth reading: `applyNewDrawing` sits on Task 4's audited history path, and the
  clipboard is runtime-only (reset by both hydration paths, never persisted or synced).

### Task 6 — `SessionPayloadV3` + V2→V3 migration + IndexedDB lift (D17.J) — IMPLEMENTED (audit pending)

- **Commits:** `076e73c` (V3 wire shape + `migrateV2ToV3`), `dfbf56d` (toPayload/fromPayload
  cutover + V2 bridge deletion), `a7e9983` (IndexedDB read-time lift + reducer guard),
  `0fd060d` (new specs), `4ef196b` (STOP-exception adaptations).
  Range `133c09e..4ef196b`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0,
  `ng test` **156 files / 1921 tests passed**.
- **Test-count arithmetic (orchestrator-verified):** counted `it()` in the range —
  **+24 added, −8 removed = net +16**; 1905 → 1921 ✓. Files 155 → 156 = the single new
  `session-migration.v3.spec.ts`. The 8 removals are the deleted `groupDrawingsBySymbol`
  bridge tests plus superseded V2-shape cases. Consistent.
- **Scope (orchestrator diff-scan):** 19 files, +707/−174. All in the brief's declared
  scope or its STOP-exception class. One out-of-domain touch,
  `state/playbook/playbook-invariants.spec.ts`, is a **single-line fixture update**
  (`drawings: {}` → `drawings: { version: 2, items: [] }`) forced by the `PayloadInput`
  type change — verified minimal, no assertion touched.
- **Deviation — REQUIRES ATTENTION (process):** the implementer **self-disclosed that it
  wrote the production code BEFORE the new specs** (`session-migration.v3.spec.ts`, the
  reducer-guard test, the workspace-legacy-lift test), inverting the mandatory TDD order.
  The tests exist and were run fresh (the first full run surfaced exactly the 5 expected
  STOP-exception failures and nothing outside that class), but they were never watched red
  against a missing implementation. **This is the material risk of this task**: specs
  written after the code can encode what the code does rather than what the spec requires.
  Forwarded to the audit as its primary lead.
- **Deviations — inert (2, per report):** `migrateV2ToV3` always re-derives
  owner/zIndex/locked/visible rather than conditionally preserving an already-tagged item
  (harmless — no real V2 payload can carry one); `isSessionPayloadV3` adds a
  `layout`/`panels` shape check beyond the brief's literal spec (strictly more
  conservative).
- **Observation for the auditor to rule on (orchestrator grep, not pre-judged):** three
  NEW non-spec comments carry decision/RFC citations, which the plan's Global Constraints
  forbid and which branch commit `257fdea` and the Task 3 audit's L1 both enforced —
  `session-sync.mapping.ts` ("(D9)"), `session-sync.models.ts` ("V3 extends V2 in place
  (D9)"), `workspaces.effects.ts` ("RFC-011's persisted layout/panels"). Mitigating
  context: the models one deliberately parallels the adjacent pre-existing V2 doc comment,
  which uses the identical phrasing.
- **FINAL-AUDIT ATTENTION:** the two genuinely new logic blocks are `migrateV2ToV3` and
  `liftWorkspaceDrawings`/`withLiftedDrawings`; and the cloud-open assertion in
  `sesiones-page.component.spec.ts` was **rewritten rather than merely re-shaped** — its
  behavioral proof changed, so it needs its own read.

### Task 6 — PER-TASK AUDIT: **FAIL** (1 Medium, 6 Low) — 2026-07-24

`branch-auditor` (Opus) re-ran all four gates personally — tsc app ✓, tsc spec ✓, lint 0,
`ng test` **156 files / 1921 tests** — and re-derived the arithmetic independently
(+24 `it()` / −8 = net +16; the 8 removals = 3 deleted bridge tests + 5 retitle-in-place
cases, **no still-valid guarantee vanished**). Every invariant grep re-run and clean:
`groupDrawingsBySymbol` gone, `assertNoCandles` single definition still on the `toPayload`
write path (kernel #4 holds), `DB_VERSION = 6` unchanged with no new object store,
`package*.json` and `domain/` zero-diff, D8 intact, `session-migration.ts` pure.
**Runtime-only state provably cannot reach the wire** — `revisions`/`history`/`clipboard`
have zero occurrences in the selectors, workspace models, payload models or mapping.

**The TDD-inversion lead was largely discharged.** The auditor derived the fidelity table
from technical spec §7 *before* reading the spec file, and found
`session-migration.v3.spec.ts` genuinely adversarial rather than code-shaped: its
`legacyItem()` fixture deliberately builds each input as a FULL `Drawing` with
`symbol:'WRONG-SYMBOL'`, `owner:{id:'stale-owner'}`, `zIndex:999`, `locked:true`,
`visible:false`, so any copy-through implementation fails; EURUSD is shown only by the
SECOND panel, so "always first panel" fails; the zIndex case uses two buckets and asserts
`0,1,2`, so a per-symbol restart fails; the corrupt-layout case pins the
replace-layout-BEFORE-migrating ordering with a `ghost-panel` fixture. The predicted
post-hoc-spec risk materialized only as L3/L4, both test-side.

**M1 (Medium) — a legacy `.session.json` import silently discards every drawing.**
`restoreDrawings` has a **second dispatcher that bypasses the read-time lift**: the
`thenRestore` branch (`workspaces.effects.ts:281`), fed straight from the on-disk file via
`plan.drawings as Drawing[]` (`sesiones-page.component.ts:736`) — a raw cast of
`unknown[]`, never lifted. A `.session.json` exported before this branch carries legacy
`{id,kind,p1,p2}` items; `isWellFormedV1` accepts the file, then this task's new reducer
guard (`if (!d.owner) continue;`) skips **every** item, `entities` comes back `{}`, the UI
reports success ("Sesión importada…"), and the debounced `persistMeta$` writes the empty
snapshot over IndexedDB. **Attribution, on the record:** the inability to restore these
was introduced by Tasks 2–5 (at `133c09e` this path threw a `TypeError`); Task 6's guard
is what converted a loud failure into a silent one. It is a **regression against shipped
`develop`** and is not no-fixable — a production data path. Medium rather than High only
because the source file survives on disk. The coverage gap that let it through:
`workspaces.effects.spec.ts:428` exercises this path with `drawings: []`.

Low findings — **ruled no-fix with written reasons, do not re-litigate:** **L2** the
read-time lift can pair `ws.layout` with a fallback `panels` map (unreachable — every
writer writes both together); **L4** two adapted assertions in `session-migration.spec.ts`
became tautologies (`f(x) === f(x)`), but the concrete guarantee **moved** to the v3 spec
and coverage is net stronger; **L5** `parseSessionPayload` no longer applies the defensive
layout fallback to V3 (unreachable, damage is a degraded layout not data loss, and the
naive fix would orphan drawings whose `owner` points into the discarded layout — a real
defect traded for a hypothetical one); **L6** the cloud write path stamps
`schemaVersion: 3` on un-lifted legacy `meta.drawings`, but this is **strictly better than
the deleted bridge** (which baked a permanently wrong `symbol: 'undefined'`); the field is
merely absent and self-heals through the read-time lift, a path the auditor traced end to
end. Booked for the final audit: L5's and L6's durable fixes are design decisions.

Lows to fold into **Task 9's sweep:** **L1** — of the three flagged decision-id comments,
two are ruled no-fix (`session-sync.models.ts:100` deliberately mirrors the adjacent
pre-existing V2 doc comment; `session-sync.mapping.ts:208` is a rewrite that *stripped* a
task/RFC citation and kept only the decision id — a net reduction), but
`workspaces.effects.ts:47`'s "RFC-011" is a real violation carrying no load. **Also
recorded:** `task-6-report.md` asserts "Comments in new code contain no task/RFC/decision
IDs", which is **false** for all three sites — nothing was concealed (the orchestrator's
own grep caught it and this ledger recorded it before the audit), but a gating report must
not assert a constraint was met when a grep says otherwise. **L3** — the workspace-lift
fixture uses `singlePanelLayoutFor`, so `panel-migrated-1` is also what the *fallback*
produces: an implementation ignoring `ws.layout`/`ws.panels` entirely would pass
identically. Production code verified correct by line-by-line read; the fixture needs a
two-panel layout with a non-default panel id.

**Auditor's own verdict on the STOP-exception adaptations:** all seven preserve intent, and
the rewritten cloud-open assertion in `sesiones-page.component.spec.ts` is **stronger, not
weaker** — verified against the fixture that `p1` really is the first panel in layout order
showing `XAUUSD`, and the test now proves the migration end-to-end through the real
cloud-open path instead of asserting passthrough.

### Task 6 — AUDIT FIX WAVE — DONE, closure orchestrator-verified

- **Commit:** `74a25a2` (2 files, +184/−29). Range `7f5e0f7..74a25a2`.
- **Evidence (implementer, raw, exit 0 on all four):** tsc app ✓, tsc spec ✓, lint 0,
  `ng test` **156 files / 1922 tests passed** (1921 → 1922 = +1: the new `2r5` case; `2r4`
  was rewritten in place).
- **M1 fixed** by extracting `resolveOwnerLayout` + `liftLegacyDrawings` out of
  `liftWorkspaceDrawings` and lifting `thenRestore.drawings` before the `restoreDrawings`
  dispatch — one shared helper, so the two read paths cannot drift.
- **The implementer OVERRODE the fix brief on owner resolution, and was right to.** The
  brief said to resolve against the store's CURRENT layout; the implementer used the
  target workspace `ws`'s own persisted layout instead, reasoning that the current/`meta`
  layout is the outgoing asset's. **Orchestrator verified this against
  `layout.reducer.ts:279-289`:** `workspaceRestored` installs
  `ws.layout && ws.panels ? those : singlePanelLayoutFor(ws.symbol, ws.activeTf ?? 'M1')`,
  and `resolveOwnerLayout(symbol, ws?.activeTf, ws?.layout, ws?.panels)` returns **exactly
  that same pair** — so the owner resolves against the layout `workspaceRestored` actually
  installs, not an approximation. The brief's instruction would have resolved against the
  pre-switch layout and orphaned the drawings. Deviation classified **inert and superior**.
- **L3 fixed:** the workspace-lift fixture now uses a two-panel layout with non-default
  ids where the matching panel is not first, so it can no longer pass under an
  implementation that ignores `ws.layout`/`ws.panels`.
- **L1 fixed:** the "RFC-011" citation stripped from `workspaces.effects.ts`; the two
  no-fix sites left untouched as ruled. The implementer also corrected the false
  "no task/RFC/decision IDs" claim in its own Task 6 report.
- **Side effect worth noting:** `resolveOwnerLayout` is all-or-nothing by construction,
  which incidentally closes **L2** (the layout/panels pairing asymmetry the auditor ruled
  no-fix-because-unreachable) — the mixed pair is now unrepresentable.
- **Decision (recorded, not improvised):** as with Task 3's second fix wave, a further full
  `branch-auditor` dispatch was NOT spent here. The load-bearing logic was verified by the
  orchestrator directly against the reducer it must mirror, and **the mandatory final
  whole-branch Opus audit re-reviews this diff along with everything else.** Task 6 is
  treated as PASSED for the purpose of proceeding to Task 9; the final audit remains the
  true gate.

### RUN STATE

Tasks 1–6 complete and green at **156 files / 1922 tests**. Next: **Task 9**
(invariant greps, `npm run build`, docs closure) → final whole-branch audit → PR to
`develop`.

Task 9 docs/sweep backlog (accumulated, do not lose): RFC deviations section must record
**the owner's panel-close cascade decision** and the
**`selectActiveAssetVisibleDrawings` fidelity caveat** (its doc comment overclaims);
`CLAUDE.md`'s accepted bundle overage is stale ("~609 kB" → measured **642.43 kB**); sweep
the stale "five composition inputs" comment at
`chart-model-mapper.composition.spec.ts:261`; and the accumulated **`ChartComponent`
keyboard-wiring coverage gap** (three tasks' worth) needs a ruling at the final audit.

Task 9 carries a docs backlog accumulated by the audits, recorded here so it is not lost:
RFC deviations section must record **the owner's panel-close cascade decision** and the
**`selectActiveAssetVisibleDrawings` fidelity caveat** (its doc comment overclaims and
should be softened); sweep the stale "five composition inputs" comment at
`chart-model-mapper.composition.spec.ts:261`; and `CLAUDE.md`'s accepted bundle overage is
stale — it says "~609 kB", the measured figure is now **642.43 kB**.

### Task 9 — Finalization: invariant greps, build, docs closure — DONE

Ships no new behavior: five gates, eleven invariant greps, one stale comment corrected,
one overclaiming doc comment softened, three documentation files written, this ledger
closed.

**Gates (fresh, raw, run from `emulador/`, exit status read — none piped through
`tail`/`head`):**

| Gate | Result |
| :--- | :--- |
| `npx tsc -p tsconfig.app.json --noEmit` | exit 0, no errors |
| `npx tsc -p tsconfig.spec.json --noEmit` | exit 0, no errors |
| `npx ng test --watch=false` | exit 0 — **156 files / 1922 tests passed** |
| `npm run lint` | exit 0 — "All files pass linting." |
| `npm run build` | exit 0 — **`Initial total 647.21 kB`**, budget-warning only (known/accepted) |

All five re-run a second time, raw, after the comment-sweep + doc-comment edits landed
(the only code touched this task): identical results — 156/1922, lint 0, build
`647.21 kB` again. `grep -rl vitest emulador/dist/emulador/browser` → empty both times
(vitest-sentinel check clean, kernel invariant #7 holds).

**Invariant greps (all 11, raw command + result):**

1. `grep -rn "selectChartView(" emulador/src/app --include="*.ts" | grep -v spec` → one
   hit, `chart-model-mapper.service.ts:469-470`, a doc comment describing the D8 ban
   itself ("Deliberately NOT a shared NgRx factory selector (`selectChartView(panelId)`)
   ...") — not an implementation. **HOLDS.**
2. `grep -rn "syncPriceScale" emulador/src/app --include="*.ts"` → 7 hits: the model
   declaration (`link-groups.models.ts:11`) and spec fixtures/assertions
   (`link-groups.channels.spec.ts`, `link-groups.reducer.spec.ts`) only. Zero read sites.
   **HOLDS.**
3. `grep -n "owner" emulador/src/app/state/drawings/drawings.reducer.ts` → every hit is
   `ownerIndex`, an import, a comment, or a READ (`ownerKeyOf(...)` or a direct
   `!d.owner`/`.owner.type` guard); no action ever writes `owner:` onto an *existing*
   entity. Proof: `drawings.reducer.entity.spec.ts`'s
   `describe('drawings reducer: ownership immutability')` (moveDrawing/setDrawingLocked/
   setDrawingVisible/selectDrawing all assert `owner` unchanged, one by reference).
   **HOLDS.**
4. `grep -rn "assertNoCandles" emulador/src/app --include="*.ts"` → single definition
   (`session-sync.mapping.ts:75`), imported (never duplicated) into
   `lessons-db.service.ts`, `playbook-db.service.ts`, `session-sync.service.ts`,
   `telemetry-db.service.ts`, called on every one of their write paths plus the
   `toPayload` path (`session-sync.mapping.ts:197`). **HOLDS.**
5. `grep -rn "spec-util" emulador/src/app --include="*.ts" | grep -v "\.spec\.ts"` → 2
   hits, both prose in `layout-invariants.ts` comments describing the companion
   `layout-invariants.spec-util.ts` file — no import statement. **HOLDS.**
6. `git diff af3d8ca..HEAD -- emulador/package.json emulador/package-lock.json` → empty.
   **HOLDS.**
7. `grep -rn "@angular\|@ngrx" emulador/src/app/domain/chart/ --include="*.ts"` → zero
   hits (grep exit 1). **HOLDS.**
8. `git diff af3d8ca..HEAD -- emulador/src/app/domain/chart/render-model.ts` → empty.
   **HOLDS.**
9. `git diff af3d8ca..HEAD -- emulador/src/app/services/workspace-db.service.ts` → empty
   (the file was not touched anywhere in this run); `DB_VERSION` unchanged, no
   `createObjectStore` added. **HOLDS.**
10. `grep -rn "groupDrawingsBySymbol" emulador/src/app --include="*.ts"` → zero hits (grep
    exit 1). **HOLDS.**
11. `grep -rn "clearDrawings\|restoreDrawingsForSymbol\|selectItems\|selectSelectedId"
    emulador/src/app --include="*.ts"` → 2 hits, both prose comments in
    `drawings.reducer.spec.ts` explaining why the actions were retired (no code
    reference). **HOLDS.**

All eleven invariants hold. No BLOCKED condition arose.

**Small sweep (the only code change):**
`chart-model-mapper.composition.spec.ts:261-262` — "the five composition inputs
(entities/ownerIndex/selection/groups/descriptor)" corrected to "the six composition
inputs (descriptor/entities/ownerIndex/selection/groups/currentAsset)", matching the
service's own "six input references" comment and field order
(`chart-model-mapper.service.ts:375,387`). No assertion touched.

**Docs written:**

- `docs/architecture/rfcs/017-compositional-panel-sync.md` — **Estado** updated to
  "Implementada" (keeping the two-column table format); new **§13 Desviaciones e
  implementación** records, in order: (1) the owner-decided panel-close cascade — a
  product decision this RFC never made, escalated during Task 3 and answered by the
  repo owner, with its full unreclaimable-UUID-owner-key rationale; (2) the §5.1
  trade-layer gating predicate NOT implemented this run (moved to TEDS, consistent with
  §6's existing supersession note); (3) the RFC-014 G3 `DrawingSnapshot` fidelity caveat,
  cross-referencing the softened selector doc comment; (4) the two Task-6-audit no-fix
  persistence limitations (`parseSessionPayload`'s V3 fallback scope,
  the cloud write path's un-lifted `schemaVersion: 3` stamp); (5) the migration's
  residual same-symbol-multi-panel limitation (already in §10, cross-referenced not
  duplicated).
- `docs/engineering/domain/workspace-panels.md` — new **"Drawing composition &
  ownership (RFC-017)"** section: the flat entity store + `ownerIndex`, the two D17.K
  sync families (event-channel vs composition), per-panel composition inside each
  `ChartModelMapper` instance (D8 intact, six-reference memo named), the `''`
  active-asset sentinel and `effectivePanelSymbol`, per-panel selection/undo-redo/
  clipboard, `hideSharedDrawings`, and the panel-close cascade. Also corrected two
  stale references to the retired per-symbol/V2 drawings shape (the opening "shape of
  the system" bullet and the **Persistence** section, now naming `SessionPayloadV3`) so
  the new section does not contradict the surrounding prose — **inert deviation beyond
  the brief's literal "add" instruction, same file, docs-only, zero behavior risk**.
  Flagged in the same edit: `session-sync.md` (out of scope for this task) still
  describes the V2 wire shape and was NOT touched — recorded as documentation debt, not
  fixed here.
- `docs/architecture/DOMAIN_MODEL.md` — new **I-18 Drawings Ownership Invariants
  (RFC-017)** section mirroring I-16/I-17's exact format (intro paragraph +
  `| Id | Invariant | Detector |` table, Spanish content matching I-17's neighbouring
  language), seven invariants (`W-1`..`W-7`): ownership immutability, exactly-one-owner,
  LinkGroups-resolve-not-store, composition-not-copying, the two delete cascades,
  per-panel selection, and revision-guarded undo determinism. **Every cited detector
  (8 `describe()` strings across 4 spec files) was grepped verbatim against the actual
  spec files before citing it** — none invented.
- `emulador/src/app/state/selectors.ts` — the `selectActiveAssetVisibleDrawings` doc
  comment softened per the brief's item 4a-3 authorization: no longer claims the
  selector captures "what a trader could actually see painted on screen at any
  instant"; now states the composed-panel fidelity gap directly (inactive-tab/
  cell-sibling/`syncDrawings`-off drawings count without being painted; secondary
  observation-panel drawings are excluded) without citing RFC/decision ids in the code
  comment itself (kept consistent with the plan's Global Constraint against task/RFC
  names in comments, the same rule Tasks 3 and 6's L1 findings enforced).

**Two items for the owner (surfaced, not acted on):**

1. `CLAUDE.md` cites the accepted bundle overage as "~609 kB"; the figure measured on
   this branch (Task 3's audit and now Task 9, independently) is **~647 kB**
   (642.43 kB at Task 3's audit, 647.21 kB now — a further ~5 kB drift across Tasks 4-6).
   `CLAUDE.md` is owner-protected; recommend updating the figure, not doing so here.
2. The accumulated **`ChartComponent` keyboard-wiring coverage gap**: Tasks 4 and 5
   added focused-panel gating, undo/redo, and clipboard shortcuts to a component with
   **no spec file at all** (every spec touching it substitutes a template-only stub,
   because the real component boots a live `ChartEngine`/lightweight-charts canvas).
   Three tasks now depend on untested DOM-event→dispatch wiring. Flagged for a ruling at
   the final audit; no harness was built in this task (out of scope, per the brief).

**Test-count arithmetic across the whole run (explicit, checked):**

| Step | Delta | Running total | Files |
| :--- | ---: | ---: | ---: |
| Baseline (re-verified at run resume) | — | 1798 | 148 |
| Task 2 | +11 | 1809 | 150 |
| Task 3 (implementation) | +34 | 1843 | 152 |
| Task 3 fix wave (audit #1) | +18 | 1861 | 152 |
| Task 3 re-audit fix wave | +1 | 1862 | 152 |
| Task 4 | +20 | 1882 | 153 |
| Task 5 | +23 | 1905 | 155 |
| Task 6 (implementation, +24/−8) | +16 | 1921 | 156 |
| Task 6 audit fix wave | +1 | 1922 | 156 |
| Task 9 (comment-only, no new specs) | +0 | **1922** | **156** |

1798 + 11 + 34 + 18 + 1 + 20 + 23 + 16 + 1 + 0 = **1922** ✓, matching the fresh `ng test`
run above exactly (156 files / 1922 tests).

**Commit range:** base `af3d8ca` (origin/develop) → pre-Task-9 HEAD `78b39c7` is 43
commits (Tasks 1–6 + their audits/fix-waves). Task 9 adds its own commits on top (see
this task's own commit hashes in `task-9-report.md`, not duplicated here to avoid a
stale hash the moment a fix-up commit is added).

**FINAL-AUDIT ATTENTION — consolidated (everything an auditor should read line-by-line,
gathered from every task in one place):**

- **Task 2:** `chart.component.ts`'s `handleClick` (the one construction site for every
  new `Drawing` field) has no dedicated spec — pre-existing gap, not introduced here.
- **Task 3 (largest diff of the run, 24 files +1004/−206):** the telemetry/export
  widening from retiring `selectItems`/`selectSelectedId` (both `.session.json` export
  and the RFC-014 `DrawingSnapshot` fact briefly widened to whole-session scope before
  M3 narrowed it back); the `ownerIndex` incremental-maintenance/mapper reference-
  stability memo as the correctness core; the sentinel-symbol fix (H1) and its six-
  reference memo; the tab-close two-dispatch non-atomicity (ruled acceptable —
  `persistMeta$` is `debounceTime(300)`).
- **Task 4:** the stale/locked undo-path distinction (command DROPPED vs RETAINED); undo
  restores `owner` verbatim rather than recomputing it; the Delete-key focused-panel fix
  applied to a pre-existing multi-panel defect.
- **Task 5:** paste is the only new drawing-creation path and it is provably routed
  through the same `resolveDrawingTarget` rule as hand-drawing (Invariant 1 by
  construction); the clipboard is runtime-only.
- **Task 6:** `migrateV2ToV3` and `liftWorkspaceDrawings`/`withLiftedDrawings` (and its
  fix-wave replacement `resolveOwnerLayout`/`liftLegacyDrawings`) are the two genuinely
  new logic blocks; the rewritten cloud-open assertion in
  `sesiones-page.component.spec.ts`; the implementer's verified-correct override of the
  fix brief (resolving owner against the target workspace's OWN persisted layout, not
  the store's current one) — checked line-by-line against `layout.reducer.ts:279-289`
  by the orchestrator.
- **Task 9 (this task):** the `selectors.ts` doc-comment edit and the DOMAIN_MODEL.md
  I-18 table are prose-only — no code paths changed; verify the 8 cited detector
  `describe()` strings still match if anything upstream renames them before the PR
  merges.
- **Standing, cross-task:** the `ChartComponent` keyboard-wiring coverage gap (owner
  item 2 above) and the `CLAUDE.md` bundle-figure staleness (owner item 1 above).

### RUN CLOSED

Tasks 1–6 + 9 done, green at **156 files / 1922 tests**, lint 0, build `647.21 kB`
(budget warning known/accepted), all 11 invariants holding, zero BLOCKED conditions.
Tasks 7–8 remain out of scope (superseded by TEDS). Next: the mandatory final
whole-branch Opus audit, then PR to `develop`.
