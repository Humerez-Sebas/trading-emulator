# Test Architecture & Test Portfolio Audit — `trading-emulator`

**Auditor role:** Test Architecture & Test Portfolio Auditor (READ-ONLY)
**Repo:** `C:\Users\78701\Desktop\trading-emulator`, branch `develop`, HEAD `a2ca53b`
**Date:** 2026-08-10
**Scope of writes:** this file only. No repository source was modified.

---

## STATUS

**~85% complete.**

### AREAS COMPLETE

- **(1) Source-text tests** — exhaustive mechanical sweep done, result is decisive (see F-01).
- **(2) Vacuous tests** — full mechanical enumeration of every `it()` block done (see F-02).
- **(3) Boundary-crossing gap** — quantified at file AND `it()`-block level (see F-03).
- **(4) Setup convention** — hook counts, factory-convention inventory, shared-fixture inventory done (see F-06).
- **(5) Isolation / flakiness risk** — the dominant risk is found and enumerated exactly (see F-04).
- **(7) Test pyramid / portfolio** — full six-bucket breakdown computed; e2e presence conclusively answered (see F-05, F-08).
- **(8) "Does the source contain this text?" tests** — answered as part of (1); named explicitly.

### AREAS PARTIAL

- **(6) Test mechanics** — fake timers, async idiom, `detectChanges`, duplication, largest fixtures and helper placement are all measured (F-07, F-09). NOT measured: actual TestBed compilation wall-clock cost (would require running the suite, which the brief forbids), and per-file runtime attribution.
- **(7) Per-domain protection verdict** — verdicts are recorded for all nine high-risk areas, but three of them (chart synchronization across panels, derived analytics/telemetry, IndexedDB persistence) were assessed from spec inventory + size + naming rather than a close read of the assertions. Treat those three verdicts as MEDIUM confidence; the other six are HIGH confidence.

### AREAS NOT STARTED

- Nothing from the brief is untouched. The only deliberate omissions are the two cost measurements named above under (6).

---

## MEASURED FACTS — headline counts

All commands run from `C:\Users\78701\Desktop\trading-emulator\emulador`.

| Metric | Value | How produced |
|---|---|---|
| Spec files | **182** | `find src -name "*.spec.ts" \| wc -l` |
| `*.spec-util.ts` files | **2** | `find src -name "*.spec-util.ts"` |
| Test code LOC | **43,337** | `find src -name "*.spec.ts" -exec cat {} + \| wc -l` |
| Source LOC (non-spec `.ts`) | **33,411** | `find src -name "*.ts" ! -name "*.spec.ts" ! -name "*.spec-util.ts" -exec cat {} + \| wc -l` |
| `it()` / `test()` call sites | **2,369** | `scratchpad/vacuous2.py` (line-anchored regex + brace matcher) |
| Skipped / `.todo` tests | **0** | same script |
| Source-text tests (read a file and assert on its bytes) | **0** | see F-01 |
| Snapshot tests | **0** | `grep -rn "toMatchSnapshot\|toMatchInlineSnapshot\|toMatchFileSnapshot"` → 0; `find src -name "*.snap"` → empty |
| `getComputedStyle` assertions | **0** | `grep -rn "getComputedStyle" src --include="*.spec.ts"` → 0 |
| Layout-metric reads (`offsetWidth` etc.) | **4** (2 files) | `grep -rn "offsetWidth\|offsetHeight\|clientWidth\|clientHeight\|getBoundingClientRect"` |
| `it()` blocks with ZERO `expect()` | **13** (all use custom assert helpers — see F-02) | `vacuous2.py` |
| `it()` blocks whose EVERY assertion is weak (`toBeDefined`/`toBeTruthy`/`toBeFalsy`/`toBeInstanceOf`/`not.toBeNull`) | **40** (1.7%) | `vacuous2.py` |
| `beforeEach` / `afterEach` / `beforeAll` / `afterAll` | **74 / 64 / 2 / 2** | `grep -rn "\bbeforeEach(" src --include="*.spec.ts" \| wc -l` (etc.) |
| Spec files with NO hooks at all | **93** (51%) | shell loop, see F-06 |
| Spec files with `beforeEach` but no `afterEach`/`afterAll` | **26** | shell loop |
| `overrideSelector` call sites | **519** | `grep -rn "overrideSelector" src --include="*.spec.ts" \| wc -l` |
| Files with `overrideSelector` and NO `resetSelectors` | **19** | shell loop, full list in F-04 |
| Module-scope `vi.mock` | **4** | `grep -rn "^vi\.mock(" src --include="*.spec.ts"` |
| Top-level (module-scope) `let` in specs | **8** (8 files) | `grep -rnE "^let " src --include="*.spec.ts"` |
| `vi.fn()` / `vi.spyOn` | **373 / 199** | `grep -rn ... \| wc -l` |
| `fixture.whenStable()` | **0** | `grep -rn "whenStable"` |
| `fakeAsync` / `tick(` / `waitForAsync` | **3** total | `grep -rn "fakeAsync\|tick(\|flushMicrotasks\|waitForAsync"` |
| `await Promise.resolve()` / `await new Promise` (the de-facto flush idiom) | **270** | `grep -rn "await Promise.resolve()\|await new Promise"` |
| `detectChanges()` | **211** | `grep -rn "detectChanges()"` |
| `compileComponents()` | **6** | `grep -rn "compileComponents()"` |
| `TestBed.configureTestingModule` call sites / distinct bodies | **81 / 60** | `scratchpad/fixtures.py` |
| Angular private-API (`ɵ`) uses in specs | **2** (1 test) | `grep -rn "ɵ" src --include="*.spec.ts"` |
| E2E test framework | **NONE** | `package.json` devDeps: no Playwright, no Cypress, no WebdriverIO; no `e2e/` dir anywhere |
| Source files with NO adjacent `.spec.ts` | **75** | shell loop |

### Portfolio breakdown (`scratchpad/portfolio.py`)

| Bucket | Files | `it()` blocks | Share |
|---|---:|---:|---:|
| Pure unit (no TestBed) | 107 | 1,425 | 60.2% |
| Integration (store/effects via TestBed injector) | 36 | 539 | 22.8% |
| Component: renders + real DOM events | 19 | 281 | 11.9% |
| Component: renders + DOM read only (no events) | 14 | 88 | 3.7% |
| Component: renders, no DOM assertions at all | 4 | 34 | 1.4% |
| TestBed injector, other | 2 | 2 | 0.1% |
| **E2E** | **0** | **0** | **0%** |

---

## FINDINGS SO FAR

---

### F-01 — There are essentially ZERO source-text tests. The suspected debt does not exist.

- **Category:** Test design / prior-hypothesis refutation
- **Severity:** N/A (negative finding — this is good news)
- **Scope:** Whole suite (182 spec files)

**Evidence (all searches returned empty):**

```
grep -rn "readFileSync\|readFile\|fs\.promises\|from 'node:fs'\|require('fs')" src --include="*.spec.ts" --include="*.spec-util.ts"   -> 0 matches
grep -rn "__dirname\|import\.meta\|path\.join\|path\.resolve\|process\.cwd" src --include="*.ts"  -> 2 matches, BOTH production code:
    src/app/services/market-data/data-onboarding.service.ts:53   (new Worker(new URL(..., import.meta.url)))
    src/app/workers/parquet.worker.ts:47                          (comment)
grep -rn "?raw" src --include="*.ts"                     -> 0
grep -rn "globby\|fast-glob\|fs-extra"                   -> 0
grep -rn "toMatchSnapshot\|toMatchInlineSnapshot"        -> 0 ; find src -name "*.snap" -> empty
grep -rn "\.toString()" src --include="*.spec.ts"        -> 0
grep -rn "Reflect\.getMetadata\|__annotations__\|\.constructor\.name" -> 0
grep -rn "innerHTML" src --include="*.spec.ts"           -> 0
```

