# Verification Integrity — Agent D report

Branch `agent/verification-integrity`, worktree
`C:\Users\78701\Desktop\trading-emulator-verification`, baseline `develop` @ `a2ca53b`.
Nothing was pushed. No PR was opened.

## The problem this work addresses

This repo has twice shipped High-severity input defects past a fully green suite
(the `/calculadora` bugs; RFC-020 M-1). Both share one mechanism: the tests drove
component state with `.set()` and never crossed the DOM, so an unbound input, a
wrong event name, or a control that never rendered at all stayed invisible to
every gate. A separate mechanism — forced NgRx selector results leaking across
spec files — makes green runs unreliable in the other direction. And no gate ran
at all on PRs into `develop`, which is where every RFC lands.

The point of this branch is that a test which cannot fail when the code breaks is
worse than no test, because it converts an absence of coverage into a false
assurance. So every claim below is backed by a run, and the central new test file
is backed by deliberate mutation.

## Commits

| SHA | What |
|---|---|
| `b19939f` | test(isolation): release forced selectors in 9 leaking specs (batch 1/2) |
| `1f4e708` | test(isolation): release forced selectors in the last 10 leaking specs (batch 2/2) |
| `446d671` | test(trade-panel): cover order entry through the real DOM boundary |
| `2f1074c` | ci: run the gates on pull requests targeting develop |
| `bb7e5f8` | chore(lint): fail the build when a spec forces a selector without releasing it |

## 1. TradePanel — 36 tests across the real DOM boundary (`446d671`)

`emulador/src/app/components/trade-panel/trade-panel.component.ts` is 283 lines of
order entry — sizing, submission, position/order editing, session close, i.e. the
money-moving surface of the application — and had **zero specs of any kind**.

`emulador/src/app/components/trade-panel/trade-panel.component.spec.ts` (547 lines,
36 tests) now covers it. Following the house exemplar
`emulador/src/app/lotaje/lotaje-view.spec.ts`, every test crosses the real boundary:

- the component renders with its **real** children — `ui-dropdown`,
  `app-risk-slider`, `app-account-card`, `ui-empty-state`, the tooltip and button
  directives. None are stubbed, because a stub cannot prove the template is wired
  to the real thing;
- values arrive as `input.value = …` followed by a dispatched `input` / `change`
  event — **never** by writing a component signal;
- clicks are real `HTMLElement.click()`, including the two-step dropdown
  (`.dd-trigger` → `.dd-option`) and the per-position `.be-btn` / `.close-btn`;
- assertions land on what a user can observe (rendered lot figure, validation
  hint, `disabled` state, cleared fields) and on the store actions dispatched,
  which are what actually move money.

Sizing expectations are computed by calling the real `lotsForRisk` kernel from
`emulador/src/app/domain/sizing/position-sizing.ts` with the same inputs, never by
hand-derived constants — and one test asserts `expect(expected).toBeGreaterThan(0)`
first, so a `0 === 0` comparison cannot pass as coverage.

Coverage by historical gap:

| Area | Gap it closes |
|---|---|
| Lot sizing from a typed SL, risk-slider re-sizing (numeric + range inputs), slider cap | Sizing was reachable only through the DOM and wholly untested |
| Market submission: `openMarket` payload, empty-TP → `tp: null`, field clearing, side from the `Vender` toggle | Order submission — the money-moving action — had no test |
| Invalid states: missing SL, non-positive SL, buy SL above entry, sell SL below entry, buy TP below entry, no price loaded | Validation existed but nothing proved the submit button was actually disabled |
| Pending orders: entry field revealed and prefilled on `Limit`, D14.B placement-time stamping, sizing off typed entry, buy-limit/buy-stop side checks | D14.B reveal-horizon semantics had no boundary test |
| Open positions: render, close at store price/time, breakeven, inline SL edit, TP removal, rejection of a non-positive SL | Inline editing dispatches money-moving actions and was untested |
| Pending cards: badge label from type+side, cancel, `contractSize` carried on entry edit, TP removal | `contractSize` must travel with `modifyOrder` for the reducer to re-size |
| Session controls: pause-before-close **ordering**, disabled end button with no price, summary gated on history, empty state | Pausing after closing would settle at a price the replay had passed |
| Initial balance: applied; non-positive ignored | — |

### Fail-when-broken evidence (the part that matters)

Each mutation was applied to the working tree, the suite was run, then the file was
reverted with `git checkout --`. **No mutation is committed**; `git diff a2ca53b..HEAD`
touches zero production source files (verified below).

| # | Mutation | Result |
|---|---|---|
| 1 | SL input `(input)="onInput('sl', $event)"` → `(change)` in the template | **15 tests red** |
| 2 | `placeOrder` `time: this.placementTime()` → `time: v.time` | **1 test red** — "stamps a placed order at the reveal horizon, not the raw cursor time (D14.B)" |
| 3 | Removed the `buy && sl >= entry` validation guard | **1 test red** — "refuses a buy whose stop sits above the entry" |
| 4 | `breakeven(p.id, p.entryPrice)` → `breakeven(p.id, p.sl)` | **1 test red** — "moves the stop to the entry price on breakeven" |
| 5 | Dropped the `sl > 0` guard in `onPositionField` | **1 test red** — "ignores a non-positive stop edit" |

