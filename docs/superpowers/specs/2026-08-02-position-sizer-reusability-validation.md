# Architecture Validation — Should the Position Sizer become a reusable product?

**Date:** 2026-08-02
**Method:** every assumption guilty until proven. Repository documents read, not assumed.
Repository measured, not estimated.
**Verdict up front:** **REJECT extraction.** The Position Sizer stays inside the emulator as a
folder with an enforced import boundary. The `apps/` + `packages/` hypothesis is rejected on the
repository's own recorded evidence.

---

## Executive Summary

The repository has already run this experiment, documented the result, and written down the rule.

**`ChartEngine` is the control group.** It is:

- a formally recognised bounded subcontext with its own aggregate root
  (`ARCHITECTURE_VISION.md` §3.1);
- the product of **seven dedicated RFCs** (001–007) whose entire purpose was framework
  independence;
- protected by the repository's highest-ceremony invariant ("Engine imports no Angular/NgRx …
  highest-ceremony code area", §3.3);
- explicitly declared portable — RFC-007's Impact section says *"El dominio del gráfico es
  totalmente portátil y agnóstico de NgRx"*;
- **1,978 LOC across 16 files.**

And its recorded physical home is `emulador/src/app/domain/chart/*` — **a folder.**

If the repository's most deliberately isolated, most audited, most explicitly portable subsystem —
forty times larger than the sizing kernel — did not earn a package after nineteen RFCs, then a
~200-line sizing kernel cannot. The repository's revealed preference is unambiguous: **isolation is
achieved by invariants plus mechanical detectors, not by package boundaries** (§3.3 is literally
titled *"Isolation rules (the executable form)"* and its second column is *"Detector"*).

The repository has also already ruled on the general question. `ARCHITECTURE_VISION.md` §8.2 records
extraction as a **contingent seam, not a plan**: *"every stage requires its own RFC with measured
demand. The current product is personal-use."* It then notes the architecture already guarantees
that "contexts are separated enough to be extracted along the mapped boundaries" — i.e. **the option
is preserved for free by the current structure.** Extraction now buys nothing that deferral does not
already provide.

Finally, the proposed `apps/` list is self-refuting. Of its five hypothetical consumers,
**four were rejected by the two preceding investigations and the fifth is technically impossible**
(§Study 7). The package structure is justified by consumers that do not and largely cannot exist.

**One conclusion is reversed** (§Reversals): calling the Position Sizer a *bounded context* was
wrong. It is a **Shared Kernel** plus a small **supporting subdomain**, and that reclassification is
what settles the whole question.

---

## Decision Matrix — the core question

Scoring: ✔✔ strong, ✔ adequate, ~ neutral, ✘ weak, ✘✘ disqualifying.

| Criterion | Stay a folder in `emulador/src/app/domain/sizing/` | Workspace package (`packages/position-sizer`) | Published npm package |
|---|---|---|---|
| Number of real consumers today | ✔✔ 1 | ✘✘ 1 | ✘✘ 0 external |
| Plausible second **application** | ✔✔ n/a | ✘✘ zero (§Study 7) | ✘✘ zero |
| Independent release cadence exists | ✔✔ n/a | ✘✘ none | ✘✘ none |
| Aligns with repo's recorded isolation mechanism | ✔✔ §3.3 detectors | ✘ introduces a second mechanism | ✘ |
| Precedent in repo (`ChartEngine`, 1,978 LOC) | ✔✔ exact match | ✘✘ contradicted | ✘✘ |
| Boundary enforcement strength | ✔ grep/lint detector | ✔✔ compiler-enforced | ✔✔ |
| Refactor cost across the boundary | ✔✔ single `tsc` pass | ✘ two builds, version step | ✘✘ publish cycle |
| Four verification gates preserved | ✔✔ unchanged | ✘ all four need rework | ✘✘ |
| Coverage thresholds preserved | ✔✔ `coverageInclude` already globs `src/app/domain/**` | ✘ falls outside the glob | ✘✘ |
| Build system additions | ✔✔ none | ✘ root `package.json` + workspaces (none exists today) | ✘✘ |
| CI changes | ✔✔ none | ✘ new job / matrix | ✘✘ registry auth, provenance |
| Deployment changes | ✔✔ none | ~ none if same app | ✘ |
| Liability (real-money sizing library, public) | ✔✔ none | ✔✔ none | ✘✘ real |
| Reversibility if wrong | ✔✔ trivial | ✘ sticky | ✘✘ permanent |

