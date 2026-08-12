# Agent D — Verification Integrity · PROGRESS

Worktree `C:\Users\78701\Desktop\trading-emulator-verification`, branch
`agent/verification-integrity`, baseline `develop` @ `a2ca53b`.

## STATUS

**~35% complete.**

- **D1 TradePanel spec** — NOT STARTED (component + template + selectors read; design known).
- **D2 Testing philosophy** — N/A, honoured as a constraint (no DOM-% KPI, no `beforeEach` crusade).
- **D3 Selector isolation** — IN FLIGHT: 9 of 19 files fixed, 10 remaining.
- **D4 CI trigger** — IN FLIGHT: gap confirmed by reading `.github/workflows/ci.yml:3-7`; edit not yet made.
- **D5 No production refactor** — HOLDING. Zero production files touched so far.
- **D6 Gates** — NOT RUN YET.

## EVIDENCE SO FAR

### Environment

- `npm ci` in `<worktree>/emulador` — **DONE, exit 0**. A successor does NOT need to re-run it.

### D3 — selector isolation (19 confirmed leakers, reproduced in this worktree)

Reproduction command (run from `<worktree>/emulador`), 19 hits at baseline:

```
for f in $(grep -rl "overrideSelector" src --include="*.spec.ts" | sort); do \
  grep -q "resetSelectors" "$f" || echo "$f"; done
```

Rule confirmed still desired: `docs/engineering/testing.md:24-27` (mandatory
`store.resetSelectors()` in `afterEach`; the leaked-`selectFloatingPnl` incident,
120.5 instead of 50). All edits are ADDITIVE hooks — no assertion in any
pre-existing spec was modified (STOP rule, `testing.md:47`).

FIXED (9):
- `src/app/auth/auth.guard.spec.ts`
- `src/app/components/playback-controller/playback-controller.component.spec.ts`
- `src/app/components/workspace/workspace-viewport.component.spec.ts` (2 describes)
- `src/app/components/workspace/workspace-viewport.lazy-creation.spec.ts`
- `src/app/state/market/market.effects.spec.ts`
- `src/app/state/replay/replay.effects.base.spec.ts`
- `src/app/state/selectors.spec.ts` (store was `const` inside one `it()`; a
  describe-scoped nullable handle + `afterEach` releases it)
- `src/app/state/trading/trading.effects.base.spec.ts`
- `src/app/state/trading/trading.effects.spec.ts`

REMAINING (10):
- `src/app/pages/auth/auth-page.component.spec.ts`
- `src/app/pages/emulador/emulador-page.component.spec.ts` (2 describes)
- `src/app/pages/reflection/reflection-cabin-page.component.spec.ts`
- `src/app/pages/sesiones/sesiones-page-journal-buttons.spec.ts`
- `src/app/pages/sesiones/sesiones-page.component.spec.ts`
- `src/app/services/journal-data.service.spec.ts`
- `src/app/state/replay/replay.effects.spec.ts`
- `src/app/state/settings/settings.effects.spec.ts`
- `src/app/state/sync/session-sync.effects.spec.ts`
- `src/app/state/workspaces/workspaces.effects.new-session-costs.spec.ts`

### D4 — CI trigger gap (verified personally)

