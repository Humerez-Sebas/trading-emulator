# TD Audit — Change-Risk, Churn & Shotgun-Surgery
**Repo:** `C:\Users\78701\Desktop\trading-emulator` · **Branch:** `develop` · **HEAD:** `a2ca53b`
**Auditor role:** Principal Engineer, READ-ONLY change-risk / churn / shotgun-surgery auditor
**Date:** 2026-08-10 · **Mode:** checkpoint (session wind-down)

---

## STATUS

**~75% complete.**

**AREAS COMPLETE**
- **(1) Churn analysis** — full-history churn, fix-commit churn, refactor/chore/style churn, docs churn all mechanically computed. Ranked complexity×churn table produced. *Caveat: the "last 6 months" split is moot — see F-01.*
- **(2) Co-change coupling** — cross-module pair counts computed with a script; top pairs recorded with confidence values.
- **(5) Revert / rework rate** — 0 reverts confirmed across all refs; 58 fix-follows-feature chains computed; rework hotspot list produced.
- **(6) RFC archaeology (quantitative half)** — per-RFC commits/files/insertions table computed for RFC-001..020 + calculadora.

**AREAS PARTIAL**
- **(1) Churn — distinct authors per hot file.** Global agent-model attribution computed (Co-Authored-By trailers). NOT computed per-file. Low value here — see "dead ends".
- **(3) Shotgun surgery** — 8/8 change types investigated and file sets identified empirically + by reading code. Recurrence ranking drafted. NOT done: exact per-file line references for the timeframe and theme-token paths; no verification pass re-reading `chart-model-mapper.service.ts` end-to-end.
- **(4) Historical defect patterns** — all 93 fix-commit subjects collected and clustered; 3 owner-stated lessons partially verified (calculadora `.set()` chain verified by commit; RFC-019 Task-5 false invariant located in dev-log but the audit text itself not read; RFC-020 M-1 not read directly).
- **(6) Known-open deferred items** — F19-1..F19-5 and F21-1..F21-4 captured with sources; `performance.md` and `DOMAIN_MODEL.md` gaps captured. NOT swept: `docs/superpowers/teds-plan-amendments.md`, `docs/engineering/anti-patterns.md`, RFC-017 §6, `.superpowers/sdd/progress.md`.

**AREAS NOT STARTED**
- Reading `docs/engineering/anti-patterns.md` to cross-check whether the recurring defect clusters are already written down (this is the "is the org learning?" question).
- Any TD-finding for the pipeline (`pipeline/`) beyond the symbol-list scatter.

---

## FINDINGS SO FAR

### F-01 · The "one year of history" premise is false — this is a 54-day repo
**Category:** Measurement integrity / audit framing · **Severity:** Info (but invalidates a brief assumption) · **Scope:** whole repo

**Evidence (MEASURED FACT).**
```
git rev-list HEAD --count                  -> 667
git rev-list --all --count                 -> 727
git rev-list HEAD --merges --count         -> 59
git log --reverse --format='%ad' --date=short | head -1   -> 2026-06-15
git log -1 --format='%ad' --date=short                    -> 2026-08-07
git shortlog -sne --all  ->  673 Humerez_Sebas <Sebastian.Humerez@jala.university>
                              54 Humerez-Sebas <166337598+...@users.noreply.github.com>
```
Commits per ISO week (`git log --pretty=format:'%ad' --date=format:'%Y-W%V' | sort | uniq -c`):
```
W25 90 | W26 50 | W27 177 | W28 64 | W29 68 | W30 81 | W31 69 | W32 68
```
Agent attribution (`git log --format='%(trailers:key=Co-Authored-By,valueonly)'`), 372 of 667 commits carry a trailer:
```
156 Claude Fable 5 | 117 Claude Opus 5 | 87 Claude Opus 4.8 | 11 Claude Sonnet 4.6 | 1 Claude Opus 4.7
```

**Observed pattern.** RFC-001 through RFC-020 — the entire "~1 year" architectural programme — was executed in **54 calendar days at a sustained ~83 commits/week**, by one human identity and five agent models. There is no "last 6 months" window to split out; full history *is* the recent window.

**Why it matters HERE.** Every churn number in this report must be read as *churn per 54 days*, not per year. A file at 37 changes is not "37 changes over a year, that's fine" — it is **37 changes in under two months**, i.e. roughly one edit every 1.5 days. The churn signal is therefore ~7× hotter than the same raw count would imply in a normal-cadence repo. Second: normal churn heuristics assume churn ≈ organic requirement pressure. Here churn is largely *self-inflicted by the RFC programme itself* — the architecture was rewritten under the same files that were also being extended.

**Concrete risk.** Interpreting these counts against year-scale intuitions will systematically *under*-prioritise refactoring. Also: the codebase has never experienced a maintenance-only period, so no file has been observed at rest — apparent stability of low-churn files is unproven, not demonstrated.

**Recommended direction.** Treat every count below as a 54-day rate. Re-run this audit after the first 60-day period with no RFC merge to get a true baseline.
**Migration difficulty:** N/A · **Best mechanism:** re-measurement discipline · **Acceptance condition:** a second churn snapshot dated ≥60 days after the last RFC merge exists for comparison.

---

### F-02 · Churn × complexity ranking — `chart.component.ts` is 2× the next file on every axis
**Category:** Refactoring priority · **Severity:** High · **Scope:** 14 named hot files

**Evidence (MEASURED FACT).** Churn from:
```
git log --pretty=format: --name-only | grep -v '^$' | sort | uniq -c | sort -rn
```
Fix-churn from:
```
git log --regexp-ignore-case --grep='^fix' --pretty=format: --name-only | grep -v '^$' | sort | uniq -c | sort -rn
```
Refactor-churn from:
```
git log --regexp-ignore-case --grep='^refactor' --grep='^chore' --grep='^style' --pretty=format: --name-only | grep -v '^$' | grep -E '\.(ts|html|css)$' | sort | uniq -c | sort -rn
```
Rework from the fix-follows-feature script (see F-07).

**Scoring reasoning (INTERPRETATION).** Score = `LOC × churn / 1000`. LOC is the complexity proxy supplied in the brief (non-spec LOC). I use raw multiplication rather than a weighted formula deliberately: churn and size are the only two mechanically-measured axes, and multiplying them is the standard "hotspot" formulation (a big file nobody touches is cheap; a small file touched constantly is cheap; the product is what hurts). Architectural importance is then applied as a *qualitative tie-breaker column*, not folded into the number, so the arithmetic stays auditable.

| # | File (under `emulador/src/app/`) | LOC | Churn | Fix | Refac | Rework | Score | Architectural importance |
|---|---|---:|---:|---:|---:|---:|---:|---|
| 1 | `components/chart/chart.component.ts` | 1694 | 37 | 8 | 9 | 3 | **62.7** | CRITICAL — the Angular↔engine boundary (I-1) |
| 2 | `pages/sesiones/sesiones-page.component.ts` | 1294 | 25 | 7 | 3 | 6 | **32.4** | HIGH — session open/save/import/export hub |
| 3 | `lotaje/lotaje-view.ts` | 1723 | 13 | — | — | 2 | **22.4** | MEDIUM — framework-free view, isolated |
| 4 | `components/chart/chart-model-mapper.service.ts` | 887 | 23 | 5 | 7 | 3 | **20.4** | CRITICAL — D8 per-instance memoization; RenderModel derivation |
| 5 | `state/selectors.ts` | 853 | 21 | 3 | 4 | — | **17.9** | CRITICAL — cross-slice read model |
| 6 | `services/session-sync.service.ts` | 915 | 14 | — | — | — | **12.8** | HIGH — Supabase LWW sync |
| 7 | `components/workspace/chart-panel.component.ts` | 581 | 16 | 3 | — | 2 | **9.3** | HIGH — panel host |
| 8 | `components/workspace/workspace-viewport.component.ts` | 543 | 14 | 5 | — | 2 | **7.6** | HIGH — grid/layout host |
| 9 | `state/workspaces/workspaces.effects.ts` | 456 | 16 | 3 | 2 | 2 | **7.3** | HIGH — session hydration |
| 10 | `state/drawings/drawings.reducer.ts` | 541 | 12 | 3 | — | 2 | **6.5** | MEDIUM |
| 11 | `state/trading/fill-engine.ts` | 584 | 10 | — | — | — | **5.8** | CRITICAL — but see note |
| 12 | `state/trading/trading.reducer.ts` | 470 | 12 | — | — | — | **5.6** | HIGH |
| 13 | `services/workspace-db.service.ts` | 460 | 11 | — | 3 | — | **5.1** | HIGH — IndexedDB |
| 14 | `state/telemetry/telemetry.effects.ts` | 521 | 9 | 2 | 3 | 2 | **4.7** | MEDIUM |