**Observed pattern:** No test in this repository opens a source file, template, or stylesheet and asserts on its text. There is no snapshot infrastructure. There is no `?raw` template import.

**Verdict per the brief's DELETE / REWRITE / LINT / ARCH / KEEP taxonomy:** the population is empty. **Exact count of source-text tests: 0.**

**The three nearest neighbours** — the only tests in the suite that assert on *structure* rather than *behavior* — are worth naming, because they are the ones a reader might mistake for source-text tests:

1. `src/app/pages/emulador/emulador-page.component.spec.ts:199-205`
   ```ts
   const metadata = (EmuladorPageComponent as unknown as { ɵcmp: { providersResolver?: unknown } }).ɵcmp;
   expect(metadata.providersResolver).toBeFalsy();
   ```
   Asserts "this component declares no `providers:` array" by reading Angular's **private compiled metadata**. This is the repo's only use of `ɵ` in a spec.
   **Verdict: REPLACE-WITH-LINT-RULE.** An `@typescript-eslint/no-restricted-syntax` rule banning a `providers` key in this component's decorator expresses the same invariant without pinning the suite to an undocumented Angular internal that can be renamed in any minor. Kernel invariant D8 (factory-selector ban) is the real thing being protected and deserves a durable mechanism.

2. `src/app/services/telemetry-db.service.spec.ts:145-151`
   ```ts
   const proto = Object.getPrototypeOf(svc) as object;
   const methodNames = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor');
   expect(methodNames.some((n) => /update|delete|remove/i.test(n))).toBe(false);
   ```
   "Append-only surface" enforced by regex over method *names*. Renaming a destructive method to `purge`/`drop`/`evict` evades it silently.
   **Verdict: REPLACE-WITH-ARCHITECTURE-TEST or KEEP-with-caveat.** The invariant (telemetry is append-only) is real and worth protecting; the mechanism is name-shaped and therefore weak. A behavioral test — write N events, attempt every public method, assert the store never shrinks — would be total instead of nominal.

3. `src/app/app.routes.spec.ts:1-40` (whole file)
   Asserts route table shape: `calculadoraRoute` exists, `canActivate` contains `authGuard` and NOT `r2OnboardingGuard`, `loadComponent` resolves to the right class, and index-before-wildcard ordering.
   **Verdict: KEEP.** This is legitimate configuration-invariant enforcement, not source-text matching — it reads the *exported runtime value* `routes`, exercises `loadComponent()` for real (`await calculadoraRoute?.loadComponent?.()`), and the "placed before the wildcard so it is never dead" test (`app.routes.spec.ts:34`) encodes a genuine, non-obvious failure mode.

**KEEP — the invariant infrastructure is exemplary and must not be touched.** The repo already implements the exact pattern `docs/engineering/testing.md:50-58` prescribes: a vitest-free production twin plus a thin `*.spec-util.ts` wrapper.
- `src/app/services/session-sync.mapping.ts:75` (`assertNoCandles`) — production code, called from `session-sync.mapping.ts:197`, `session-sync.service.ts:112`, `lessons-db.service.ts:62`, `playbook-db.service.ts:61`; tested at `session-sync.mapping.spec.ts:97-106`, `:336`, `:570` and reused as a payload guard at `lessons-db.service.spec.ts:44` and `playbook-db.service.spec.ts:49`. Kernel invariant 4 is enforced at runtime in production, not merely in tests. This is the strongest single piece of test architecture in the repo.
- `src/app/state/layout/layout-invariants.ts` (pure) + `layout-invariants.spec-util.ts` (vitest wrapper), consumed at `layout.reducer.spec.ts:12` and `session-persistence.e2e.spec.ts:6`.
- `src/app/components/chart/lookahead-invariants.spec-util.ts` (RFC-019 D19.I) consumed at `chart-model-mapper.service.spec.ts:24`.

**Why it matters HERE:** the audit brief budgeted the largest share of effort for this category. It is empty. That effort should be redirected to F-03 and F-04, which are where real defects have actually shipped.

---

### F-02 — Vacuous tests are rare (1.7%) and concentrated in one family; the CSS/layout-vacuity risk does not materialize.

- **Category:** Test effectiveness
- **Severity:** LOW
- **Scope:** 40 `it()` blocks of 2,369

**Evidence — the mechanical rule:** an `it()` block is flagged when *every* `expect()` inside it is one of `toBeDefined` / `toBeTruthy` / `toBeFalsy` / `toBeInstanceOf` / `not.toBeNull`. Produced by `scratchpad/vacuous2.py`.

**Distribution of the 40:**

| Family | Count | Files |
|---|---:|---|
| `journal-viz` chart components (SVG existence + tooltip show/hide) | 21 | `scatter-mae-mfe.component.spec.ts` (8), `bubble-duration-r.component.spec.ts` (6), `heatmap-trade-calendar.component.spec.ts` (7) |
| `emulador-page` conditional-render shell tests | 6 | `src/app/pages/emulador/emulador-page.component.spec.ts:46,167,173,183,193,199` |
| Workspace panel state-class tests | 3 | `chart-panel.component.spec.ts:190,354`; `workspace-viewport.component.spec.ts:493` |
| Reflection domain boundary cases | 3 | `scene-spec.spec.ts:296`; `waypoints.spec.ts:202,354` |
| Assorted single cases | 7 | `app.routes.spec.ts:12`; `app.spec.ts:14`; `chart.component.pane-guard.spec.ts:331`; `mercados-page.component.spec.ts:6`; `journal-data.service.spec.ts:164`; `trading.reducer.spec.ts:814`; `workspaces.effects.spec.ts:1038` |

**Observed pattern — most of these are shallow, not vacuous.** Read closely, the journal-viz cases DO cross the DOM and DO dispatch real events:

`src/app/components/journal-viz/scatter-mae-mfe.component.spec.ts:238-259`
```ts
const circle = fixture.nativeElement.querySelector('circle[data-point]');
circle?.dispatchEvent(new MouseEvent('mouseenter'));
fixture.detectChanges();
const tooltip = fixture.nativeElement.querySelector('[data-tooltip]');
expect(tooltip).toBeTruthy();
```
That is a genuine behavioral assertion (hover → tooltip element appears). The weakness is that it never asserts tooltip *content*, and the file's sibling test at `:262` ("should format tooltip as `#seq · date · ±R · ruleTitle`") does — so the content is covered elsewhere. **Verdict for the 21 journal-viz cases: KEEP.**

**Genuinely weak, worth acting on (4 cases):**

- `scatter-mae-mfe.component.spec.ts:31`, `bubble-duration-r.component.spec.ts:31`, `heatmap-trade-calendar.component.spec.ts:31`:
  ```ts
  expect(svg?.getAttribute('aria-label')).toBeTruthy();
  ```
  Passes for `aria-label="x"`, `"TODO"`, or an untranslated English string in a Spanish UI. The test's own title claims it verifies the label *describes the visualization*. **Verdict: REWRITE-AS-BEHAVIORAL** — assert the actual expected string, the same way the tooltip-format tests already do three lines away.
- `src/app/app.spec.ts:14` (`should create the app`) and `src/app/pages/emulador/emulador-page.component.spec.ts:46` (`is created successfully`) — pure smoke, cannot fail except on a constructor throw. **Verdict: KEEP** (cheap DI/bootstrap canary; the CLI-generated idiom) but they are not evidence of anything.

