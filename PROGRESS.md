# Agent D — Verification Integrity · PROGRESS

Worktree `C:\Users\78701\Desktop\trading-emulator-verification`, branch
`agent/verification-integrity`, baseline `develop` @ `a2ca53b`.

## STATUS

**COMPLETE.** All four gates green at `bb7e5f8`. Nothing pushed, no PR opened.

Full write-up: `VERIFICATION_INTEGRITY_REPORT.md` at this worktree root.

| Item | State |
|---|---|
| D1 TradePanel spec | **DONE** — `446d671`, 36 DOM-crossing tests, 5 mutations proved they fail when the component breaks |
| D2 Testing philosophy | Honoured as a constraint — no DOM-% KPI, no `beforeEach` crusade |
| D3 Selector isolation | **DONE** — `b19939f` + `1f4e708`, all 19 leaking files; reproduction now returns zero |
| D3+ Lint rule | **DONE** — `bb7e5f8`, enforces the law now that the backlog is clear; proved it fires |
| D4 CI trigger | **DONE** — `2f1074c`, PRs into `develop` now run the gates; deploy path re-verified closed |
| D5 No production refactor | **HELD** — zero production source files changed, verified by diff |
| D6 Gates | **DONE** — all four exit 0; 183 files / 2409 tests |

## COMMITS

| SHA | What |
|---|---|
| `b19939f` | test(isolation): release forced selectors in 9 leaking specs (batch 1/2) |
| `1f4e708` | test(isolation): release forced selectors in the last 10 leaking specs (batch 2/2) |
| `446d671` | test(trade-panel): cover order entry through the real DOM boundary |
| `2f1074c` | ci: run the gates on pull requests targeting develop |
| `bb7e5f8` | chore(lint): fail the build when a spec forces a selector without releasing it |

## GATE EVIDENCE (raw, from `<worktree>/emulador`, no pipes)

| Gate | Command | Exit |
|---|---|---|
| 1 | `npx tsc -p tsconfig.app.json --noEmit` | 0 |
| 2 | `npx tsc -p tsconfig.spec.json --noEmit` | 0 |
| 3 | `npm run lint` | 0 |
| 4 | `npx ng test --watch=false` | 0 — 183 files / 2409 tests |

Baseline was 182 files / 2373 tests, so `+1 file / +36 tests` — exactly the new
spec. No pre-existing test removed, skipped, or weakened.

All four were run twice — at `2f1074c` and again in full after the last code commit
(`bb7e5f8`) — with identical results. Only markdown changed afterwards.

## KEY EVIDENCE

- **The TradePanel spec was verified by mutation, not by a green run.** Five
  mutations, each applied to the working tree, run, then reverted:
  SL `(input)`→`(change)` (**15 red** — the exact historical defect class, which a
  `.set()`-driven test would have missed), `placementTime`→`v.time` (1 red, D14.B),
  buy-SL guard removed (1 red), `breakeven(entryPrice)`→`sl` (1 red), `sl > 0` guard
  dropped (1 red — kills a *negative* assertion, proving it is not vacuous).
- **The spec had never been executed before this session** (untracked, 538 lines) and
  contained two real type errors that would have failed CI. Both fixed; the fix to
  the second strengthened the assertion (whole ordered call list vs. type strings).
- **D3 edits are purely additive**, verified: the only deletions across both commits
  are nine `import … from 'vitest'` lines regaining `afterEach`.
- **Deploy path re-verified personally before touching CI**: `deploy` needs
  `github.event_name == 'push' && github.ref == 'refs/heads/main'` (`ci.yml:85`), and
  `push.branches` stays `[main]` — both conditions independently close it.
- **Zero production source files touched**:
  `git diff --name-only a2ca53b..HEAD -- 'emulador/src/**' | grep -v "\.spec\.ts$"`
  is empty.

## OPEN — needs the owner

1. **Branch protection** (`main` and `develop`) — human dashboard action, no MCP/CLI
   path, deliberately not attempted. Gates now *run* on `develop` PRs but are not
   *required*, so a red run is still mergeable.
2. **tsc / `format:check` divergence** — the CI `frontend` job runs lint,
   format:check, ng test and build but **no tsc**, while `CLAUDE.md` names four gates
   (tsc app, tsc spec, ng test, lint) and never mentions `format:check`. Flagged, not
   silently resolved: which document is authoritative is a judgement call. See
   `VERIFICATION_INTEGRITY_REPORT.md` §4.
3. **This branch is unpushed** and has no PR, per its constraints.

## DEAD ENDS

- Parsing `ci.yml` with a `yaml` module to verify structure — not installed, and
  adding a dep was not warranted. Verified by reading the diff instead, which is the
  stronger check anyway (it shows the trigger block is the only change).
- A stricter selector-reset lint rule (requiring `afterEach` containment or
  per-`describe` coverage) — rejected: real false-positive risk, no gain against the
  observed failure, since all 19 offenders had no reset at all.

## RESUME BRIEF

You are **Agent D — Verification Integrity**. Work ONLY in
`C:\Users\78701\Desktop\trading-emulator-verification` (branch
`agent/verification-integrity`, based on `develop` @ `a2ca53b`). Never modify
`C:\Users\78701\Desktop\trading-emulator` (canonical) or any sibling
`trading-emulator-*` worktree — you may read them. Never checkout/merge/rebase
`develop`, never force-push, **never push**. Commit only to your own branch with
conventional messages and pathspec `git add <paths>` (never `git add -A`).

`npm ci` has ALREADY been run in `<worktree>/emulador` (exit 0) — do not repeat it
unless `node_modules` is genuinely absent.

**The assigned mission is COMPLETE** (see STATUS). All four gates pass at `bb7e5f8`:
`npx tsc -p tsconfig.app.json --noEmit`, `npx tsc -p tsconfig.spec.json --noEmit`,
`npm run lint`, `npx ng test --watch=false` — 183 files / 2409 tests. Run gates RAW
from `<worktree>/emulador`; never pipe one through `| tail`/`| head` (it hides the
non-zero exit), and never run bare `npx vitest run` (no TestBed env; always fails).

Nothing is required to finish the mission. What remains is owner-gated: branch
protection on `main`/`develop` (human dashboard action), the tsc/`format:check`
divergence between `ci.yml` and `CLAUDE.md`, and the decision to push/open a PR.

Guiding principle if the work is extended: a test that cannot fail when the code
breaks is worse than no test. Prove new boundary tests by mutation — break the
component in the working tree, watch the test go red, revert, watch it go green —
and record that evidence. Do not adopt a "DOM test percentage" KPI; the principle is
that every changed user-facing or cross-module boundary gets at least one test that
actually crosses it, while pure functions and view models may stay pure unit tests.
