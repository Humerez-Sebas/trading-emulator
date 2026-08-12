---
description: Run all verification gates for emulador/ and report fresh evidence
---

Run the repository's verification gates and report the evidence. Never claim a gate
passed without its fresh output (docs/engineering/PHILOSOPHY.md §1.1).

From `emulador/`, run in this order:

1. `npx tsc -p tsconfig.app.json --noEmit`
2. `npx tsc -p tsconfig.spec.json --noEmit`
3. `npx ng test --watch=false` — record the exact test count and file count.
   NEVER use bare `npx vitest run` (it always fails: no TestBed environment).
4. `npm run lint` — must be 0 problems.
5. `npm run format:check`
6. If finalizing a branch (pre-PR/audit): `npm run build` — flag any NEW chunk types
   (vitest/expect-type sentinels). The initial-bundle budget WARNING is tolerated but NOT
   structural: measured 651.60 kB at `a2ca53b`, dominated by an eager
   `@supabase/supabase-js` (219.12 kB), not by Arrow/parquet (both lazy). Report the
   actual number; a bigger one is a finding, not a known-accepted constant.
7. If `package.json`/lockfile changed on this branch: `npm ci --dry-run` — on failure,
   see the lockfile recovery procedure in docs/engineering/testing.md.

If the branch touches `pipeline/`: `cd pipeline && py -m pytest -q && ruff check .
&& ruff format --check .` — use `py`, NOT `python`: on this machine `python` resolves to
the Microsoft Store stub, which prints an install ad and exits 49 without running a test.

Report: a table of gate → result → key numbers (test count progression vs the ledger if
an SDD run is active), plus verbatim failure output for anything red. Do not fix
failures as part of this command — report them.