**The CSS/layout-vacuity hypothesis is REFUTED:**
- `getComputedStyle` in specs: **0**.
- Layout-metric reads: **4**, in `chart-engine.pane-rect.spec.ts` (3) and `chart.component.trade-guard.spec.ts` (1) — and `chart-engine.pane-rect.spec.ts:58` mocks `lightweight-charts` with `vi.mock`, so these are stubbed rects fed deliberately, not jsdom's always-zero geometry being trusted.
- Class-presence assertions: **43** across 10 files. Sampled in full for the two densest files:
  - `src/app/lotaje/lotaje-view.spec.ts:771,776,781,785,802,818,951,958` — `lotaje-copy-action--copied` toggling around a real clipboard interaction; `:1018,1029,1030` — `lotaje-method-option--selected`.
  - `src/app/components/workspace/chart-panel.component.spec.ts:247,254,265` (`linked`), `:370,378,386` (`disabled`), `:446,452,457` (`active`).
  These are **class-as-state-proxy**, i.e. real behavior expressed through a class name. **Verdict: KEEP.** Residual risk is only that a CSS rename breaks the visual while the test still passes — a real but low-severity coupling, not vacuity.
- Inline `style.` assertions: **6**. `var(--token)` occurrences (58) are almost all *input data* (`colorToken: 'var(--rule-1)'`); the three assertions that mention tokens (`scatter:135`, `heatmap:85,98,111`) verify token **pass-through into the fill attribute**, which is behavior.

**Why it matters HERE:** the owner's memory note ("the unit suite has NO layout engine so CSS tests pass vacuously") is a true statement about jsdom but is **not** currently a live debt in this suite — the suite has already avoided writing those tests. The lesson has been internalized. What has NOT been internalized is F-03.

**Concrete risk:** low. Three aria-label tests give false assurance about accessibility.
**Recommended direction:** rewrite the 3 aria-label assertions to exact strings; leave the rest.
**Migration difficulty:** trivial (3 one-line edits).
**Best mechanism:** direct edit.
**Acceptance condition:** no `it()` in the suite whose title asserts a *property of a string* while the assertion only checks the string is non-empty.

---

### F-03 — 🔴 THE PRIMARY FINDING. The suite's largest page specs never render their component. This is the exact mechanism that shipped two High-severity input bugs.

- **Category:** Test design / boundary coverage
- **Severity:** **HIGH**
- **Scope:** 7 component specs, 133 `it()` blocks, 2,588 lines of test code that exercise no DOM

**Evidence — component-shaped specs that call `TestBed` but NEVER `createComponent`:**

| File | Lines | `it()` | `createComponent` | DOM reads | Real events |
|---|---:|---:|---:|---:|---:|
| `src/app/pages/sesiones/sesiones-page.component.spec.ts` | 1,778 | 83 | **0** | **0** | **0** |
| `src/app/pages/crear-sesion/crear-sesion-page.component.spec.ts` | 345 | 24 | **0** | **0** | **0** |
| `src/app/pages/crear-sesion/crear-sesion-page.component.costs.spec.ts` | 173 | 10 | **0** | **0** | **0** |
| `src/app/components/toolbar-tools/toolbar-tools.component.spec.ts` | 106 | 6 | **0** | **0** | **0** |
| `src/app/pages/auth/auth-page.component.spec.ts` | 99 | 6 | **0** | **0** | **0** |
| `src/app/components/controls/controls.component.spec.ts` | 83 | 3 | **0** | **0** | **0** |
| `src/app/pages/mercados/r2-markets.component.spec.ts` | 54 | 1 | **0** | **0** | **0** |

`sesiones-page.component.spec.ts` is the **second-largest spec file in the repository** (1,778 lines, 148 `vi.fn()` calls — the highest mock density anywhere) and it renders nothing.

**Observed pattern — bypass by direct signal `.set()`** (41 occurrences, `grep -rnE "(component|comp|instance|cmp|fixture\.componentInstance|host)\.[A-Za-z0-9_]+(\(\))?\.set\("`):

`src/app/pages/crear-sesion/crear-sesion-page.component.spec.ts:198,207,215,223,231,242,243,260,269,277,288,311,312,340`
```ts
component.startDate.set('');
component.endDate.set('1990-01-01');
component.step.set(2);
component.sessionName.set('Mi Sesión');
```
This is the **calculadora bug pattern verbatim**. Every one of these tests proves the component's *computed graph* is right given a value already in the signal. None proves the `<input>` is wired to the signal, that the right event (`input` vs `change` vs `blur`) is bound, that the parse path from `event.target.value` to the signal is correct, or that the control is even rendered. The two High-severity input defects the owner recorded (memory: *calculadora run*, *RFC-020 M-1*) live precisely in that unproven span.

Per-file `.set()` bypass counts:
```
crear-sesion-page.component.spec.ts   14
auth-page.component.spec.ts           12
sesiones-page.component.spec.ts        6
chart.component.trade-guard.spec.ts    4
chart.component.time-shift.spec.ts     3
reflection-cabin-page.component.spec.ts 2
```

**Observed pattern — bypass by direct handler invocation with hand-built synthetic events** (56 occurrences):

`src/app/pages/sesiones/sesiones-page.component.spec.ts:1481-1514`
```ts
component.onDragStart(c, ev);
component.onDragEnd();
component.onDragStart(card(), { dataTransfer: { setData: vi.fn() } } as unknown as DragEvent);
component.onGroupDrop({ key: 'f1', label: 'A', folderId: 'f1', cards: [] }, ev);
component.onGroupDragOver({ key: 'US30', label: 'US30', folderId: null, cards: [] }, ev);
```
and `:1545,1560,1575,1603,1625,1650,1667`
```ts
await component.onImportSessionJson(sessionFileEvent('x.session.json', '{}'));
```
The `as unknown as DragEvent` cast is the tell: the test author had to lie to the type system because no real event was ever involved. A whole drag-and-drop folder-organization feature and the entire `.session.json` import path (a data-integrity-critical entry point) are tested with fabricated event objects against a component that was never attached to a document.

Per-file handler-bypass counts:
```
sesiones-page.component.spec.ts            22
crear-sesion-page.component.costs.spec.ts   8
chart.component.pane-guard.spec.ts          7
chart.component.trade-guard.spec.ts         6
playback-controller.component.spec.ts       4
reflection-cabin-page.component.spec.ts     3
journal-page.component.spec.ts              3
```

**The DOM-crossing ratio, stated precisely:**

- Of **37** spec files that construct a `ComponentFixture`: **19 dispatch real events** (281 `it()`), **14 read the DOM but never dispatch** (88 `it()`), **4–5 render but assert nothing about the DOM** (34–43 `it()`).
- Adding the 7 files above that render *nothing*: of **44** component-shaped spec files, **19 (43%) cross the boundary**, **25 (57%) do not**.
- At `it()` granularity across the whole suite: **281 of 2,369 tests (11.9%)** ever produce a real DOM event. `fixture.whenStable()` is used **0** times.

**Named blind spots — components with NO spec anywhere in the repo** (verified with `grep -rl "<name>" src --include="*.spec.ts"` returning 0):

| Component | Lines | Spec files referencing it |
|---|---:|---:|
| `src/app/components/trade-panel/trade-panel.component.ts` | 283 | **0** |
| `src/app/components/ui/date-picker.component.ts` | 347 | **0** |
| `src/app/components/interactive-candles.component.ts` | 339 | **0** |
| `src/app/components/custom-color-picker.component.ts` | 417 | **0** |
| `src/app/components/risk-slider.component.ts` | 244 | 1 (incidental) |
| `src/app/components/ui/modal.component.ts` | 222 | **0** |
| `src/app/components/account-card.component.ts` | 193 | **0** |
| `src/app/components/ui/segmented-control.component.ts` | 102 | **0** |
| `src/app/components/ui/draggable.directive.ts` | 136 | **0** |
| `src/app/components/ui/tooltip.directive.ts` | 117 | **0** |
| `src/app/components/ui/dropdown.component.ts` | 324 | 2 |
| `src/app/components/chart/chart.component.ts` | **1,694** | 3 narrow guards only (`pane-guard`, `trade-guard`, `time-shift`) |