Mutation 1 is the decisive one: it is *exactly* the historical defect class. A
`.set()`-driven spec would still have passed it, because the component method is
unchanged and only the event binding moved. Fifteen tests caught it.

Mutation 5 matters for a different reason: it kills a **negative** assertion
(`expect(dispatch).not.toHaveBeenCalled()`). Negative assertions are the ones that
pass vacuously when the test never reaches the code, so this proves that one is
load-bearing.

Restoration verified: `git diff` against `HEAD` empty, suite back to 36/36 green.

Two defects were found and fixed **in the spec** while proving it runs — the file
had never been executed before this session. Both were real type errors that would
have failed CI: an implicit `any` from annotating the dispatch spy as
`ReturnType<typeof vi.spyOn>` (which erases argument types), and an unsound cast
of `Store.dispatch`'s union parameter type. The second was fixed by asserting the
whole ordered call list against real action objects, which is a stronger assertion
than the string-type comparison it replaced.

## 2. Selector isolation — 19 leaking spec files (`b19939f`, `1f4e708`)

The law is `docs/engineering/testing.md` §"isolate:false discipline" #1: the Angular
unit-test builder runs vitest with `isolate: false`, so `MockStore.overrideSelector()`
writes the forced result onto the module-level memoized selector, which
`TestBed.resetTestingModule()` does **not** undo. A file that forces a selector and
never calls `store.resetSelectors()` poisons every later spec file in the same
worker. The recorded incident: a leaked `selectFloatingPnl` made an unrelated
assertion see 120.5 instead of 50.

Reproduction at baseline, from `emulador/` — 19 hits:

```sh
for f in $(grep -rl "overrideSelector" src --include="*.spec.ts" | sort); do \
  grep -q "resetSelectors" "$f" || echo "$f"; done
```

All 19 are fixed. Re-running the command now returns nothing, against 49 spec files
that use `overrideSelector`.

The edits are **purely additive hooks**. Verified rather than assumed: the only
deleted lines across both commits are nine `import … from 'vitest'` lines being
replaced by the same import plus `afterEach`. No assertion in any pre-existing spec
was modified (the STOP rule at `docs/engineering/testing.md:47`).

Files: `auth.guard`, `playback-controller.component`, `workspace-viewport.component`
(2 describes), `workspace-viewport.lazy-creation`, `market.effects`,
`replay.effects.base`, `selectors`, `trading.effects.base`, `trading.effects`,
`auth-page.component`, `emulador-page.component` (2 describes),
`reflection-cabin-page.component`, `sesiones-page-journal-buttons`,
`sesiones-page.component`, `journal-data.service`, `replay.effects`,
`settings.effects`, `session-sync.effects`, `workspaces.effects.new-session-costs`.

## 3. Lint rule closing the backlog for good (`bb7e5f8`)

With the backlog at zero, the law is now enforced instead of merely documented:
`emulador/eslint-rules/require-reset-selectors.js`, registered in
`emulador/eslint.config.js` for `**/*.spec.ts` only. Plain ESLint AST — **no new
dependency** (`eslint` / `typescript-eslint` are already devDeps).

It encodes a **current** law, not stale prose, and it is deliberately coarse: it
asserts a reset *exists* in the file, not that it sits in an `afterEach` or covers
every `describe`. Scope analysis would add genuine false-positive risk (a reset
reached through a shared helper is legitimate) for no gain — all 19 offenders had
no reset at all. The rule header states that limit explicitly, so a passing lint is
never mistaken for more than it proves.

Proved it fires rather than passing vacuously:

| Step | Command | Exit |
|---|---|---|
| Backlog clear | `npm run lint` | `0` — "All files pass linting" |
| Reset removed from `src/app/auth/auth.guard.spec.ts` | `npm run lint` | **`1`** — rule reported at the `overrideSelector` call, line 40 |
| Reverted | `npm run lint` | `0` |

## 4. CI — gates now run on PRs into `develop` (`2f1074c`)

`.github/workflows/ci.yml` is the only workflow file in the repo. Its trigger was:

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```

`pull_request.branches` filters on the PR's **base** branch. Every RFC and feature
branch lands in `develop` first, so **no PR into `develop` ever ran a single gate** —
they were validated only by whatever their author chose to run locally. Change made,
and nothing else:

```yaml
  pull_request:
    branches: [main, develop]
