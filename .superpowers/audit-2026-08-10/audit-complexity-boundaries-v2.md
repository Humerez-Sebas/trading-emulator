## STATUS

**100% complete.**

**AREAS COMPLETE:** cross-layer scan; misleading names; eight large-file verdicts; complexity outliers; duplication; dead prototype classification; test-only public-member spot-check.

**AREAS PARTIAL:** exhaustive all-class-member test-only scan was not justified after the targeted scan found one low-risk getter.

**AREAS NOT STARTED:** none material to the digest.

## FINDINGS SO FAR

The original established one import cycle, the export/dead-code census, complexity metrics, and harmful shared-contract duplication.
It explicitly cleared deep paths, boolean naming, selector-projector arity, separate IndexedDB databases, and several coherent long handlers.
This addendum closes boundary, naming, large-file, duplication, and encapsulation verdicts.

### TD-12 [CAP] [SEQ] - One real reversed dependency exists; component-to-service imports need judgment, not a blanket ban

- **Finding name:** Cross-layer boundary closeout
- **Category:** Dependency boundaries
- **Severity:** MEDIUM
- **Scope:** domain, state, components
- **Evidence:** domain scan command `git grep -n -E "@(angular|ngrx)/" -- "emulador/src/app/domain" ":(exclude)**/*.spec.ts"` -> 0. State scan command `git grep -n -E "(/components/|/pages/)" -- "emulador/src/app/state" ":(exclude)**/*.spec.ts"` -> one match: `state/journal/journal-read.models.ts:8`. Component/service scan produced seven lines: `components/data-wizard/data-wizard.guard.ts:3`; `components/interval-dialog/interval-dialog.component.ts:23-29`; `components/missing-dataset-dialog/missing-dataset-dialog.component.ts:2`; `components/session-summary/session-summary.component.ts:25`.
- **Observed pattern:** domain purity holds; state has one reversed UI dependency; workflow components directly use infrastructure where they own orchestration.
- **Why it matters HERE:** I1 is clean as an import direction but still leaky through raw chart handles. The state/UI reversal is mechanically expressible and independent of legitimate component services.
- **Concrete risk:** UI folder moves break state analytics; an over-broad component-service ban creates false positives and is disabled.
- **Recommended direction:** enforce zero Angular/NgRx imports in chart domain and zero component/page imports from state; do not blanket-ban component services.
- **Migration difficulty:** LOW
- **Best mechanism:** Scoped `no-restricted-imports`
- **Acceptance condition:** both zero-tolerance scans fail lint on a representative forbidden import; current legitimate component service imports remain reviewable.

### TD-13 [NSYM] - Names are mostly honest; `models.ts` is the one mixed high-fan-in exception

- **Finding name:** Misleading-name sweep closeout
- **Category:** Naming / discoverability
- **Severity:** LOW-MEDIUM
- **Scope:** session services, selectors, root models
- **Evidence:** `session.service.ts` owns local `.session.json` parse/export (`services/session.service.ts:1-383`); `session-sync.service.ts` owns cloud transport (`:1-915`); `session-sync.mapping.ts` owns pure payload conversion/assertions (`:19-198`); `session-migration.ts` owns legacy lifts. These names match responsibilities. `selectTradeChartView` remains the misleading spec-only exception at `state/selectors.ts:423-427`. Root `models.ts:1-123` mixes core types/constants with `detectTimeframe`, `derivePointSize`, and filename parsing; exact importer command `git grep -l -E "from '(\.\./)+models'" -- "emulador/src/app/**/*.ts"` -> 64 files, 38 excluding specs/spec-utils, 37 after excluding `testing/fixtures.ts`.
- **Observed pattern:** adjacent session names are differentiated correctly; the generic root model file acts as both model and utility hub.
- **Why it matters HERE:** `[NSYM]` and units work will otherwise keep treating display inference as canonical instrument metadata.
- **Concrete risk:** a fresh engineer follows `derivePointSize` from the universal-looking root module into sizing/cost logic.
- **Recommended direction:** keep session names; retire `selectTradeChartView`; move only `derivePointSize`/parsing utilities to named domain modules when their related fixes land.
- **Migration difficulty:** LOW
- **Best mechanism:** Opportunistic cleanup
- **Acceptance condition:** no spec-only selector presents itself as the production chart view; `models.ts` contains model primitives/constants only.

### TD-14 [CAP] - Complexity outliers are mostly explicit algorithms; `invalidReason` is the short hidden matrix

- **Finding name:** Final coherence verdict for complexity outliers
- **Category:** Function/file complexity
- **Severity:** MEDIUM for `invalidReason`; INFO otherwise
- **Scope:** top functions and eight unread large files
- **Evidence:** original AST metrics at `audit-complexity-boundaries.md:476-517`; direct reads of the implementations. `trade-panel.component.ts:96-117` contains 29 measured branches in 23 lines. `trading-capability.ts:67-203`, `fill-engine.ts:298-414`, `sizing-view-model.ts:98-202`, and `drawings-primitive.ts:322+` expose ordered algorithms.
- **Observed pattern:** long methods generally make required ordering visible. The short validator hides an order-entry rule matrix inside a component computed.
- **Why it matters HERE:** splitting fill/hit-test order harms auditability; extracting order validation gives the untested money-moving surface a pure seam.
- **Concrete risk:** line-count refactors scatter trading behavior, while embedded validation remains untestable and grows with order types.
- **Recommended direction:** extract only `validateTradeDraft`; defer per-drawing geometry strategies until modifier/type work creates the third concrete need.
- **Migration difficulty:** LOW now; MEDIUM later
- **Best mechanism:** Pure function plus table-driven specs
- **Acceptance condition:** `invalidReason` delegates to a pure validator; fill and hit-test order remain visible in one function.