**Why it matters HERE:** The brief named "inputs, forms, calculadora/lotaje, trade panel, dropdowns" as the highest-risk areas. Measured:
- **calculadora/lotaje: FIXED and now exemplary.** `src/app/lotaje/lotaje-view.spec.ts` has **61** real `dispatchEvent`/`click()` calls — the highest in the repo — and mounts into fresh `document.implementation.createHTMLDocument()` realms (`lotaje-view.spec.ts:56`, `:60-64`). `calculadora-page.component.spec.ts` adds 12 more through the real Angular host, and its header comment (`lotaje-view.spec.ts:8-17`) explicitly says these are "proof, not just a grep". The M-1 lesson was learned **in this one module only**.
- **trade-panel: ZERO coverage.** The single highest-risk surface in a trading application — order entry — has no test of any kind.
- **inputs/forms/dropdowns: unprotected.** `date-picker` (347 lines), `custom-color-picker` (417), `segmented-control`, `modal`, `risk-slider` — all zero.
- **crear-sesion (session creation form): bypassed**, 14 direct `.set()` calls, 0 DOM.

**Concrete risk:** an input can be unbound, bound to the wrong event, bound to a signal that no longer exists, or not rendered at all, and 2,369 tests will stay green. This has already happened twice (owner memory: two High-severity input bugs on `/calculadora`). The remaining exposure is `trade-panel` (money-moving), `crear-sesion` (session integrity), and `sesiones-page` `.session.json` import (data integrity).

**Recommended direction (in priority order):**
1. Write the first `trade-panel.component.spec.ts` as a DOM-crossing spec. Nothing else in this report is worth more.
2. Convert `crear-sesion-page.component.spec.ts` from `.set()` to `createComponent` + `input.dispatchEvent(new Event('input'))`. 24 tests, and the file already has clean stub factories (`makeRoute`, `makeRepoStub`, `makeStorageManagerStub` at `:29-53`) so the conversion is mechanical.
3. Add a DOM-crossing spec for the `.session.json` import path in `sesiones-page` (a real `<input type="file">` change event), leaving the other 76 tests alone.
4. Adopt `src/app/lotaje/lotaje-view.spec.ts` as the house pattern and cite it in `docs/engineering/testing.md`.

**Migration difficulty:** MEDIUM. Item 2 is mechanical. Item 1 is new work. Item 3 needs a `File`/`FileList` stub, which `sesiones-page.component.spec.ts` already builds (`sessionFileEvent`, used at `:1545`) — it just needs to arrive through the DOM.

**Best mechanism:** a written convention in `docs/engineering/testing.md` §"Test taxonomy" stating that any component with user input MUST be exercised through `createComponent` + a real event, plus an ESLint rule (custom, `no-restricted-syntax`) forbidding `component.<signal>.set(` inside `*.component.spec.ts`. The lint rule is what makes it stick; the convention alone did not stop it happening twice.

**Acceptance condition:** every `*.component.spec.ts` for a component containing an `<input>`, `<select>`, `<textarea>`, or `(click)` binding contains at least one `dispatchEvent`; `trade-panel` has a spec; the count of `component.X.set(` inside component specs is 0.

---

### F-04 — 🔴 19 spec files violate the repo's own mandatory `isolate:false` rule, leaking forced NgRx selector results across spec files.

- **Category:** Test isolation / flakiness
- **Severity:** **HIGH**
- **Scope:** 19 of the 54 store-using spec files

**The rule being violated** — `docs/engineering/testing.md:24-27`, verbatim:

> **Any spec using `overrideSelector` MUST call `store.resetSelectors()` in `afterEach`.** Forced selector results live on the module-level NgRx singleton and poison later spec files (incident: a leaked `selectFloatingPnl` override made `selectors.spec` read 120.5 instead of 50, intermittently).

**Evidence — 519 `overrideSelector` call sites; 31 files call `resetSelectors`; these 19 do not:**

```
src/app/auth/auth.guard.spec.ts
src/app/components/playback-controller/playback-controller.component.spec.ts
src/app/components/workspace/workspace-viewport.component.spec.ts
src/app/components/workspace/workspace-viewport.lazy-creation.spec.ts
src/app/pages/auth/auth-page.component.spec.ts
src/app/pages/emulador/emulador-page.component.spec.ts
src/app/pages/reflection/reflection-cabin-page.component.spec.ts
src/app/pages/sesiones/sesiones-page-journal-buttons.spec.ts
src/app/pages/sesiones/sesiones-page.component.spec.ts
src/app/services/journal-data.service.spec.ts
src/app/state/market/market.effects.spec.ts
src/app/state/replay/replay.effects.base.spec.ts
src/app/state/replay/replay.effects.spec.ts
src/app/state/selectors.spec.ts
src/app/state/settings/settings.effects.spec.ts
src/app/state/sync/session-sync.effects.spec.ts
src/app/state/trading/trading.effects.base.spec.ts
src/app/state/trading/trading.effects.spec.ts
src/app/state/workspaces/workspaces.effects.new-session-costs.spec.ts
```
(Produced by: `for f in $(grep -rl "overrideSelector" src --include="*.spec.ts"); do grep -q "resetSelectors" "$f" || echo "$f"; done`)

**Worked example of a live cross-file leak.** `src/app/pages/emulador/emulador-page.component.spec.ts:33-44`:
```ts
TestBed.configureTestingModule({ providers: [EmuladorPageComponent, provideMockStore()] });
store = TestBed.inject(MockStore);
store.overrideSelector(tradingFeature.selectSummaryOpen, false);
store.overrideSelector(settingsFeature.selectFloatingToolbar, true);
...
afterEach(() => { TestBed.resetTestingModule(); });   // <- resets the injector, NOT the selectors
```
`TestBed.resetTestingModule()` discards the injector but `overrideSelector` wrote to the **memoized selector object itself**, which is a module-level singleton shared by every spec file in the same vitest worker. `tradingFeature.selectSummaryOpen` and `settingsFeature.selectFloatingToolbar` therefore stay pinned for the rest of the worker's run.

**Highest-blast-radius offenders** — selectors these files pin and never release, all of them central, widely-read selectors:
- `replay.effects.spec.ts`: `selectActiveCandles`, `selectCurrentTime`, `selectFillContext`, `selectMsPerCandle`, `selectPlaying`, `selectReplayIndex`, `selectReplaySeries`, `selectVisibleIndex`, `replayFeature.selectJumpSize` — **nine core replay selectors**, and this same file is one of only six that also uses `vi.useFakeTimers()`.
- `selectors.spec.ts`: `selectContractSize`, `selectReplayIndex`, `selectReplaySeries`, `tradingFeature.selectPositions` — this is the file the documented incident *victimised*, and it is itself a leaker.
- `trading.effects.spec.ts` / `trading.effects.base.spec.ts`: `selectFillContext` — the fill engine's input.
- `workspace-viewport.component.spec.ts`: `selectCurrentTime`, `selectDisplayZone`, `selectSeries`.