`.github/workflows/ci.yml:3-7` is the ONLY workflow file in the repo
(`ls .github/workflows/` → `ci.yml` alone):

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```

`pull_request.branches` filters on the PR's BASE branch, so no PR targeting
`develop` — where every RFC lands — runs any gate. The `deploy` job is
independently guarded by `github.event_name == 'push' && github.ref ==
'refs/heads/main'`, so widening `pull_request` cannot cause a deploy.

Divergence to flag (not yet acted on): the `frontend` job runs `npm run lint`,
`npm run format:check`, `npx ng test`, `npm run build` — **no tsc at all** —
while `CLAUDE.md` names four gates (tsc app, tsc spec, ng test, lint) and does
not name `format:check`.

### D1 — TradePanel (design notes, no code yet)

`src/app/components/trade-panel/trade-panel.component.ts` (283 lines) +
`.html` (323 lines), zero specs. Store surface is two selectors
(`selectTradePanelView`, `selectPlacementTime`) and dispatched
`TradingActions` / `ReplayActions`. DOM boundary is real and drivable:
number `<input>`s with `(input)`/`(change)`, `.side` buttons, `.submit` button,
`ui-dropdown` (`.dd-trigger` → `.dd-option`), `app-risk-slider`
(range + numeric inputs), per-position/per-order edit inputs with
`aria-label`s, `.be-btn`, `.close-btn`.

## DEAD ENDS

- Nothing chased and discarded yet.

## NEXT STEPS (ordered)

1. Finish the 10 remaining selector-reset fixes; commit.
2. Write `trade-panel.component.spec.ts` as a DOM-crossing spec; commit.
3. Make the CI change (`pull_request: branches: [main, develop]`), decide on the
   tsc gates only with local evidence they pass; commit.
4. Run all four gates RAW from `<worktree>/emulador`, record exit codes.
5. Write `VERIFICATION_INTEGRITY_REPORT.md`; commit.

## RESUME BRIEF

You are **Agent D — Verification Integrity**. Work ONLY in
`C:\Users\78701\Desktop\trading-emulator-verification` (branch
`agent/verification-integrity`, based on `develop` @ `a2ca53b`). Never modify
`C:\Users\78701\Desktop\trading-emulator` (canonical) or any sibling
`trading-emulator-*` worktree — you may read them. Never checkout/merge/rebase
`develop`, never force-push, never push. Commit only to your own branch with
conventional messages and pathspec `git add <paths>` (never `git add -A`).

`npm ci` has ALREADY been run in `<worktree>/emulador` (exit 0) — do not repeat it.

Mission: improve verification at the boundaries a prior audit identified,
WITHOUT refactoring production code.

- **D1** Add meaningful interaction tests for
  `emulador/src/app/components/trade-panel/trade-panel.component.ts` (283 lines,
  ZERO specs — order entry, the money-moving surface). Drive them through the
  REAL UI boundary: render the component, dispatch real DOM events, assert
  observable/store consequences. Prioritise user-entered trade parameters,
  order submission, invalid state, stop/take-profit interactions, and the
  financially meaningful store effects. Do NOT test implementation details to
  inflate coverage. House exemplar to imitate: `src/app/lotaje/lotaje-view.spec.ts`.
- **D2** Do NOT adopt "DOM test percentage" as a KPI. Principle: every changed
  user-facing or cross-module boundary should have at least one test that
  actually crosses it. Pure functions/view models may stay pure unit tests.
  51% of spec files use no hooks and that is NOT a problem — no `beforeEach` crusade.
- **D3** Repair the confirmed leaking specs (list above). The rule at
  `docs/engineering/testing.md:24-27` was re-read and still expresses desired
  behaviour. Consider a lint rule ONLY after the backlog is clear; no new runtime
  deps (`eslint`/`typescript-eslint` are already devDeps).
- **D4** Smallest safe change so gates run on PRs targeting `develop`. Preserve
  every existing gate. Flag the tsc/format:check divergence; align only if safe
  and obviously correct. Branch protection is a HUMAN dashboard action — say so,
  do not attempt it.
- **D5** No production-logic refactor unless a boundary test genuinely cannot be
  written against the current public contract; if it becomes necessary, document
  why FIRST in the report, keep it minimal, call it out prominently.
- **D6** Run all four gates RAW from `<worktree>/emulador` and report exit codes:
  `npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`,
  `npm run lint`, `npx ng test --watch=false`. NEVER pipe a gate through
  `| tail`/`| head` (it hides the non-zero exit). NEVER run bare `npx vitest run`
  (no TestBed env; always fails).

Deliverable: `VERIFICATION_INTEGRITY_REPORT.md` at the worktree root — tests
added and the historical gap each covers, selector fixes, CI change, exact
commands with raw exit codes, before/after verification, files changed, commit
SHAs, and anything deliberately NOT done and why. Keep this `PROGRESS.md`
updated and committed after every meaningful unit.