| File/function | Verdict and seam |
|---|---|
| `doSwitch` | SPLIT: IO versus pure ordered action translation |
| `TradingCapability.render` | KEEP |
| `fill-engine.processCandle` | KEEP |
| `sizing-view-model.deriveLots` | KEEP |
| `drawings-primitive.hitTestDrawing` | SPLIT LATER `[CAP]`: per-kind geometry when modifiers land |
| `state/selectors.ts` | KEEP |
| `session-sync.service.ts` | SPLIT: session/folder versus playbook/lesson mappings/transports |
| `chart-model-mapper.service.ts` | KEEP; protect D8 |
| `fill-engine.ts` | KEEP |
| `chart-panel.component.ts` | KEEP |
| `workspace-viewport.component.ts` | KEEP |
| `drawings.reducer.ts` | SPLIT LATER: pure history seam |
| `telemetry.effects.ts` | KEEP |

### TD-15 [SEQ] - SessionSyncService spans four independently changing synchronization policies

- **Finding name:** SessionSync bounded-context accumulation
- **Category:** File responsibility / cohesion
- **Severity:** MEDIUM-HIGH
- **Scope:** `services/session-sync.service.ts`
- **Evidence:** sessions/folders through `:581`; playbook `:588-707`; lessons `:709-833`; active-session flattening `:835-914`. Physical line command returns 915. AST command using `emulador/node_modules/typescript` returns `METHOD_DECLARATIONS=21`, `GET_ACCESSORS=1`, `CONSTRUCTORS=1`.
- **Observed pattern:** each RFC appended an entity family to one client wrapper even though session deletion/LWW differs from knowledge retention.
- **Why it matters HERE:** multi-symbol/session changes should not destabilize playbook or lesson synchronization.
- **Concrete risk:** generic cleanup transfers destructive session semantics to durable knowledge entities.
- **Recommended direction:** extract playbook/lesson pure mappings and separate their transport policy while retaining one small auth/client port.
- **Migration difficulty:** MEDIUM
- **Best mechanism:** Focused refactor, not a generic repository framework
- **Acceptance condition:** pure mappings are framework-free siblings; the remaining class no longer spans all four policy families.

### TD-16 - One test-only getter is low debt; `topbar-hud` is not repository code

- **Finding name:** Encapsulation/dead-prototype closeout
- **Category:** Encapsulation / dead code
- **Severity:** LOW
- **Scope:** Lotaje and repo-root prototype residue
- **Evidence:** `getMountedWindow` is exported at `lotaje-view.ts:149-152` and referenced only by `lotaje-view.spec.ts:4,274-290`; `getMountedState` is production-required by `companion-window.ts:26,151,211`. `git ls-files -- "topbar-hud/**"` -> 0 and `git status --short --untracked-files=all -- "topbar-hud"` -> 0; `emulador/angular.json:17-34` builds only the Angular source graph.
- **Observed pattern:** one public getter is a test observation seam. `topbar-hud` is ignored local residue, not tracked dead architecture.
- **Why it matters HERE:** public test seams modestly inflate perceived API; treating ignored prototypes as repo debt would mis-rank work.
- **Concrete risk:** low accidental coupling to active Window state.
- **Recommended direction:** remove the getter opportunistically when Lotaje is next touched; perform local prototype cleanup outside the evolution RFC.
- **Migration difficulty:** TRIVIAL
- **Best mechanism:** Opportunistic cleanup
- **Acceptance condition:** `getMountedWindow` is not a production export; no architecture finding targets untracked `topbar-hud`.

**Duplication closeout:** session/playbook/lesson DTO mappings are distinct schema work; drawing geometry dispatch and two chart hosts are coincidental; journal visualizations share frame mechanics but different grammars. Do not abstract until a third chart host or fourth visualization creates a stable shared seam.

## RESUME BRIEF

- **Role/scope:** read-only complexity, boundaries, naming, duplication, dead-code, and encapsulation audit at `develop` / `a2ca53b`.
- **Commands/output:** domain framework imports 0; state-to-UI 1; component-to-service lines 7; `models.ts` importers 64/38/37; tracked `topbar-hud` 0; one test-only getter found.
- **Inherited measurements:** one SCC, 30 real dead exports, 61 over-exported, 92 spec-only; do not regenerate AST scripts.
- **Dead ends:** no aliases, boolean rename sweep, high-arity selector concern, IDB merge, madge/jscpd, mapper refactor, or generic formatting facade.
- **Remaining steps:** synthesis only.
- **Digest spec:** <=140 lines with boundary scan, file/function verdict table, SessionSync seam, harmful duplication only, and three recommendations.