**Why it matters HERE:** the builder hardcodes `isolate: false` and `sequence.setupFiles: 'list'` (`testing.md:13`); it is not configurable. Low-CPU CI runners pack more spec files per worker, so leakage is *worse on CI than locally* — the failure mode is "green on my machine, intermittently red on CI, in a file that did not change." This is the single most expensive class of failure in this repo's history (PR #25, and the `selectFloatingPnl` → `120.5 instead of 50` incident).

**Concrete risk:** `selectCurrentTime`, `selectReplayIndex` and `selectFillContext` being pinned means replay-progression and fill-engine tests in *other* files can silently read a frozen cursor. A leak that makes a test pass is undetectable and permanently masks a real regression.

**Recommended direction:** add `afterEach(() => store.resetSelectors())` to all 19. Then make it structural: an ESLint rule (or a shared `provideMockStoreWithReset()` helper in `src/app/testing/`) so it cannot regress. A one-off cleanup will decay — this rule has been written down since RFC-013 and 19 files still violate it.

**Migration difficulty:** LOW per file (one `afterEach`), but 4 of the 19 have no `afterEach` block at all today and 26 spec files repo-wide have `beforeEach` without any `afterEach`.

**Best mechanism:** custom ESLint rule `require-reset-selectors` — "a file containing `overrideSelector` must contain `resetSelectors`". Ten lines of AST matching; catches every future occurrence at `npm run lint`, which is already a required gate and already 0-problems on `develop`.

**Acceptance condition:** `for f in $(grep -rl "overrideSelector" src --include="*.spec.ts"); do grep -q "resetSelectors" "$f" || echo "$f"; done` prints nothing, and a lint rule enforces it.

---

### F-05 — Module-scope `vi.mock` of a Vite-optimized dependency: 4 files, and the documented mitigation is not uniformly applied.

- **Category:** Test isolation
- **Severity:** MEDIUM
- **Scope:** 4 files

**Evidence:**
```
src/app/domain/chart/capabilities/trading-capability-rule-tag.spec.ts:21  vi.mock('lightweight-charts', () => ({ ... }))
src/app/domain/chart/capabilities/trading-capability.spec.ts:50           vi.mock('lightweight-charts', () => ({ ... }))
src/app/domain/chart/chart-engine.pane-rect.spec.ts:58                    vi.mock('lightweight-charts', async (importOriginal) => { ... })
src/app/domain/chart/chart-engine.spec.ts:116                             vi.mock('lightweight-charts', async (importOriginal) => { ... })
```

**The rule** — `docs/engineering/testing.md:28-31`:
> Mocking a Vite-optimized dep (e.g. `lightweight-charts`) requires: `vi.hoisted` for the mock, then `vi.resetModules()` + dynamic `import()` of the SUT in `beforeEach`. A module-scope SUT import races vitest's optimizeDeps step under a cold `.vite` cache and the REAL module intermittently wins over `vi.mock`.

**Observed pattern:** all four mock the same Vite-optimized dependency at module scope. Whether each applies the full `vi.hoisted` + `vi.resetModules()` + dynamic-import mitigation was NOT verified line-by-line — that is the one open item in this finding.

**Why it matters HERE:** this is the PR #25 failure mode. It is cache-state-dependent (`node_modules/.vite`), so it reproduces only after a cache wipe or on a fresh CI runner. Two of these four files (`trading-capability*.spec.ts`) use the plain `() => ({...})` factory form rather than the `async (importOriginal)` form, which is a weak signal they may predate the mitigation.

**Recommended direction:** verify all four follow the `vi.hoisted` + `vi.resetModules()` + dynamic-`import()` shape; normalize any that do not.
**Migration difficulty:** LOW.
**Best mechanism:** direct edit + a note in `testing.md` listing the four files as the canonical examples.
**Acceptance condition:** all four files import their SUT dynamically inside `beforeEach` after `vi.resetModules()`.

---

### F-06 — Setup convention: a real factory convention already exists and is winning. Do not impose hooks.

- **Category:** Test maintainability
- **Severity:** LOW (this is largely a positive finding)
- **Scope:** whole suite

**Evidence — hooks are already the minority idiom:**
```
beforeEach: 74   afterEach: 64   beforeAll: 2   afterAll: 2
spec files with NO hooks at all: 93 of 182 (51%)
max beforeEach in any single file: 5 (session-sync.service.spec.ts, chart-model-mapper.service.spec.ts)
```
There is no file with a deep nest of `beforeEach` layers. The classic "hidden shared mutable setup" antipattern is **not** present at scale.

**Evidence — an explicit setup-factory convention exists in 47 files:**
```
grep -rlE "^\s*(async )?function (setup|create|make|build|mount|render|arrange)[A-Za-z]*\(" src --include="*.spec.ts" | wc -l   -> 47
```
Factory names in use: `create(` ×25, `mount(` ×6, `setup(` ×5, `makeService(` ×4, `setupTestBed(` ×3, plus `makeTradingState`, `makeRepoStub`, `makeRoute`, `makeStorageManagerStub`, `makeCtx`, `renderIn`, `createWithVisible`…
13 files use BOTH a factory and `beforeEach` — the healthy hybrid (hook does teardown, factory does arrangement).

**Evidence — a shared test-data factory module exists and has real adoption:**
`src/app/testing/fixtures.ts` (136 lines) exports partial-override builders — `candle(...)`, `series(n, start, step, price)`, `order(p)`, `position(p)`, and trading/workspace builders — and is imported by **31 spec files**, concentrated in `state/trading`, `state/drawings`, `state/replay`, `state/workspaces`, `services`. `src/app/testing/workspace-db.stub.ts` is the companion stub.

**Where the convention has NOT reached** (these are the duplication hotspots in F-07): `domain/reflection/*`, `state/journal/*`, `components/journal-viz/*`, `pages/reflection/*`.

**Recommended direction:** do NOT run a repo-wide hooks→factory migration; the suite is already mostly factory-based and 51% of files need no setup at all. Instead **extend `src/app/testing/fixtures.ts`** with the four builders the un-served domains keep re-typing (`telemetryEvent`, `closedTrade`, `scatterPoint`/`bubble`/`heatmapCell`, `layoutState`) and adopt them in the ~8 offending files.
**Migration difficulty:** LOW.
**Best mechanism:** extend the existing module; the convention is already established, only its coverage is partial.
**Acceptance condition:** no object literal of ≥18 lines is repeated ≥4 times across the suite.

---

### F-07 — Fixture duplication is localized and measurable: 78 eight-line chunks repeated ≥4 times.

- **Category:** Test maintainability / agent-context cost
- **Severity:** MEDIUM
- **Scope:** ~6 files

**Evidence — largest inline literals in specs (comment-stripped brace matching, `scratchpad/fixtures2.py`):**
```
37 lines  src/app/domain/reflection/waypoints.spec.ts:268                  const events
33 lines  src/app/domain/reflection/scene-spec.spec.ts:205                 const events
31 lines  src/app/components/workspace/workspace-viewport.lazy-creation.spec.ts:22  const layoutState
28 lines  src/app/components/journal-viz/bubble-duration-r.component.spec.ts:155     const bubbles
25 lines  src/app/state/journal/journal-read.models.spec.ts:233            const events
25 lines  src/app/domain/reflection/waypoints.spec.ts:320,379,416          const events  (×3)
25 lines  src/app/components/workspace/workspace-viewport.component.spec.ts:41       const layoutState
23 lines  src/app/state/lessons/lessons-invariants.spec.ts:64 / journal-read.models.spec.ts:101 / reflection-cabin-page.component.spec.ts:39 / waypoints.spec.ts:12 / scene-spec.spec.ts:24
21 lines  src/app/components/journal-viz/scatter-mae-mfe.component.spec.ts:39,389,472
```
Only **34** literals in the whole suite reach 18 lines. There are no monster fixtures — this is a mild problem, not a severe one.