**Not in the brief's LOC list but demanding a row —** `domain/chart/chart-engine.ts`: churn **16**, fix-churn **8**, refactor-churn **3**, **rework 6 (joint highest)**. It has the highest fix-to-churn ratio (8/16 = 0.50) of any file in the repo and ties `sesiones-page.component.ts` for most rework. Its LOC was not supplied; it must be measured and scored.

**Observed pattern.** Three distinct hotspot *shapes*:
1. **Chart cluster** (`chart.component.ts` + `chart-model-mapper.service.ts` + `chart-engine.ts`): high churn AND high fix AND high refactor. This is the classic "we keep rewriting it and it keeps breaking" signature.
2. **Session hub** (`sesiones-page.component.ts`): high churn, high fix, **highest rework (6)**, low refactor. Nobody has ever restructured it; it just accretes.
3. **Cold-but-critical** (`fill-engine.ts`, `trading.reducer.ts`): moderate churn, **zero fix commits**. These are the well-specified parts.

**Why it matters HERE.** `fill-engine.ts` having zero `fix(` commits over 54 days despite being the money-correctness core is strong evidence that the RFC/spec discipline works *when applied*. The chart cluster shows what happens where it was applied late (RFC-001..007 retrofitted an existing 1443-line component — see `72e0554`, which shipped `chart.component.ts` at 1443 LOC on day 1; it is 1694 today, i.e. **the decomposition RFCs did not shrink it**).

**Concrete risk.** `chart.component.ts` is the single most likely site of the next production defect: it is the largest churned file, has the most fix commits tied with `chart-engine.ts`, and sits exactly on Invariant 1 (the Angular/NgRx ↔ engine boundary). A defect there is a boundary violation, which is the one class of bug the architecture cannot contain.

**Recommended direction.** Do NOT propose a generic "split chart.component.ts". Propose the *specific* extraction the churn points at: the file's churn co-occurs 9× with `render-model.ts` and 8× with `trading-capability.ts` (F-03), i.e. the churn is concentrated in **capability wiring and draft/preview state**, not in Angular plumbing. Extract the draft/preview/quick-ruler interaction state (it owns `__quick_ruler__`, `draft`, hit-testing at `chart.component.ts:1275,1364,1368,1451,1461`) into an interaction controller behind the existing `Capability` seam.
**Migration difficulty:** Medium-High · **Best mechanism:** new `Capability` (Invariant 2 already mandates this) · **Acceptance condition:** `chart.component.ts` under 1000 LOC AND its 30-day churn drops below `chart-model-mapper.service.ts`'s.

---

### F-03 · Cross-module co-change reveals the chart boundary is a co-edit, not a seam
**Category:** Hidden coupling / leaky boundary · **Severity:** High · **Scope:** `components/chart` ↔ `domain/chart`

**Evidence (MEASURED FACT).** Script `scratchpad/cochange.py` (logic reproduced in RESUME BRIEF). Input: `git log --pretty=format:'@@%H' --name-only`. Filters: only `emulador/src/app/**/*.{ts,html,css}`, excludes `*.spec.ts`, excludes commits touching >40 app files. 667 commits parsed, **196 usable multi-file commits**. Module key = first two path segments for `state/`,`components/`,`domain/`,`pages/`, else first segment. Threshold: count ≥3.

