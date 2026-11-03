> **Back-merge note (2026-08-06, `main` -> `develop`).** This file holds the *current
> run's* ledger and every run replaces it wholesale, so the two branches carried
> unrelated ledgers: develop's RFC-017 run and main's calculadora/RFC-020 run. Both are
> kept below instead of dropping either record. Runs from RFC-018 onward keep their own
> durable ledger at `.superpowers/rfc-XXX/dev-log.md`; the next run overwrites this file.

---
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

### M-1 RE-AUDIT: **FAIL** (1 Medium, 1 Low) — 2026-07-25

**The code fix passed on every axis.** The auditor re-ran all five gates itself
(156 files / 1936 tests, lint 0, build 648.07 kB, sentinel clean — reproducing every figure
above), re-derived the arithmetic by running the **full suite at both endpoints** rather
than counting `it(` (1934 at `c17fd81`, 1936 at `7b02726`, net +2 ✓), and **empirically
verified the TDD claim instead of accepting it**: it reverted only the production file,
kept the three specs, and observed exactly one failure — `2r7b`, owner flattened to
`{type:'panel', id:'panel-migrated-1'}`. It also traced `ws.linkGroups` through
`link-groups.reducer.ts:50-57` to confirm the installed group set is exactly what the fix
resolves against, including the `ws === undefined` and `thenRestore.linkGroups: []` edges,
and re-confirmed Invariant 1 branch-wide (`grep "owner:" drawings.reducer.ts` → nothing;
the only four owner assignments in app code are two fresh-`Drawing` construction sites, the
V2→V3 migration, and the hydration-boundary re-home). No environment damage — it used
in-place `git checkout` of two files rather than a worktree, deliberately avoiding the
junction hazard that cost a previous auditor `node_modules`.

**M-2 (Medium, blocking) — the branch's normative record still stated the deleted rule.**
`017-compositional-panel-sync.md` §13 point 6 specified group resolvability as "si ese id de
grupo sigue existiendo **en el store** en el momento de la restauración", with a parenthetical
*arguing for* it. `git log -L 412,424` attributes that paragraph to `f2d8a4a` — the same
commit that introduced M-1 — so the RFC encoded the defect as intended design. Not doc
drift: a live contradiction between shipped code and a level-2/3 authority document
(PHILOSOPHY §3.1, §5.6), on the exact axis that returned FAIL twice. Failure scenario is
M-1's own: an engineer reimplementing from the RFC restores `Object.keys(store groups)`, and
the resulting owner-flattening is irreversible in-app.

**Root cause is the orchestrator's brief again — the THIRD of this run.** `m1-fix-brief.md`
said "Do NOT touch anything else" and enumerated only the effect and the spec; a brief that
changes a rule must schedule the update to the document stating it. Recorded as a pattern,
not an incident: all three brief errors (L1's literal fix, M-1's state source, M-2's missing
doc scope) share a shape — asserting *what* to change without checking what else asserts it.

**L-1 (Low) —** `workspaces.effects.spec.ts:68-71`'s bootstrap comment stated the deleted
store-read rule as current, over a now-inert `overrideSelector`. The auditor declined to
rule it no-fix on the grounds that a written rationale outliving the code it justified is
precisely what produced M-1.

### M-2 / L-1 FIX — DONE, closure orchestrator-verified (re-check pending)

**Commit `e0b79fa`** `docs(rfc-017): correct the stale group-resolution rule from M-1's fix
wave` — 2 files (`017-compositional-panel-sync.md`, `workspaces.effects.spec.ts`), +31/−12.
**Zero production files.**