**Evidence — clone detection (8-line windows, ≥4 repeats): 78 clusters.** The worst:
```
x8  TelemetryEvent 'OrderModified' literal
    scene-spec.spec.ts:277,278,279,337,338,339 ; waypoints.spec.ts:62,63,64,235,236,237,321,322,323,417,420,512,515
x7  const points: ScatterPointView[] = [...]
    scatter-mae-mfe.component.spec.ts:39,75,95,118,139,389,472
x6  BubbleView literal
    bubble-duration-r.component.spec.ts:39,40,41,76,225,226,297,298,348,349,437,438
x6  SavedSession literal (schemaVersion/trading/currentTime/activeTf/…)
    sesiones-page.component.spec.ts:475,476,513,514,568,569,607,608,654,655
x6  thenRestore: { trading, drawings, intervalMinutes, playbackSpeed, replayResolution }
    workspaces.effects.spec.ts:351,636,686,736,782
x6  drawing literal (kind:'line', p1, p2, zIndex, locked, visible)
    workspaces.effects.spec.ts:337,623,673,723,769
x6  trade-boxes primitive options block
    trade-boxes-primitive.spec.ts:101,182,208,224,240
```

**Evidence — TestBed setup duplication:** 81 `configureTestingModule` call sites, **60 distinct** bodies, 11 bodies repeated. Largest clusters: `({ providers: [provideMockStore()] })` ×9; the TelemetryEffects provider block ×5 across `telemetry.effects.spec.ts:22`, `telemetry.jump-anchor.spec.ts:176`, `telemetry.management-events.spec.ts:40`, `telemetry.trading.jump-50-profile.spec.ts:71`, `telemetry.trading.spec.ts:38`.

**Evidence — `it()` block length distribution:** 1,408 of 2,369 (59%) are ≤10 lines; only **1** exceeds 100 lines (`session-persistence.e2e.spec.ts:27`, 112 lines) and 15 are 50–100. Test granularity is genuinely good.

**Why it matters HERE:** the repeated `ScatterPointView`/`BubbleView`/`TelemetryEvent` literals are agent-context poison — a coding agent asked to change one field must edit 7 identical 21-line literals and will miss one. The fix is F-06's: extend `src/app/testing/fixtures.ts`.

**Recommended direction:** add `telemetryEvent(p)`, `closedTrade(p)`, `scatterPoint(p)`, `bubbleView(p)`, `heatmapCell(p)`, `layoutState(p)` to `src/app/testing/fixtures.ts`; add a shared `telemetryEffectsTestBed()` helper for the ×5 cluster.
**Migration difficulty:** LOW–MEDIUM (mechanical, ~8 files).
**Best mechanism:** extend the existing shared-fixture module.
**Acceptance condition:** the ≥4-repeat clone count drops below 20.

---

### F-08 — There is no end-to-end test of any kind, and the two most business-critical UI paths are the ones with no coverage at all.

- **Category:** Test pyramid / portfolio
- **Severity:** **HIGH** (as a portfolio-shape finding)
- **Scope:** whole project

**Evidence:**
```
emulador/package.json devDependencies:
  @angular/build @angular/cli @angular/compiler-cli @eslint/js @vitest/coverage-v8
  angular-eslint eslint fake-indexeddb jsdom prettier typescript typescript-eslint vitest
scripts: ng / start / build / watch / test / test:coverage / lint / format / format:check
```
No Playwright, no Cypress, no WebdriverIO. No `e2e/` directory anywhere in the repo (`find . -maxdepth 3 -iname "playwright*" -o -iname "cypress*" -o -iname "*.e2e-spec.ts"` → empty). The only file named `*.e2e.spec.ts` is `src/app/state/workspaces/session-persistence.e2e.spec.ts`, which is an in-process reducer-fold test, not a browser test.

The pyramid is therefore: **60.2% pure unit / 22.8% store-and-effects integration / 17.0% jsdom component / 0% browser**, with a documented practice of driving the real browser **by hand** for anything layout-shaped (owner memory: *"jsdom has no layout and /calculadora needs auth; dump real DOM → real stylesheets → fixed-size overflow:auto box → measure in browser"*).

**Coverage config note:** `angular.json` sets `coverageThresholds: { lines: 80, statements: 80 }` with `coverageInclude` limited to `state/`, `services/`, `auth/`, `pages/`, `domain/`, `components/`. `src/app/lotaje/**` — 67 kB of sizing logic and the module where the last two High bugs shipped — is **outside `coverageInclude`** and therefore invisible to the threshold. So is `src/app/workers/`.

**Per-domain protection verdict:**

| High-risk domain | Primary specs | Verdict | Confidence |
|---|---|---|---|
| Replay progression | `replay.reducer.spec.ts`, `replay.effects.spec.ts`, `replay.effects.base.spec.ts` | **PROTECTED**, but see F-04 — `replay.effects.spec.ts` leaks 9 core selectors and uses fake timers | HIGH |
| Session state & persistence | `session-persistence.e2e.spec.ts`, `session-sync.mapping.spec.ts` (573 ln), `session-sync.service.spec.ts` (869 ln), `workspaces.effects.spec.ts` (1,198 ln) | **WELL PROTECTED** — real reducer folds + full `toPayload→parse→fromPayload` round-trips + runtime `assertNoCandles` | HIGH |
| Trade lifecycle & fill engine | 6 dedicated specs (`fill-engine.spec.ts`, `.sided`, `.excursions`, `.facts`, `.base-loop`, `.freeze-on-last`) — ~57 kB of tests for a 21 kB, 584-line source | **BEST-PROTECTED AREA IN THE REPO** | HIGH |
| Risk & lot sizing | `position-sizing.spec.ts`, `asset-registry.spec.ts`, `sizing-view-model.spec.ts` (415 ln), `lotaje-view.spec.ts` (2,433 ln, 61 real events) | **PROTECTED at the kernel and now at the DOM.** But excluded from coverage thresholds, and open High **F21-2** (gold 100× via the `pipSize`-null fallback at `sizing-view-model.ts:76-79`) is not closed — `sizing-view-model.spec.ts:67,84` assert XAUUSD points pass through 1:1, which is the *current* behavior, not necessarily the correct one | HIGH |
| Timeframe generation / aggregation | `services/timeframe-generator.spec.ts` (epoch-floor bucketing at `:48`), `selectors.base.spec.ts` | **PROTECTED but thin** — one spec file for a cross-cutting concern | MEDIUM |
| Chart engine + capabilities | 12 specs under `domain/chart/**` (`chart-engine.spec.ts` 18 kB, 7 capability specs) | **PROTECTED**, but heavily mocked at the `lightweight-charts` seam (F-05) | MEDIUM |
| Chart sync across panels | `chart-sync-bus.spec.ts` (**1,991 bytes**), `link-groups.channels.spec.ts`, `link-groups-menu.component.channels.spec.ts` | **UNDER-PROTECTED.** A ~2 kB spec for the mechanism behind the whole multi-chart panel vision (RFC-008–012). The 8-panel case is covered only as a *performance* proof (`chart-model-mapper.eight-panel-profile.spec.ts`, 4 kB), not a correctness one | MEDIUM |
| Derived analytics / telemetry | 8 specs under `state/telemetry/` (611+453+384 ln…), `domain/reflection/waypoints.spec.ts` (655 ln), `scene-spec.spec.ts` | **PROTECTED, arguably OVER-tested at the implementation level** — 5 of the 8 duplicate the same TestBed provider block, and the `OrderModified` event literal is copy-pasted 8× | MEDIUM |
| IndexedDB persistence | `workspace-db.service.spec.ts` (627 ln), `market-data-db.spec.ts`, `telemetry-db.service.spec.ts`, `lessons-db.service.spec.ts`, `playbook-db.service.spec.ts`, `candles-writer.spec.ts` | **PROTECTED.** `src/test-setup.ts` installs a fresh `IDBFactory` per file — a deliberate, documented isolation fix | MEDIUM |
| **Order entry (trade panel)** | — | **🔴 UNPROTECTED. Zero specs.** `trade-panel.component.ts`, 283 lines | HIGH |
| **Form / input primitives** | — | **🔴 UNPROTECTED.** `date-picker` (347), `custom-color-picker` (417), `modal` (222), `segmented-control` (102), `draggable.directive` (136), `tooltip.directive` (117), `account-card` (193), `interactive-candles` (339) — all zero | HIGH |
| `chart.component.ts` (1,694 lines) | 3 narrow guard specs only | **PARTIALLY PROTECTED** — the largest file in the app, covered only where a specific RFC forced a guard | HIGH |