**Result: the folder wins on every axis except boundary-enforcement strength**, and that single
advantage is already supplied by the mechanism the repository chose and documented.

---

## Study 1 — Is the Position Sizer a bounded context?

**No. And the repository already says who owns sizing.**

`DOMAIN_MODEL.md` §2 enumerates the contexts: **Market Data**, **Simulation/Trading**,
**Workspace/Presentation**, plus **Chart Rendering** (isolated subcontext) and **Identity & Sync**
(supporting). Position Sizing is not among them — because it is already *inside* one:

> **I-1 Risk Invariance (lot sizing is derived, never free)** … *"Enforced by `lotsForRisk`
> (`trading.models.ts`). The trader chooses risk; SL geometry decides size."*
> — `DOMAIN_MODEL.md` §5

And `DOMAIN_MODEL.md` §6 lists `lotsForRisk`, `contractSizeFor` as **domain services of the
Simulation/Trading context**.

Applying the DDD tests honestly:

| Bounded-context test | Position Sizer |
|---|---|
| Own ubiquitous language | ✘ Identical to Simulation/Trading — *lote, riesgo %, contract size, distancia al stop*. Zero translation needed. `UBIQUITOUS_LANGUAGE.md` is shared. |
| Own aggregate root | ✘ None. It is stateless functions plus a static lookup table. Nothing persists, nothing has identity. |
| Own lifecycle | ✘ None. No entity is created, transitioned, or archived. |
| Own invariants | ✘ Its only invariant is **I-1, already owned by Simulation/Trading.** |
| Own model that may legitimately diverge | ✘ Divergence would be a **defect** — parity with the emulator is the property the feature exists to guarantee. |
| Independent team / cadence | ✘ Single owner, single release. |

**Correct classification — and it is three different answers, none of them "new bounded context":**

1. **The sizing math is a Shared Kernel** between Simulation/Trading and the Companion surface.
   DDD's guidance on Shared Kernels is explicit: keep them **as small as possible** and change them
   with high ceremony, because two contexts are jointly bound to them. `domain/risk/` is 44 LOC
   today; with the registry the kernel is ~200–400 LOC. **A Shared Kernel is the argument for a
   tight folder, not for a package** — a package would *encourage* the kernel to grow.
2. **The Asset Registry is a small supporting subdomain** — "Instrument Specification" — supplied
   by the pipeline. This maps exactly onto a pattern the repo already runs:
   *"Pipeline → frontend: **Published Language**. `manifest.json` … is the entire contract; neither
   side imports the other"* (`ARCHITECTURE_VISION.md` §3.2). The generated registry is a second
   published artifact from the same supplier. **Reusing an audited pattern (PHILOSOPHY §2.5), not
   inventing one.**
3. **The Companion surface is a presentation concern** — a second mount point of the Workspace/
   Presentation context, not a context of its own.

**Recommendation: REJECT** the bounded-context framing.
**Confidence: HIGH.** Grounded in three normative repository documents.

---

## Study 2 — What is the correct reusable unit?

The right test is not "what could be reused" but **"what is stable?"** — packaging an unstable
layer is the canonical mistake.

Observed churn, from this investigation's own history:

| Candidate layer | Stability evidence | Verdict |
|---|---|---|
| **Sizing formula** | Frozen as I-1 in a normative document. Unchanged since the trading engine was written. | **Most stable** |
| **Asset registry** | New, but *generated* — churn is mechanical (re-run, commit diff), not design churn | **Stable enough** |
| **Renderer / view** | Rewritten **twice in two days**: "Desde lotes" cut, Method B added, copy action added, density changed, Angular→vanilla | **Least stable** |
| **Adapters (window hosting)** | Contains the one genuinely unresolved technical question (clipboard-in-PiP) | **Unvalidated** |
| **Styles** | Owned by `DESIGN.md`, already shared via CSS custom properties | Shared already, no packaging needed |

The proposed `packages/position-sizer/{domain,registry,view,styles,adapters}` bundles the two most
stable layers **with the two least stable ones**. That is backwards: it would force the stable kernel
to be versioned at the churn rate of the view.

**Recommendation: the reusable unit is `domain + registry` and nothing else — and it is already
correctly placed.** `emulador/src/app/domain/sizing/` with an enforced import boundary
(`no imports from state/*, components/*, or @angular/*`) is precisely the right abstraction level.
The view, styles and adapters belong to their host.
**Confidence: HIGH.**

---

## Study 3 — Package evolution options

| Option | Verdict | Reason |
|---|---|---|
| **Internal folder** (`domain/sizing/`) | ✅ **ADOPT** | Matches `ChartEngine` precedent; zero new machinery; boundary enforced by the mechanism §3.3 already prescribes |
| npm workspace | ❌ Reject now | **No root `package.json` exists** — this is a from-scratch monorepo bootstrap, not an evolution. Solves dependency hoisting problems the repo does not have. *Cheapest escalation if ever needed.* |
| pnpm workspace | ❌ Reject | Same as above plus a package-manager migration; repo pins `npm@11.6.1` and has a documented npm-lockfile hazard already |
| Nx library | ❌ Reject | An entire build system, task graph, and cache layer for **one** application. Textbook failure of PHILOSOPHY §2.8 |
| Turborepo package | ❌ Reject | Task orchestration across many builds; there is one build |
| Private/published npm package | ❌ Reject | Zero external consumers; and publishing a *real-money position-sizing* library is a liability with no upside for a single user |
| Git submodule | ❌ Reject | All the costs of extraction plus checkout fragility |

**Escalation path, written down so it is not re-derived:** folder → npm workspace → (never) Nx.
Skip straight past the middle unless a trigger in §Study 10 actually fires.
**Confidence: HIGH.**

---

## Study 4 — Should the repository become `apps/` + `packages/`?

### Measured, not estimated