The RFC clause now states the real rule — resolvable if the file carries `linkGroups`, else
if the id exists among the groups of the workspace *that restoration installs* ("sus propios
`linkGroups` persistidos, no los del store") — with a parenthetical carrying the *correct*
reasoning: resolving against the workspace being installed is what makes both cases right at
once. The `ownerPanelFor` rule, the hydration-boundary/Invariant-1 argument and the
before-this-correction history are preserved intact. A **"Nota de corrección"** paragraph
was added naming what the original wording got wrong and why, so the document's own
history cannot be mined for the defective rule. The spec comment now states that the
override is inert for production and is kept so `2r7`/`2r7b`/`2r7c` can each override it
independently — which is what lets `2r7b` demonstrate the store's contents never affect the
outcome.

**Gates re-run by the orchestrator, raw, exit status read:** tsc app `0` · tsc spec `0` ·
`ng test` `0`, **156 files / 1936 tests** · lint `0` · build `0`, **648.07 kB**, sentinel
clean. **Every figure unchanged from `e4d8928`** — which is the proof the change was
prose-only.

### FINAL RE-CHECK: **PASS** — 2026-07-25 · the branch is cleared for PR to `develop`

Zero Critical, zero High, zero Medium. The auditor re-ran all five gates itself and
reproduced every figure exactly (**156 files / 1936 tests**, lint 0, `648.07 kB`, sentinel
clean, no new chunk types) — invariance from `e4d8928` confirmed. It then proved prose-only
**structurally** rather than only empirically: filtering the spec-file diff to non-comment
changed lines returns **nothing**.

Verified beyond the ask:
- **§13.6 now matches the code in all four branches** — `thenRestore.linkGroups` (traced to
  `link-groups.reducer.ts:40-47`, wholesale replacement), the `ws` branch (confirmed neither
  `applySelectedTfs` nor `withLiftedDrawings` touches `linkGroups`, so the installed set is
  *exactly* `ws.linkGroups`), `ws === undefined`, and `thenRestore.linkGroups === []`.
- **The same-workspace parenthetical is stronger than it reads and holds:** `doSwitch`
  `putMeta`s the outgoing meta *before* `getWorkspace` reads `META_STORE`
  (`workspace-db.service.ts:168-180`), so on a same-workspace reimport the live groups
  genuinely round-trip into `ws.linkGroups`.
- **Reconstruction test: negative.** An engineer implementing solely from the corrected
  §13.6 has no path back to a store read — the store is named only to exclude it.
- **The Nota's history is accurate**, verified independently by `git log -S`: the defective
  clause was added by `f2d8a4a` and removed by `e0b79fa`.
- **No other document or comment states the old rule** — swept `docs/`, `.superpowers/`, and
  both rewritten code comments.
- **The inert `overrideSelector` kept at `workspaces.effects.spec.ts:74` is load-bearing as a
  tripwire:** if the store read were ever reintroduced, `2r7b`'s per-test override turns it
  red — which is exactly what the prior audit's revert experiment observed.
- All standing invariants re-greped clean (deps, engine purity, `syncPriceScale` zero
  production read sites, D8, no spec-util import, protected files zero-diff, and Invariant 1
  — the only four `owner:` writes in app code are two creation sites, the V2→V3 migration,
  and the hydration-boundary re-home).

**Two Lows, both ruled NO-FIX with written reasons — do not re-open without new evidence:**

- **Low-1** `workspaces.effects.spec.ts:799,802` — `2r8`'s title and fixture comment still
  frame the store as an input, omitting the condition that actually governs the assertion
  (`db.getWorkspace → undefined`). Risk confined to test code; the fixture and assertion are
  correct and pass for the right reason; blast radius is one `it()` (not the shared
  bootstrap, which is what made L-1 different); the governing rule is now stated correctly
  three times in the same file; and `2r7b`/`2r7c` pin the behaviour so a misreading cannot
  survive a code change.
- **Low-2** `017-compositional-panel-sync.md:417` — §13.6's first branch elides the
  membership test ("si el propio archivo trae `linkGroups`" without "si ese id está entre
  los que trae"). **Pre-existing** (`f2d8a4a`), untouched by this diff, so no regression. The
  item's head clause and the parenthetical both establish membership as the test, and the
  strict-literal misreading is self-defeating (it would make re-anchoring inert for every
  modern export, contradicting the paragraph's stated purpose). If §13.6 is ever edited
  again, tighten branch 1.

**Ledger correction made in response:** the auditor flagged that this ledger used
"redaction" where Spanish *redacción* means wording/drafting — in English it reads as
removal or censoring, i.e. the opposite of what happened. Corrected in both places before
any of it reached the PR description.

### PR body — what the auditor requires it to disclose (once M-1 is closed and re-audited)

Owner re-anchoring at the `.session.json` hydration boundary (RFC §13.6, **as corrected by
`e0b79fa`** — resolvability is judged against the groups/layout the restore *installs*, never
the outgoing workspace's store state; the RFC's first wording of this rule was itself
defective and carries a "Nota de corrección"): what re-homes, what does not, and that the
IndexedDB read path is deliberately excluded · the
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

## RUN COMPLETE — PR opened 2026-07-25

**[PR #45](https://github.com/Humerez-Sebas/trading-emulator/pull/45)** ·
`feature/rfc-017-compositional-panel-sync` → **`develop`** (never `main`; RFC work is
released to `main` only as a whole-block release PR). Head `71f15f7`, base `af3d8ca`,
58 commits. No PR template exists in `.github/`; the body follows
`docs/engineering/git-workflow.md`'s required shape (what/why · evidence · deviations ·
reviewer attention · generated-with footer) and carries every item this ledger's
`### PR body` section enumerates.

**Final state:** Tasks 1–6 + 9 done, Tasks 7–8 out of scope (superseded by TEDS). Five
gates green — 156 files / **1936 tests**, lint 0, build **648.07 kB**, sentinel clean.
Tests 1798 → 1936 across the run; bundle 639.07 → 648.07 kB; zero new runtime dependencies.
Final audit verdict **PASS**, zero Critical/High/Medium.

Noted in the PR for the reviewer: CI (`.github/workflows/ci.yml`) runs on PRs to `main` and
pushes to `main` — **not** on PRs to `develop`. So no automated check will gate this PR; the
evidence is the locally-run gates, each independently re-run by the auditors rather than
taken from a report.

**Two owner-facing items carried out of the run, deliberately not acted on:** the
`ChartComponent` keyboard-wiring coverage gap (audit-accepted, non-blocking, with a standing
recommendation to close it before more keyboard surface lands) and `CLAUDE.md`'s stale
"~609 kB" bundle figure (owner-protected file; the drift predates this branch).

---

# SDD Progress Ledger — Calculadora de riesgo (CFD/Forex) v1

**Plan:** `docs/superpowers/plans/2026-08-01-calculadora-riesgo.md`
**Spec:** `docs/superpowers/specs/2026-08-01-calculadora-riesgo-design.md`
**Orchestrator prompt:** `docs/superpowers/2026-08-01-calculadora-orchestrator-prompt.md`
**RFC:** none — product track (`decision-frameworks.md` §1: not RFC territory; additive
feature over audited machinery, nothing hard to reverse).
**Branch:** `claude/calculadora-riesgo` (target: **`main`**, product track)
**Base commit:** `b8ae481` (= `origin/main` tip; branch carries only the three doc commits
plus merge `0509bf5` on top of it)
**Baseline test count:** **75 files / 1001 tests** passed (`npx ng test --watch=false`,
2026-08-02).

## Run mode — SEQUENTIAL, one batched review + final whole-branch audit

`decision-frameworks.md` §8 leaf: **batched mode**. Nothing here touches persistence or
migration, nothing reopens audited code (`trading.models.ts` is *consumed*, never
edited), and the plan carries no requires-attention risk of the kind that forces full
mode. All three tasks are additive: two new files, one new page, one route + one nav
link.

One deviation from plain batched mode, recorded as a decision: **Checkpoint 1 after
Task 2** runs a `branch-auditor` dispatch over Tasks 1+2 together (Batch A) *before*
Task 3. Reason: the 0.01-lot floor warning is the correctness core of the feature, and
Task 3 is what exposes the page to users — routing to arithmetic that has not been
audited is the wrong order. The final whole-branch audit still runs and still gates
the PR.

**No wave parallelism, deliberately.** The dependency chain is total (Task 2 consumes
Task 1's module; Task 3 mounts Task 2's page). Three worktrees plus three `npm ci` runs
to parallelize nothing would cost more than the run.

**Roles:** Implementer = `sdd-implementer`. Auditor = `branch-auditor` (Opus), which
re-runs every gate personally — implementer and orchestrator reports are claims, not
evidence.

## Base-drift note

`origin/main` is ~400 commits behind `develop`. Nothing from RFC-014..019 exists on this
base. Verified present on `b8ae481` by the orchestrator before dispatch:
`state/trading/trading.models.ts:190,202` (`contractSizeFor`, `lotsForRisk`),
`components/risk-slider.component.ts` (clamps to 0.1–5 → the page needs its own free
numeric field, per spec §3), `components/ui/` primitives (`index.ts` exports
`InputDirective`, `ButtonDirective`, `BadgeDirective`, `DropdownComponent`),
`state/selectors.ts:63` (`selectAssets` → `AssetMeta[] = { symbol, lastModified }`),
`app.routes.ts`, `app.html`. Note: the UI primitives live under
`components/ui/`, **not** `src/app/ui/` as the orchestrator prompt stated.

**Working artifacts:** `.superpowers/calculadora/task-N-{brief,report}.md` (local only,
untracked — kept out of `.superpowers/sdd/` so the previous run's briefs there survive).

## Tasks

- [x] Task 1: `domain/risk/risk-calculator.ts` — four pure parameterized functions (LOW)
- [x] Task 2: `pages/calculadora/` — page composing `lotsForRisk`/`contractSizeFor` with
      the three honest states and the 0.01-floor warning (MEDIUM — correctness core)
- [x] Checkpoint 1 — **GATE**: Batch A audit (Tasks 1+2) → **NOT PASS** (3 Medium) →
      fix commit `3a9185e` → **re-audit PASS ("Ship it")**
- [x] Task 3: lazy `/calculadora` route (`authGuard`, **no** `r2OnboardingGuard`) + nav
      link after «Nueva sesión» (LOW) — **committed, gates NOT yet re-run by the
      orchestrator (see below)**
- [x] Final gates + `npm run build` + invariant greps (all green, recorded below)
- [x] Whole-branch Opus audit → **NOT PASS** (1 High, 1 Medium) → fix `dfa5dc9` →
      re-audit **NOT PASS** (1 High, fix-introduced) → fix `8b6093a` →
      **re-audit PASS ("Ship it")**
- [x] PR → `main` (GitHub MCP): **[#53](https://github.com/Humerez-Sebas/trading-emulator/pull/53)**
- [ ] Back-merge `main → develop` — **blocked on the owner merging #53** (see below)

## Completed

### Task 1 — `feat(risk): módulo puro de cálculo de riesgo parametrizado`

- **Commit:** `5b3f521` (`4ff74e7..5b3f521`)
- **Scope actually touched:** exactly the two files in the brief —
  `emulador/src/app/domain/risk/risk-calculator.ts` (+44) and
  `risk-calculator.spec.ts` (+45). `git show --stat` confirms 2 files / +89 / −0;
  `git status` shows no stray staged or modified files.
- **Evidence — gates re-run by the ORCHESTRATOR, not taken from the report:**
  `npx tsc -p tsconfig.app.json --noEmit` clean · `npx tsc -p tsconfig.spec.json --noEmit`
  clean · `npx ng test --watch=false` → **76 files / 1009 tests passed** ·
  `npm run lint` → "All files pass linting" (0 problems).
- **Test-count arithmetic:** 1001 → 1009 = +8, and the plan's Task 1 block specifies
  exactly 8 `it()` blocks (4 `pipSizeFor` + 1 `priceDistance` + 1 `riskUsdFor` +
  2 `riskForLots`). Consistent.
- **Invariants:** `grep -rn "from '.*state/" emulador/src/app/domain/risk/` empty ·
  `Math.max(0.01` in `domain/risk/` empty · `@angular|@ngrx` in `domain/risk/` empty ·
  no `package.json`/lockfile diff vs `origin/main`. Verified against the committed source:
  `pipSizeFor` discards `XAU*`/`XAG*` before testing `/^[A-Z]{6}$/`, mirroring
  `contractSizeFor`.
- **Deviations (2, both inert):**
  1. `npm run format` reflowed the `riskForLots` signature onto one line — whitespace only.
  2. An additive module-level doc comment stating the Dependency Rule and the Futures
     exclusion, on top of the required `pipSizeFor` order comment.
- **One reported non-finding, checked and agreed:** the `spec-util` grep matches two
  **doc-comment** lines in `state/layout/layout-invariants.ts`, a pre-existing untouched
  file. Not an import, so kernel invariant 7 (no vitest in the prod bundle) holds. Inert.

### Task 2 — `feat(calculadora): página de dimensionado CFD/Forex con estados honestos`

- **Commit:** `085c08d` (`5b3f521..085c08d`)
- **Scope actually touched:** exactly the four files in the brief, all new —
  `calculadora-page.component.{ts,html,css,spec.ts}` under `pages/calculadora/`.
  `git show --stat` confirms 4 files / +549 / −0. **Task 3's files are untouched:**
  `git diff --stat origin/main -- app.routes.ts app.html` is empty.
- **Evidence — gates re-run by the ORCHESTRATOR:** tsc app clean · tsc spec clean ·
  `npx ng test --watch=false` → **77 files / 1016 tests passed** · `npm run lint` →
  "All files pass linting" (0 problems).
- **Test-count arithmetic:** 1009 → 1016 = +7, matching the 7 `it()` blocks (the plan's
  six required cases, with (c) split into balance and risk % — see deviations).
- **Composition rule verified by reading the source, not the report:**
  `calculadora-page.component.ts:5` imports `contractSizeFor`/`lotsForRisk` from
  `state/trading/trading.models`; `domain/risk/` still imports nothing from `state/`.
  Direction of dependency is page → {domain, state}, never domain → state.
- **The prohibition holds:** `grep -rn "lotsForRisk" pages/calculadora/` returns one
  import (line 5), one call site (line 65), and doc-comment prose. No second sizing
  formula; `Math.max(0.01` appears nowhere in either new directory.
- **The floor warning is two-sided,** which is the point: spec case (d) — 100 / 0.1 % /
  40000→39950 — asserts `$0.50` and `$0.10` render; case (e) asserts the acceptance case
  does **not** contain «mínimo de 0.01 lotes». A warning that always fires is not a
  warning, and (e) is what proves it does not.
- **Deviations (6 — five inert, one requires-attention):**
  - *Inert:* (1) a first-draft doc comment quoted `Math.max(0.01, …)` and tripped the
    implementer's own invariant grep; reworded **before** the commit, so the grep is
    genuinely clean rather than needing an auditor's judgment call — self-caught and
    self-reported. (2) ASCII-only commit body (the subject line keeps its accents).
    (3) seven tests instead of six. (4) `invalidReason` checks SL = entry before the
    non-positive branch — an unspecified priority, chosen to mirror `lotsForRisk`'s own
    order; no required case exercises the overlap. (5) inputs prefill with the acceptance
    case so the page opens on a working example.
  - *Requires-attention:* (6) the contract-size line uses one fixed wording,
    «{símbolo} → {contractSize} $/punto por lote», for **every** instrument. It is
    numerically true in this domain model (`contractSize` is $ per 1.0 price-unit per lot
    everywhere), but on a forex pair it renders «100000 $/punto por lote» beside a
    distance shown in pips, which may read oddly. Not a defect and not a sizing error —
    a copy decision the task was not asked to make. **Owner-visible item.**

### Checkpoint 1 — Batch A audit (`branch-auditor`, Opus) over `4ff74e7..7df6356`

**VERDICT: NOT PASS.** All four gates green in the auditor's own re-run
(77/1016, tsc clean, lint 0, `format:check` clean, `npm run build` clean with no new
chunk types — only the known 611 kB Arrow/parquet budget warning). Every structural
invariant held: `domain/risk/` dependency-free, `lotsForRisk` the only lot source,
`pipSizeFor` correct on input classes the spec never listed (`''`, `XAUEUR`, `EURXAU`,
`EURUSDX`, `JPYUSD`), the honest states genuinely exclusive in the template, zero Task 3
scope leak, no new deps. The auditor also re-derived the baseline instead of trusting it:
1016 − 15 new `it()` = **1001**, 77 − 2 = **75**. The defects were in *what the code said*
and *what the tests actually proved*:

- **M1 (Medium).** `minLotWarning` fired on any >1 % difference but hardcoded both the
  floor narrative and the "above" direction. On an ordinary retail trade — 5000 / 1 % /
  EURUSD 1.1000→1.0940 — it rendered, inside a `role="alert"`: «El mínimo de 0.01 lotes
  arriesga $48.00, por encima de los $50.00 solicitados» while showing 0.08 lots. Two
  false claims (the floor never applied; $48 is *below* $50) next to the figures that
  contradict them. Spec §3.1 had assigned the rounding case to this same mechanism; the
  mechanism was reused, the wording never was — and the Task 2 report had not caught it.
- **M2 (Medium).** The three honest-state tests guarded the headline failure mode with
  `not.toContain('0.00 lotes')`, which `preserveWhitespaces: false` makes **unsatisfiable**
  — the DOM renders `1.00lotes`, no space. The guard could never fail.
- **M3 (Medium).** The acceptance test — spec §4's «el test que da sentido al trabajo» —
  asserted whole-page substrings that other fields also produce. The auditor deleted the
  lot figure from the DOM and the test still passed.
- **L1 (Low).** The inverse block rendered a fabricated `0.00 %` when balance ≤ 0.
- **L2 (Low).** «$/punto por lote» is the wrong unit off index CFDs (EURUSD showed
  «100,000 $/punto por lote» beneath a pip distance) — this was the Task 2 report's own
  requires-attention deviation #6, confirmed as Low: no path from that line to a wrong
  position size.
- **L3, L4 — ruled NO-FIX with written reasons** (`decision-frameworks.md` §6), so they
  are not re-litigated: `invalidReason`'s priority order (every ordering shows one of
  several simultaneously-true conditions; the message shown is never false; the order
  mirrors `lotsForRisk`'s own) and the two differently-clamped % inputs (spec §3 requires
  both; the clamp is pre-existing shared-primitive behaviour; the caption discloses it;
  verified no silent write-back).

### Fix — `fix(calculadora): mensaje de aviso honesto y tests que fijan lo que afirman`

- **Commit:** `3a9185e` (`7df6356..3a9185e`), 3 files, +193/−35, all inside
  `pages/calculadora/`. `domain/risk/`, `trading.models.ts`, `app.routes.ts` and
  `app.html` untouched.
- **Orchestrator decision (recorded, not improvised):** the fix brief covered **M1–M3
  plus L1 and L2**, not the Mediums alone. Both Lows live in the two files already open,
  both are cheap, and each defeats a purpose the spec states outright — L1 reproduces the
  «0.00 reads as valid» failure §3.1 exists to prevent, and L2 defeats §5's «make the
  applied assumption checkable before operating» (a trader cross-multiplying 60 pips ×
  100,000 gets 6,000,000 instead of $600). L3/L4 stay no-fix.
- **M1 closed:** the message now branches on cause (`lots() === 0.01 && actual > requested`
  = the floor signature — the minimum can only push risk *up*) and on direction, using
  only already-computed values. **No "raw lots before rounding" is computed anywhere**;
  that would have been the second sizing formula this run exists to prevent.
- **M2/M3 closed:** assertions now pin elements (`.lots-hero`, `.lots-value`,
  `.requested-risk-value`, `.distance-value`) instead of whole-page substrings, and the
  parity test spec §4 asked for now exists — three cases (acceptance, floor, rounding)
  comparing the rendered figure against `lotsForRisk` **called from the test**. Calling
  the real function is the parity assertion; hand-deriving the arithmetic is what stays
  forbidden.
- **Red-before-green evidence** (demanded in the brief, since a test that would have
  passed before the fix has closed nothing): M1 — reverted `minLotWarning` to the pre-fix
  one-liner and captured the new test failing with the audit's exact false string. M2 —
  the production code was already correct, so the implementer injected the regression the
  guard exists to catch (hero rendering beside the invalid-state message), showed all
  three new assertions red **and the reinstated old assertion passing** against the same
  regression. M3 — deleted `.lots-hero` from the template, showed the four new tests red
  while an old-style substring test still passed. All reverts removed before the commit;
  `git status` clean.
- **Evidence — gates re-run by the ORCHESTRATOR:** tsc app clean · tsc spec clean ·
  `npx ng test --watch=false` → **77 files / 1023 tests passed** · `npm run lint` 0 ·
  `npm run format:check` clean.
- **Test-count arithmetic:** 1016 → 1023 = +7 (14 `it()` in the page spec, up from 7).

### Checkpoint 1 re-audit (`branch-auditor`, Opus) over `3a9185e` — **PASS ("Ship it")**

Gates re-run by the auditor: 77 files / **1023 tests**, tsc app+spec clean, lint 0,
`format:check` clean, `npm run build` clean at 611.21 kB with **no new chunk types** (the
page is still tree-shaken out — correct, nothing routes to it before Task 3). Arithmetic
re-derived independently: the page spec now has 14 `it()` (was 7) → +7 → 1023, and
`git diff 5b3f521 HEAD -- domain/risk/` is empty, so the whole delta is the page spec.

**The auditor did not accept the fix report's red-before-green claim** — it injected its
own mutations. Mutation A bound the lots hero to `manualLots()` instead of `lots()` (the
mutation that had escaped the *entire* old suite) and reverted M1's message: the two
parity cases and the rounding test went red. Mutation B rendered the hero beside the
invalid message: all three honest-state guards went red. Six guards confirmed
load-bearing.

M1's boundary was mapped case by case rather than spot-checked — raw lots just under
0.01, just over, exactly 0.01 (no warning, correctly), and both sides of the 1 % threshold
(24.75 warns at relDiff 1.0101 %; 24.755 stays silent at 0.9897 %, exclusive per spec
«> 1 %»). The original false message now reads «El redondeo al paso de 0.01 lotes arriesga
$48.00, **por debajo de** los $50.00 solicitados.»

Two things the auditor examined hardest and cleared explicitly, so they are not
re-litigated: (1) at raw 0.008 the message says «mínimo de 0.01 lotes» although `Math.max`
never clamped (`round2(0.008)` is already 0.01) — true as rendered, and no smaller size is
tradeable either way, so the trader's takeaway is identical; (2) test (a) alone still
passes under Mutation A because the prefilled `manualLots = 1` coincidentally renders
`1.00` — the parity floor and rounding cases are what actually close M3, and they do.

**New finding L5 — ruled NO-FIX with written reasons, and OWNER-VISIBLE.**
`USDJPY → 1,000 $/pip por lote` overstates the pip value: the true value of one lot is
¥1,000 ≈ $6.70. The model performs **no quote-currency conversion**. No-fix because
(1) it is not introduced here and not a regression — it is a property of
`contractSizeFor`/`lotsForRisk` in the already-audited `trading.models.ts`, and it governs
every figure on the page identically (the same trade renders «Riesgo real $500.00» where
the true figure is ~$3.35); the previous «100,000 $/punto por lote» carried the identical
error in a unit nobody cross-checks. (2) Currency conversion is an explicit spec non-goal,
so there is no in-scope correct fix — inventing an FX rate here is exactly the
confident-wrong-number failure the Futures deferral exists to prevent. (3) Parity with the
emulator is this run's stated purpose; diverging on this one line would break the
invariant the feature exists to guarantee. **Consequence:** the deferred follow-up spec
(design doc §6) now has a second reason to exist beyond Futures — quote-currency
conversion. This goes in the PR body.

### Task 3 — `feat(calculadora): ruta lazy /calculadora y enlace de navegación`

- **Commit:** `8140c56` (`3c252be..8140c56`), 3 files, +46/−0.
- **Scope actually touched (orchestrator diff-scan):** `app.routes.ts` (+10),
  `app.html` (+1), `app.routes.spec.ts` (+35, new). Nothing else; `git status` clean apart
  from the four pre-existing untracked dirs.
- **Read from the committed source, not the report:** the route sits **between**
  `sesiones/crear` and `{ path: '**' }` — before the wildcard, as required — carries
  `canActivate: [authGuard]` with **no `r2OnboardingGuard`** and a comment saying why, and
  loads lazily via `loadComponent`. The nav link is on the line after «Nueva sesión»,
  without `[routerLinkActiveOptions]` (correct: `/calculadora` is nobody's prefix, same as
  `/mercados`).
- **Evidence — gates re-run by the ORCHESTRATOR on resume (2026-08-02):** tsc app clean ·
  tsc spec clean · `npx ng test --watch=false` → **78 files / 1028 tests passed** ·
  `npm run lint` 0 · `npm run format:check` clean. `app.spec.ts` stayed green untouched.
- **Test-count arithmetic:** 1023 → 1028 = +5, matching the 5 assertions in the new
  `app.routes.spec.ts`.
- **Honest note from the implementer's report, carried forward for the auditor:** during
  TDD only 3 of the 5 new assertions went red pre-implementation. The two guard-membership
  assertions passed **vacuously**, because `calculadoraRoute?.canActivate` was `undefined`
  and vitest's `toContain`/`not.toContain` do not throw on an undefined actual. The
  implementer states they are non-vacuous now that the route exists. That claim is worth a
  mutation check in the final audit, not a re-read.
- **Deviations (2, both inert):** the new `app.routes.spec.ts` (pre-authorized in the
  brief — the plan's File Structure lists only the two modified files, but the protocol
  requires a failing test first, and a route with the wrong guard is exactly what a diff
  read misses); and the optional nav-link render test was skipped, as the brief permitted.

_(The run was paused here at the owner's request for one session, then resumed. Task 3's
gates and the branch-level verification below were run on resume.)_

## Final branch verification (orchestrator, 2026-08-02)

- **Four gates + `format:check`:** all green at `4cf1252` — 78 files / **1028 tests**,
  tsc app+spec clean, lint 0, Prettier clean.
- **`npm run build`:** success. Initial total **611.53 kB** (the auditor measured
  611.21 kB pre-Task-3; the +0.32 kB is the route entry itself). **No new chunk types** —
  no vitest sentinel. The one new lazy chunk is `calculadora-page-component` at 10.93 kB,
  which is precisely what Task 3 was for: before the route existed the page was
  tree-shaken out entirely. The 500 kB budget warning is the known-accepted
  Arrow/parquet-dominated baseline, not a regression of this branch.
- **Invariant greps — all clean:**
  - `grep -rn "from '.*state/" emulador/src/app/domain/risk/` → **empty** (Dependency Rule)
  - `grep -rn "Math.max(0.01" pages/calculadora/ domain/risk/` → **empty** (the floor stays
    `lotsForRisk`'s alone)
  - `grep -rn "lotsForRisk(" emulador/src/app --include=*.ts` → in this branch's surface,
    exactly one app call site (`calculadora-page.component.ts:65`) plus the parity test.
    All other hits are pre-existing (`chart.component.ts`, `trade-panel.component.ts`,
    `trading.reducer.ts` and their specs) and untouched by this branch.
  - `spec-util` in app code → only the two known-inert doc-comment lines in
    `state/layout/layout-invariants.ts`
  - `git diff --stat origin/main -- package.json package-lock.json` → **empty**
- **Whole-branch diff vs `origin/main`:** 13 files, +1750/−28 — 3 committed docs
  (spec, plan, orchestrator prompt), the ledger, and 9 code files. Nothing outside the
  declared scope.

## Whole-branch audit (`branch-auditor`, Opus) over `b8ae481..70dfe74` — **NOT PASS**

Every gate green in the auditor's own run (78/1028, lint 0, Prettier clean, build
611.53 kB with no new chunk types), every kernel invariant clean, and the ledger
arithmetic re-derived from scratch rather than accepted: `it()` counts 8 + 14 + 5 = 27,
`1028 − 27 = 1001`, `78 − 3 = 75`, and `git diff --name-only origin/main...HEAD | grep
spec.ts` returns **only those three files** — no pre-existing spec was edited, so the
derivation is airtight. It also killed all three Task 3 route-test mutations
(adding `r2OnboardingGuard`, emptying `canActivate`, moving the wildcard), closing the
implementer's honest vacuity note, and probed the route against the **real** Store and
Router: the page lazy-loads, renders correctly with `assets: []`, and an anonymous user
does not reach it.

Two findings, both in the page's **input surface** — invisible to every previous check
because all 14 page tests set the component's signals directly and none crossed the DOM:

- **F1 (HIGH).** The five numeric fields bound `[value]="signal()"` and did
  `signal.set(Number(target.value))` on every `input` event. `Number('')` is `0`, and
  `<input type="number">` returns `''` for any invalid intermediate text (`"1."`, `"-"`,
  a cleared field). So mid-keystroke the signal collapsed to `0`, the binding changed, and
  Angular wrote `"0"` back into the field. **Typing `1.10952` left to right was
  impossible** — the field snapped to `0` at the decimal point, every time, in Entrada,
  Stop Loss, the free Riesgo % field and Lotes. Clearing a field was impossible too. On a
  page titled *CFD/Forex*, whose own suite uses `EURUSD 1.1 → 1.094`, the shipped UI could
  not accept those values from a keyboard. Index CFDs have integer prices, which is
  exactly why the prefilled acceptance case and all 14 tests passed.
- **F2 (MEDIUM).** None of the six inputs had an accessible name — `<div class="ui-field">`
  plus a `<span>` with no `for`, and inputs with no `id`/`aria-label`. A screen reader
  announced five indistinguishable spin buttons on a page whose whole purpose is putting
  the right number in the right field. Production path, so §6 bars a convenience no-fix.
- **L6, L7, L8 — ruled NO-FIX with written reasons.** L6: `invalidReason` does not reject
  a *finite* negative SL — spec §3.1 lists exactly three honest states, and `lotsForRisk`
  has the identical behaviour, so rejecting it here would break the emulator-parity
  invariant this feature exists to guarantee; the correct home is `trading.models.ts`,
  which this branch may not touch. L7: the symbol echoes un-normalized (`eurusd`) —
  display-only, every figure correct. L8: the `ui-dropdown` branch had no coverage —
  test-code only, and the auditor exercised it against the real store and found it
  correct.

### Final fix — `fix(calculadora): entradas que aceptan decimales y campos con nombre accesible`

- **Commit:** `dfa5dc9` (`70dfe74..dfa5dc9`), 3 files, +286/−37, all inside
  `pages/calculadora/`. Frozen files confirmed untouched:
  `git diff --stat 70dfe74 -- domain/risk/ app.routes.ts app.html app.routes.spec.ts` is
  empty.
- **F1 closed by a design change, and the reason is worth keeping.** The implementer
  probed jsdom directly and found that `<input type="number">.value` sanitizes incomplete
  float text to `''` *on assignment*, before any Angular code runs — so **neither** repo
  precedent cited in the brief could have survived while keeping `type="number"`. The five
  fields became `type="text" inputmode="decimal"` with raw string signals (`entryText`, …)
  bound to `[value]` and parsed by separate `computed(() => parseFloat(...))` — which is
  structurally the `trade-panel.component.ts` pattern. `parseFloat('')` is `NaN`, never
  `0`, so a cleared field drives an honest state instead of a confident wrong figure.
- **Two consequential guards, both reasoned in-code:** `invalidReason` gained
  `!Number.isFinite(sl())` — a **NaN check, not a positivity check**, so L6's ruled-no-fix
  behaviour (finite negative SL still produces a figure, matching `lotsForRisk`) is
  deliberately preserved; and `manualRiskUsd` gained NaN guards, since the inverse block
  does not sit behind `invalidReason`.
- **Red-before-green evidence:** 7 failures captured against the unfixed component (fields
  snapping to `0`; no accessible name), then green with `1.10952` and `2650.50` surviving
  keystroke-by-keystroke DOM entry. The new tests drive the real `<input>`
  (`el.value = …; dispatchEvent(new Event('input'))`), which is what makes them able to
  fail at all.
- **L8 coverage added** (dropdown renders; `onAssetPick('XAUUSD')` re-sizes through
  `contractSizeFor`) — green before the fix too, confirming it was a gap, not a defect.
- **Evidence — gates re-run by the ORCHESTRATOR:** tsc app+spec clean ·
  `npx ng test --watch=false` → **78 files / 1037 tests passed** · lint 0 ·
  `format:check` clean · `npm run build` success, initial total **611.53 kB unchanged**,
  no new chunk types.
- **Test-count arithmetic:** 1028 → 1037 = +9 (page spec 14 → 23).
- **Implementer-flagged for audit attention (honest, not a defect claim):** the Riesgo
  group was wrapped in `<label>` per the brief's literal six-field list even though it
  holds two controls (the slider and the free field), made safe by an explicit `aria-label`
  on the free field.

## Whole-branch re-audit over `dfa5dc9` — **NOT PASS** (1 High, introduced by the fix)

F1 and F2 confirmed genuinely closed, with the auditor's own probes rather than the
report's: every intermediate keystroke of `1.10952` and `2650.50` survives, the trailing
zero is not canonicalized away, clearing lands in the honest state, all six inputs have
accessible names (checked via `input.labels`, the spec-accurate association, not
`closest()`), L6's finite-negative-SL behaviour is preserved exactly, and **no NaN reaches
the screen**. Both F1 mutations were killed (reverting the field to `type="number"`;
reinstating the numeric write-back). The `type="number"` sanitization claim was verified
independently and the design change stands.

**One correction the auditor put on the record, worth keeping:** the code comment implies
*no* `type="number"` approach could have worked. Not quite — `risk-slider`'s
`parseFloat` + `isNaN` guard would have stopped the clobbering (which is why that
component has no such bug). What it could not do is distinguish a **cleared** field from a
mid-decimal one, since `.value` is `''` for both, leaving a stale value behind an empty
box. The design change is still the right call; the justification as written is stronger
than the facts support.

- **F3 (HIGH).** `parseFloat` stops at the first character it cannot consume and returns
  the prefix. `parseFloat('2650,50')` is **`2650`** — and the comma is the decimal
  separator on a Spanish numeric keypad and on a Spanish-locale phone's
  `inputmode="decimal"` keypad, in an app whose UI is Spanish throughout. Measured on
  XAUUSD / 5000 / 1 %: `2650,50 → 2648,00` renders **0.25 lots** where `2650.50 → 2648.00`
  renders 0.20 — a **25 % oversized position**, with no honest state, no warning, the field
  still displaying `2650,50`, and «Riesgo real 50.00 $» *false* (the real loss at the true
  2.5-point stop is $62.50). `parseFloat('1.5abc')` → `1.5` shares the root cause. This is
  the failure class the spec itself cites when deferring Futures — «dimensionado
  incorrecto con apariencia de autoridad» — and the F1 fix caused it by moving off
  `type="number"`, which is what had been normalizing the comma.
- **L9, L10, L11 — ruled NO-FIX with written reasons.** L9: clearing Cuenta/Riesgo feeds
  `NaN` to `app-risk-slider`, so `[style.width.%]` emits `NaN%`, the CSSOM rejects it and
  the thumb keeps its last valid position while the field is empty — cosmetic, no NaN text
  on screen, and the stale pixel lives in the shared `risk-slider.component.ts` this branch
  may not widen scope to touch. L10: the Riesgo `<label>` wraps two controls so the
  slider's computed name absorbs the tooltip text — verbose, but a strict improvement over
  no name, and the alternative means editing the same shared component. L11 was test-code
  only and got fixed anyway in the next commit. **L8 is now closed** — the dropdown-branch
  test the auditor recommended exists.

### F3 fix — `fix(calculadora): parsear el número completo o rechazarlo (coma decimal)`

- **Commit:** `8b6093a` (`85ad656..8b6093a`), 2 files, +131/−12. Template unchanged;
  `domain/risk/`, `app.routes.ts`, `app.html`, `components/` all confirmed zero-diff.
- **The fix is one helper, deliberately:** `parseDecimal` = trim → empty-as-`NaN` →
  comma-to-dot → `Number(...)`, which unlike `parseFloat` requires the **whole** string to
  parse. All five computeds use it, so the parsing rule cannot drift between fields. The
  `Number('') === 0` trap is handled before `Number` sees the string, with a comment saying
  why — that is the F1 bug class and it must not come back.
- **What the DOM holds did not change.** `2650,50` keeps displaying as `2650,50` while the
  user types; only how the text is *read* changed. The two load-bearing carve-outs hold:
  mid-typing (`1.`, `1,`) still parses, so F1 stays closed, and finite negatives (`-1`)
  still parse, so L6's no-fix ruling stays true.
- **Red-before-green:** 3 of the 9 new tests failed against the unmodified `parseFloat`
  code — the comma-typed XAUUSD scenario rendering `0.25` instead of `0.20`, plus `1.5abc`
  and `1,234,56` parsing to non-`NaN`.
- **L11 closed in the same commit:** the accessible-name test now uses
  `input.labels.length > 0` instead of `closest('label') !== null`, which was true for any
  descendant of a label even when the label did not name it.
- **Evidence — gates re-run by the ORCHESTRATOR:** tsc app+spec clean ·
  `npx ng test --watch=false` → **78 files / 1046 tests passed** · lint 0 ·
  `format:check` clean · `npm run build` success, initial total **611.53 kB unchanged**.
- **Test-count arithmetic:** 1037 → 1046 = +9 (page spec 23 → 32).

## Whole-branch re-audit over `8b6093a` — **PASS ("Ship it")**

Gates re-run by the auditor: 78 files / **1046 tests**, tsc clean, lint 0, Prettier clean,
build **611.53 kB unchanged**, no new chunk types (the lazy `calculadora-page-component`
chunk grew 11.67 → 11.70 kB). Arithmetic re-derived: 32 + 8 + 5 = 45 new `it()`;
`1046 − 45 = 1001` = the baseline; `78 − 3 = 75` files.

- **F3 closed at the DOM.** The original reproduction now renders **identically** for both
  separators: `2650,50 → 2648,00` and `2650.50 → 2648.00` both give `2.5 puntos` and
  **0.20 lots**. The whole behaviour table walked and confirmed, including `1e5` → 100000,
  `+40100` → 40100, `  5  ` → 5, `1_000` → honest state, and grouped input in either
  locale format (`40.000,50`, `40,000.50`) landing on the honest state rather than a
  plausible wrong number.
- **F1 not broken again** — `1.10952` and `2650.50` re-verified keystroke by keystroke,
  trailing zero intact, clearing still honest; the comma path now works end to end
  (`2650,` → `2650,5` → `2650,50` → parsed 2650.5). `replace(',', '.')` replacing only the
  first comma is inert: `1,234,56` lands on `NaN` either way.
- **L6 re-verified precisely.** The auditor corrected a conflation in my own re-audit
  request: a negative *entry* correctly gets the honest state via `!(entry > 0)`, while a
  negative *SL* (EURUSD entry 1.1 / SL −1) still renders a real `0.01` lot figure with
  `invalid-state = null` — which is the behaviour L6 was ruled no-fix to preserve, for
  parity with `lotsForRisk`.
- **Both mutations killed.** Reverting `parseDecimal` → `parseFloat` turned 3 tests red
  (including the exact F3 symptom, `expected '0.25' to be '0.20'`); dropping *only* the
  comma normalisation turned 2 red — so the normalisation is independently load-bearing,
  not carried by the `Number` change. **L11's fix is load-bearing too:** turning Entrada's
  `<label>` back into a `<div>` fails the accessible-name test for the right reason.
- **Nothing frozen moved.** `git diff --stat origin/main...HEAD -- src/app/components/
  src/app/state/` is **empty** across the whole branch — `risk-slider.component.ts` and
  `trading.models.ts` are untouched, which is exactly what L9/L10 were ruled no-fix to
  protect.

### New Low — L12, ruled NO-FIX with written reasons

`Number` accepts three literal forms `parseFloat` rejected: `Infinity`, `0x10` → 16,
`0b101` → 5 (also `0o17` → 15). Measured: `Infinity` in Cuenta renders «∞ lotes»;
in Entrada it trips the floor warning loudly («arriesga $Infinity»); in Stop Loss the
`!Number.isFinite(sl())` guard already catches it. **No-fix, three reasons.** (a) Every
one requires typing a Latin letter into the middle of a number — impossible from a numeric
keypad. That is categorically different from F3, where the comma *was* the default decimal
key on the target locale's keypad; that difference is precisely why F3 was High and this
is Low. (b) The output is not a confident wrong figure — `∞` is unmistakable and cannot be
acted on, and the hex/binary forms need a deliberate `0x`/`0b` prefix and land so far off
that the floor warning fires. (c) The available fix — a post-normalisation shape regex —
would have to admit `1e5`, `+40100`, `.5`, `-1` and the mid-typing states `1.` and `1,`
that F1 depends on: a fourth round on an input path that has already produced one High,
spent on input nobody types. Documented accepted risk with a bounded, non-deceptive
failure mode, not a convenience ruling.

### Standing no-fix rulings at ship time

L3 (`invalidReason` priority) · L4 (two differently-clamped % inputs) · **L5 (no
quote-currency conversion — OWNER-VISIBLE, goes in the PR body)** · L6 (finite negative
SL) · L7 (symbol echoed un-normalised) · L9 (risk-slider stale visuals on a cleared
field) · L10 (Riesgo label's verbose computed name) · L12 (above). **L8 and L11 are
closed** by the last two fix commits.

## PR — [#53](https://github.com/Humerez-Sebas/trading-emulator/pull/53) → `main`

Branch pushed to `origin/claude/calculadora-riesgo` and the PR opened via the GitHub MCP.
Body carries: what/why, the structural decision, the three honest states, the full
test-count progression 1001 → 1046, the gate and build evidence, the three NOT PASS audits
and what each caught, the **Futures deferral** and **L5** (no quote-currency conversion) as
the two reasons the follow-up spec exists, and the remaining no-fix Lows.

### Two items left for the owner — the run stops here on purpose

1. **Merging #53 is the owner's call, not the orchestrator's.** Merging to `main` is what
   deploys to production, and the run has no mandate to trigger a deploy. Note also the
   pre-existing repo state recorded elsewhere: the CI **Pipeline job fails on unpinned
   ruff** (39 errors in untouched code) and **`main` is not branch-protected** — neither is
   caused by this branch, but both bear on whether a merge is safe right now. Branch
   protection has no MCP/CLI path either way; it is a human dashboard task.
2. **Back-merge `main → develop`** immediately after that merge, with a clean tree, and
   re-run the gates there (`git-workflow.md` §Two-track flow). This branch touches no file
   that diverges between the two — `git diff origin/main...HEAD -- src/app/components/
   src/app/state/` is empty — so it should be clean. **A conflict would mean something
   landed outside the declared scope: stop and investigate rather than resolving it.**

## Deviations

- Task 1: two, both inert (formatter reflow; additive doc comment).
- Task 2: six — five inert, one **requires-attention** (#6, contract-size line wording).
  All are described above and were self-reported by the implementer.

## FINAL-AUDIT ATTENTION flags

- Nothing from Task 1: +89 lines across two new pure files, no private APIs, no DI.
- **Task 2 is the largest diff of the run (+549) and carries all of its arithmetic.**
  Read line by line: (a) that `lots` flows only from `lotsForRisk`; (b) that
  `minLotWarning`'s 1 % threshold cannot fire on the acceptance case nor stay silent on
  the 5× case; (c) that `invalidReason` replaces the lot figure instead of rendering
  beside it; (d) that `distanceValue` divides by `pipSize` only when it is non-null.
- No private-API use anywhere in the run. Public NgRx surface only
  (`store.selectSignal(selectAssets)`), no `dispatch`, no effects, no subscriptions.