**Recommended direction:** do not buy a browser-test framework to fix this. The cheap, high-yield move is to raise the jsdom component tier from 17% to cover the unprotected primitives (F-03), and to bring `src/app/lotaje/**` inside `coverageInclude`. A single smoke-level Playwright run over login → create session → place trade would be the right *next* investment, but only after F-03 items 1–3.

---

### F-09 — Async idiom is homegrown and undocumented; `whenStable` is never used.

- **Category:** Test mechanics
- **Severity:** LOW–MEDIUM
- **Scope:** whole suite

**Evidence:**
```
fixture.whenStable()                              0
fakeAsync / tick( / waitForAsync / flushMicrotasks 3 total
await Promise.resolve() | await new Promise      270
async it() blocks                                585
detectChanges()                                  211
compileComponents()                                6
useFakeTimers                                    6 files; useRealTimers present in ALL 6 (no timer leaks)
```

**Observed pattern:** the suite has independently settled on `await Promise.resolve()` as its microtask-flush idiom and avoids Angular's zone-based helpers entirely — consistent with a signals-based Angular 21 app, and arguably the right call. Fake timers are always restored (`lotaje-view.spec.ts:49` does `vi.useRealTimers()` in `afterEach`), so there is no timer leak under `isolate:false`.

**Why it matters HERE:** with 585 async tests and 0 `whenStable`, correctness depends on every author knowing that one `await Promise.resolve()` flushes exactly one microtask tick. A test that needs two ticks and gets one passes today by accident and fails when an implementation adds an `await`. This is undocumented — `docs/engineering/testing.md` says nothing about it.

**Recommended direction:** document the idiom in `testing.md` (a `flushMicrotasks()` helper in `src/app/testing/` would make the intent explicit and the tick-count adjustable in one place). Low priority relative to F-03/F-04.
**Acceptance condition:** `testing.md` has an "async idiom" subsection.

---

## RESUME BRIEF

*(Self-contained. A fresh agent with zero conversation history can start from here.)*

### (a) Role and remaining scope

You are a **Principal Engineer performing a READ-ONLY technical-debt audit** of `trading-emulator` at `C:\Users\78701\Desktop\trading-emulator`, branch `develop`, HEAD `a2ca53b`. Your role is **Test Architecture & Test Portfolio Auditor**.

**ABSOLUTE RULES:** READ-ONLY on all repository source. The ONLY files you may write are under `C:\Users\78701\Desktop\trading-emulator\.superpowers\audit-2026-08-10\`. Do NOT run the full test suite (slow). Targeted commands are fine; run them from `emulador/`; NEVER pipe a gate through `| tail` or `| head`. Every claim needs `path/to/file.ts:line` evidence. Counts must be generated mechanically. Separate MEASURED FACT / INTERPRETATION / RECOMMENDATION.

**Deliverable:** this file (`audit-tests.md`) in TD-finding blocks — Finding name / Category / Severity / Scope / Evidence / Observed pattern / Why it matters HERE / Concrete risk / Recommended direction / Migration difficulty / Best mechanism / Acceptance condition — plus a ≤140-line digest returned as the final message.

**Context you need:** Angular 21 + NgRx SPA; app code is under `emulador/src/app` (NOT repo-root `src/`). Test runner is Vitest via the Angular builder: `npx ng test --watch=false`. Bare `npx vitest run` ALWAYS fails (no TestBed env) — never try it. The builder hardcodes `isolate: false`, so module-level state leaks between spec files. Owner's lesson: *"a test that doesn't cross the boundary can't see the defect"* — two High-severity input bugs shipped past a green suite because tests called `.set()` instead of going through the DOM. The unit suite has no layout engine.

### (b) Commands already run — DO NOT RE-RUN. Key outputs:

All from `C:\Users\78701\Desktop\trading-emulator\emulador`.

```
find src -name "*.spec.ts" | wc -l                                    -> 182
find src -name "*.spec-util.ts"                                       -> 2 (layout-invariants, lookahead-invariants)
find src -name "*.spec.ts" -exec cat {} + | wc -l                     -> 43337
find src -name "*.ts" ! -name "*.spec.ts" ! -name "*.spec-util.ts" -exec cat {} + | wc -l  -> 33411

grep -rn "readFileSync\|readFile\|fs\.promises\|node:fs" --include="*.spec.ts"  -> 0
grep -rn "__dirname\|import.meta\|path.join\|path.resolve\|process.cwd" --include="*.ts" -> 2, both PRODUCTION
grep -rn "?raw" / "globby|fast-glob" / "toMatchSnapshot" / ".toString()" / "innerHTML"     -> 0 each
find src -name "*.snap" -o -name "__snapshots__"                      -> empty
grep -rn "getComputedStyle" --include="*.spec.ts"                     -> 0
grep -rn "offsetWidth|offsetHeight|clientWidth|clientHeight|getBoundingClientRect" -> 4 (chart-engine.pane-rect x3, chart.component.trade-guard x1)
grep -rn "classList.contains|toHaveClass|.className" --include="*.spec.ts" -> 43 across 10 files
grep -rn "\.style\." --include="*.spec.ts"                            -> 6
grep -rn "ɵ" --include="*.spec.ts"                                    -> 2 lines, 1 test (emulador-page.component.spec.ts:200-201)

