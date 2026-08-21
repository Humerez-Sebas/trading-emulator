# Wave 2 Closeout - Cold Resume Prompt

## Mission

Resume the Engineering Evolution Wave 2 closeout. This is not a new wave, another audit, or
permission for broad refactoring. Finish only the remaining bounded Track A findings, then the
remaining bounded Track C findings, verify each independently, and repair central synthesis.
Never mutate `develop`; never push.

## Git State At Pause

- Canonical repo: `C:\Users\78701\Desktop\trading-emulator`
- `develop == origin/develop == a2ca53b44f678dd285cd90f31ee644696664f32a`
- Specialist base: `894d72be95f8ad4b8d63e629114e486e825b13d7`
- Integration: `C:\Users\78701\Desktop\trading-emulator-wave2-base`, branch
  `agent/evolution-wave2-base`; this pause commit follows `cbe52fc`
- Track A: `C:\Users\78701\Desktop\trading-emulator-session-sovereignty`, branch
  `agent/session-sovereignty-v2`, head `fefea658a9cd169b4d93654d21895c22a43d3190`, clean
- Track C: `C:\Users\78701\Desktop\trading-emulator-engine-boundary`, branch
  `agent/engine-boundary-restoration`, head
  `66211cc4828f42ceea4b9289024bfab743ec7fcd`, clean

Run Git reconciliation first. Git wins over every progress document. If `develop` moved or A/C
is unexpectedly dirty, stop and reconcile without resetting or discarding anything.

```powershell
git -C C:\Users\78701\Desktop\trading-emulator fetch
git -C C:\Users\78701\Desktop\trading-emulator rev-parse HEAD
git -C C:\Users\78701\Desktop\trading-emulator rev-parse origin/develop
git -C C:\Users\78701\Desktop\trading-emulator worktree list --porcelain
git -C C:\Users\78701\Desktop\trading-emulator-session-sovereignty status --short
git -C C:\Users\78701\Desktop\trading-emulator-session-sovereignty rev-parse HEAD
git -C C:\Users\78701\Desktop\trading-emulator-engine-boundary status --short
git -C C:\Users\78701\Desktop\trading-emulator-engine-boundary rev-parse HEAD
git -C C:\Users\78701\Desktop\trading-emulator-wave2-base status --short
git -C C:\Users\78701\Desktop\trading-emulator-wave2-base rev-parse HEAD
```

## Read First

1. `docs/engineering/PHILOSOPHY.md`
2. `.superpowers/evolution-wave2/WAVE2-STATE.md`
3. `.superpowers/evolution-wave2/TRACK-A-CLOSEOUT-BRIEF.md`
4. `.superpowers/evolution-wave2/TRACK-C-CLOSEOUT-BRIEF.md`
5. Track A/C specialist `PROGRESS.md` files
6. Relevant session-sync, chart-engine, testing, and anti-pattern guides

The earlier central `ACCEPTED` text and `WAVE2-SYNTHESIS.md` are stale snapshots.

## Remaining Work

### Track A First

Execute only A-R5 and A-R6 in the 2026-08-20 addendum:

- Archive reconciliation must fail safe if a second live edit arrives during its second
  transaction; restore latest A active and do not dispatch archive.
- Cloud promotion must refuse to start when captured live A is already ahead of durable A.

Use TDD, commit explicit paths, request a fresh independent review of `894d72b..new HEAD`, and
resolve only verified in-scope Critical/High/Medium findings. After zero remain, independently
run all five raw gates from Track A `emulador/` and record exact exits/counts/build size.

### Track C Second

Execute only C-R5 and C-R6 in the 2026-08-20 addendum:

- Close the caller-supplied capability-constructor/static-field raw-series escape.
- Detect exported forbidden type-alias declarations, including namespace-qualified forms.

Use TDD, repeat/restore the constructor and lint mutations, request a fresh independent review
of `894d72b..new HEAD`, and resolve only verified in-scope Critical/High/Medium findings. After
zero remain, independently run all five raw gates.

Five gates, raw and unpiped from each specialist `emulador/`:

```powershell
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npx ng test --watch=false
npm run lint
npm run build
```

### Central Closeout Last

Reconcile exact heads, logs, stats, reports, restored probes, and clean worktrees. Then update
`WAVE2-STATE.md`, replace the stale synthesis notice and evidence, and convert this file into the
concise final index. Commit explicit central paths only. Return the owner-facing table and
dispositions. Do not merge or push specialist branches.

## Completed Tracks - Read Only

- Landing `agent/landing-product-showcase` at `161e9f5`
- B `agent/multisymbol-feasibility` at `3ae5935`, research only
- D `agent/unit-semantics` at `1984e5d`, complete
- E `agent/clock-authority` at `cee6cff`, verified / owner-gated

## Settled - Do Not Reopen

- XAUUSD Lotaje sizing and index `ExecutionCosts.pointSize = 1` are correct.
- Unit differences are vocabulary/transcription, not lot-size arithmetic bugs.
- Storage/pipeline UTC reads are correct; `utc-4` winter behavior is intentional.
- Multi-symbol trading remains the frozen non-goal; view-only secondary panels are allowed.
- `syncTimeRange` logical-index transport and F19-2 remain future defects.

## Safety

- No commit, merge, rebase, or reset on `develop`.
- No push, PR, deployment, Vercel, Supabase, dependency, lockfile, or worktree-pruning change.
- No `git add -A`; use explicit pathspecs.
- Do not rewrite specialist interruption/WIP history.
- No broad refactor, recovery UI, auth listener, or cross-tab framework.
- Do not claim acceptance from progress files or old gates. Reviews and gates must be fresh.

Wave 2 is paused safely and is **not closed**.
