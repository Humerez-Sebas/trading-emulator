# Architecture Validation Report — Position Sizer

**Date:** 2026-08-02
**Purpose:** adversarial validation of the v2 architecture before any RFC is written.
**Method:** every decision treated as guilty until proven innocent; authoritative sources only;
repo configuration read directly rather than assumed.
**Not in scope:** implementation, RFC text, design.

---

## Executive Summary

**The proposed architecture did not survive intact.** It survives in its *domain* half and is
substantially modified in its *hosting* half.

The v2 proposal rested on an assumption that was never tested: **that the companion surface must be
an Angular application.** Every expensive decision downstream — the second `bootstrapApplication`,
the second build entry point, the iframe, the Vercel output merge, the second test target — exists
only to serve that assumption. Study 1 found the assumption is false, and Studies 2–4 then collapse.

What changed:

| Area | v2 proposal | Validated outcome |
|---|---|---|
| Window content | Standalone Angular micro-app in an iframe | **Vanilla-TS view mounted directly** — the repo's own `ChartEngine` pattern |
| Second Angular app | Recommended | **Rejected.** Angular CLI officially does not support multiple app entry points; separate projects mean a duplicated Angular runtime with no shared chunks |
| iframe | Recommended | **Optional, not required** — it solves a problem only Angular creates. Retained as a fallback |
| Vercel | "A rewrite exception is needed" | **Wrong.** Vercel gives filesystem precedence over rewrites; a static file needs no config change |
| Testing | "Two entry points complicate the gates" | **Wrong if scoped correctly** — one project with two architect targets keeps all four gates intact |
| Spike | Fit check | **Still required**, and one question is genuinely unanswered by any source (§S1.6) |

Three findings changed my own prior conclusions and are documented as such in §Reversals.

**Overall verdict: APPROVED WITH MODIFICATIONS**, with a sequencing change: the registry/domain work
and the window work must be decoupled and shipped separately, because the first is unconditionally
valuable and the second is conditionally valuable and least validated.

---

## Study 1 — Document PiP + iframe vs. the alternatives

### S1.1 The question, corrected

The study was framed as "iframe vs. cross-realm mounting". That framing hides a prior question.
Two platform facts reframe it:

1. **A PiP window cannot be navigated** (spec, MDN, Chrome docs, all concurring). Therefore *any*
   URL-loaded host inside a PiP window must be an iframe. "iframe vs. not" is not a real choice —
   the real choice is **"document-based host, or DOM-injection host?"**
