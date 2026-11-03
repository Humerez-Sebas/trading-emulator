## STATUS

**100% complete.**

**AREAS COMPLETE:** chart-engine hotspot score; anti-pattern/defect-cluster cross-check; RFC-019 Task-5 and RFC-020 M-1 verification; tracked deferred-item sweep; F21-2/D.20.6 arithmetic reconciliation.

**AREAS PARTIAL:** none.

**AREAS NOT STARTED:** optional intra-module co-change only; omitted because the cross-module result already answers the architectural question.

## FINDINGS SO FAR

The original established the 54-day churn baseline, the ranked hotspots, and the chart boundary's high co-change rate.
It also banked eight defect clusters, 58 fix-follows-feature chains, and the RFC size-growth trend.
This addendum only corrects/extends F-02, F-08, F-11, and adds F-13/F-14.

### F-13 [CAP] [NSYM] [SEQ] - Codification is selective; uncodified defect families keep recurring

- **Finding name:** Defect-cluster codification versus recurrence
- **Category:** Organisational learning
- **Severity:** HIGH
- **Scope:** F-10 clusters C1-C8 and `docs/engineering/anti-patterns.md`
- **Evidence:** `docs/engineering/anti-patterns.md:6-113` contains 16 named entries. C6 maps directly to entry 1 (`:6-13`); C7 maps to entries 2 and 6 (`:15-21`, `:46-50`); C1 is only narrowly covered by async echoes in entry 3 (`:23-31`); C2 is only partly covered by payload/LWW entries 8-10 (`:60-77`). No entry generalizes C3 units, C4 clock authority, C5 boundary-crossing verification, or C8 cross-TF lookahead. Exact count command: `$matches = @(git grep -n -E "^## [0-9]+\." -- "docs/engineering/anti-patterns.md"); "COUNT=$($matches.Count)"` -> `COUNT=16`.
- **Observed pattern:** C7 stopped recurring after codification; lifecycle, hydration, units, clocks, and boundary-test failures continue to be rediscovered in individual RFC audits.
- **Why it matters HERE:** parallel Capability, drawing, and multi-symbol work multiplies the number of boundaries and hydration paths exposed at once.
- **Concrete risk:** agents repeat known failure mechanisms because the durable catalog names incidents but omits four dominant defect families.
- **Recommended direction:** add named entries for hydration conformance/single ownership, explicit units at UI boundaries, declared clock authority, boundary-crossing tests, and a dedicated lookahead property invariant.
- **Migration difficulty:** LOW
- **Best mechanism:** Documentation plus linked lint/property-test detectors
- **Acceptance condition:** every C1-C8 cluster maps to a durable named mechanism and each RFC audit template asks which mechanism applies.

### F-14 [SEQ] - F21-2 satisfies D.20.6; the remaining 100x problem is shared-label semantics

- **Finding name:** XAUUSD point semantics reconciled against owner pins
- **Category:** Units / cross-surface contract
- **Severity:** HIGH
- **Scope:** Lotaje, TradePanel, D.20.6
- **Evidence:** D.20.6 says every non-FX displayed `pt` is `1.00` price unit and pins XAUUSD `$10,000`, `1%`: `5 -> 0.20`, `10 -> 0.10`, `20 -> 0.05` lots at `.superpowers/rfc-020/dev-log.md:2564-2569`. Lotaje implements `pipSize === null -> 1` at `emulador/src/app/lotaje/sizing-view-model.ts:76-79`, converts display distance at `:110-119`, and sizes at `:132-146`; the three exact tests are `sizing-view-model.spec.ts:67-115`. TradePanel instead divides price distance by broker `pointSize` at `components/trade-panel/trade-panel.component.ts:87-92`; generated XAUUSD `pointSize` is `0.01` at `domain/sizing/asset-registry.generated.ts:48-55`. Arithmetic command: `$riskUsd=100; $contractSize=100; foreach($d in @(5,10,20,300,3)){ $raw=$riskUsd/($d*$contractSize); "$d $raw" }` -> `5=.2`, `10=.1`, `20=.05`, `300=.003333...`, `3=.333333...` before 0.01 lot rounding/floor.
- **Observed pattern:** Lotaje `300 pts` means 300.00 price units and floors to 0.01 lots; TradePanel `300 pts` means 300 broker points = 3.00 price units and sizes about 0.33 lots. The same label denotes quantities differing by 100x.
- **Why it matters HERE:** the code **does satisfy the owner pins**. Reporting the Lotaje result as an implementation failure would contradict explicit user authority. The interoperability hazard remains real.
- **Concrete risk:** a trader copies a 300-point TradePanel stop into Lotaje, receives 0.01 instead of 0.33 lots, and both screens appear internally valid.
- **Recommended direction:** do not change Lotaje arithmetic without explicitly revoking D.20.6. Disambiguate UI vocabulary (`price pts` versus `broker points`) and add a cross-surface conversion/wording test.
- **Migration difficulty:** LOW for wording; MEDIUM if the owner changes the unit contract
- **Best mechanism:** Product decision plus cross-surface acceptance test
- **Acceptance condition:** identical labels never denote different divisors; the D.20.6 5/10/20 pins remain green unless a successor decision explicitly replaces them.