Top cross-module pairs (`conf` = count / min(individual file's commit count)):

| Count | Conf | Module A ↔ Module B | Files |
|---:|---:|---|---|
| 9 | 0.82 | `lotaje` ↔ `pages/calculadora` | `lotaje-view.ts` ↔ `calculadora-page.component.css` |
| 9 | 0.69 | `components/chart` ↔ `domain/chart` | `chart.component.ts` ↔ `render-model.ts` |
| 9 | 0.56 | `components/chart` ↔ `domain/chart` | `chart.component.ts` ↔ `chart-engine.ts` |
| 8 | 0.80 | `components/chart` ↔ `domain/chart` | `chart.component.ts` ↔ `capabilities/trading-capability.ts` |
| 6 | 0.86 | `components/chart` ↔ `components/toolbar-tools` | `chart.component.ts` ↔ `toolbar-tools.component.ts` |
| 6 | 0.60 | `components/chart` ↔ `domain/chart` | `chart-model-mapper.service.ts` ↔ `capabilities/trading-capability.ts` |
| 6 | 0.38 | `components/chart` ↔ `components/workspace` | `chart.component.ts` ↔ `chart-panel.component.ts` |
| 5 | 0.71 | `components/chart` ↔ `domain/chart` | `chart.component.ts` ↔ `capabilities/drawings-primitive.ts` |
| 5 | 0.71 | `state/replay` ↔ `state/selectors.ts` | `replay.effects.ts` ↔ `selectors.ts` |
| 5 | 0.56 | `components/chart` ↔ `state/layout` | `chart-model-mapper.service.ts` ↔ `layout.models.ts` |
| 5 | 0.45 | `pages/sesiones` ↔ `services` | `sesiones-page.component.ts` ↔ `session-sync.mapping.ts` |
| 4 | 0.80 | `components/chart` ↔ `domain/chart` | `chart.component.ts` ↔ `capabilities/session-primitive.ts` |
| 4 | 0.80 | `components/chart` ↔ `domain/chart` | `chart.component.ts` ↔ `capabilities/trade-boxes-primitive.ts` |
| 4 | 0.57 | `components/chart` ↔ `domain/chart` | `chart-model-mapper.service.ts` ↔ `capabilities/drawings-primitive.ts` |
| 4 | 0.44 | `state/layout` ↔ `state/link-groups` | `layout.reducer.ts` ↔ `link-groups.reducer.ts` |
| 4 | 0.33 | `pages/sesiones` ↔ `state/trading` | `sesiones-page.component.ts` ↔ `trading.reducer.ts` |
| 4 | 0.29 | `pages/sesiones` ↔ `services` | `sesiones-page.component.ts` ↔ `session-sync.service.ts` |
| 4 | 0.25 | `pages/sesiones` ↔ `state/workspaces` | `sesiones-page.component.ts` ↔ `workspaces.effects.ts` |
| 4 | 0.19 | `components/chart` ↔ `state/selectors.ts` | `chart.component.ts` ↔ `selectors.ts` |
| 3 | 1.00 | `domain/…` ↔ `domain/…` | `csv-legacy.repository.ts` ↔ `market-data.repository.ts` |
| 3 | 0.75 | `pages/storage-manager` ↔ `services` | `storage-manager.service.ts` ↔ `data-onboarding.service.ts` |

**Observed pattern (INTERPRETATION).** **9 of the top 15 cross-module pairs have `components/chart` on one side and `domain/chart` on the other.** Invariant 1 declares this a hard boundary crossed only by immutable `RenderModel` + `ChartEventBus`. The *dependency* direction is indeed clean (verified: `f1bc626 fix(chart): remove domain->app outward import, re-export Candle from render-model` — the one violation was caught and fixed). But the *change* direction is not: adding a capability means editing the capability AND its consumer in the same commit, every time, at confidence 0.80.

Three other patterns:
- **`lotaje-view.ts` ↔ `calculadora-page.component.css` at conf 0.82** is the sharpest smell in the table. A framework-free TS view and an Angular page's stylesheet co-change 9 times. The view builds DOM imperatively (`lotaje-view.ts:909` creates elements directly) while its styling lives in the host page's component CSS. Neither file can be changed alone — that is a **missing abstraction: the Lotaje view owns its markup but not its styles.**
- **`sesiones-page.component.ts` appears against four different modules** (`services`, `state/trading`, `state/workspaces`) at low individual confidence. That is not one missing abstraction — it is **distributed ownership converging on a god-page** (F-04, session-field shotgun).
- **`layout.reducer.ts` ↔ `link-groups.reducer.ts` (4)** — two NgRx slices that must be mutated together. Genuine leaky boundary between panel layout and link-group membership; confirmed by `9e0c744 fix(link-groups): normalize composition flags on every group-hydration path`.

**Why it matters HERE.** Invariant 1 is enforced as a *dependency* rule and passes. But the value of a boundary is that one side can change without the other. Measured, that value is not being delivered on the chart seam. The invariant is protecting against the wrong failure mode.

**Concrete risk.** Every new capability costs an edit to a 1694-line file that already has the repo's worst fix record. The boundary adds ceremony without buying isolation.

**Recommended direction.** Make capability registration data-driven: a capability registry module that `chart.component.ts` iterates, so adding a capability edits the capability file + one registry line, not the host. Separately, give `lotaje-view.ts` its own stylesheet or adopt constructable stylesheets so the CSS moves next to the view that owns it.
**Migration difficulty:** Medium · **Best mechanism:** registry/plugin table (extends Invariant 2 rather than fighting it) · **Acceptance condition:** a new capability's introducing commit touches ≤2 files outside `domain/chart/capabilities/`.

---

### F-04 · Shotgun-surgery map (empirical + code-read)
**Category:** Distributed ownership · **Severity:** High (composite) · **Scope:** 8 recurring change types

Each row's file set was derived by (a) `git show --stat` on the commit that actually introduced such a thing, and (b) grepping the live tree for all consumers.

| # | Change type | Files to edit today | Count | Mechanical-but-scattered vs thoughtful | Recur. rank | Verdict |
|---|---|---|---:|---|---:|---|
| 1 | **New tradable ASSET / symbol** | `pipeline/fill_r2.py:54` (HARVEST_SYMBOLS default), `pipeline/update_r2.py:302`, `pipeline/export_symbols.py:106`, `emulador/src/app/domain/sizing/asset-registry.generated.ts` (regen), `domain/sizing/asset-registry.ts` (`heuristicContractSize`, only if a new *shape*), `domain/sizing/position-sizing.ts` (`contractSizeFor`/`pipSizeFor` — duplicated heuristic), `state/trading/execution-costs.ts` (`assetClassOf` + `pointSizeFor` + `COST_PRESETS`), `lotaje/asset-catalog.ts` (name/mark/tone), plus `pipeline/tests/test_export_symbols.py` | **8–9** | **Mechanical-but-scattered, and dangerously so** | **1** | **CONSOLIDATE.** See F-05 — the symbol classification heuristic is triplicated by design-decision, and one copy already caused a shipped defect. |
| 2 | **New TIMEFRAME** | *Display TF:* `models.ts` (`Timeframe` union + `TIMEFRAME_SECONDS` + `TIMEFRAME_ORDER`) — **already exhaustive over all MT5 TFs, so this is a no-op today.** *New **fetchable/anchor** TF:* `services/session.service.ts:26` (`AnchorTf`), `:217` (`ANCHOR_TF_ORDER`), `services/timeframe-generator.ts:21` (`ANCHOR_MINUTES`), `:24` (`anchorFor`), `services/market-data/manifest.service.ts:19` (`ManifestTf`), `services/session-sync.mapping.ts:238` (inline `tf === 'M1' \|\| 'H1' \|\| 'D1'`), `components/interval-dialog/…:34` (`ANCHOR_TIMEFRAME`), `components/session-summary/…:33` (`ANCHOR_TFS`), `pages/sesiones/sesiones-page.component.ts:65` (`ANCHOR_TFS` — **second copy**), `pages/mercados/r2-catalog.logic.ts:22` (`TF_ORDER`), `pages/mercados/r2-jobs.logic.ts:17`, `pages/mercados/r2-markets.component.ts:20`, `pipeline/parquet_builder.py:150`, `pipeline/r2_uploader.py`, `pipeline/manifest.py` | 0 (display) / **~15** (anchor) | Display: closed. Anchor: **mechanical-but-scattered with two literal duplications** (`ANCHOR_TFS` in two files; the `M1\|H1\|D1` test inlined in `session-sync.mapping.ts` instead of reusing a guard) | 6 | **CONSOLIDATE the anchor set.** One exported `ANCHOR_TFS` + one `isAnchorTf()` guard; delete the 4 re-declarations. |
| 3 | **New chart OVERLAY / drawing tool / capability** | *Drawing tool:* `domain/chart/render-model.ts:37` (`DrawingTool`) **and** `state/drawings/drawings.models.ts:1` (`DrawingTool` — **identical union, deliberately duplicated by `0995e9e`**), `domain/chart/capabilities/drawings-primitive.ts` (render + hit-test), `components/drawing-toolbar/drawing-toolbar.component.ts:17` (keybinding), `components/toolbar-tools/toolbar-tools.component.html:76` (button), `components/chart/chart.component.ts` (draft/preview handling). *Capability:* new file in `domain/chart/capabilities/` + registration in `chart.component.ts` + usually `chart-model-mapper.service.ts` + `render-model.ts` | **5–6** | **Thoughtful in the primitive, mechanical in the 5 registration points** | **2** | **PARTIAL CONSOLIDATE.** The two `DrawingTool` unions must stay in lockstep with no compiler link between them — a latent drift bug. Toolbar/keymap should be table-driven off the union. |
| 4 | **New PANEL SETTING** | `state/layout/layout.models.ts` (field on `PanelDescriptor` + any predicate), `state/layout/layout.actions.ts`, `state/layout/layout.reducer.ts`, + consumer (`chart-model-mapper.service.ts` for a visual flag) | **3–4** | **Genuinely thoughtful and well-contained** | 4 | **LEAVE ALONE — this is the model to copy.** Empirical: `658fc76` (`hideTrades`) = 3 non-spec files; `e278857` (`hideSharedDrawings`) = 4. Persistence is free because `panels: Record<string, PanelDescriptor>` is mirrored verbatim into the payload. |
| 5 | **New SESSION-persisted field** | `services/session-sync.models.ts` (payload interface + `PayloadInput`), `services/session-sync.mapping.ts` (`toPayload`/`fromPayload`), `services/session-migration.ts` (version bridge), `services/session.service.ts`, `services/session-sync.service.ts` (Supabase), `state/workspaces/workspaces.actions.ts` + `workspaces.effects.ts` (hydration), `services/workspace-db.service.ts` (IndexedDB), `pages/sesiones/sesiones-page.component.ts` (open/import/export), `components/session-summary/session-summary.component.ts` | **~10** | **Genuinely thoughtful — and correctly so** | **3** | **DO NOT flatten.** Verified live: `replayResolution` appears in exactly 10 non-spec files. Each is a real decision (wire shape, migration, LWW, IndexedDB, .session.json import). But: a **schema-version bump** is cheap and well-factored — `076e73c` added `SessionPayloadV3` + V2→V3 migration in **2 files**; the cutover `dfbf56d` was 5. That is excellent. The cost is in *hydration*, not persistence. |
| 6 | **New TELEMETRY fact** | `state/telemetry/telemetry.models.ts` (payload iface + widen `TelemetryEventKindV1` + widen `TelemetryEventV1`), `state/telemetry/telemetry-facts.ts`, `state/telemetry/telemetry.effects.ts`, (+`telemetry-anchors.ts` if anchored) | **3–4** | **Thoughtful, correctly open-closed** | 5 | **LEAVE ALONE — best-designed extension point in the repo.** `TelemetryEvent` is deliberately loose (`kind: string`, `payload: object`) so the storage layer never changes. Empirical: `cb08950` (RFC-016 management events, two new fact kinds) = **4 files, zero storage-schema change.** |
| 7 | **Change a THEME TOKEN** | `emulador/src/styles.css` (126 custom-property declarations) — **but the chart does not read it.** See F-06. | 1 (+N hidden) | **Deceptively mechanical** | 7 | **CONSOLIDATE — see F-06.** |
| 8 | **New NgRx state slice** | slice dir (`*.actions.ts`, `*.models.ts`, `*.reducer.ts`, `*.selectors.ts`, `*.effects.ts`) + **`app.config.ts` only** | **1 file outside the slice** | **Thoughtful; zero scatter** | 8 | **LEAVE ALONE — exemplary.** Empirical: `ae5fdb3` (playbook) touched `app.config.ts` +2 lines and nothing else outside `state/playbook/`. `8d1a145` (lessons) touched zero files outside its own dir + `domain/reflection/`. There is no root `AppState` interface to update — verified: `grep -rn 'AppState\b'` returns **nothing** in non-spec app code. |

**Recurrence ranking rationale (INTERPRETATION).** Ranked by observed frequency in RFC history plus forward pressure from the roadmap: assets (#1) recur every time the broker/pipeline changes and are already the subject of two open findings; capabilities/drawings (#2) are the declared extension mechanism of Invariant 2 and TEDS Phase 3+ is entirely capability work; session fields (#3) recur with every stateful RFC (011, 014, 015, 016, 017 all added some).

---

### F-05 · The symbol-classification heuristic is triplicated *by written decision*, and it has already shipped a defect
**Category:** Duplicated domain logic · **Severity:** High · **Scope:** sizing + costs + registry

**Evidence.**
- `emulador/src/app/domain/sizing/asset-registry.ts:~68` — `heuristicContractSize()`, whose own doc comment says: *"Reproduces `contractSizeFor` from `position-sizing.ts` EXACTLY, including evaluation order (metals before the 6-letter regex) — see the module comment above `resolveAsset` for why this is a deliberate duplication, not an import."*
- `emulador/src/app/state/trading/execution-costs.ts:80-90` — a **third** copy, `assetClassOf()`, doc-commented *"mirroring `contractSizeFor`'s prefix/shape checks"*, plus `pointSizeFor()` at `:66-78` mirroring it again.
- **The defect this caused:** `9bfba5e fix(trading): crypto pointSize resolution in cost presets (RFC-014 T2 review fix)` — landed the *same day* as the feature `1093d86 feat(trading): ExecutionCosts value object + sided Bid/Ask predicates`. The surviving comment at `execution-costs.ts:62-64` documents the failure: *"Resolves asset class via `assetClassOf` to ensure crypto symbols (e.g. BTCUSD, ETHUSD) correctly resolve to pointSize: 1 instead of being misclassified by the 6-letter forex regex."* A 6-letter crypto symbol was classified as Forex by one copy of a heuristic that another copy handled correctly.
- Symbol string literals additionally scattered across `pipeline/fill_r2.py:54`, `pipeline/update_r2.py:302`, `pipeline/export_symbols.py:106`, `lotaje/asset-catalog.ts:30-33`, `asset-registry.generated.ts:21-48`.

**Observed pattern.** Three independent implementations of "what kind of instrument is this string", each with slightly different vocabulary (`contractSize` shape vs `AssetClass` vs `pointSize`), each with its own evaluation order that must be kept identical by hand and by comment.

**Why it matters HERE.** This is a *personal-use trading emulator*: a misclassified symbol produces silently-wrong lot sizes and silently-wrong P/L. There is no user who will notice a 100× error before the training data is corrupted — and indeed **F21-2 is exactly that: a 100× non-FX sizing error** that shipped and was owner-deferred (F-08). The duplication is justified in the docs on kernel-purity grounds, but the justification protects a *layering* concern at the cost of a *correctness* concern, which inverts PHILOSOPHY's own hierarchy.

**Concrete risk.** Adding a fifth asset class (crypto is already half-handled; the `Cripto` preset exists but no crypto symbol is in `GENERATED_ASSETS`) requires three synchronized edits with no compiler linkage. The next divergence will again be a silent wrong number.

**Recommended direction.** Extract one `classifyInstrument(symbol): AssetClass` in `domain/sizing/`, have `position-sizing.ts`, `asset-registry.ts`, and `execution-costs.ts` all import it. This does NOT violate the kernel-purity rule (it is math/instrument data, not formatting). Keep `asset-catalog.ts` separate — that one *is* correctly split, it holds copy only.
**Migration difficulty:** Low (pure function, three call sites, all covered by existing specs) · **Best mechanism:** shared pure module + a spec asserting the three former copies agree on a table of ~20 symbols · **Acceptance condition:** `grep -c 'XAU' emulador/src/app/**/*.ts` (non-spec) returns 1 classification site; a table-driven spec covers FX/metal/index/crypto/unknown.

---

### F-06 · Theme tokens have no path into the chart — 146 hex literals live in TS
**Category:** Parallel systems / false single-source-of-truth · **Severity:** Medium-High · **Scope:** design system ↔ canvas rendering

**Evidence (MEASURED FACT).**
```
grep -c -- '--' emulador/src/styles.css                                        -> 126
grep -rn --include=*.ts -oE "#[0-9a-fA-F]{6}\b" emulador/src/app | grep -v '\.spec\.' | wc -l   -> 146
grep -rn --include=*.ts "getComputedStyle|getPropertyValue|--color|cssVar" \
     emulador/src/app/domain/chart emulador/src/app/components/chart           -> (no output)
```
Per-file hex counts: `state/settings/settings.models.ts` **58**, `components/custom-color-picker.component.ts` 17, `components/account-card.component.ts` 11, `components/risk-slider.component.ts` 10, `components/interactive-candles.component.ts` 8, `domain/chart/chart-engine.ts` **6**, `components/workspace/link-groups-menu.component.ts` 6, `domain/chart/capabilities/drawings-primitive.ts` 4, … Concrete collisions: `chart-engine.ts:91` `background: '#000000'`, `:101` `upColor: '#26a69a'`, `:102` `downColor: '#ef5350'` — versus `settings.models.ts:80-91` `upColor: '#26A69A'`, `downColor: '#EF5350'`, `background: '#000000'` (same values, **different case, different files, no link**), and `styles.css` declaring `--up:` / `--down:` independently.

**Observed pattern.** Three colour systems: (1) CSS custom properties in `styles.css` for DOM chrome; (2) a user-settings palette in `settings.models.ts` (58 literals, light + dark presets) for the chart; (3) hard-coded fallbacks inside `chart-engine.ts` and the capability primitives. `DESIGN_SYSTEM.md` is declared the visual authority (per CLAUDE.md and the RFC-016 memory), but nothing mechanically enforces it against any of the three.

**Why it matters HERE.** "Change a theme token" reads as a one-file edit and is measured as one. In reality changing `--up` leaves the candles unchanged, because the canvas never reads CSS. The audit-relevant point is not the duplication itself — a canvas engine legitimately cannot use CSS vars — it is that **there is no declared conversion point**, so the drift is invisible and unbounded. Invariant 1 (engine never imports Angular/NgRx) makes the *correct* fix non-obvious: the engine cannot read the theme, so the theme must be pushed into it as data.

**Concrete risk.** A TEDS design pass that updates `DESIGN_SYSTEM.md` tokens will silently fail to reach the chart — the one surface the product is actually about. Reviewers will see a green build and a changed stylesheet and conclude the change landed.

**Recommended direction.** One `theme-tokens.ts` exporting the palette as plain data; `styles.css` generated from it or asserted against it by a spec; `settings.models.ts` presets and `chart-engine.ts` defaults both import it. The engine still receives colours as `RenderModel`/options data — Invariant 1 holds.
**Migration difficulty:** Medium (58 literals in settings alone, but all in default objects) · **Best mechanism:** single token module + a lint rule or spec banning new 6-digit hex literals in `emulador/src/app/**/*.ts` · **Acceptance condition:** the hex count in non-spec TS drops below 20 and a spec fails when `styles.css` and the token module disagree.

---

### F-07 · Zero reverts, but 58 fix-follows-feature chains — rework is happening *inside* the branch
**Category:** Process / rework rate · **Severity:** Medium · **Scope:** whole history

**Evidence (MEASURED FACT).**
```
git log --all --format='%h|%s' --grep='^Revert' -i   -> (empty)
```
**0 reverts across all 727 commits on all refs.** Fix-follows-feature computed by a chronological script (`git log --reverse --format='@@%H|%ad|%s' --date=short --name-only`), matching each `fix*` commit against the nearest preceding `feat*`/`refactor*` commit within 12 commits that touched ≥1 shared non-spec file:

**58 chains.** Rework hotspots (times a file appears in such a chain):
```
6  pages/sesiones/sesiones-page.component.ts
6  domain/chart/chart-engine.ts
3  components/chart/chart.component.ts
3  components/chart/chart-model-mapper.service.ts
3  pages/calculadora/calculadora-page.component.ts
2  components/playback-controller/playback-controller.component.ts
2  domain/chart/render-model.ts
2  components/workspace/workspace-viewport.component.ts
2  components/workspace/chart-panel.component.ts
2  state/telemetry/telemetry.effects.ts
2  state/drawings/drawings.reducer.ts
2  state/workspaces/workspaces.effects.ts
2  pages/calculadora/calculadora-page.component.html
2  lotaje/lotaje-view.ts
```
"Fix the fix" chains found by message search (`--grep='fix loop'|'review fix'|'audit fix'|'audit follow'|'FIX)'`): **15 commits explicitly labelled as a second corrective pass**, incl. `cc35aa5`/`fd6e8a3` (RFC-010 "fix loop", two commits same day), `3c323c3`→`60ac114` (RFC-011 Task 1, two consecutive audit fixes on the same file), `d2838fd` (RFC-020 `W5-FIX`). **71 of 667 commit subjects contain "review" or "audit"** (`git log --format='%s' | grep -icE 'review|audit'`).

The worst single chain — one feature, three same-day fixes:
```
085c08d feat(calculadora): página de dimensionado CFD/Forex con estados honestos
  -> 3a9185e fix(calculadora): mensaje de aviso honesto y tests que fijan lo que afirman
  -> dfa5dc9 fix(calculadora): entradas que aceptan decimales y campos con nombre accesible
  -> 8b6093a fix(calculadora): parsear el numero completo o rechazarlo (coma decimal)
```
And a four-fix cascade off one refactor:
```
a7e9983 feat(workspaces): lift legacy drawings at IndexedDB read time
  -> 74a25a2 / f2d8a4a / 102b97e   (three fixes, next day, drawings ownership)
```

**Observed pattern (INTERPRETATION).** Zero reverts is not evidence of low rework — it is evidence that **rework is absorbed pre-merge by the audit process**. 58 chains against 667 commits ≈ **8.7% of all commits are corrections of work from the same branch**. That is the true rework rate and it is invisible to any revert-based metric.

**Why it matters HERE.** The SDD/audit protocol is *working* — it catches defects before `develop`. But the concentration is diagnostic: `sesiones-page.component.ts` and `chart-engine.ts` tie at 6, and both are files the audits keep having to re-open. Those two are where the specification is weakest relative to the code's surface area.

**Concrete risk.** The audit loop is the only thing standing between these files and shipped defects, and audits are expensive (71 audit/review-labelled commits). This does not scale; it is currently affordable only because of the extreme commit cadence (F-01).

**Recommended direction.** Target the two 6-count files specifically. `chart-engine.ts` has the repo's worst fix-to-churn ratio (8 fixes / 16 changes) — its lifecycle contract (destroy idempotence, duplicate registration, marker detach — see `9deebfd`, `5ab3605`) should be pinned by a contract spec suite rather than re-audited per RFC.
**Migration difficulty:** Low-Medium · **Best mechanism:** contract/property tests on engine lifecycle; a spec-first requirement for `sesiones-page` changes · **Acceptance condition:** fix-follows-feature chains touching either file drop to ≤1 per RFC.

---

### F-08 · Known-open deferred items (from tracked artifacts)
**Category:** Debt inventory · **Severity:** Mixed (one High) · **Scope:** repo-wide

All sources are **git-tracked** (verified via `git ls-tree -r HEAD --name-only .superpowers`, which returns `rfc-018/dev-log.md`, `rfc-019/dev-log.md`, `rfc-020/dev-log.md`, `sdd/progress.md` + three `.gitignore`s).

| ID | Item | Severity | Source | Live-code status |
|---|---|---|---|---|
| **F21-2** | Non-FX distance off by the symbol's point size (**100× sizing error**), `sizing-view-model.ts` `priceUnitsPerDisplayUnit` returning `1` when `pipSize === null` | **High** | `.superpowers/rfc-020/dev-log.md:2340`, `:2456` ("explicitly deferred by the owner"), `:2560` §24 | **Appears ADDRESSED but UNAUDITED.** The heuristic still reads `if (asset.pipSize !== null) return asset.pipSize; return 1;` at `lotaje/sizing-view-model.ts:76-79` — but §24 records that this is now the *intended* D.20.6 behaviour (non-FX displays `pts` = 1.00 price unit), landed via `7e21d49`, `fd68a28`, `264e900`. dev-log:2617 carries `requires-attention: … final PASS at d2838fd predates these commits and requires a new whole-branch audit.` **No PASS is claimed. This is the single most important open item.** |
| **F19-2** | Foreign-symbol panels render the **primary** symbol's candles under a foreign label | High (correctness) | `.superpowers/rfc-019/dev-log.md:123`; `docs/superpowers/plans/2026-07-27-rfc-019-resume-prompt.md:181` | **OPEN.** `state/market/market.reducer.ts` still keys series by `Timeframe` only (`series: Partial<Record<Timeframe, Candle[]>>`) with no symbol dimension — the mono-symbol D1 assumption is structural. Marked "**Should be opened as its own issue**"; no issue found. |
| **F19-1** | Per-panel replay resolution | Feature | `.superpowers/rfc-019/dev-log.md` §6 | Deferred to its own RFC (conflicts with the global replay cursor). |
| **F19-3** | Touch/mobile hit-testing | Low | idem | Deferred, desktop-first. |
| **F19-4** | Z-order hover disambiguation for stacked drawings | Low | idem | Deferred to TEDS Phase 3. |
| **F19-5** | Register RFC-019 in `docs/architecture/ROADMAP.md` | Housekeeping | idem | Unverified. |
| **F21-1** | Lotaje layout breaks at the 240 px floor | Medium | `.superpowers/rfc-020/dev-log.md:2330`, `:2391`, `:2534` | **CLOSED** — "**F21-1 is CONFIRMED closed**" at `:2534`. |
| **F21-3** | «Otro símbolo» free-text input inert | Medium | `:2350` | **CLOSED** at `:2393` (replaced by a keyboard-operable listbox). |
| **F21-4** | Companion trigger name/placement | Low | `:2352` | **CLOSED** at `:2395`. |
| — | **Programmatic time-jumps escape telemetry capture.** "go to date" teleport + session/CSV-start loads dispatch `goToTime` directly, bypassing `seekTo` and the jump-arming path → captured as neither `ReplaySeek` nor `ReplayJump`, and do not reset anchors | Medium (data integrity of the black box) | `docs/architecture/DOMAIN_MODEL.md:563-566` — "A known, disclosed gap — not fixed in this closure — tracked as future telemetry work" | **OPEN.** Silently biases every RFC-014/016 behavioural metric. |
| — | **Deep IndexedDB insert rework** — the ~700 s download lever | Medium (perf) | `docs/engineering/performance.md:42-47` "Known deferred work" | **OPEN, deliberately.** Download pipelining explicitly **REJECTED — do not re-propose** (`performance.md:19`, dated 2026-06-19). |
| — | Dev-DB pollution: ~100k throwaway rows with timeframe `BENCH` in local `emulador-workspaces` | Trivial | `docs/engineering/performance.md` | Local-only, disposable. |
| — | RFC-017 Tasks 7–8 superseded by TEDS; **branch audit pending before PR** per the RFC status line | Process | `docs/architecture/rfcs/017-compositional-panel-sync.md:5` | Status line reads *"auditoría final de rama pendiente antes del PR a `develop`"* although PR #45 merged — **stale status line**, not real debt. |
| — | RFC-018 / RFC-019 / RFC-020 status lines still read *"Diseño aprobado — implementación pendiente"* | Docs staleness | `rfcs/018:5`, `rfcs/019:5`, `rfcs/020:5` | **All three shipped** (PRs #46, #47, #54). The RFC front-matter is systematically not updated at merge. |

---

### F-09 · RFC archaeology — branches grew ~10× and the SDD output is erratic, not steady
**Category:** Process trend · **Severity:** Medium · **Scope:** RFC-001..020

**Evidence (MEASURED FACT).** For each merge commit `M`: `git rev-list --no-merges M^1..M^2 | wc -l`, `git diff --name-only M^1 M | wc -l`, and the same filtered to `emulador/src/app/` non-spec.

| RFC | Merge | Commits | Files | App non-spec | Insertions |
|---|---|---:|---:|---:|---:|
| 001 | `1fc53ec` | 8 | 6 | 4 | 312 |
| 002 | `18a9f72` | 5 | 6 | 3 | 341 |
| 003 | `eb3435a` | 1 | 2 | 0 | 50 |
| 004 | `0e8ad5a` | 8 | 8 | 6 | 282 |
| 005 | `71c6ab1` | 3 | 7 | 5 | 170 |
| 006 | `06e34e1` | 4 | 8 | 7 | 280 |
| 007 | `89a9476` | 3 | 7 | 6 | 315 |
| 008 | `5867ac5` | 13 | 16 | 9 | 1690 |
| 009 | `0ce42f2` | 13 | 16 | 9 | 1690 |
| 010 | `8e89142` | 15 | 23 | 12 | 2234 |
| 011 | `cce9e80` | 17 | 31 | 17 | 1814 |
| 012 | `3844957` | 13 | 11 | 1 | 622 |
| 013 | `98c49c6` | 12 | 49 | 24 | 3157 |
| 014 | `e700ecb` | 35 | 66 | 28 | 9729 |
| 015 | `ab3a8e5` | 19 | 39 | 24 | 2995 |
| 016 | `1db11b6` | **44** | **143** | **68** | **15607** |
| 017 | `4e005d6` | **59** | 64 | 27 | 6242 |
| 018 | `0e66392` | 22 | 42 | 11 | 4262 |
| 019 | `49781f8` | 15 | 27 | 9 | 4065 |
| 020 | `b8d220f` | **63** | 45 | 15 | **16260** |
| calculadora (product fix→main) | `ad80b9f` | 20 | 13 | 6 | 2341 |

*Caveat:* RFC-008 and RFC-009 report identical figures because PR #27 (`0ce42f2`) merged a branch that already contained RFC-008's work; RFC-008 was also merged twice (`204b261` PR #26 and `5867ac5` PR #28). Treat 008/009 as one ~1690-insertion block.

**Observed pattern (INTERPRETATION).**
- **Yes, RFC branches are getting larger** — and by a lot. Mean insertions RFC-001..007 = **250**; RFC-014..020 = **8,023**. That is a **32× growth** in branch size across 54 days.
- **The output is erratic, not steady.** Commits-per-RFC over the last seven: 35, 19, **44**, **59**, 22, 15, **63**. Standard deviation is comparable to the mean. Files-per-commit swings from 143/44 ≈ 3.3 (RFC-016) to 45/63 ≈ 0.7 (RFC-020).
- **Two distinct RFC shapes have emerged.** RFC-016 = *broad* (143 files, 68 app files, 44 commits — a whole new Reflection/Journal surface). RFC-020 = *deep* (only 45 files and 15 app files, but **63 commits and 16,260 insertions** — the most commits of any RFC, on the smallest file surface). RFC-020 is 4.2 commits per changed file: the branch churned the same handful of files (`lotaje-view.ts`, `calculadora-page.component.*`) over and over. That is the signature of **design being discovered during implementation**, and it matches the dev-log record of D.20.5 being approved then revoked then replaced by D.20.6 (`.superpowers/rfc-020/dev-log.md` §24.1).
- **RFC-012 is the outlier worth celebrating:** 13 commits, 11 files, **1 app non-spec file**. A performance RFC that changed essentially one production file and proved it with specs.

**Why it matters HERE.** The SDD protocol was designed and validated on 250-insertion branches. It is now being run on 16,000-insertion branches with the same single-final-audit gate. F-10's Task-5 incident is the predictable consequence.

**Concrete risk.** RFC-021 at the current trend is a >60-commit, multi-thousand-insertion branch audited as one unit by an agent that must hold the whole diff in context. The audit's own reliability degrades exactly where it matters most.

**Recommended direction.** Cap RFC branch size (a wave/sub-PR split at ~2,000 insertions or ~20 commits, whichever first) rather than capping scope — RFC-016's breadth was legitimate, its single-block merge was not.
**Migration difficulty:** Low (process) · **Best mechanism:** `git-workflow.md` rule + a pre-audit size check · **Acceptance condition:** no RFC branch merges to `develop` with >25 commits without a documented split waiver.

---

### F-10 · Recurring defect clusters (from 93 `fix(` commits)
**Category:** Defect taxonomy · **Severity:** High · **Scope:** whole history

**Evidence.** `git log --regexp-ignore-case --grep='^fix' --format='%h|%ad|%s' --date=short` → **93 commits** (includes 5 merge commits of `fix/*` branches; ~88 distinct fixes). Clustered by reading subjects + the diffs/comments cited.

| # | Cluster | Incidents | Representative SHAs | Files | Preventing mechanism |
|---|---|---:|---|---|---|
| **C1** | **Lifecycle / cleanup / idempotence** | **9** | `9deebfd` (detach series markers, destroy idempotent), `5ab3605` (duplicate capability registration + clear map on destroy), `9d55e30` (container tracking), `335e85f` (`onversionchange` handler), `d2838fd` (companion adapter vs host lifecycle, `W5-FIX`), `c84d9cc`+`8db3211` (`[hidden]` / parked panels), `85e3d14` (versionless DB open), `3ffb639` (empty-dir guard) | `domain/chart/chart-engine.ts` (dominant), `lotaje/companion-window.ts`, `services/*-db.service.ts` | **Contract/property spec suite for engine + DB lifecycles**: create→destroy→create must be a no-op; double-register must throw; destroy must be idempotent. These are 5-line invariants that were each discovered by audit instead of asserted once. |
| **C2** | **State sync / hydration / ownership** | **13** | `102b97e`, `f2d8a4a`, `74a25a2`, `396398e`, `afd3c7b` (drawings ownership/`''` sentinel), `e4d8928`, `9e0c744` (link-group composition flags), `75e6a1f` (cloud payload threading), `40fcadd`, `4d73916`, `0c98d97`, `c39b74a`, `63fd8b8` (Supabase sync) | `state/workspaces/workspaces.effects.ts`, `state/drawings/drawings.reducer.ts`, `services/session-sync.service.ts`, `pages/sesiones/sesiones-page.component.ts` | **A single "hydration conformance" spec** that drives every entry path (cold start, IndexedDB restore, cloud pull, `.session.json` import, legacy migration) through the *same* assertion table. Today each path is fixed individually — `a7e9983` fixed IndexedDB-read lifting and three separate follow-ups fixed the other paths (F-07). |
| **C3** | **Units / precision / instrument classification** | **7** | `9bfba5e` (crypto pointSize misclassified as Forex), `ea06fb4` (pip-denominated distance not converted to price units), `d528bc8`, `264e900`, `fd68a28` (metal points), `8b6093a` (decimal-comma parsing), `df030de` (price P/L off the sub-TF) | `state/trading/execution-costs.ts`, `lotaje/sizing-view-model.ts`, `domain/sizing/*` | **F-05's single classifier** + a **units-in-types discipline** (branded `PriceUnits` / `Points` / `Pips` types so a conversion cannot be forgotten). Every incident here is a number that was right in one unit and wrong in another. |
| **C4** | **Time / timezone / server time** | **4** | `b5fbde3` (shift display time over broker **server** time, not UTC), `95cb14e` (pick a real time zone), `1264385`/`a353a7a` (pipeline server-time shortfall + silent truncation), `1aacd3c` (archived export M1 anchor/year derivation) | `domain/chart/display-time.ts`, `pipeline/mt5_common.py` | **One declared time authority**: a single module that names *which* clock each timestamp is in, with the broker-server offset as explicit data. `pipeline/mt5_common.py:143-144` documents the failure mode in prose ("*así se perdieron NAS100 y SP500, cortados en el 2026-06-18 mientras US30 y XAUUSD llegaban al minuto actual*") — prose is not a guard. |
| **C5** | **Test blind spots — the suite was green** | **6+** | `3a9185e` ("*tests que fijan lo que afirman*"), `dfa5dc9`, `8b6093a` (all three off `085c08d`), `7e063aa` (`isolate:false` determinism), `213f6b5` (fixtures widened after the fact), `cebd6bc` (`assertNoLookahead` compared against the wrong instant — audit M1) | `pages/calculadora/*`, `state/selectors.spec.ts` | See F-11 — this is the meta-cluster. |
| **C6** | **Selector memoization / reference stability** | 2 | `28a2b4d` (memoize `chartStyle$` colours + `tradeBoxOpacity` for reference stability), `cc35aa5` (timing-independent range-echo suppression) | `components/chart/chart-model-mapper.service.ts` | Reference-identity assertions in specs (`expect(a).toBe(b)` across two emissions), not just value equality. Notably **low** — Invariant 5 (factory-selector ban) appears to be working. |
| **C7** | **Build / bundle / lockfile hygiene** | 4 | `3c323c3` (vitest-free layout invariant checker — a `*.spec-util` import was shipping vitest into prod), `d8af213` (`@emnapi` lock entries for `npm ci`), `3db125c` (Vercel using the wrong config), `8d5f269` (parquet-wasm served-asset URL) | build config, `services/session-migration.ts` | Already codified as Invariants 7/8 + the `npm ci --dry-run` rule in `CLAUDE.md`. **This cluster stopped recurring after it was written down** — direct evidence that the mechanism works. |
| **C8** | **Cross-TF / lookahead fidelity** | 3 | `7e4ab2a` (close cross-TF lookahead in `chartView$`), `cebd6bc` (audit M1 on the fix itself), `74e17ef` (derive trade geometry from each panel's own candles) | `components/chart/chart-model-mapper.service.ts` | Property test: for every (display TF, replay TF, cursor) triple, no rendered candle may contain data after the revealed instant. |

**Why it matters HERE.** C1+C2 = 22 of ~88 fixes (**25%**) are lifecycle and hydration — i.e. *the same two questions asked in different modules*. C3+C4 = 11 (**12.5%**) are units and clocks — the two things a trading emulator must never get wrong. C7 is the proof that writing a rule down ends a cluster.

---

### F-11 · The three owner-stated lessons are corroborated by history — and one is unfixed
**Category:** Verification-integrity / test design · **Severity:** High · **Scope:** test strategy

**(a) "A test that doesn't cross the boundary can't see the defect."** **CORROBORATED.** Cited as M-1 in the RFC-020 memory. Direct historical instance: `3c323c3 fix(state): extract vitest-free layout invariant checker so session-migration keeps vitest out of the production bundle` — tsc and the whole suite were green while the prod bundle shipped vitest, because no gate crossed the bundling boundary. Also `d8af213` (local green, CI `npm ci` EUSAGE). *Not yet read directly: the M-1 entry in `.superpowers/rfc-020/dev-log.md`.*

**(b) "A Task-5 audit passed all four gates while asserting a FALSE invariant."** **LOCATED, partially verified.** RFC-019's dev-log carries the finding structure and `cebd6bc fix(rfc-019): compare assertNoLookahead against the revealed instant (audit M1)` is the corrective commit — the invariant helper itself was comparing against the wrong instant, so it asserted something false and passed. Separately, RFC-018's dev-log records the *other* shape at `:538`: `#### Task 5 / F3 — Per-panel trade geometry — **COMPLETE ⟨AUDITED: FAIL → fixed → PASS⟩**` and at `:569` `**Fix (51836a9)** — one test, gate **OPEN**, boxesVisible flipped false *after* the mapper is …`. *Not yet read: the RFC-019 Task-5 audit text itself.*

**(c) "Two High-severity input bugs shipped past a green suite because tests called `.set()` instead of using the DOM."** **CORROBORATED MECHANICALLY.** The chain is in the history exactly as described — one feature, three same-day fixes, all input handling:
```
085c08d feat(calculadora): página de dimensionado CFD/Forex con estados honestos
  -> 3a9185e fix(calculadora): mensaje de aviso honesto y tests que fijan lo que afirman
  -> dfa5dc9 fix(calculadora): entradas que aceptan decimales y campos con nombre accesible
  -> 8b6093a fix(calculadora): parsear el numero completo o rechazarlo (coma decimal)
```
The middle commit's subject ("*campos con nombre accesible*" — fields with an accessible name) is itself the tell: the fields had no accessible name, which a DOM-crossing test would have required in order to find them at all. `pages/calculadora/calculadora-page.component.spec.ts` is the **#1 file in fix-commit churn (8)** — the spec file is fixed as often as the code.

**Why it matters HERE.** All three lessons are the *same* lesson at three altitudes: **the repo's verification gates are strong on logic and weak on boundaries** (DOM, bundler, CSS layout, and the invariant-helper's own correctness). The memory entry "unit suite has NO layout engine so CSS tests pass vacuously" is the fourth instance of it.

**Concrete risk.** Four verification gates run green on every RFC. Their green is trusted (`CLAUDE.md`: "fresh output is the only acceptable evidence"). But green demonstrably does not cover: DOM event paths, CSS layout, bundle contents, or whether an invariant helper asserts a true proposition.

**Recommended direction.** Name the blind spots explicitly in `docs/engineering/testing.md` as a standing checklist ("does this change alter DOM input handling / CSS layout / bundle contents / an invariant helper? then the unit suite cannot see it"), and require *one* DOM-crossing test per user-input surface. The mechanism already exists for C7-class problems (the build-probe sentinel); it needs siblings.
**Migration difficulty:** Low · **Best mechanism:** written rule + a per-surface DOM test requirement · **Acceptance condition:** every component accepting free-text numeric input has ≥1 spec that dispatches a real `input` event rather than calling `.set()`.

---

### F-12 · Documentation churn is concentrated in run-ledgers, and RFC front-matter is systematically stale
**Category:** Documentation instability · **Severity:** Low-Medium · **Scope:** `docs/`, `.superpowers/`

**Evidence (MEASURED FACT).**
```
git log --pretty=format: --name-only | grep -v '^$' | grep -E '^(docs/|README|CLAUDE.md|PRODUCT.md|DESIGN|.superpowers/)' | sort | uniq -c | sort -rn
```
```
101 .superpowers/sdd/progress.md         <- #1 most-changed file in the entire repo
 32 .superpowers/rfc-020/dev-log.md
 13 .superpowers/rfc-018/dev-log.md
  9 .superpowers/rfc-019/dev-log.md
  8 docs/architecture/rfcs/017-compositional-panel-sync.md
  8 docs/architecture/UBIQUITOUS_LANGUAGE.md
  8 docs/architecture/DOMAIN_MODEL.md
  6 docs/engineering/domain/workspace-panels.md
  6 docs/engineering/domain/data-pipeline.md
  6 docs/architecture/ROADMAP.md
  5 README.md
  5 CLAUDE.md
```

**Observed pattern (INTERPRETATION).** The top four documentation files are all **run ledgers**, not knowledge. That is healthy — a ledger *should* churn. The signal is in the next tier: `UBIQUITOUS_LANGUAGE.md` (8) and `DOMAIN_MODEL.md` (8) churn as much as the most-edited RFC. Domain vocabulary that is still moving after 20 RFCs means the model is not settled. Meanwhile the RFC front-matter is *not* churning when it should: RFC-018, 019 and 020 all still read `Estado: Diseño aprobado — implementación pendiente` despite having shipped (PRs #46, #47, #54), and RFC-017 still claims its branch audit is pending after PR #45 merged.

**Why it matters HERE.** `CLAUDE.md`'s context-loading table sends every agent to the RFCs first. An agent reading `019-pane-guard-cross-tf-forming.md:5` today is told the work is unimplemented. That is a live misinformation hazard in the exact document the operating system points at.

**Recommended direction.** Add "update the RFC's `Estado` row" to the merge checklist in `git-workflow.md`; it is a one-line edit that four consecutive RFCs have missed.
**Migration difficulty:** Trivial · **Best mechanism:** merge checklist item · **Acceptance condition:** no RFC in `docs/architecture/rfcs/` whose branch has merged reads "implementación pendiente".

---

## RESUME BRIEF

*Paste this whole section into a fresh session. It is self-contained.*

### (a) Role and remaining scope

You are a **Principal Engineer performing a READ-ONLY technical-debt audit** of the `trading-emulator` repository at `C:\Users\78701\Desktop\trading-emulator` (branch `develop`, HEAD `a2ca53b`). Your specific role is **Change-Risk, Churn & Shotgun-Surgery Auditor**.

**ABSOLUTE RULES.** READ-ONLY on the repository. Do NOT edit, refactor, delete, commit, push, or create any file in the repo. Do NOT change branches, stash, or reset. Read-only git commands ONLY (`git log`, `git show`, `git diff`, `git blame`, `git rev-list`, `git shortlog`, `git ls-tree`, `git ls-files`). **The ONLY writes permitted are files under `C:\Users\78701\Desktop\trading-emulator\.superpowers\audit-2026-08-10\`** (untracked, survives session resets). Your report file is `.superpowers\audit-2026-08-10\audit-churn-shotgun-history.md` — **read it first; it already contains ~75% of the finished work.** Append/extend it; do not rewrite what is there.

Every claim needs evidence: a commit SHA, a `path:line`, or a mechanically generated count. No invented metrics. Separate MEASURED FACT / INTERPRETATION / RECOMMENDATION. Use TD-finding blocks: Finding name / Category / Severity / Scope / Evidence / Observed pattern / Why it matters HERE / Concrete risk / Recommended direction / Migration difficulty / Best mechanism / Acceptance condition.

**Original six investigation areas:** (1) churn analysis, (2) co-change coupling, (3) shotgun surgery [core deliverable], (4) historical defect patterns, (5) revert/rework rate, (6) RFC archaeology + known-open deferred items.

**Final deliverable owed to the caller:** a digest of AT MOST 140 lines containing — the churn×complexity ranked table, the top cross-module co-change pairs, the shotgun-surgery table (change type → files touched → verdict), the recurring defect clusters with incident counts and preventing mechanism, the rework hotspots, and the list of known-open deferred items. No padding.

### (b) Commands already run — DO NOT RE-RUN THESE

All were run from `/c/Users/78701/Desktop/trading-emulator` via the Bash tool (Git Bash). Key outputs are recorded in FINDINGS above; the essentials:

| Command | Key output |
|---|---|
| `git rev-list HEAD --count` / `--all --count` / `HEAD --merges --count` | 667 / 727 / 59 |
| `git log --reverse --format='%ad' --date=short \| head -1` and `git log -1 --format='%ad' --date=short` | 2026-06-15 → 2026-08-07 (**54 days total history**) |
| `git shortlog -sne --all` | 673 + 54, one human, two email aliases |
| `git log --format='%(trailers:key=Co-Authored-By,valueonly)' \| sort \| uniq -c \| sort -rn` | Fable 5 =156, Opus 5 =117, Opus 4.8 =87, Sonnet 4.6 =11, Opus 4.7 =1; 372/667 commits carry a trailer |
| `git log --pretty=format: --name-only \| grep -v '^$' \| sort \| uniq -c \| sort -rn` | full churn — top rows recorded in F-02/F-12 |
| `git log --regexp-ignore-case --grep='^fix' --pretty=format: --name-only \| … \| sort \| uniq -c \| sort -rn` | fix-churn — recorded in F-02 |
| `git log --regexp-ignore-case --grep='^fix' --oneline \| wc -l` | **93** |
| `git log --regexp-ignore-case --grep='^refactor' --grep='^chore' --grep='^style' --pretty=format: --name-only \| …` | refactor-churn — recorded in F-02 |
| `git log --all --format='%h\|%s' --grep='^Revert' -i` | **empty — 0 reverts** |
| `git log --merges --format='%h\|%s'` | 59 merges; RFC merge SHAs recorded in F-09 |
| per-RFC: `git rev-list --no-merges M^1..M^2 \| wc -l`, `git diff --name-only M^1 M \| wc -l`, `git diff --shortstat M^1 M` | full table in F-09 |
| `git ls-tree -r HEAD --name-only .superpowers` | `rfc-018/dev-log.md`, `rfc-019/dev-log.md`, `rfc-020/dev-log.md`, `sdd/progress.md`, 3 `.gitignore`s |
| `grep -c -- '--' emulador/src/styles.css` | 126 |
| `grep -rn --include=*.ts -oE "#[0-9a-fA-F]{6}\b" emulador/src/app \| grep -v '\.spec\.' \| wc -l` | 146 |
| `grep -rn "getComputedStyle\|getPropertyValue\|--color\|cssVar" emulador/src/app/domain/chart emulador/src/app/components/chart` | **no output** (chart never reads CSS vars) |
| `grep -rn "AppState\b" emulador/src/app \| grep -v '\.spec\.'` | **no output** (no root state interface) |

**Co-change script** (rerun only if you need different thresholds). Dump: `git log --pretty=format:'@@%H' --name-only > commits.txt`. Then a Python script (`py` is the working launcher on this box — **`python` is a Windows Store stub, do not use it**) that: splits on `@@`, keeps only `emulador/src/app/**` `.ts|.html|.css` excluding `*.spec.ts`, skips commits with 0/1 or >40 kept files, counts `itertools.combinations` pairs, and reports pairs with count ≥3 where the two files' module keys differ (module key = first two path segments for `state/`,`components/`,`domain/`,`pages/`, else first segment). Output: **667 commits parsed, 196 usable multi-file commits**; results in F-03. Commit-size distribution from the same data: `{0 app files: 367, 1: 102, 2-5: 159, 6-15: 31, 16-40: 6, >40: 2}`, total 1113 app-file edits, max 105 in one commit.

**Rework script** (fix-follows-feature). Dump: `git log --reverse --format='@@%H|%ad|%s' --date=short --name-only`. Parse to ordered commit records keeping non-spec `emulador/src/app/**` and `pipeline/**` (excluding `pipeline/tests`). For each commit whose subject starts with `fix`, scan back up to 12 commits for the nearest `feat*`/`refactor*` sharing ≥1 file; count that file. Output: **58 chains**; hotspot counts in F-07.

### (c) What was concluded

Twelve findings, F-01..F-12, all written up in FINDINGS above. The load-bearing conclusions:
1. **54-day repo, not a year** — all churn is a 54-day rate; multiply your intuitions by ~7.
2. `chart.component.ts` is the #1 hotspot on every axis (score 62.7, 2× the next file); `chart-engine.ts` has the worst fix-to-churn ratio (8/16) and ties for most rework.
3. Invariant 1's chart boundary is clean as a *dependency* rule but is a **co-edit** in practice — 9 of the top 15 cross-module co-change pairs straddle it.
4. Shotgun surgery is **worst for assets (8–9 files, triplicated classifier)** and **best for NgRx slices (1 file outside the slice) and telemetry facts (3–4 files)**.
5. 0 reverts but **58 fix-follows-feature chains (8.7% of commits)** — rework is real and absorbed pre-merge by the audit loop.
6. RFC branches grew **32×** in mean insertions (250 → 8,023) across the 54 days; output is erratic (15..63 commits per RFC).
7. All three owner-stated test lessons are corroborated; they are one lesson — **the gates are strong on logic, blind on boundaries** (DOM, CSS layout, bundle, invariant-helper truth).
8. The single most important open item is **F21-2** (`.superpowers/rfc-020/dev-log.md:2617`): the fix landed on the PR branch after the final PASS, and the dev-log itself says a fresh whole-branch audit is required and **no PASS is claimed**.

### (d) Dead ends and non-issues — do not spend time here

- **"Distinct authors per hot file"** is not a useful signal in this repo: one human author (two email aliases) wrote everything; the only real variation is the agent model in the `Co-Authored-By` trailer, and those are distributed across all files by session, not by ownership. The global model histogram (F-01) is the whole of the available signal. Skip per-file author counts.
- **"Last ~6 months vs full history"** — these are the same window (F-01). Do not compute a split.
- **Adding a display timeframe** is a **non-issue**: `models.ts` already enumerates all 21 MT5 timeframes with `TIMEFRAME_SECONDS` and `TIMEFRAME_ORDER`. Only the *anchor/fetchable* TF set (`M1|H1|D1`) is scattered.
- **`grep -iE "deferred|pendiente|independiente"` over Spanish docs is heavily contaminated** — "independiente" matches "pendiente" substrings and produced ~40 false positives from RFC prose. Search for the finding IDs directly (`F19-`, `F21-`, `D\.20\.`) instead.
- **Invariant 5 (factory-selector ban) shows no defect trail** — only 2 memoization fixes in 93. It is working. Do not flag it.
- **`state/trading/fill-engine.ts` has zero `fix(` commits.** Despite being money-critical it is not a hotspot. Do not recommend touching it.
- **The `main`↔`develop` ancestry graft is present and benign**: `1352cf5 chore(merge): graft the PR #36 squash release into develop's ancestry` and back-merges `85dc547`, `a2ca53b`. It did NOT distort any count in this report (all counts are HEAD-reachable and merges contribute no filenames to `--name-only`). Note it as a caveat, do not investigate it.
- **`.superpowers/rfc-020/` IS tracked at HEAD** despite the session-start `git status` showing `?? .superpowers/rfc-020/` (that snapshot predates the back-merge). Verified with `git ls-tree -r HEAD --name-only .superpowers`.

### (e) ORDERED remaining steps

1. **Measure `domain/chart/chart-engine.ts` LOC** (`wc -l`, non-spec) and insert its row into the F-02 ranked table. It is the only hot file with no complexity figure, and it has the worst fix ratio in the repo. *(1 command)*
2. **Read `docs/engineering/anti-patterns.md` end-to-end** and cross-check it against the eight defect clusters in F-10. The question to answer: *which clusters are already written down, and which keep recurring because nobody wrote them down?* Cluster C7 (build/bundle) stopped after it was codified — that is the control case. Add the result as a new finding **F-13 (Category: organisational learning)**. *(1 read)*
3. **Read `.superpowers/rfc-020/dev-log.md` around the M-1 entry** (search `M-1`) and the RFC-019 Task-5 audit text (`.superpowers/rfc-019/dev-log.md`, search `Task 5`). Quote them directly to finish verifying F-11(a) and F-11(b). *(2 greps + 2 targeted reads)*
4. **Sweep the three remaining tracked artifacts for open items** to complete F-08: `docs/superpowers/teds-plan-amendments.md`, `docs/architecture/rfcs/017-compositional-panel-sync.md` §6, and `.superpowers/sdd/progress.md` (the 101-change ledger — check its tail for unclosed tasks). *(3 reads)*
5. **Confirm F21-2's true status.** Read `emulador/src/app/lotaje/sizing-view-model.ts:60-120` (already quoted in F-08) against the D.20.6 owner pins in `.superpowers/rfc-020/dev-log.md` §24.1 (XAUUSD / $10,000 / 1% / 10 pts → 10.00 price units / 0.10 lots / $100.00). State plainly whether the code satisfies the pins. This is the highest-value remaining check. *(1 read, arithmetic)*
6. **Optional, only if budget allows:** compute intra-module co-change (run the script with `mode='same'` instead of `'cross'`) to see whether any single module is internally shotgunned. Low expected value — the cross-module table already told the story.
7. **Produce the ≤140-line digest** for the caller, drawing from the tables in F-02, F-03, F-04, F-07, F-08, F-10. Do not exceed 140 lines; drop prose before dropping numbers.