2. **The spec explicitly sanctions iframes**: the Document PiP window may contain
   `HTMLIFrameElement`s, including cross-origin ones. The only restriction runs the other way — a
   PiP window cannot be *opened from* an iframe ("only allowed from a top-level browsing context",
   [WICG#97](https://github.com/WICG/document-picture-in-picture/issues/97)), which does not affect
   us since the request originates in the top-level SPA.

So the iframe is *safe and sanctioned*. The question is whether it is *necessary*.

### S1.2 The untested assumption

Every hazard that made the iframe attractive in v2 is an **Angular** hazard:

| v2 hazard | Root cause | Exists without Angular? |
|---|---|---|
| Zone.js / change detection across realms | Angular's CD scheduling | **No** |
| Angular-injected `<style>` tags arriving late | Angular's runtime style injection | **No** |
| `SIZER_HOST_WINDOW` DI token threading | Angular DI ceremony to avoid globals | **No** — a vanilla `mount(doc, win)` takes them as parameters |
| Cross-origin `@import` in `styles.css` breaking `cssRules` copying | Copying the *app's* stylesheet | **No** — a self-contained view injects its own `<style>` string |
| `DraggableDirective` binding to the opener's `window` | An Angular directive using a global | **No** — not used in a window host anyway |
| Future zoneless migration risk | Angular internals | **No** |

The only hazard that survives is **clipboard realm** (§S1.6), and it survives in *every* option.

This repo already has the answer, and it is its own founding invariant: **`ChartEngine` is vanilla
TS, never imports Angular or NgRx, and is hosted by a thin Angular component**
(`CLAUDE.md` invariant 1; RFC-001; PHILOSOPHY §2.1 *"el dominio en el centro; los frameworks son
periféricos"*). A companion view that is vanilla TS over `domain/sizing`, hosted by an Angular
wrapper on `/calculadora` and mounted directly into a companion window, is the **same pattern
already audited across thirteen RFCs**.

### S1.3 Cost of the vanilla view, measured not assumed

The objection is "you would rewrite the UI twice". Measured against the repo:

- `input.directive.ts` is **18 lines** and its entire function is to apply the CSS class `.ui-input`
  from `styles/ui-primitives.css`. In vanilla that is `class="ui-input"`. Zero logic duplicated.
- The directive's own selector already accepts `select[appInput]`, so a native `<select>` is the
  sanctioned control — `dropdown.component.ts` (324 lines) is not required by a compact companion.
- `risk-slider.component.ts` (244 lines) is replaceable in the companion by a native
  `<input type="range">` plus the existing free-text field.
- The page template is 187 lines of HTML + 154 of CSS — but the companion UI is **specified to be
  different** (no "Desde lotes", Method A/B toggle, hero lot + copy, compact density). It is a new
  view under every option; it is not duplication.

Design tokens are shared in both directions because they live in `:root` in `styles.css`, and the
vanilla view consumes them by `var(--…)` exactly as the Angular components do.

### S1.4 Decision matrix

Scoring: ✔✔ strong, ✔ adequate, ~ neutral, ✘ weak, ✘✘ disqualifying.

| Criterion | A. Vanilla direct DOM mount | B. iframe → vanilla static page | C. iframe → Angular micro-app | D. Cross-realm Angular mount |
|---|---|---|---|---|
| Angular support (documented pattern) | ✔✔ repo precedent (`ChartEngine`) | ✔✔ n/a | ✔✔ ordinary app | ✘ emergent, undocumented |
| Browser limitations | ✔✔ none beyond PiP itself | ✔✔ spec-sanctioned | ✔✔ spec-sanctioned | ✔ works, unverified |
| Lifecycle | ✔✔ explicit `unmount()` | ✔✔ document teardown | ✔ needs `detachView`+`destroy` | ✘ leak-by-default if `pagehide` missed |
| Focus | ✔ single document | ~ extra frame boundary | ~ extra frame boundary | ✔ single document |
| Clipboard | ~ **unverified** (§S1.6) | ~ unverified + policy nuance | ~ unverified + policy nuance | ✘ opener-realm trap |
| CSS isolation | ✔ self-contained `<style>` | ✔✔ full document isolation | ✔✔ full | ✘ must copy opener sheets |
| Performance / memory | ✔✔ ~nothing | ✔ second document | ✘ second Angular runtime | ✔ one runtime |
| Debugging / DevTools | ✔✔ one realm, plain DOM | ✔✔ frame selector | ✔✔ frame selector | ✘✘ JS in opener, DOM in PiP |
| Accessibility | ✔ one a11y tree | ~ separate tree, needs `title` | ~ separate tree | ✔ one tree |
| Security / CSP | ✔✔ no new surface | ✔ needs `frame-src 'self'` *if* CSP is ever added | ✔ same | ✔✔ none |
| Future Angular (zoneless/hydration) | ✔✔ immune | ✔✔ immune | ✔✔ immune | ✘✘ directly exposed |
| Build/deploy impact | ✔✔ none | ✘ new artifact | ✘✘ new artifact + runtime | ✔✔ none |
| Testability | ✔✔ no TestBed; forces real DOM | ✔ | ~ TestBed | ✘ untestable in jsdom |

### S1.5 Recommendation — **MODIFY**

Adopt **A (vanilla-TS view, mounted directly)** as the primary architecture, with **B** retained as
a documented fallback if the spike shows style or clipboard problems that a real document solves.
**Reject D** (confirmed from v2). **C** is not wrong, merely dominated — it pays a full Angular
runtime for isolation that A obtains for free.

One consequence must be stated plainly: **the existing Angular `/calculadora` page becomes a thin
host wrapper**, mirroring `ChartComponent` around `ChartEngine`. That is a rewrite of shipped code
from PR #53 — but that page is being rewritten under the reframe regardless (cut "Desde lotes", add
Method B, add copy, compact the layout), so the marginal cost is the wrapper, not the view.

### S1.6 What no source could answer — **INSUFFICIENT EVIDENCE**

**Does `navigator.clipboard.writeText()` succeed when called from inside a Document PiP window?**

The pieces are documented; the *composition* is not, in any authoritative source:

- `clipboard-write`'s default Permissions-Policy allowlist is `self`, so a **same-origin** iframe
  inherits it (every documented failure involves cross-origin frames).
- The Clipboard API's transient-activation and "document is focused" requirements are documented.
- Nothing states how those interact with a PiP window's focus model, or with a same-origin iframe
  nested inside one.

This is the **only** genuinely unresolved technical question in the entire proposal, and it gates
the product's second-most-important action. It must be answered empirically before an RFC freezes
anything about the copy path. Mitigation regardless of outcome: mount into the target document and
call **that document's** `navigator.clipboard`, with a visible failure state and a selectable input
as fallback.

**Confidence: HIGH** on the ranking (A > B > C > D). **LOW** on clipboard specifics.

---

## Study 2 — One Angular application vs. two

### S2.1 The decisive platform fact

**Angular CLI does not support multiple application entry points.** The maintainers' position on
[angular-cli#9905](https://github.com/angular/angular-cli/issues/9905) is that it is out of scope,
achievable only via a third-party builder (`ngx-build-plus`) or separate *projects*. Multiple entry
points are supported for **libraries**, not applications — a distinction that is easy to misread.

Consequence: two applications means **two independent builds with two independent dependency
graphs**. There is no shared-chunk mechanism across builds. The Angular runtime, `tslib`, and every
shared component are **duplicated in full** in the second bundle.

### S2.2 The mitigation that survives — and it matters for Studies 3 and 4

If a second entry point is ever needed, it should be a **second architect target inside the existing
project**, not a second project. Verified against the builder's documented options:

- A project may define arbitrary architect targets beyond `build`/`serve`/`test`/`lint`.
- `index` accepts `{ input, output }`, where `output` sets the generated HTML filename.
- `outputPath` accepts `{ base, browser }`.

So a second target can emit `lotaje.html` into `dist/emulador/browser` alongside `index.html`.
Critically, because it stays in one project sharing `sourceRoot: "src"`:

- `tsconfig.app.json` includes `src/**/*.ts` → **gate 1 still covers it**
- `tsconfig.spec.json` includes `src/**/*.spec.ts` → **gate 2 still covers it**
- the `test` target's `sourceRoot` is `src` → **gate 3 still covers it**
- `lintFilePatterns: ["src/**/*.ts", "src/**/*.html"]` → **gate 4 still covers it**

Only `npm run build` becomes two invocations. **This invalidates the cost I attributed to the second
entry point in v2** (see §Reversals).

### S2.3 Decision matrix

| Criterion | Single SPA (lazy route) | Second architect target (same project) | Second project | Module Federation / microfrontend |
|---|---|---|---|---|
| Angular CLI support | ✔✔ native | ✔ documented options, unusual composition | ✔✔ native | ✘ third-party, Angular has moved away |
| Bundle duplication | ✔✔ none | ✘ full Angular runtime duplicated | ✘ same | ~ shared at runtime, high machinery |
| Tree shaking | ✔✔ | ✔ per-build | ✔ per-build | ~ |
| Build complexity | ✔✔ none | ✔ one extra command | ✘ workspace restructure | ✘✘ |
| Four verification gates | ✔✔ intact | ✔✔ intact (§S2.2) | ✘ all four need per-project invocation | ✘✘ |
| Runtime isolation from emulator effects | ✘✘ **none** — `ROOT_EFFECTS_INIT` fires | ✔✔ separate app config | ✔✔ | ✔ |
| Memory / cold start | ✔✔ | ✘ second runtime | ✘ | ✘ |
| Maintenance / code ownership | ✔✔ | ✔ | ~ two projects, one owner | ✘✘ ceremony for a solo repo |
| CI time | ✔✔ | ✔ +1 build | ✘ +1 of everything | ✘✘ |

**Module Federation / microfrontends: REJECT outright.** Their purpose is letting *independently
deployed teams* share runtime dependencies across *separately released* applications. This is one
owner, one repo, one deploy, one release. Adopting it would be pure ceremony with no defect to
prevent — a textbook failure of PHILOSOPHY §2.8.

**Single SPA / lazy route: REJECT as a companion host.** Verified in code, a second full-SPA instance
runs `AuthEffects.init$` ([auth.effects.ts:24](emulador/src/app/state/auth/auth.effects.ts:24)),
`WorkspacesEffects.init$` ([workspaces.effects.ts:54](emulador/src/app/state/workspaces/workspaces.effects.ts:54)),
and consequently `SessionSyncEffects` ([session-sync.effects.ts:50](emulador/src/app/state/sync/session-sync.effects.ts:50))
— i.e. **a second live LWW session-sync actor.** This repo has already paid for a sovereignty bug
once (PHILOSOPHY §4.3). Not acceptable.

### S2.4 Recommendation — **REJECT the two-Angular-applications proposal**

Not because the mechanics fail, but because **the vanilla view (Study 1A) delivers the same runtime
isolation with zero Angular duplication, zero extra build target, and zero deployment change.** The
second Angular app's only advantage over vanilla was familiarity, and it costs a duplicated runtime
to buy it.

If Study 1's spike forces the document-based host (option B), then the artifact is a **plain static
page loading a small vanilla bundle** — still not a second Angular application.

**Confidence: HIGH.** Grounded in the CLI maintainers' stated position, the documented builder
options, and the repo's own effect wiring read directly.

---

## Study 3 — Vercel deployment architecture

### S3.1 Current state (read, not assumed)

```
vercel.json:
  buildCommand    : npm run build            → ng build (project "emulador", production)
  outputDirectory : dist/emulador/browser
  installCommand  : npm ci
  rewrites        : [{ source: "/(.*)", destination: "/index.html" }]     ← SPA fallback
  git.deploymentEnabled.main : false
  headers         : (none — no CSP today)
```

### S3.2 The finding that removes a cost

**Vercel gives the filesystem precedence over rewrites.** A static file present in the output
directory is served before any rewrite is evaluated. Therefore a second HTML artifact at
`/lotaje.html` is served correctly **with no change to `rewrites` at all**.

This directly **invalidates my v2 claim** that a rewrite exception would be required (§Reversals).

### S3.3 Deployment diagrams

**Option A — vanilla direct mount (recommended). No deployment change whatsoever.**

```
npm run build ──▶ dist/emulador/browser/ ──▶ Vercel static
                    index.html
                    main-<hash>.js        ← contains the sizer view; mounted into the
                    styles-<hash>.css       PiP/popup window at runtime by the SPA
                    …
vercel.json: UNCHANGED
```

**Option B — document-based host (fallback). One extra artifact.**

```
npm run build ──▶ ng build                    ──▶ dist/emulador/browser/index.html + assets
             └──▶ ng build emulador:build-sizer ──▶ dist/emulador/browser/lotaje.html + assets
                                                       (index.output = "lotaje.html",
                                                        outputPath.browser = same dir)

Request /lotaje.html ──▶ filesystem hit ──▶ served  (rewrite never evaluated)
Request /sesiones    ──▶ no file        ──▶ rewrite ──▶ /index.html
vercel.json: only buildCommand changes
```

### S3.4 Decision matrix

| Criterion | A. No new artifact | B. Second target, same output dir | C. Second project, separate output dir |
|---|---|---|---|
| `vercel.json` changes | ✔✔ none | ✔ `buildCommand` only | ✘ output merge step needed |
| Rewrites | ✔✔ untouched | ✔✔ untouched (filesystem precedence) | ✔✔ untouched |
| Static assets / hashing | ✔✔ one graph | ✔ two graphs, collision-free via `outputHashing: all` | ✔ |
| CDN caching / invalidation | ✔✔ unchanged | ✔ content-hashed, immutable | ✔ |
| Preview deployments | ✔✔ | ✔✔ | ✔ |
| Build time (CI) | ✔✔ | ✘ ~2× | ✘ ~2× |
| Bundle budgets | ✔✔ existing | ~ second target has no budget unless configured | ~ same |
| Source maps | ✔✔ | ✔ dev only | ✔ |
| Headers / CSP | ✔✔ no new surface | ~ `frame-src 'self'` needed *if* CSP is ever added | ~ same |

### S3.5 Recommendation — **APPROVE (option A); MODIFY if B is forced**

Deployment is **not** a reason to reject any option. Under the recommended vanilla architecture the
deployment surface does not change at all. Under the fallback it changes by one build command.

Two operational notes for whoever implements: verify with a real build that two targets writing to
one directory do not collide on unhashed filenames, and add a budget to the second target so it
cannot silently grow.

**Confidence: MEDIUM-HIGH.** Vercel's precedence rule and the builder options are documented; the
two-targets-one-directory composition is documented-but-unusual and should be proven by an actual
build before being frozen.

---

## Study 4 — Testing strategy

### S4.1 Current state (read, not assumed)

- Runner: `@angular/build:unit-test` (Vitest under the hood), `setupFiles: src/test-setup.ts`,
  `coverageThresholds: { lines: 80, statements: 80 }`.
- Environment: **jsdom**, plus `fake-indexeddb`.
- **No E2E stack exists.** `package.json` devDependencies contain no Playwright, no Cypress, no
  WebDriver. Adding one is a new dependency decision, not a configuration tweak.
- Known lesson, recorded from this very feature: tests that drove component signals via `.set()`
  never crossed the DOM, and **two High-severity input bugs shipped past a green suite** (PR #53).

### S4.2 What actually changes

**Unit testing barely changes**, provided §S2.2 is honoured (one project). All four gates keep their
current single-command form. The v2 worry about breaking the gate commands applies only to the
*second project* variant, which is now rejected anyway.

**What genuinely appears is a new untestable surface**, and it appears under every option that has a
companion window:

| Surface | jsdom | Notes |
|---|---|---|
| `documentPictureInPicture` | ✘ absent | Not implemented; would have to be stubbed wholesale |
| Real clipboard | ✘ absent | `navigator.clipboard` must be faked; proves nothing about the real path |
| Cross-window focus | ✘ absent | The exact condition the clipboard depends on |
| iframe navigation/load | ~ partial | jsdom does not fetch or run frame content by default |
| Window geometry | ✘ absent | No layout engine |

**The vanilla view improves testing**, for a reason directly tied to the recorded failure:

- No TestBed, no `ComponentFixture`, no `.set()` escape hatch. A vanilla view is exercised by
  dispatching real `input`/`click` events at real DOM nodes — the path that the two escaped bugs
  lived on.
- Tests become plain Vitest with no Angular bootstrap: the fastest and least flaky category in this
  repo (relevant given the recorded `isolate:false` module-state flakiness).

### S4.3 Decision matrix

| Criterion | Vanilla view, one project | Angular micro-app, second target | Angular micro-app, second project |
|---|---|---|---|
| Four gates keep current form | ✔✔ | ✔✔ | ✘✘ all four need rework |
| TestBed needed for the sizer | ✔✔ no | ✘ yes | ✘ yes |
| Tests exercise real DOM events | ✔✔ forced by design | ~ possible, not forced | ~ |
| Coverage thresholds (80 %) | ✔✔ one report | ✔ one report | ✘ two reports |
| Window/PiP layer coverage | ~ adapter-only | ~ adapter-only | ~ adapter-only |
| Clipboard coverage | ✘ manual only | ✘ manual only | ✘ manual only |
| New devDependencies | ✔✔ none | ✔✔ none | ✔✔ none |
| Flakiness risk | ✔✔ lowest | ~ | ~ |

### S4.4 The window layer — three options, one recommendation

- **(a) Injected window factory + fake.** The adapter takes a `() => Window` and a target `Document`.
  Tests assert *the adapter's logic* (singleton behaviour, teardown, mount target) against a fake.
  Covers the code; proves nothing about the platform. **Cheap, honest, recommended.**
- **(b) Vitest Browser Mode + Playwright.** Would exercise the real API. Costs an entire
  browser-testing stack and CI runtime to cover roughly fifty lines of window plumbing. **Reject** on
  complexity-pays-rent grounds — for now; revisit only if the window layer grows.
- **(c) Written manual protocol.** The clipboard→MT5 path is *inherently* out of reach of any
  in-repo test: it terminates in a native Win32 application. It must be a **re-runnable manual
  checklist committed to the repo**, not an aspiration. This is the honest response to a coverage
  limit — name it rather than pretend it away.

### S4.5 Recommendation — **APPROVE WITH MODIFICATIONS**

Keep one project. Prefer the vanilla view specifically because it forces DOM-level tests on the
input-handling code that has already failed once. Test the window adapter through an injected
factory. Commit the manual protocol for the clipboard path. Do not add an E2E stack yet.

**Confidence: HIGH.** Every claim is grounded in the repo's own configuration and its recorded
defect history.

---

## Cross-cutting observations

1. **Study 1 is the root; Studies 2–4 are its shadow.** Choosing a vanilla view dissolves Study 2
   entirely, reduces Study 3 to "no change", and improves Study 4. Choosing Angular-in-the-window
   re-inflates all three. No other single decision has this leverage.
2. **Study 3's finding retroactively cheapened Study 2.** Filesystem-precedence means a second
   artifact costs one build command, not a routing change — so "deployment complexity" was never a
   valid argument against a second entry point. Any conclusion that leaned on it was mis-weighted.
3. **Study 2's finding retroactively cheapened Study 4.** One project with two architect targets
   preserves all four verification gates verbatim, so "two entry points break the gates" was true
   only of the second-*project* variant.
4. **PiP's non-navigability couples Studies 1 and 3.** Because a PiP window cannot be navigated, any
   document-based host requires an iframe, which requires a deployed artifact, which is the only
   reason Study 3 exists at all. Remove the document-based host and Study 3 has no subject.
5. **The clipboard question (§S1.6) is architecture-independent.** It is unresolved in every option,
   so it cannot be used to discriminate between them — but it can invalidate the *product premise*,
   which makes it the highest-value spike item by a wide margin.
6. **The recorded `.set()` defect connects Study 1 to Study 4.** The architecture that is cheapest to
   deploy is also the one that structurally prevents the test-shortcut that let two bugs ship. That
   alignment is rare and should be weighted accordingly.

---

## Updated Recommendation

### **APPROVED WITH MODIFICATIONS**

The architecture is sound in its domain half and materially wrong in its hosting half. Specifically:

**Approved unchanged**
- A dedicated Position Sizer bounded context.
- A generated Asset Registry, synchronous and module-load-available (forced by the NgRx reducer
  calling `contractSizeFor` synchronously — [trading.reducer.ts:86](emulador/src/app/state/trading/trading.reducer.ts:86)).
- Shared sizing domain between emulator and companion.
- No NgRx, no Supabase, no Router in the companion.
- Document PiP and popup as *alternative* window hosts, neither designated primary.

**Modified**
- The companion view becomes **vanilla TS** on the repo's own `ChartEngine` precedent, not a
  standalone Angular application. The `/calculadora` page becomes its Angular host wrapper.
- The **iframe is demoted from architecture to fallback**, used only if the spike shows the direct
  mount cannot carry styles or clipboard.
- **No second Angular entry point.** If a document-based host is later forced, it is a second
  *architect target in the existing project*, never a second project.

**Sequencing change — the most consequential recommendation in this report**

Split the work in two and ship them separately:

| Phase | Content | Conditional on |
|---|---|---|
| **1** | Registry generation, domain move, redesigned compact page, copy action on the page | Nothing. Unconditionally valuable; fixes a real 100 000× defect; improves emulator fidelity |
| **2** | Companion window hosting (PiP + popup) | Phase 1 in daily use, **plus** the clipboard spike passing |

Rationale: Phase 1 carries all the correctness value and none of the unvalidated risk. Phase 2
carries all the unvalidated risk and only ergonomic value. Freezing both in one RFC couples a
certain benefit to an uncertain one — and would freeze window decisions before the single
unresolved technical question has an answer.

**Not "REQUIRES ANOTHER SPIKE" overall**, because Phase 1 needs no spike at all. Phase 2 alone does.

---

## Architectural Risks

| # | Sev | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|---|
| **V1** | **Critical** | Clipboard fails from inside a PiP window (§S1.6). No authoritative source resolves the composition of PiP focus + transient activation + Permissions Policy. | Unknown — genuinely unmeasured | Kills the product's #2 action; would reduce the companion to read-and-retype | Spike before any Phase 2 commitment. Call the *target document's* clipboard. Visible failure state + selectable-input fallback. Phase split so this cannot block Phase 1. | Owner (spike) |
| **V2** | **Critical** | Wrong contract spec ⇒ confidently wrong lot. `contractSizeFor('BTCUSD')` returns `100000` today. | Certain for affected symbols | Real money | MT5-generated registry with provenance; visible contract line; keep the existing min-lot/rounding warning as the symptom surface | Phase 1 |
| **V3** | High | Registry cutover silently changes emulator sizing. `modifyOrder` re-sizes pending orders from `riskPct + contractSize` ([trading.reducer.ts:154](emulador/src/app/state/trading/trading.reducer.ts:154)). | Medium | Restored sessions' pending orders shift | Pure re-export first (zero delta); all pre-existing specs pass unmodified as proof; every intentional delta gets a named test; verify the `modifyOrder` path explicitly | Phase 1 |
| **V4** | High | Rewriting the shipped `/calculadora` page (PR #53, tested) reintroduces the input-handling bugs the F1/F3 fixes closed — comma decimals, `type="text"` DOM sanitization. | Medium | Silent wrong numbers | Port the existing specs to the vanilla view **first**, unchanged in intent; they are the regression net. The vanilla view forces DOM-level tests, which is what caught these late last time | Phase 1 |
| **V5** | Medium | PiP does not stay above MT5 on the owner's specific setup. | Low — Spotify's Miniplayer is a production existence proof; only *exclusive* fullscreen defeats always-on-top, and MT5 is an ordinary Win32 window | Phase 2 default host changes | Popup + PowerToys fallback; identical adapter, so the design survives | Owner (spike) |
| **V6** | Medium | Vanilla view re-implements reactivity badly (derived values, honest states, two-way text). | Medium | Bug class Angular would have prevented | Scope is ~6 inputs → ~8 derived values; plain recompute-on-input suffices. If it grows past that, escalate to the iframe+Angular fallback rather than hand-rolling a framework | Phase 1 |
| **V7** | Medium | Two build targets writing to one output directory collide on unhashed filenames (fallback path only). | Low | Broken deploy | Prove with a real build before freezing; `outputHashing: all` already applies in production | Phase 2 |
| **V8** | Low | A future CSP would need `frame-src 'self'` (fallback path only). No CSP exists today. | Low | Broken companion | Note it in the RFC so a future CSP author sees it | Phase 2 |
| **V9** | Low | Second build target has no bundle budget and grows unnoticed. | Medium | Bloat | Configure a budget on the second target at creation | Phase 2 |

---

## Open Questions

Only questions that genuinely block implementation.

| # | Question | Blocks | Why it cannot be deferred |
|---|---|---|---|
| **Q1** | Does `navigator.clipboard.writeText()` succeed from inside a Document PiP window on the owner's Chrome/Edge, and does the result paste into MT5's F9 field? | **Phase 2 only** | Unresolved by every authoritative source consulted. The entire copy path — the product's second-most-important action — depends on it. Cannot be answered by reasoning. |
| **Q2** | Are the page and the companion ever used **simultaneously**? | Phase 2 design | If no, persisted context is the whole sync story and no cross-window messaging is built. If yes, a `BroadcastChannel` is required. Changes what gets built, not how. |
| **Q3** | Which MT5 symbols should the registry export — the full terminal list, or a curated set? | **Phase 1** | Determines the generator's contract and the bundle's size. Cannot generate without it. |

Everything else previously listed as an open question (RFC numbering, branch target, route naming,
auth on the companion route) is a **decision**, not a blocker: implementation can proceed under a
stated default and be changed later without rework.

---

## Reversals — where this investigation overturned its own prior conclusions

**Reversal 1 — the companion must be an Angular application**

- *Previous conclusion (v2 §1.6):* the companion should be a standalone Angular micro-app with its
  own `bootstrapApplication`, hosted in an iframe.
- *New evidence:* every hazard motivating that design is Angular-specific (§S1.2); the repo's
  founding invariant is that the core is vanilla TS hosted by a thin Angular wrapper
  (`ChartEngine`/`ChartComponent`); and the "duplicated UI" objection measures far smaller than
  assumed — `input.directive.ts` is 18 lines applying a CSS class, and the companion's UI is
  specified to differ from the page's anyway (§S1.3).
- *Updated conclusion:* the companion is a **vanilla-TS view**. No second Angular application. The
  iframe becomes a fallback rather than the architecture.

**Reversal 2 — a second entry point requires a Vercel rewrite exception**

- *Previous conclusion (v2 §1.6):* `vercel.json` needs a rewrite exception so `/lotaje.html` is not
  swallowed by the SPA catch-all.
- *New evidence:* Vercel evaluates the filesystem **before** rewrites; a static file is served
  directly and the rewrite is never reached.
- *Updated conclusion:* no rewrite change is needed. Deployment complexity was over-stated and can
  no longer be used as an argument for or against any option.

**Reversal 3 — two entry points break the repo's verification gates**

- *Previous conclusion (v2 §1.6):* two entry points force per-project gate invocations and rework of
  `CLAUDE.md`'s four commands.
- *New evidence:* a single project may define multiple architect targets, and `index: {input,
  output}` plus `outputPath: {base, browser}` allow a second HTML artifact from one project. Since
  `tsconfig.app.json`, `tsconfig.spec.json`, the `test` target and `lintFilePatterns` are all scoped
  to `src/**`, **all four gates keep their exact current form.**
- *Updated conclusion:* the gate objection applies only to a second *project*, which is rejected for
  other reasons. It is not an argument against a second target.

**Reversal 4 — the spike is a gate on the whole project**

- *Previous conclusion (v1):* the PiP spike is Task 0 and gates everything.
- *New evidence:* the registry and domain work have no dependency on any window question, and carry
  the entire correctness value (V2, V3).
- *Updated conclusion:* the spike gates **Phase 2 only**. Phase 1 proceeds unconditionally.