### F-15 [CAP] - Boundary-blind verification is historically proven, not anecdotal

- **Finding name:** Owner-stated verification lessons closed with primary evidence
- **Category:** Verification integrity
- **Severity:** HIGH
- **Scope:** RFC-019 Task 5 and RFC-020 final audit
- **Evidence:** RFC-020 M-1 states both sides were well tested independently but "Nothing crossed them" at `.superpowers/rfc-020/dev-log.md:2470-2480`. RFC-019 Task 5 re-ran all gates green at `.superpowers/rfc-019/dev-log.md:567-576`, then executable probes proved the invariant false at `:578-613`: valid native/finer-grain paths threw because the helper compared close time with cursor-open rather than the revealed instant.
- **Observed pattern:** logic-level gates remained green while lifecycle integration and invariant truth failed at the boundary being claimed.
- **Why it matters HERE:** `[CAP]` work crosses Angular/engine/library boundaries; `[NSYM]` work crosses storage/state/panel ownership boundaries.
- **Concrete risk:** parallel branches each prove their local module and still compose into an invalid system.
- **Recommended direction:** require one test at the changed boundary, not merely one test per changed module; validate invariant helpers with positive and negative production-reachable probes.
- **Migration difficulty:** LOW
- **Best mechanism:** Test-architecture convention and RFC acceptance criteria
- **Acceptance condition:** every new boundary names an integration test, and every invariant helper demonstrates both a valid state that passes and the historical defect that fails.

### F-16 [NSYM] - Deferred-item sweep leaves one structural future blocker, not an unfinished RFC-017 task

- **Finding name:** Tracked deferred inventory correction
- **Category:** Debt inventory / sequencing
- **Severity:** MEDIUM
- **Scope:** RFC-017/TEDS, F19-2, legacy progress ledger
- **Evidence:** RFC-017 Tasks 7-8 were superseded by TEDS and its surviving gate was changed/shipped by RFC-018 at `docs/architecture/rfcs/017-compositional-panel-sync.md:193-218`. `docs/superpowers/teds-plan-amendments.md:33-74` carries the replacement detector work. `.superpowers/sdd/progress.md:1611-1656` ends with accepted calculadora no-fix rulings and owner merge/back-merge actions, not an open architecture task. F19-2 remains structural because `state/market/market.reducer.ts:6-18` keys series only by timeframe.
- **Observed pattern:** stale status text makes superseded work look open, while the genuine foreign-symbol candle-source blocker is buried in a follow-up ledger.
- **Why it matters HERE:** multi-symbol sequencing must begin from F19-2/runtime ownership, not by reviving RFC-017 visual tasks.
- **Concrete risk:** an RFC spends effort on superseded TEDS work while panel labels can still be paired with the primary symbol's candles.
- **Recommended direction:** mark RFC-017 tasks closed/superseded and promote F19-2 into the future multi-symbol RFC's entry criteria.
- **Migration difficulty:** TRIVIAL docs; HIGH implementation
- **Best mechanism:** Documentation cleanup plus explicit `[NSYM]` RFC
- **Acceptance condition:** no tracked status calls RFC-017 Tasks 7-8 pending, and the multi-symbol RFC owns symbol-keyed runtime series before UI enablement.

**F-02 changed row:** `domain/chart/chart-engine.ts` = 261 LOC, churn 16, fix 8, refactor 3, rework 6, score `261*16/1000 = 4.176` -> **4.2**, below telemetry's 4.7. Exact requested command: `& "C:\Program Files\Git\usr\bin\wc.exe" -l "emulador/src/app/domain/chart/chart-engine.ts"` -> `261 emulador/src/app/domain/chart/chart-engine.ts`.

## RESUME BRIEF

- **Role/scope:** Principal Engineer, read-only churn/history audit at `develop` / `a2ca53b`; source tree untouched.
- **Baseline command/output:** `git status --short; git log --oneline -1; git branch --show-current` -> only `?? .superpowers/audit-2026-08-10/`, `a2ca53b ...`, `develop`.
- **Commands added:** Git `wc.exe -l chart-engine.ts` -> 261; anti-pattern heading count -> 16; D.20.6 arithmetic above; no baseline gates rerun.
- **Dead ends:** no per-file author analysis, six-month split, broad Spanish `pendiente` grep, or intra-module co-change; do not recreate deleted scripts.
- **Remaining steps:** synthesis only. Correct the original Agent-4/Test finding before final report: D.20.6 pins pass; the defect is cross-surface `pts` ambiguity.
- **Digest spec:** <=140 lines retaining hotspot/co-change/shotgun/rework tables, F-13, corrected F21-2, and F19-2 sequencing.
