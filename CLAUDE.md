# CLAUDE.md — Repository Operating System (kernel)

Personal-use professional trading emulator (candle-by-candle market replay, manual
backtesting). Angular 21 + NgRx SPA (`emulador/` — app code is under `emulador/src/app`,
NOT repo-root `src/`), Supabase (auth + session sync, RLS), Cloudflare R2 market data
(Parquet → parquet-wasm → IndexedDB), static deploy on Vercel, MT5 data pipeline in
`pipeline/` (Windows). Login is required; there is no guest/offline mode.

**Read `docs/engineering/PHILOSOPHY.md` before non-trivial work.** It defines how
engineering decisions are made here; every rule below is an application of it.

## Context loading — read only what the task needs

| Task type | Read first |
|---|---|
| Any architectural change | `docs/architecture/ROADMAP.md` + the relevant RFC in `docs/architecture/rfcs/` |
| Chart engine / capabilities | `docs/engineering/domain/chart-engine.md` |
| Panels, layout, sync, workspace UI | `docs/engineering/domain/workspace-panels.md` + frozen decisions in `docs/architecture/rfcs/008-012-multi-chart-panel-system-vision.md` |
| Replay, fills, trading state | `docs/engineering/domain/replay-trading.md` |
| Market data, R2, IndexedDB, pipeline | `docs/engineering/domain/data-pipeline.md` |
| Session persistence / Supabase sync | `docs/engineering/domain/session-sync.md` |
| Writing/fixing tests, flaky tests | `docs/engineering/testing.md` |
| Branching, PRs, releases | `docs/engineering/git-workflow.md` |
| Executing an implementation plan | `docs/engineering/sdd-orchestration.md` |
| Performance questions | `docs/engineering/performance.md` |
| Before proposing a fix/refactor | `docs/engineering/anti-patterns.md` |
| Ambiguous engineering choice | `docs/engineering/decision-frameworks.md` |
| UI/visual work | `PRODUCT.md` (brand, anti-references) + `DESIGN.md` (tokens) |
| On-chart trade visualization / TEDS grammar | `docs/architecture/TEDS_GRAMMAR.md` + `docs/architecture/EXPERIENCE_DOMAINS.md` (domain boundaries) |

## Invariants — never break these (see PHILOSOPHY §3.1 for the authority hierarchy)

1. `ChartEngine` (vanilla TS) never imports Angular or NgRx. Communication crosses the
   boundary only as immutable `RenderModel` data + `ChartEventBus` events.
2. The engine core is closed to modification; new behavior = new `Capability`.
3. Market Data domain and User Workspace domain stay strictly separated (no leaks in DTOs).
4. Session payloads are **candle-free** (candles referenced via `requiredDatasets`,
   enforced by `assertNoCandles`). Never embed candles in a session.
5. **Factory-selector ban (D8):** per-panel derivation uses per-instance local
   `ChartModelMapper` memoization. Shared `selectChartView(panelId)`-style factory
   selectors are forbidden (single-slot memoization thrashes at N panels).
6. Frozen non-goals of the 008-012 vision doc (mono-symbol session, single-level grid,
   no floating panels, no web workers, `syncPriceScale` reserved-unimplemented,
   session-scoped drawings) are revocable only by an explicit new RFC.
7. Never import from `*.spec-util.ts` (or anything importing vitest) in app code — it
   ships vitest into the prod bundle while tsc and tests stay green.
8. No new runtime dependencies by default; adding one requires explicit justification
   (see `docs/engineering/decision-frameworks.md`).

## Verification gates — required before claiming any work "done"

Run from `emulador/` (all four; fresh output is the only acceptable evidence):

```
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npx ng test --watch=false        # NEVER bare `npx vitest run` — it always fails (no TestBed env)
npm run lint                      # must be 0 problems (develop is lint-clean)
```

`npm run build` additionally required at branch finalization (watch for NEW chunk types,
e.g. vitest sentinels; the ~609 kB vs 500 kB budget warning is known-accepted,
Arrow/parquet-dominated). Pipeline changes: `cd pipeline && python -m pytest -q && ruff
check . && ruff format --check .`

After ANY `npm install`: run `npm ci --dry-run` before committing the lockfile
(npm 11.x silently prunes optional-dep entries; local stays green, CI fails EUSAGE —
recovery in `docs/engineering/testing.md`).

## Git essentials (full rules: `docs/engineering/git-workflow.md`)

- Architectural/RFC work: `feature/rfc-XXX-*` → PR to **develop**; `develop` → `main`
  only as a whole-block release PR. Product fixes/features: branch off `origin/main` →
  PR to main. Never PR an individual RFC to main.
- Always branch from `origin/*`, never a possibly-stale local branch.
- Commit messages: conventional (`feat(scope):`, `fix:`, `chore(sdd):`); task-scoped
  commits; use pathspec commits (`git commit <files> -m ...`) when parallel actors share
  a working tree. Never commit the user's unrelated dirty files.
- Use the GitHub MCP for PRs/repo settings. Branch protection and Supabase auth admin
  have no MCP/CLI path — they are explicitly human dashboard tasks; say so in plans.

## Conventions

- **Language:** Spanish for user-facing docs (README, RFCs, PHILOSOPHY); English for
  agent artifacts (plans, ledgers, briefs, this file). UI copy is Spanish.
- **Docs hierarchy:** RFCs (`docs/architecture/rfcs/`) for architecture; specs/plans
  (`docs/superpowers/`) for feature work; `docs/engineering/` for permanent engineering
  knowledge. SDD run artifacts live in `.superpowers/sdd/` (only `progress.md` is tracked).
- **Design prototypes** (Next.js playgrounds like `topbar-hud/`) are scratch spaces at
  repo root, never part of the app or its build.
- Decisions worth keeping get an identity (D-numbers) and a written rationale; deviations
  from plans are documented in the ledger, never silent.