```

**Deploy safety, re-verified personally before editing.** The `deploy` job is guarded
by `if: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}`
(`ci.yml:85`). Anything arriving through the widened trigger has
`github.event_name == 'pull_request'`, failing the first condition; and `push.branches`
was deliberately left as `[main]`, so a push to `develop` does not start the workflow
at all. Both conditions independently close the deploy path. The committed diff is
the trigger line plus a comment — every job, step, and gate is otherwise byte-identical.

### Flagged, NOT changed — the tsc / format:check divergence

The `frontend` job runs `npm run lint`, `npm run format:check`, `npx ng test`, and
`npm run build` — **no `tsc` at all** — while `CLAUDE.md` names four mandatory gates
(tsc app, tsc spec, ng test, lint) and never mentions `format:check`. Neither
document matches the other in either direction.

Left alone on purpose. Two observations for whoever decides:

1. The gap is narrower than it looks. The unit-test builder type-checks spec code
   through the Angular compiler — that is how the new spec's implicit-`any` error
   surfaced in this session — and `npm run build` type-checks app code. A pure tsc
   regression that both miss is possible but not the common case.
2. Which document is authoritative is a judgement call, not a mechanical fix. It
   could be resolved by adding two tsc steps to CI, or by amending `CLAUDE.md` to
   name `format:check` and drop tsc, or both. That is an **owner decision**, and
   silently picking a direction would be exactly the kind of undocumented drift
   this branch exists to reduce.

`format:check` also only covers `src/**/*.{ts,html,css}`, so the new
`eslint-rules/*.js` and `eslint.config.js` are outside it. Both are prettier-clean
anyway (verified, exit 0).

### Branch protection — HUMAN dashboard action, not attempted

Widening the trigger makes the gates *run* on PRs into `develop`; it does not make
them *required*. Until branch protection is configured, a red run can still be
merged. Neither `main` nor `develop` is protected today. Branch protection has no
MCP or CLI path in this setup and is an explicit human dashboard task — flagged
here, deliberately not attempted.

## 5. Verification gates — raw, from `emulador/`

Run individually — no gate was piped through `| tail`, `| head`, or anything else
that could swallow a non-zero exit. `npx vitest run` was never used (no TestBed env
— it always fails).

All four were run twice: once at `2f1074c`, then again in full after the last code
commit (`bb7e5f8`), with identical results both times. The only change made after
that second run is this report and `PROGRESS.md` — markdown, which no gate reads.

| Gate | Command | Exit |
|---|---|---|
| 1 | `npx tsc -p tsconfig.app.json --noEmit` | **0** |
| 2 | `npx tsc -p tsconfig.spec.json --noEmit` | **0** |
| 3 | `npm run lint` | **0** — "All files pass linting" |
| 4 | `npx ng test --watch=false` | **0** — **183 files, 2409 tests, all passed** |

The second full pass confirms the lint-rule commit (`bb7e5f8`) left every gate green,
including the full suite.

Before / after:

| | Test files | Tests |
|---|---|---|
| Baseline `a2ca53b` | 182 | 2373 |
| `bb7e5f8` | 183 | 2409 |

`+1 file / +36 tests`, matching the new spec exactly. No pre-existing test was
removed, skipped, or weakened.

## 6. Production code — untouched (D5)

No production-logic refactor was needed; every boundary test was writable against
the component's current public contract. Verified, not asserted:

```sh
git diff --name-only a2ca53b..HEAD -- 'emulador/src/**' | grep -v "\.spec\.ts$"
# (empty)
```

Every changed file under `emulador/src/` is a `*.spec.ts`. The remaining changes are
`.github/workflows/ci.yml`, `emulador/eslint.config.js`,
`emulador/eslint-rules/require-reset-selectors.js`, `PROGRESS.md`, and this report.

## 7. Deliberately NOT done

- **Branch protection** — human dashboard action (see §4). Neither `main` nor
  `develop` is protected; the gates now run on `develop` PRs but are not required.
- **The tsc / `format:check` divergence** — flagged with evidence, not resolved.
  Owner decision (see §4).
- **A "DOM test percentage" KPI** — explicitly not adopted. The principle held here
  is narrower and more useful: every changed user-facing or cross-module boundary
  should have at least one test that actually crosses it. Pure functions and view
  models are legitimately served by pure unit tests.
- **A `beforeEach` crusade** — ~51% of spec files use no hooks, and that is not a
  defect. Only the 19 files with a demonstrated cross-file leak were touched.
- **Widening `push.branches` to include `develop`** — out of scope for "smallest
  safe change". It would be safe (the deploy guard also requires
  `refs/heads/main`) and would give post-merge validation on `develop`; worth
  considering separately.
- **A stricter selector-reset lint rule** (requiring `afterEach` containment, or
  per-`describe` coverage) — rejected as false-positive-prone for no gain against
  the observed failure. See §3.
- **Nothing was pushed and no PR was opened** — per the branch's constraints.

## 8. Residual risk worth naming

The 36 new tests run in jsdom, which has **no layout engine**. They prove event
wiring, rendered text, and dispatched actions; they cannot prove anything about
CSS, overflow, or visual layout. A control that is present and correctly wired but
invisible or unclickable in a real browser would still pass. That limit is
inherent to the unit suite, and it is the same limit recorded for `/calculadora`.
