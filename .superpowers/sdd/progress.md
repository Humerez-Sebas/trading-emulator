# SDD Progress Ledger — RFC-011 Workspace Layout Persistence

- **Plan:** `docs/superpowers/plans/2026-07-03-rfc-011-layout-persistence.md`
- **RFC:** `docs/architecture/rfcs/011-workspace-layout-persistence.md`
- **Branch:** `feature/rfc-011-layout-persistence` (off develop @ 8e89142 — RFC-010 PR #29 merged)
- **Base commit:** `8e89142`

## Task Progress

Task 1 (SessionPayloadV2 model + pure migrateV1ToV2/parseSessionPayload): complete (commits df7a49b + fix 3c323c3 + audit fix 60ac114, verified 2026-07-03: 901 tests green, tsc app+spec clean, lint 0; Opus review FAIL->fixed->closed, 0 High/Critical remaining)
  - Step 0 outcome: NO rename of layout-invariants.spec-util.ts — but orchestrator build probe caught a High the plan's tsc sentinel missed: production import of the spec-util pulls `vitest` into the app bundle (probe: "expect-type is not ESM" warning + magic-string-es/index chunks). Fix 3c323c3: new production-safe `layout-invariants.ts` (pure `layoutInvariantViolation`/`isLayoutConsistentPure`, zero vitest); spec-util keeps `assertLayoutConsistent` signature, delegates via expect(violation).toBeNull(); session-migration imports only the pure checker. Probe re-run clean.
  - Opus audit HIGH (closed by 60ac114): 3c323c3 dropped df7a49b's try/catch, so a V2-labeled payload with structurally malformed layout (null/{}/tabs:null/non-array cells/panelIds/null panels — typeof null === 'object' passes isSessionPayloadV2) made parseSessionPayload THROW instead of falling back. Fix: shape guard at top of layoutInvariantViolation returns 'malformed layout state'; regression spec iterates all 6 malformed shapes + asserts non-layout fields survive fallback. Fix applied inline by orchestrator per auditor's own empirically pre-verified prescription (re-audit dispatch skipped as redundant; auditor had already validated the exact guard against all repro shapes).
  - Rule for Tasks 2-5: any production consumer of layout invariants imports `layout-invariants.ts`, NEVER `layout-invariants.spec-util.ts` (vitest-carrying).
  - Lint deviation ratified: destructure-drop `_drop` pattern violates no-unused-vars (no ignore override in eslint.config.js) — spec uses `delete rest['schemaVersion']` instead.
Task 2 (restore actions: restoreLayout / restoreGroups / restoreDrawingsForSymbol): incomplete
Task 3 (workspace meta snapshot + Supabase toPayload/fromPayload V2 mapping): incomplete
Task 4 (workspace-db IndexedDB threading of layout/panels/linkGroups, no DB_VERSION bump): incomplete
Task 5 (restore dispatch wiring + .session.json thenRestore + persist→restore e2e): incomplete
Final audit: incomplete