grep -rl "TestBed"           -> 75    grep -rl "createComponent|ComponentFixture" -> 37
grep -rl "nativeElement|debugElement|querySelector" -> 34
grep -rl "dispatchEvent|.click()|triggerEventHandler" -> 21
grep -rn "overrideSelector" | wc -l  -> 519 ; grep -rl "resetSelectors" -> 31 files
grep -rn "^vi.mock(" --include="*.spec.ts" -> 4
grep -rnE "^let " --include="*.spec.ts"  -> 8 (8 files)
grep -rn "vi.fn(" -> 373 ; "vi.spyOn" -> 199
grep -rn "whenStable" -> 0 ; "fakeAsync|tick(|waitForAsync" -> 3 ; "await Promise.resolve()|await new Promise" -> 270
grep -rn "detectChanges()" -> 211 ; "compileComponents()" -> 6
grep -rn "beforeEach(" -> 74 ; "afterEach(" -> 64 ; "beforeAll(" -> 2 ; "afterAll(" -> 2
grep -rlE "^\s*(async )?function (setup|create|make|build|mount|render|arrange)[A-Za-z]*\(" -> 47 files
grep -rln "testing/fixtures" -> 31 files
```

Three Python analysis scripts were written to (session-scoped, now likely gone) `%TEMP%\claude\...\scratchpad\`: `vacuous2.py`, `fixtures2.py`, `portfolio.py`. **Their outputs are fully transcribed into the MEASURED FACTS and F-02/F-03/F-07 sections above — you do not need to recreate them.** If you must: they walk `src`, use a line-anchored `^\s*(await )?(it|test)(\.\w+)*\s*\(` regex plus a brace matcher, and (critically) **strip comments first** — an apostrophe in a `//` comment (e.g. `// the panel's own groups`) otherwise opens a phantom string and corrupts brace matching, which produced bogus 481-line "fixtures" on the first pass.

**Key derived numbers:** 2,369 `it()` call sites; 0 skipped; 13 zero-`expect` blocks (all use custom assert helpers → legitimate); 40 all-weak-assertion blocks; portfolio = 60.2% pure unit / 22.8% store+effects / 11.9% component-with-events / 3.7% component-DOM-read / 1.4% component-blind / 0% e2e; 44 component-shaped spec files of which 19 (43%) cross the DOM boundary; 75 source files with no adjacent spec.

### (c) Files read, and what was concluded

- `docs/engineering/testing.md` (79 lines, read in full) — **the single most useful document.** `:24-27` is the mandatory `resetSelectors` rule that F-04 shows is violated by 19 files. `:28-31` is the `vi.mock` + `vi.resetModules()` rule behind F-05. `:50-58` is the spec-util contamination rule the repo genuinely follows. `:37-48` defines the intended taxonomy (hard TDD for pure cores, proof specs, round-trips, persistence-e2e-through-real-reducers, STOP rule).
- `emulador/src/test-setup.ts` — installs a fresh `IDBFactory` per file in `beforeAll`. Deliberate, documented, correct.
- `emulador/angular.json` test target — builder `@angular/build:unit-test`; coverage thresholds 80% lines/statements; **`coverageInclude` omits `src/app/lotaje/**` and `src/app/workers/**`**.
- `emulador/package.json` — no e2e framework, confirmed.
- `src/app/lotaje/lotaje-view.spec.ts` (2,433 lines, head + samples) — **the house exemplar.** Framework-free view, mounts into fresh `document.implementation.createHTMLDocument()`, 61 real events, scrubs `localStorage` before AND after each test with an explicit `isolate:false` rationale at `:22-27`. Cite this file as the pattern.
- `src/app/lotaje/lotaje-view.ts` / `sizing-view-model.ts` / `domain/sizing/position-sizing.ts` — read; sizing kernel is pure and well-documented. `sizing-view-model.ts:76-79` (`priceUnitsPerDisplayUnit` returning 1 when `pipSize === null`) is the F21-2 gold-100× area; `sizing-view-model.spec.ts:67,84` pin the current XAUUSD behavior.
- `src/app/pages/sesiones/sesiones-page.component.spec.ts` — 1,778 lines, 83 tests, **0 fixtures, 0 DOM, 148 `vi.fn()`**. Worst offender for F-03.
- `src/app/pages/crear-sesion/crear-sesion-page.component.spec.ts` — 14 direct `.set()` calls; clean stub factories at `:29-53` make conversion easy.
- `src/app/pages/emulador/emulador-page.component.spec.ts` — the `ɵcmp` structural test at `:199`, and an F-04 leaker.
- `src/app/components/journal-viz/scatter-mae-mfe.component.spec.ts` — sampled `:24-45`, `:230-262`, `:525-575`. Behavioral, just shallow. Duplicated 21-line literals ×7.
- `src/app/services/telemetry-db.service.spec.ts:145-151` — name-regex "append-only" structural test.
- `src/app/app.routes.spec.ts` (full) — legitimate config-invariant test, KEEP.
- `src/app/testing/fixtures.ts` (head) — the existing shared-factory module, 31 consumers.

### (d) Dead ends / non-issues — do not spend time here again

1. **Source-text tests do not exist.** Zero `fs` reads, zero snapshots, zero `?raw`. The brief's highest-priority category is empty. Confirmed by 8 independent greps.
2. **CSS/layout vacuity does not exist.** Zero `getComputedStyle`; the 4 geometry reads are against mocked `lightweight-charts` rects; the 43 class assertions are state proxies with real behavior behind them.
3. **Hook sprawl does not exist.** 51% of spec files have no hooks; max 5 `beforeEach` in any file. Do NOT recommend a blanket hooks→factory migration — a factory convention already exists in 47 files and a shared fixture module in 31.
4. **Timer leaks do not exist.** All 6 `useFakeTimers` files also call `useRealTimers`.
5. **Giant fixtures are not a real problem.** Only 34 literals reach 18 lines; only 1 `it()` exceeds 100 lines. The first-pass measurement claiming 481/387/378-line fixtures was a **comment-apostrophe brace-matching bug** — do not repeat it.
6. `npx vitest run` — never try. Only `ng test` bootstraps TestBed.

### (e) ORDERED remaining steps

1. **Verify F-05 properly** (~15 min). Read the four `vi.mock('lightweight-charts')` files and check each applies `vi.hoisted` + `vi.resetModules()` + dynamic `import()` of the SUT in `beforeEach` per `testing.md:28-31`. Suspects: `trading-capability.spec.ts:50` and `trading-capability-rule-tag.spec.ts:21` use the plain factory form, not `async (importOriginal)`. Upgrade or downgrade F-05's severity accordingly.
2. **Raise the three MEDIUM-confidence domain verdicts to HIGH** (~30 min) by reading assertions, not just inventory:
   - `src/app/domain/chart/chart-sync-bus.spec.ts` (1,991 bytes) + `state/link-groups/link-groups.channels.spec.ts` — is cross-panel sync actually protected, or only its plumbing?
   - `src/app/state/telemetry/*.spec.ts` (8 files) — confirm the "over-tested at implementation level" read.
   - `src/app/services/workspace-db.service.spec.ts` + `market-data-db.spec.ts` — confirm IndexedDB round-trips are real, not mocked.
3. **Confirm the F21-2 gold gap** (~15 min). Read `src/app/domain/sizing/asset-registry.ts:99-135` (`heuristicPipSize`) and decide whether `sizing-view-model.spec.ts:67,84` pin correct or merely current behavior. If the latter, that is a named characterization-test finding.
4. **Spot-check 3 of the 19 F-04 leakers** for whether `provideMockStore()` is re-created per test (it is in `emulador-page.component.spec.ts` and still leaks — the point is that `overrideSelector` mutates the selector singleton, not the store). Enough to state the mechanism with certainty in the digest.
5. **Optional, only if budget remains:** count `it()` blocks per high-risk domain directory to put a number on "over-tested at the implementation level."
6. **Finalize:** update `## STATUS` to 100%, then return the ≤140-line digest (hard counts, named worst offenders, per-domain verdict table, top-3 recommendations).

### Top 3 highest-leverage recommendations (current standing conclusion)

1. **Write `trade-panel.component.spec.ts` as a DOM-crossing spec, and convert `crear-sesion-page.component.spec.ts` off `.set()`.** (F-03) Order entry — the money-moving surface of a trading application — has zero tests of any kind, and session creation is tested only below the boundary where the last two High bugs lived.
2. **Add a custom ESLint rule `require-reset-selectors` and fix the 19 violating files.** (F-04) The rule has been written down in `testing.md:24` since RFC-013 and 19 files still break it; `npm run lint` is already a required 0-problems gate, so a lint rule is the only mechanism that will hold.
3. **Add a lint rule forbidding `component.<signal>.set(` inside `*.component.spec.ts`, and cite `src/app/lotaje/lotaje-view.spec.ts` in `testing.md` as the house pattern.** (F-03) The M-1 lesson was learned in exactly one module; make it structural so it generalizes instead of being re-learned per incident.
