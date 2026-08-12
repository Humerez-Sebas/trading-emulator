## STATUS

**100% complete.**

**AREAS COMPLETE:** four optimized-dependency mocks; assertion-level chart-sync, telemetry, and IndexedDB verdicts; F21-2 test characterization; selector-reset leak mechanism.

**AREAS PARTIAL:** none.

**AREAS NOT STARTED:** optional per-domain `it()` recount; omitted because it would not change the portfolio ranking.

## FINDINGS SO FAR

The original established zero source-text/CSS-vacuity debt, the DOM-boundary gap, 19 selector-reset leakers, and no browser E2E.
It identified TradePanel and input primitives as the highest-risk unprotected UI and Lotaje as the DOM-testing exemplar.
This addendum closes F-05 and upgrades three domain-protection verdicts while correcting F21-2.

### F-10 [CAP] - All four `lightweight-charts` mocks implement the required cold-cache mitigation

- **Finding name:** Optimized-dependency mock mitigation verified
- **Category:** Test isolation
- **Severity:** INFO; original F-05 downgraded from MEDIUM
- **Scope:** four chart specs
- **Evidence:** exact search `git grep -n "vi.mock('lightweight-charts'" -- "emulador/src/app/**/*.spec.ts"` -> four files. Each uses `vi.hoisted`, `vi.resetModules()`, and dynamic SUT import: `chart-engine.spec.ts:35,116,138-145`; `chart-engine.pane-rect.spec.ts:20,58,66-72`; `trading-capability.spec.ts:37,50,153-164`; `trading-capability-rule-tag.spec.ts:8,21,118-120`.
- **Observed pattern:** mitigation is uniform even where the mock factory style differs.
- **Why it matters HERE:** this is the exact cold `.vite` optimizeDeps race documented at `docs/engineering/testing.md:28-31`.
- **Concrete risk:** no open defect in these files; risk returns only if a new optimized-dependency mock copies a static SUT import.
- **Recommended direction:** list these files as canonical examples; no code change now.
- **Migration difficulty:** NONE
- **Best mechanism:** Documentation reference
- **Acceptance condition:** future `vi.mock('lightweight-charts')` specs use the same four-part shape.

### F-11 [CAP] [NSYM] - Chart sync, telemetry, and IndexedDB are better protected than the inventory implied

- **Finding name:** Assertion-level protection verdict upgrade
- **Category:** Test portfolio
- **Severity:** LOW residual risk
- **Scope:** three previously medium-confidence domains
- **Evidence:** `chart-sync-router.spec.ts:39-166` covers channel gates, N-1 fan-out, idempotence, and teardown; exact `it()` count commands return router 8 and bus 5. `workspace-viewport.component.spec.ts:594-754` covers real panel/registry/router wiring, including N>=3 at `:636-741`. Eight telemetry specs are enumerated by `git ls-files "emulador/src/app/state/telemetry/*.spec.ts"` -> 8. `workspace-db.service.spec.ts:29-627` and market-data specs use fake-indexeddb round-trips rather than repository mocks.
- **Observed pattern:** pure units, mechanism units, and Angular integration form a layered portfolio; the original inventory omitted router/viewport tests.
- **Why it matters HERE:** current panel sync is not the weak foundation originally reported.
- **Concrete risk:** `[NSYM]` policy remains untested because all fixtures are mono-symbol; DB tests protect two candle stores independently without proving one authority.
- **Recommended direction:** upgrade chart sync/telemetry/IndexedDB to HIGH-confidence protected; add tests only with the future symbol policy and candle-authority migration.
- **Migration difficulty:** NONE now
- **Best mechanism:** Verdict correction plus future RFC acceptance tests
- **Acceptance condition:** the final portfolio separates current sync protection from unimplemented `[NSYM]` semantics.

### F-12 [SEQ] - XAUUSD tests pin the approved D.20.6 contract, not a known implementation bug

- **Finding name:** Gold sizing characterization corrected
- **Category:** Domain-test authority
- **Severity:** HIGH correction to prior audit claim
- **Scope:** `sizing-view-model.spec.ts`, D.20.6, TradePanel
- **Evidence:** `asset-registry.ts:80-88` deliberately returns null `pipSize` for metals; D.20.6 at `.superpowers/rfc-020/dev-log.md:2564-2569` defines non-FX displayed points as whole price units. Tests at `sizing-view-model.spec.ts:67-115` exactly pin 5/10/20 price units and 0.20/0.10/0.05 lots. TradePanel broker-point display is separately defined at `trade-panel.component.ts:87-92`.
- **Observed pattern:** the prior test audit at `audit-tests.md:521` treated a later owner-authorized replacement as merely current behavior.
- **Why it matters HERE:** the STOP rule and authority hierarchy require preserving these tests unless D.20.6 is explicitly revoked.
- **Concrete risk:** "fixing" tests to expect `300 -> 0.33` silently reverts the owner decision and conflates broker points with Lotaje price-unit points.
- **Recommended direction:** keep the pins; add a cross-surface terminology/conversion test and resolve the duplicated `pts` label before the next sizing/trading RFC.
- **Migration difficulty:** LOW
- **Best mechanism:** Test correction in the audit, then product wording decision
- **Acceptance condition:** final reporting no longer calls D.20.6 a failed implementation; a new test proves the two surfaces cannot present ambiguous identical units.

### F-13 - The 19 selector leaks mutate shared selector objects, not MockStore instances

- **Finding name:** Selector leak mechanism confirmed
- **Category:** Test isolation
- **Severity:** HIGH (confirms original F-04)
- **Scope:** 19 spec files
- **Evidence:** exact census command iterating `git grep -l "overrideSelector" -- "emulador/src/**/*.spec.ts"` returns 48 override files and 19 without `resetSelectors`. Spot checks: `replay.effects.spec.ts:40-42` restores timers but not selectors while pinning core replay selectors; `selectors.spec.ts:519-532` pins selector singletons without teardown; `workspace-viewport.component.spec.ts:506-530,594-628` pins series/time/zone selectors in two describes.
- **Observed pattern:** `TestBed.resetTestingModule()` replaces the injector/store but `overrideSelector` mutates module-level memoized selector objects shared under `isolate:false`.
- **Why it matters HERE:** later files can read forced values from an earlier file even after a fresh MockStore is created.
- **Concrete risk:** replay/fill/panel tests pass or fail based on file order and worker packing.
- **Recommended direction:** retain original recommendation: fix all 19 and enforce file-level `overrideSelector` => `resetSelectors`.
- **Migration difficulty:** LOW
- **Best mechanism:** Custom ESLint rule plus cleanup
- **Acceptance condition:** the census prints zero missing-reset files and lint rejects a representative leak.

## RESUME BRIEF

- **Role/scope:** read-only test architecture/portfolio audit at `develop` / `a2ca53b`.
- **Commands/output:** optimized mocks = 4, all compliant; telemetry specs = 8; router/bus `it()` = 8/5; override files = 48, missing reset = 19.
- **Verdict changes:** original F-05 closed/downgraded; chart sync, telemetry, and IndexedDB upgraded; D.20.6 tests confirmed authoritative.
- **Dead ends:** no source-text, CSS-vacuity, hook, giant-fixture, or timer-leak work; never run bare Vitest or baseline gates.
- **Remaining steps:** synthesis only; preserve TradePanel/DOM boundary as the highest test gap.
- **Digest spec:** <=140 lines with portfolio counts, F-03/F-04 priorities, F-10/F-11 corrections, and explicit F21-2 test verdict.
