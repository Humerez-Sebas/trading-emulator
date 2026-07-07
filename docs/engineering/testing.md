# Testing & Verification Playbook

Applies PHILOSOPHY §1 (evidence precedes assertion) and §4 (debugging loop). This is the
operational survival kit for the `emulador/` test suite; every rule here was paid for with
a real incident.

## The runner: hard facts

- **Only `ng test` can run this suite.** The `@angular/build:unit-test` builder bootstraps
  the TestBed environment; bare `npx vitest run <spec>` ALWAYS fails with
  `TestBed.initTestEnvironment` errors. Do not "fix" specs that fail under bare vitest,
  and do not add vitest bootstrap files to work around it.
- The builder runs vitest with **`isolate: false`** and `sequence.setupFiles: 'list'`
  (hardcoded in the builder, not in any committed config). All spec files in a worker
  share ONE module registry — any module-level state leaks across files, and failures
  become file-order/cache dependent. Low-CPU CI packs more files per worker → more leakage.
- To reproduce order/cache-dependent flakiness deterministically: temp
  `vitest-base.config.ts` with a single fork + custom sequencer, run via
  `ng test --runner-config` (the builder defaults `runnerConfig:false`), and delete
  `node_modules/.vite` to force the optimizeDeps race.

## isolate:false discipline (mandatory patterns)

1. **Any spec using `overrideSelector` MUST call `store.resetSelectors()` in
   `afterEach`.** Forced selector results live on the module-level NgRx singleton and
   poison later spec files (incident: a leaked `selectFloatingPnl` override made
   `selectors.spec` read 120.5 instead of 50, intermittently).
2. **Mocking a Vite-optimized dep (e.g. `lightweight-charts`) requires:** `vi.hoisted`
   for the mock, then `vi.resetModules()` + dynamic `import()` of the SUT in
   `beforeEach`. A module-scope SUT import races vitest's optimizeDeps step under a cold
   `.vite` cache and the REAL module intermittently wins over `vi.mock`.
3. Module-level state in app code (singletons, caches) is a flakiness liability — reset
   hooks or per-instance state are part of the design, not test afterthoughts.

## Test taxonomy (what kind of test to write)

- **Hard TDD** for pure cores: payload mapping, migrations, fill engine, layout
  invariants. Red → green → refactor, no exceptions.
- **Proof specs** for invariants that aren't features: performance shape
  (`*.eight-panel-profile.spec.ts`), shared-cache identity, update-gating. They encode a
  measured claim so regressions are mechanical to catch.
- **Round-trip tests** for every migration (V1→V2→persist→parse→restore).
- **Persistence e2e through real reducers**: fold the real action sequence through real
  reducers, then the full `toPayload → parse → fromPayload` chain (RFC-013 Task 5 pattern).
- **RLS verification without a second user**: simulate two JWT `sub` claims under role
  `authenticated` in SQL — see `supabase/verify_session_rls.sql`.
- **STOP rule:** pre-existing specs are authority. Never modify one to accommodate your
  change; if it looks wrong, escalate it as a finding.

## Prod-bundle contamination probe

Importing anything from a `*.spec-util.ts` (or any file importing vitest) in app code
ships vitest into the production bundle while tsc and all tests stay green.

- **Detection:** temp-import the suspect from `app.config.ts`, run `npm run build`, look
  for expect-type/magic-string chunks in the output.
- **Prevention:** keep a pure production twin (e.g. `state/layout/layout-invariants.ts`
  vs its spec-util) and import only the twin from app code.

## Lockfile integrity (npm 11.x)

`npm install <pkg>` can silently prune `optionalDependencies` entries from
`package-lock.json` (seen: `@emnapi/core`, `@emnapi/runtime`). Local build/test stay
green (they use installed `node_modules`); CI `npm ci` fails with EUSAGE "Missing: … from
lock file".

- **Gate:** after ANY install, run `npm ci --dry-run` in `emulador/` before committing
  the lockfile. Green dry-run ⇒ CI passes.
- **Recovery:** restore the pruned entries **verbatim from origin/main**
  (`git show origin/main:emulador/package-lock.json`). Re-running `npm install`
  re-prunes — never "regenerate to fix".

## Evidence discipline

- Record test-count progression per task in the ledger (e.g. 943→951→954→980) — auditors
  verify the arithmetic; it catches silently skipped or deleted specs.
- A claim of "green" is only valid with fresh output from all gates (see CLAUDE.md).
  The final auditor re-runs every gate personally; implementer reports are claims.