| Metric | Value |
|---|---|
| App source (TS/HTML/CSS, excl. specs) | **20,531 LOC** |
| Spec code | 17,505 LOC |
| `domain/chart` (ChartEngine) | 1,978 LOC / 16 files — **still a folder** |
| `domain/risk` (today's sizing) | **44 LOC** |
| `components/ui` | 2,038 LOC |
| Deployable frontend artifacts | **1** |
| Root `package.json` | **does not exist** |
| CI jobs | 2 (`pipeline`, `frontend`), each scoped by `working-directory` |

### The repository already solved multi-artifact coordination — without a workspace

Top level is `emulador/`, `pipeline/`, `supabase/`, `scripts/`, `docs/`, plus `topbar-hud/` (a
scratch prototype that `CLAUDE.md` explicitly declares *"never part of the app or its build"*). This
is already a **polyglot multi-directory repository**. It coordinates a Python pipeline, a SQL
project and an Angular SPA using **directories plus per-job `working-directory` in CI** — and it
works. Adding a JS workspace layer would introduce a *second, overlapping* coordination mechanism
that governs only one of the four directories.

### Verdict

**Architecture astronautics. REJECT.** The structure is justified by a company shape that does not
exist: `apps/` implies multiple deployables (there is one), `packages/` implies shared dependencies
across them (there are none to share), and both imply independent cadences (there is one release
train).

**Confidence: HIGH.**

---

## Study 5 — Independent deployments

Independent deployment requires **independent reasons to deploy**. Those require independent change
cadences, which require independent consumers. None exist.

Worse, extraction would *create* problems that do not currently exist:

- **Version drift** — today impossible: one `tsc` pass proves the whole graph consistent. With
  packages, the sizer and its host can disagree, and a compile-time guarantee becomes a runtime
  question.
- **Release choreography** — a formula fix would need: bump package → rebuild host → redeploy. Today
  it is one commit.
- **Local development** — link/watch setups, the most common source of "works on my machine" in
  monorepos. Today: edit and save.
- **CI** — a second job, second cache, second lockfile (with the documented npm optional-dep prune
  hazard doubled).

There is also a **hard architectural argument** against a separately-deployed calculator: the
companion window must be **same-origin** with its opener to share the persisted context and avoid
Permissions-Policy friction on the clipboard path. A separate subdomain would break that outright.
See §Study 8.

**Recommendation: REJECT. Confidence: HIGH.**

---

## Study 6 — Source of truth and ownership

| Asset | Owner | Physical home | Propagation |
|---|---|---|---|
| **Sizing formula (I-1)** | Simulation/Trading context (normative: `DOMAIN_MODEL.md` §5) | `domain/sizing/position-sizing.ts`, re-exported by `state/trading/trading.models.ts` | One definition; both consumers import it. Changing it requires the same ceremony as changing an invariant |
| **Asset registry** | **The pipeline**, as Published Language — same pattern as `manifest.json` | Generated into `domain/sizing/asset-registry.generated.ts`, **committed** | Re-run generator → commit → PR diff review. Provenance (`mt5:<broker>@<date>`) travels with the data |
| **Design tokens** | `DESIGN.md` (normative source) | Materialised in `styles.css` `:root` | Consumed by `var(--…)`. **CSS custom properties are already the cross-boundary sharing mechanism** — they cross document boundaries too. No package required |
| **Shared UI primitives** | Workspace/Presentation | `components/ui/*` + `styles/ui-primitives.css` | **Split ownership is the real finding:** the *CSS classes* are reusable by a vanilla view; the *Angular directives* are not. The genuinely shareable part of the design system is already CSS |
| **Sizer view + interaction** | The host feature | `domain/sizing/view/` (framework-free) or the page component | Not shared across applications — there is one application |
| **Window adapters** | The host application | Companion feature folder | Host-specific by definition |

**The key ownership insight:** the only asset with two consumers is the sizing kernel, and it is
already singly-owned with a single definition. Nothing else has an ownership problem to solve.

**Confidence: HIGH.**

---

## Study 7 — Could one package power all the hypothesised products?

Examining the proposed `apps/` list against the two preceding investigations:

| Hypothesised consumer | Status | Evidence |
|---|---|---|
| `emulator` | ✅ Real | The one application |
| `calculator` | ❌ Not a second app | Established previously: page + popup + PiP are **mount points of one application**, not applications |
| `future-desktop` (Tauri/Electron) | ❌ **Already rejected** | Violates `CLAUDE.md` invariant 8 (no new runtime deps) and the static-Vercel constraint |
| `browser-extension` | ❌ **Already rejected** | An extension side panel lives inside the browser window — it does not float over MT5, losing on the primary requirement. Additionally it could not import app source at runtime; it would need its own bundle, which is a bundler config, not a package boundary |
| `tradingview` | ❌ **Technically impossible** | TradingView exposes no extension point that can both size a position and reach the OS clipboard for MT5. Pine Script cannot do it |
| `mobile` | ❌ Rejected | Cannot reach the desktop clipboard — which is the entire purpose |

**Plausible second host applications: zero.** The proposed package structure is justified by
consumers this investigation has already eliminated. That is circular.

**And if two hosts did appear, packaging the *view* would be the wrong response.** The view encodes
Spanish copy, `DESIGN.md` tokens, and MT5-specific units. A second host would want different copy,
different tokens, possibly different units — so the package would need configuration, and
**configuration is the coupling**. Sharing the domain (universally correct) and letting each host
own its view is strictly better.

**Recommendation: REJECT the multi-product premise. Confidence: HIGH.**

---

## Study 8 — Deployment strategy

Current: one Vercel project, `outputDirectory: dist/emulador/browser`, SPA catch-all rewrite,
`git.deploymentEnabled.main: false` (production promotion gated on CI).

| Option | Verdict |
|---|---|
| **One Vercel project** | ✅ **KEEP.** Zero operational change; one build; one cache; one rollback |
| Multiple Vercel projects | ❌ Doubles build minutes on the free tier, doubles rollback surface, creates two things that can be at different versions |
| Static calculator deployment | ❌ Solves nothing; the calculator needs the same static hosting it already has |
| **Independent subdomain** | ❌ **Architecturally disqualifying.** The companion window must be **same-origin** with its opener to share persisted context via `localStorage` and to inherit the `self` default allowlist for `clipboard-write`. A separate origin breaks both — the exact mechanisms the design depends on |
| Embedded emulator page | ✅ Status quo |

The subdomain finding is worth emphasising: it is not an operational preference. **Cross-origin
would break the clipboard path**, which is the product's second-most-important action.

**Recommendation: one Vercel project, unchanged. Confidence: MEDIUM-HIGH** (high on the same-origin
reasoning; medium on free-tier specifics, which were not independently verified).

---

## Study 9 — Testing evolution

Extraction would **complicate** testing, concretely and verifiably:

1. **Coverage would silently drop.** `angular.json`'s `coverageInclude` globs
   `src/app/domain/**/*.ts` among others, with `coverageThresholds: { lines: 80, statements: 80 }`.
   A package outside `src/` **falls out of that glob** — coverage would not fail, it would simply
   stop counting the sizer. A silent weakening of a gate is worse than a loud one.
2. **The four gates would need rework.** `tsconfig.app.json` (`src/**/*.ts`),
   `tsconfig.spec.json` (`src/**/*.spec.ts`), the `test` target (`sourceRoot: src`) and
   `lintFilePatterns` (`src/**`) are all scoped to `src`. Every one would need a second invocation —
   and `CLAUDE.md`'s gate block is a *normative* four-command list.
3. **Contract tests would have to replace the compiler.** Today the contract between sizer and host
   is a TypeScript import, checked by `tsc` for free. Across a package boundary you must *write*
   contract tests to recover what the compiler currently gives you.
4. **Shared fixtures would need a home.** Today specs import fixtures directly across folders.
5. **Test-setup duplication.** `src/test-setup.ts` (fresh `fake-indexeddb` per file) is project-wide;
   a package needs its own — and the repo has a documented `isolate:false` module-state flakiness
   history that duplicated setups would aggravate.

What *does* improve testing is orthogonal to packaging: the **vanilla view** removes TestBed and
forces DOM-level tests — directly addressing the recorded failure where `.set()`-driven tests let
two High input bugs ship. That benefit is obtained by the folder design already; a package adds
nothing to it.

**Recommendation: extraction complicates testing with no offsetting benefit. REJECT.
Confidence: HIGH.**

---

## Study 10 — Five-year view: when does extraction start paying?

**The trigger is not size. It is independent release cadence.**

A package exists so that two artifacts can change on *different schedules*. Everything else a
package supposedly provides — boundaries, testability, portability — this repository already obtains
from invariants plus detectors (`ARCHITECTURE_VISION.md` §3.3).

The decisive evidence is `ChartEngine`: 1,978 LOC, 16 files, seven RFCs of dedicated isolation work,
an explicit portability claim in RFC-007, the highest-ceremony invariant in the codebase — and still
a folder, because it ships on exactly the same schedule as its only host. **Size and isolation
quality were never the trigger, and never will be.**

**Concrete triggers to write down** (extraction pays for itself when *any one* fires):

| ID | Trigger | Why it is real |
|---|---|---|
| **T1** | A second artifact must be **released independently** of the emulator | The only thing a package structurally provides |
| **T2** | A host that **cannot import TypeScript source** (different runtime or language) | A build boundary becomes unavoidable |
| **T3** | A **second maintainer** with separate ownership of the kernel | Package boundaries are also social boundaries |
| **T4** | An **external consumer** (open-sourcing the sizer) | Requires a published contract |

None currently exists, and per `ARCHITECTURE_VISION.md` §8.2 the repository's own scaling stages are
gated on **measured demand** at ~1k and ~10k users. Current user count: one.

**Cost of deferring: near zero.** `domain/sizing/` is a few hundred lines with full test coverage
and no framework imports. Moving it later is a mechanical refactor that `tsc` verifies completely —
§8.2 already says the contexts *"are separated enough to be extracted along the mapped boundaries"*.
**Cost of premature extraction: permanent** — build machinery, gate rework, coverage regression,
version drift, and a Shared Kernel that will grow because it now has a package to grow into.

**Five-year prediction:** the repository will still have one deployable frontend, and
`domain/sizing/` will be a folder next to `domain/chart/`, which will also still be a folder.

**Confidence: HIGH** on the trigger analysis; **MEDIUM** on the five-year prediction (predictions
about a personal project's direction are inherently uncertain — but the *rule* holds regardless of
which way it goes).

---

## Recommended Structure

### Package structure — none. Folder structure:

```
emulador/src/app/
  domain/
    chart/                    ← precedent: vanilla TS, framework-free, a folder
    sizing/                   ← NEW, same pattern, same rules
      position-sizing.ts          Shared Kernel: I-1 formula (moved from trading.models.ts)
      asset-registry.ts           resolve(): generated → manual override → heuristic
      asset-registry.generated.ts Published Language artifact from pipeline/
      view/                       framework-free view (mountable into any document)
      *.spec.ts
  state/trading/trading.models.ts   ← pure re-export; zero consumer edits, zero spec edits
  pages/calculadora/                ← thin Angular host (mirrors ChartComponent→ChartEngine)
  components/companion/             ← window adapters (host-owned, not shared)

pipeline/
  export_symbols.py           ← generator; same supplier pattern as manifest.py
```

### Build structure — unchanged

One project, one `ng build`, four gates in their current form. If a document-based companion host is
ever forced, it becomes a **second architect target inside the same project** (never a second
project), preserving all four gates.

### Deployment strategy — unchanged

One Vercel project, one output directory, existing rewrites. Same-origin is a **requirement**, not a
convenience.

### Ownership model

| Layer | Owner | Change ceremony |
|---|---|---|
| I-1 formula | Simulation/Trading context | Invariant-level: RFC or explicit owner decision |
| Registry data | Pipeline (generated) | Re-run generator, commit, review the diff |
| Registry resolution logic | Shared Kernel | Normal PR + tests |
| View | Host feature | Normal PR |
| Adapters | Host application | Normal PR |
| Design tokens | `DESIGN.md` → `styles.css` | Design-system change |

### Migration strategy — the only structural move required

1. Create `domain/sizing/`; move the four functions from `domain/risk/` and `lotsForRisk` /
   `contractSizeFor` from `state/trading/trading.models.ts`.
2. Leave a **pure re-export** in `trading.models.ts`. **Zero consumer edits. Zero spec edits.**
   Every existing test passing unmodified *is* the proof the move is behaviour-preserving.
3. Add the import-boundary detector to the audit grep list, alongside the existing engine rule:
   `domain/sizing/` imports nothing from `state/*`, `components/*`, `domain/chart/*`, or `@angular/*`.
4. Delete `domain/risk/`.

That is the whole migration. No workspace, no build change, no deployment change, no CI change.

---

## Architectural Risks

| # | Sev | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|---|
| **P1** | High | **Shared Kernel creep.** Two contexts bind to `domain/sizing/`; without a size discipline it accretes formatting, copy, and view helpers, and a change for the companion silently alters emulator sizing. | Medium-High — this is what Shared Kernels do | Emulator P&L changes without intent | Written size discipline: the kernel holds *math and instrument data only*. Add the import-boundary detector to audits. Any kernel change requires the emulator's parity tests to pass unmodified | Kernel |
| **P2** | Medium | **Registry provenance rot.** The generated file ages; the broker changes a spec; nobody re-runs the generator. | Medium over years | Silently wrong lot size (real money) | `source: 'mt5:<broker>@<ISO-date>'` rendered in the "Ficha del activo" so staleness is *visible at the point of use*, not buried in a file header | Pipeline |
| **P3** | Medium | **Someone extracts anyway** in a future session, citing "reusability", without a trigger firing. | Medium — the idea is attractive | Permanent complexity | Record T1–T4 as the named, citable extraction triggers. An extraction proposal without a fired trigger is an automatic finding | Docs |
| **P4** | Low | Generator becomes a Windows/MT5-only build dependency. | Certain, but bounded | Cannot regenerate on CI | It is *offline codegen*, not a build step — the output is committed. CI never runs it. Same posture as `pipeline/fill_r2.py` today | Pipeline |
| **P5** | Low | Vanilla view and Angular page drift into two UIs. | Medium if the page keeps its own markup | Duplicate maintenance | The page hosts the same view (ChartComponent→ChartEngine pattern), so there is exactly one view implementation | Host |

---

## Open Questions

Only what genuinely blocks the decision. Everything else is settled by the evidence above.

| # | Question | Blocks |
|---|---|---|
| **Q1** | Confirm the Shared Kernel size discipline: is *"math and instrument data only, no formatting, no copy, no view helpers"* the rule you want enforced by audit grep? | The P1 mitigation, which is the main long-term risk of keeping it a folder |
| **Q2** | Which MT5 symbols does `export_symbols.py` emit — full terminal list or curated set? | Carried forward unanswered from the previous investigation; blocks Phase 1 implementation |

Everything in the original brief's `apps/`+`packages/` hypothesis is **answered, not open.**

---

## Reversals

**Reversal 1 — "dedicated Position Sizer bounded context"**

- *Previous conclusion:* the v2 architecture described a "dedicated Position Sizer bounded context",
  and I carried that language forward without testing it.
- *New evidence:* `DOMAIN_MODEL.md` §2 enumerates the contexts and Position Sizing is not one;
  §5 places lot sizing inside **I-1**, owned by Simulation/Trading; §6 lists `lotsForRisk` and
  `contractSizeFor` as Simulation/Trading domain services. It has no aggregate, no lifecycle, no
  distinct ubiquitous language, and divergence from Simulation would be a defect rather than a
  legitimate model difference.
- *Updated conclusion:* it is a **Shared Kernel** (the math) plus a **supporting subdomain** (the
  registry, delivered as Published Language from the pipeline). This reclassification is what
  settles the extraction question — DDD prescribes keeping Shared Kernels *small and tightly held*,
  which argues for a folder and against a package.

**Reversal 2 — "the registry is a code-owned static catalog"**

- *Previous conclusion:* the registry is owned by application code as a static catalog.
- *New evidence:* `ARCHITECTURE_VISION.md` §3.2 documents an existing supplier relationship —
  *"Pipeline → frontend: Published Language. `manifest.json` … is the entire contract; neither side
  imports the other."*
- *Updated conclusion:* the registry is a **second published artifact from the same supplier**, so
  its *owner* is the pipeline, not the app. This changes who is responsible for regeneration and
  makes it an instance of an audited pattern rather than a new one — a strictly better position.

**No reversal on:** the vanilla view, the synchronous-registry constraint, the rejection of a second
Angular application, or the Phase 1 / Phase 2 split. Each was re-tested against the repository
documents in this round and each held.
