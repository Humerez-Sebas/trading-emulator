# Steering — always-on context

> Injected verbatim into every prompt by `.claude/hooks/steering_context.py`
> (the `UserPromptSubmit` hook). Keep it SHORT — every line spends context budget.
> This is the single place to tune persistent steering without repeating yourself
> in chat. Full detail lives in `CLAUDE.md` and `docs/engineering/`.

- Before non-trivial work: read `docs/engineering/PHILOSOPHY.md`, then load ONLY the
  domain doc the task needs (CLAUDE.md "Context loading" table). Before building on the
  current branch, confirm it is not behind `origin` (see the drift line above) and
  confirm any referenced PR's real state (merged/open) before assuming it.
- Invariants (never break): ChartEngine never imports Angular/NgRx; the engine core is
  closed -> new behavior is a new Capability under `domain/chart/capabilities/`;
  Market-Data vs User-Workspace domains stay separated; session payloads are candle-free
  (`assertNoCandles`); the D8 factory-selector ban holds; no `*.spec-util.ts` or vitest
  imports in app code.
- Checkpoint discipline (sessions hit usage limits mid-task): after each approved unit of
  work, commit it with a task-scoped conventional message and update the progress ledger,
  so an interrupted session resumes from git state, not memory. Use pathspec
  `git add <paths>` — never `git add -A`; never sweep unrelated dirty files into a commit.
- "Done" = all four gates green with FRESH, RAW output, run from `emulador/`:
  `tsc -p tsconfig.app.json`, `tsc -p tsconfig.spec.json`, `ng test --watch=false`,
  `npm run lint` (0 problems). Never pipe a gate through `| tail`/`| head` (it hides the
  non-zero exit code); never claim a gate passed without showing its output.
- Protected — never delete or overwrite without explicit approval: `pipeline/**`
  (especially `fill_r2.py`), the `.claude/` hooks / `settings.json` / `steering.md`,
  and `CLAUDE.md`.
- Git: branch from `origin/*`; RFC & `feature/*` work -> develop, product/fix -> main;
  never PR an individual RFC to main. Language: user-facing docs & UI copy in Spanish;
  agent artifacts in English.
