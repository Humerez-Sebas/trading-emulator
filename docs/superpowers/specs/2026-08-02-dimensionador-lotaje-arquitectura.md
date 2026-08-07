# Architecture Analysis v2 — Position Sizer (companion surfaces + asset registry)

**Date:** 2026-08-02 (v2 supersedes v1 of the same day)
**Author role:** principal architect (analysis only — no implementation)
**Status:** proposal under adversarial review, awaiting owner decisions
**Language note:** analysis in English (agent artifact, `CLAUDE.md` §Conventions); RFC outline in
Spanish.

> **v2 changes three of v1's conclusions.** The retractions are listed in §7 and argued in place.
> The short version: v1's "mount the same Angular component into another realm" was over-engineered
> and partly self-justifying — it manufactured the very architectural novelty it then used to argue
> the work needed an RFC. v1's hand-written seed table was also wrong: the repo already owns a
> machine that knows the true instrument specs.

---

## 1. The companion window: full architectural comparison

### 1.1 The requirement, restated (and challenged)

The brief says: *"a single reusable COMPONENT with multiple hosts."* That phrasing already encodes
an implementation choice. The product requirement is weaker and better:

> **A single source of sizing truth, reachable from several surfaces.**

Whether the *component instance* is shared, or merely the *code and the persisted context*, is an
engineering decision to be made on maintainability grounds — not a product constraint. v1 accepted
the stronger phrasing and was driven into cross-realm DOM adoption by it. Restating it reopens
options that are strictly simpler.

Second challenge, to the brief's "lives INSIDE the emulator SPA (session/auth/deploy reuse)":
**auth reuse is not a benefit here, it is a liability.** The sizer needs no identity: pure math, a
static catalog, and a local context. Putting a login wall in front of a tool whose entire value
proposition is "two taps and a copy" is friction with nothing on the other side of it. The genuine
reasons to live in this repo are **code reuse** (one registry, one formula, shared with the
emulator) and **deploy reuse** (one Vercel project). Those hold regardless of auth. See §5.4.

### 1.2 Every option on the table

| # | Option | Always-on-top over MT5 | Survives opener close | 2nd app boot | Realm hazards | New deps | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | **Cross-realm mount → PiP** (v1 proposal) | ✔ native | ✘ never | No | **6 named** | No | Retracted (§1.4) |
| 2 | **Cross-realm mount → `about:blank` popup** | ✘ (PowerToys) | ✘ (JS dies with opener) | No | 6 named | No | Retracted |
| 3 | **iframe(full SPA) inside PiP window** | ✔ native | ✘ | **Yes, full** | None | No | Viable, costed (§1.5) |
| 4 | **iframe(full SPA) inside popup** | ✘ (PowerToys) | ✔ | Yes, full | None | No | Viable |
| 5 | **Micro-app entry point in PiP/popup** | ✔ / ✘ | ✘ / ✔ | Yes, tiny | None | No | **Recommended (§1.6)** |
| 6 | Second SPA via `window.open('/ruta')` | ✘ | ✔ | Yes, full | None | No | = #4 without window control |
| 7 | Same-page floating overlay (`DraggableDirective`) | ✘ never | n/a | No | None | No | Fails the core need |
| 8 | PWA standalone window | ✘ never | n/a | No | None | Yes (SW) | Rejected (§1.7) |
| 9 | Electron / Tauri shell | ✔ perfect | ✔ | n/a | None | **Yes, large** | Rejected (§1.7) |
| 10 | Browser extension (MV3) + side panel | ✘ (panel is in-browser) | ✔ | Yes | None | Yes | Rejected (§1.7) |
| 11 | **MQL5 panel inside MT5** | n/a — *is* MT5 | ✔ | No | None | Yes (MQL5) | **Strongest rival (§1.8)** |
| 12 | AutoHotkey / native overlay | ✔ | ✔ | n/a | None | Yes | Rejected (§1.7) |
| 13 | Phone / second device | ✔ trivially | ✔ | Yes | None | Yes | Rejected (§1.7) |
| 14 | Do nothing: `/calculadora` + PowerToys on the whole browser window | ✔ (whole window) | ✔ | No | None | No | **The baseline everything must beat** |

### 1.3 The baseline nobody should skip past (#14)

PowerToys `Win+Ctrl+T` pins *any* window. The owner can pin the existing browser window showing
`/calculadora` today, at zero engineering cost. Every option below must justify itself against
this. What it actually costs: a full browser window's worth of screen area, the nav chrome, and
tab-switching if the browser is doing anything else. Those are real ergonomic costs for a
side-by-side-with-MT5 workflow — but they are *ergonomic*, not functional. **This is the honest
floor: none of this work is required for correctness; it is required for speed and pleasantness.**
Which is a legitimate goal (the owner said so explicitly), but it must be priced as one.

### 1.4 Why v1's cross-realm mount is retracted

The proposal was: `createComponent()` → `attachView()` → append the host element into another
window's `document.body`, keeping one Angular application. It *works* — Angular's own docs describe
exactly this create/attach/append/detach lifecycle for programmatic rendering — and it has a real
virtue: no second bootstrap, no state sync at all.

But price it honestly, on each axis the owner asked about:

| Axis | Cross-realm mount |
|---|---|
| **Complexity** | A style-copy routine, a theme mirror, a `SIZER_HOST_WINDOW` DI token threaded through every leaf that touches a global, a `pagehide` teardown, and possibly a `<head>` MutationObserver. All of it load-bearing; none of it is business logic. |
| **Maintenance** | Every future UI primitive reused inside the sizer (`ui-dropdown`, `tooltip`, `menu`) must be audited for global `window`/`document` access, forever. `DraggableDirective` already fails this test (`draggable.directive.ts:64`). The invariant is grep-able but it is a *standing tax on unrelated components*. |
| **Debugging** | DevTools attaches to the PiP document, but the component's JS, styles-of-origin and change-detection root live in the opener. Stack traces, breakpoints and the Elements panel are split across two contexts. |
| **Memory leaks** | Leak-by-construction if `pagehide` is ever missed: a detached view stays attached to `ApplicationRef` and keeps running change detection with no visible surface. Silent, and exactly the class of leak that "rarely explodes, accumulates". |
| **Angular lifecycle** | The framework has no supported concept of "this view lives in another document". It works because DOM adoption preserves the originating realm's prototypes, so zone.js's `EventTarget` patch still applies — **an emergent property, not a contract**. |
| **Future Angular compatibility** | This is the decisive one. The app is zone-based today (no `provideZonelessChangeDetection` in `app.config.ts`). Angular is moving to zoneless. A future migration would change *how events schedule change detection*, and the cross-realm path is precisely where an untested assumption would break — in a tool that produces real-money numbers, maintained by an owner who will not be reading Angular changelogs for regressions in an undocumented pattern. |

**The verdict:** it buys the elimination of a second bootstrap, and pays with a permanent
maintenance tax plus an unsupported dependency on framework-internal behaviour. Per PHILOSOPHY §2.8
("la complejidad paga alquiler"), an abstraction must name the defect it prevents. The defect it
prevents is *the cost of a second bootstrap* — and §1.6 shows that cost can be driven to nearly
zero by other means. **Retracted.**

### 1.5 What a second bootstrap actually costs here (measured against the code)

v1 asserted this was expensive. Verified against the repo, for the **full** SPA it genuinely is —
and worse than v1 said, because two of the costs are *behavioural*, not just resource use:

- `AuthEffects.init$` fires on `ROOT_EFFECTS_INIT` → `checkSession()` → a Supabase `getUser()`
  round-trip ([auth.effects.ts:24-31](emulador/src/app/state/auth/auth.effects.ts:24)).
- `WorkspacesEffects.init$` fires on `ROOT_EFFECTS_INIT` → loads the asset registry from IndexedDB
  and restores the last active asset ([workspaces.effects.ts:54-60](emulador/src/app/state/workspaces/workspaces.effects.ts:54)).
- `SessionSyncEffects` triggers on `AuthActions.sessionResolved | authSuccess`
  ([session-sync.effects.ts:50](emulador/src/app/state/sync/session-sync.effects.ts:50)) — which the
  second bootstrap *will* emit. **So a second full-SPA instance is a second live LWW session-sync
  actor.** This repo has already paid for a sovereignty bug once (PHILOSOPHY §4.3: the LWW guard had
  to move into a database trigger). Duplicating the actor to get a floating window is a bad trade.
- Plus: a second `@supabase/supabase-js` client with `persistSession: true` on the same storage key,
  a second IndexedDB connection, and ~648 kB of bundle re-parse.

That kills options #3, #4 and #6 as *default* choices. Not because of memory — because of the
duplicated sync actor.

### 1.6 Recommendation: a separate micro-app entry point (#5)

The insight v1 missed: **"second bootstrap" and "second copy of the whole application" are not the
same thing.** All the costs in §1.5 come from `appConfig` — the nine NgRx features, the eight
effect classes, Supabase, the router. A companion that sizes positions needs *none* of them.

```
emulador/src/
  main.ts        → bootstrapApplication(App, appConfig)          ← the emulator, unchanged
  sizer.main.ts  → bootstrapApplication(SizerApp, sizerConfig)   ← new, tiny
                     providers: []           no NgRx, no Supabase, no router, no effects
                     imports:   domain/sizing + the UI primitives it reuses
```

The companion window (PiP or popup) hosts a document that loads **this** entry point. Properties:

- **Zero realm hazards.** Its own document, its own realm, its own Angular. All six v1 hazards
  (clipboard realm, cross-origin `@import`, `data-theme`, late `<style>` injection, `DraggableDirective`,
  zone-crossing) simply do not exist. The style sheet is loaded by the document, not copied into it.
- **Zero framework risk.** It is an ordinary Angular app. Zoneless migration, Angular 22, DevTools,
  breakpoints, `ng test` — all normal.
- **Zero duplicated stateful actors.** No auth check, no session sync, no IndexedDB, no workspace
  restore. The costs of §1.5 are structurally absent rather than tolerated.
- **Survives the opener** when hosted in a popup (its JS lives in its own realm) — something *no*
  cross-realm option can offer.
- **Shares the code that matters**: `domain/sizing/` (formula + registry) is imported by both apps,
  so parity with the emulator is preserved by construction — the property the original calculator
  existed to guarantee.

Costs, stated plainly:

1. **A second build target** in `angular.json`, a second output document, and a `vercel.json` rewrite
   exception so `/lotaje.html` is served instead of falling through to `index.html`. Real, one-time,
   and it trips `CLAUDE.md`'s "watch for NEW chunk types" rule at build gate — deliberately, with a
   written reason.
2. **State is no longer shared live.** Which leads to the question that dissolves most of the problem:

> **Is live bidirectional state sync actually a requirement?** The workflow is: open the companion,
> set balance and risk % once, then per trade type entry + SL and copy. The page and the companion
> are used at *different times*, not simultaneously. If that is true, there is no sync problem at
> all — only **persisted context**, which requirement 5 already mandates. `localStorage` write on
> change, read on mount, with the `storage` event as a free bonus for the case where both are open.
> **Owner decision U1 (§8).** If the owner says "I want them live-mirrored", the answer is a
> `BroadcastChannel` — still ordinary, still no cross-realm DOM.

### 1.7 The rejected options, with reasons

- **#8 PWA.** Does not do the one thing needed: a PWA window is not always-on-top, and a PWA does
  *not* extend a PiP window's lifetime (the PiP dies with its opener document regardless of display
  mode). It buys taskbar launch and a frameless shell, neither of which is on the requirement list,
  and costs a service worker sitting next to a Parquet/IndexedDB cache — a new cache-invalidation
  surface in the one part of this app where cache correctness is already delicate. **Reject.**
- **#9 Electron / Tauri.** Architecturally the *best* overlay — transparent, click-through, global
  hotkey, true always-on-top, and it could read MT5 directly. It is rejected on repo invariants (no
  new runtime deps by default; static Vercel deploy), and those invariants are the owner's, not
  mine. Worth recording that this is the option that would win if the constraints were different.
- **#10 Browser extension (MV3).** The only pure-web path to a *global hotkey* (`Ctrl+Shift+0-9`).
  But an extension's side panel lives inside the browser window — it does not float over MT5 — so it
  loses on the primary requirement while adding a whole second distribution channel (packaging,
  updates, a separate codebase). **Reject**, unless the global hotkey ever outranks always-on-top.
- **#12 AutoHotkey / native overlay.** Solves window management, solves nothing about sizing, and
  adds a second language and a second artifact to maintain. PowerToys already covers the pinning
  need with zero code. **Reject.**
- **#13 Phone as the calculator.** Genuinely defensible — always-on-top is free when it is a
  different piece of glass, and there is no window management at all. It loses because the copy →
  paste-into-MT5 step is the whole point, and a phone cannot reach the desktop clipboard. **Reject**,
  but it is the reminder that "always on top" is a means, not the end; the end is *the lot figure in
  MT5's volume field*.

### 1.8 The rival that deserves a real hearing: an MQL5 panel (#11)

This is the option the brief did not consider, and it is the strongest competitor — because it
dissolves the hardest problem in the entire design.

MT5's own API exposes, per symbol, exactly the data the asset registry is trying to reconstruct:
`SYMBOL_TRADE_CONTRACT_SIZE`, `SYMBOL_TRADE_TICK_SIZE`, `SYMBOL_TRADE_TICK_VALUE`,
`SYMBOL_VOLUME_STEP`, `SYMBOL_VOLUME_MIN/MAX` — plus the live account balance. An on-chart MQL5
panel would therefore:

- need **no asset registry at all** (the terminal is authoritative, per broker, always current);
- need **no clipboard** (it can pre-fill the order dialog, or place the order directly);
- need **no window management** (it lives on the chart);
- be **immune** to every browser limitation in this document.

**This is a genuine architectural indictment of the web approach: the registry is a workaround for
not being inside MT5.** It must be stated, not hidden.

Why it still loses, and the reasons are not "we already started":

1. **It does not cover TradingView.** The owner's stated workflow is TradingView *and* MT5. An MQL5
   panel is dead weight on the analysis platform where the setup is actually found.
2. **It does not share the emulator's formula.** The parity property — practice and live trading
   using the same code — evaporates, and the two implementations would drift silently.
3. **It is a second language, toolchain, and repo.** Against a no-new-deps culture and a single
   maintainer working through agents.
4. **It is prop-firm coupled in practice.** Panels must be installed per terminal; prop firms
   restrict EAs on some challenge accounts.

**But there is a synthesis, and it is the best idea in this document:** keep the web tool as the
product, and use MT5 *as the data source for the registry, offline, through the pipeline the repo
already owns*. See §3.5. That takes the MQL5 option's one decisive advantage — authoritative
instrument specs — and imports it into the web architecture without any of its costs.

---

## 2. Document Picture-in-Picture: evidence dossier

### 2.1 What the platform actually guarantees (verified, 2026)

| Property | Finding | Impact |
|---|---|---|
| Availability | Chrome/Edge **116+**, **Firefox 151+ (2026)**, Safari **no** | The brief's "Chromium-only" is **out of date**. Two engines shipping is the practical bar for a WICG feature to be durable — this materially lowers the long-term bet risk. |
| Always-on-top | Floats above other windows; Spotify's Miniplayer ships on it and is described as staying on top of other applications | The core premise is **real-world validated at scale**, not theoretical. |
| Exclusive fullscreen | Any app in *exclusive* fullscreen bypasses the Desktop Window Manager and paints over everything, including all always-on-top windows | Does **not** affect MT5 (an ordinary maximized Win32 window). Does affect fullscreen video/games. A known, bounded limitation. |
| Position | Not settable by the site. No `moveTo()`. | User drags it once. Acceptable. |
| Size | `resizeTo()`/`resizeBy()` from **Chrome 121**, user-gesture gated. Spec directs UAs to cap max size so a site cannot cover the screen. | The sizer must be designed *small*. Which the compact requirement already demanded. |
| Geometry persistence | Chrome **reuses previous window state by default**; `preferInitialWindowPlacement: true` (Chrome 130+) opts out | **v1 listed this as an open spike question. It is not — the browser handles it.** One less thing to build. |
| Lifetime | "Never outlives the opening window" | The single hardest constraint. Not fixable. Mitigated only by persisted context. |
| Navigation | The PiP window cannot be navigated | ⇒ a URL-loaded companion needs an **iframe inside** the PiP window. Direct consequence for §1.6. |
| Count | One per tab; UA may cap globally | Fine for one tool. |
| `copyStyleSheets` | Was supported, **no longer**; manual `<link>`/`<style>` cloning is the documented workaround | Confirms v1's hazard H2 was real — and confirms §1.6 avoids it entirely by loading a document instead of copying into one. |
| Focus | `window.focus()` from the PiP focuses the opener (Chrome 123+), user-gesture gated | Useful for a "back to the page" affordance. |
| `disallowReturnToOpener` | Chrome 124+ | Cosmetic. |

### 2.2 Should PiP be the *primary* surface? — No.

Comparing the two window hosts on properties the trader can feel:

| | Document PiP | `window.open` popup (own document) |
|---|---|---|
| Always-on-top | **Native, one click** | Requires PowerToys `Win+Ctrl+T` each time |
| Survives opener close | **No — dies** | **Yes** |
| Survives opener *navigation* | Yes | Yes |
| Browser support | Chrome/Edge/Firefox | Universal |
| Position control | None (user drags; Chrome remembers) | Full (`left/top`; multi-monitor via Window Management API, permission-gated) |
| Max size | UA-capped | Unconstrained |
| Failure mode | Feature absent → no window | None |

Neither dominates. PiP wins the headline feature; the popup wins **robustness and lifetime**.

**Recommendation:** build one host adapter with two window providers, ship **both**, and let the
owner choose per session. If forced to name a default: **PiP**, because one click beats a keyboard
shortcut plus an external tool, and because dying with the opener is nearly harmless once the
context is persisted. But this is a *preference*, not an architecture decision — and framing it as
"the primary surface" (as the brief does) overstates a choice that costs nothing to leave open.

**The spike's job therefore changes.** v1 framed it as a go/no-go on the whole premise. With
Spotify as existence proof and Firefox shipping, it is no longer that. It is now a **fit check** on
the owner's specific setup, and it can shrink accordingly (§4).

---

## 3. Asset registry: seven designs

### 3.1 The constraint that eliminates half the options immediately

`contractSizeFor` is called **synchronously inside an NgRx reducer**
([trading.reducer.ts:86,107,154](emulador/src/app/state/trading/trading.reducer.ts:86)) and inside a
`createSelector` ([selectors.ts:245](emulador/src/app/state/selectors.ts:245)). Reducers are pure
synchronous functions. Therefore:

> **The instrument lookup must remain synchronous, pure, and available at module load.**

That single fact eliminates IndexedDB, SQLite-wasm, and any runtime-fetched catalog — not on
preference but on architecture. Adopting any of them forces either an async reducer (impossible) or
a pre-hydration phase gating the entire trading engine on a database read (a new startup failure
mode in the emulator, to serve a companion tool). **Rejected on structural grounds.**

### 3.2 The remaining designs

| Design | Correctness | Add an instrument | Validate | Testability | Risk |
|---|---|---|---|---|---|
| **A. Hand-written `.ts`** (v1) | As good as my guesses | Edit + PR | Manual, by eye | Trivial | **Silent wrong spec** |
| **B. Hand-written `.json` + typed loader** | Same as A | Edit + PR | Schema test possible | Trivial | Same as A + import config |
| **C. Fetched from R2** | Same as A | Re-upload | Server-side | Needs network mocks | Async ⇒ **eliminated by §3.1** |
| **D. IndexedDB / SQLite** | Same as A | UI or migration | Runtime | Heavy | Async ⇒ **eliminated by §3.1** |
| **E. Generated from MT5, committed** | **Broker-authoritative** | Re-run a script | Diff in PR | Trivial (static import) | Generation drift |
| **F. Hybrid E + manual override + heuristic** | Best available | Script, or one line | Diff + provenance | Trivial | Layer confusion |
| **G. Keep heuristics** | Wrong for crypto/aliases | n/a | n/a | Existing | **Known defect** |

### 3.3 The defect being fixed (unchanged from v1, restated because it is the whole justification)

```
contractSizeFor('BTCUSD')  →  /^[A-Z]{6}$/ matches  →  100000     (should be ~1)
pipSizeFor('BTCUSD')       →  0.0001                              (should be null)
```

Five orders of magnitude, in a real-money tool. It degrades loudly today (lots hit the 0.01 floor
and the existing warning fires) but that is luck, not design. Broker alias drift
(`US30` / `DJ30` / `US30.cash` / `YM`) is the second class.

### 3.4 Why hand-written (A) is now retracted

v1 proposed a hand-maintained seed table with a `source: 'seed' | 'heuristic'` provenance field.
The problem: **`'seed'` means "an agent typed a number it believed"**. For a tool whose only
catastrophic failure mode is a confidently wrong specification, that is the weakest possible
provenance — and the repo's own Futures non-goal already articulated the principle:
*"encodearlos «a ojo» produciría un dimensionado incorrecto con apariencia de autoridad."*
v1 then argued the four core instruments were an exception because their values are
"broker-typical". That is a rationalization. **A hand-written table is the same epistemic act as the
heuristic it replaces — a guess with a nicer shape.**

### 3.5 Recommended: (F) generated from MT5, committed, with an override layer

The repo already has a Windows Python pipeline that talks to the owner's live MT5 terminal:
`pipeline/mt5_common.py` imports `MetaTrader5 as mt5` and its docstring names the broker
(FivePercentOnline) — the same prop-firm terminal the owner trades. `mt5.symbol_info(symbol)`
returns `trade_contract_size`, `trade_tick_size`, `trade_tick_value`, `volume_step`, `volume_min`,
`digits`, `point`, `currency_profit`.

So the registry can be **generated from the authoritative source, offline, by machinery the repo
already owns and already gates** (`pytest`, `ruff`):

```
pipeline/export_symbols.py   →   emulador/src/app/domain/sizing/asset-registry.generated.ts
                                 (committed, diffable, typed, synchronous)
```

Three layers, most-authoritative first, each declaring its provenance:

```
resolveAsset(symbol):
  1. GENERATED   source: 'mt5:FivePercentOnline@2026-08-02'   ← truth, from the terminal
  2. OVERRIDE    source: 'manual'                             ← hand-written, for symbols MT5
                                                                lacks (TradingView-only names,
                                                                other prop firms' aliases)
  3. HEURISTIC   source: 'heuristic'                          ← today's name rules, last resort
```

Why this is the right design on every axis the owner asked about:

- **Correctness:** the numbers come from the broker, not from anyone's belief.
- **Maintainability:** adding an instrument is *running a script*, not researching contract specs.
- **Validation:** the generated file is a committed diff reviewed in a PR, with the broker and date
  in the header. Provenance is a fact, not a label.
- **Testability:** a static TS module. Unit tests are trivial; no network, no async, no mocks.
- **Scalability:** it scales to whatever the terminal lists, at zero marginal effort.
- **Risk:** the remaining risk is *staleness* (a broker changing a spec), which is visible as a diff
  the next time the script runs, and which the "Ficha del activo" surfaces via the date in `source`.

**And it produces an unexpected second benefit for the emulator.** The emulator's candles already
come from this same terminal via `pipeline/`. Feeding the same terminal's contract specs into
`contractSizeFor` makes the *simulation* match the broker's real instrument definitions — a fidelity
improvement directly aligned with the Mastery Block's RFC-014 (high-fidelity simulation). The
registry stops being "a thing the calculator needs" and becomes shared infrastructure that improves
the product it was extracted from.

**Format: generated `.ts`, not `.json`.** It is type-checked by `tsc` (already a gate), needs no
`resolveJsonModule` or import-attribute configuration, and diffs identically. Escalate to lazy
loading only if the catalog ever grows enough to matter — reserve, don't implement.

### 3.6 Schema (unchanged in substance from v1, minus the invented provenance)

```
AssetSpec {
  symbol · kind · contractSize · tickSize · pointSize · pipSize|null
  volumeStep · volumeMin · quoteCurrency · aliases[]
  source: 'mt5:<broker>@<ISO-date>' | 'manual' | 'heuristic'
}
```

`pointSize` and `pipSize` remain **separate fields**: on 5-digit FX an MT5 *point* is `0.00001` and
a pip is `0.0001` — 1 pip = 10 points, so collapsing them is a 10× Method-B error. With a generated
registry the Method-B default unit is *derived* (`pipSize !== null ? pips : points`) rather than
declared, which removes one more hand-made decision.

---

## 4. The spike, rescoped

§2 changed the spike's purpose. Always-on-top over native apps is validated by Spotify; geometry
persistence is handled by Chrome; stylesheet copying is moot under §1.6. What remains genuinely
unknown is **fit on the owner's setup**:

| # | Task | Why it survived |
|---|---|---|
| S1 | PiP over a maximized MT5, and over MT5 on the second monitor; click MT5 to focus and observe | Multi-monitor behaviour is the least documented axis |
| S2 | Copy inside the companion → paste into MT5's F9 volume field | The #2 product requirement; must be proven end-to-end once |
| S3 | Minimum usable window size vs. the UA size cap, with real content | Decides the compact layout budget |
| S4 | An iframe loading a same-origin document *inside* the PiP window renders and is interactive | The one structural assumption §1.6 rests on |
| S5 | Popup variant: survives opener close; PowerToys pins it; multi-monitor placement | Validates the fallback that makes S1 non-fatal |
| S6 | Record exact Chrome/Edge/Firefox versions, Windows build, monitor and DPI layout | Makes the result citable later (PHILOSOPHY §1.2) |

**Exit criteria:** S2 and S4 are pass/fail gates. S1, S3, S5 are *measurements* that shape the UI,
not gates — because §1.6's architecture is identical whether the window is a PiP or a popup.

**This is roughly half of v1's spike**, and it no longer gates the project — only the choice of
default window host. That is the correct amount of ceremony for a question with an existence proof
already in the wild.

---

## 5. Emulator integration: the constraint is load-bearing

The owner's direction is explicit: **nothing is added to the Order Dock, the chart, or the trade
panel.** This is not merely a scope limit; it settles several architectural questions.

### 5.1 Why the existing flow should not be touched

The in-replay flow (verified: `handleContextMenu`~804 → `menuPlace`~913 → `updatePlacingHover`~946
computing `lotsForRisk` live at [chart.component.ts:958](emulador/src/app/components/chart/chart.component.ts:958)
→ commit at ~1126, with the risk % held by the dock slider) is **direct manipulation**: the stop is
expressed as a gesture on the price axis and the lot appears as continuous feedback. The companion
is a **form**: the stop is typed. These are different input modalities for different contexts
(chart present vs. chart absent) — not two skins of one feature. Unifying them would degrade the
better one.

### 5.2 What follows architecturally

1. **No shared UI between dock and companion — only shared math.** The seam is
   `domain/sizing/`, and nothing above it.
2. **The companion must not import `state/trading` at all**, which makes the import-boundary grep a
   real invariant rather than a formality. Under §1.6 this is structural: the micro-app's config has
   no NgRx.
3. **The companion is reachable from the global nav only** — never from the chart, dock, or trade
   panel. (This closes v1's open question U1 in the negative.)
4. **The emulator's only visible change is a correctness one**: `contractSizeFor` becomes
   registry-backed, so index/metal/crypto sizing gets more accurate. No new UI. This should be called
   out explicitly so it is not a surprise in review.

### 5.3 The parity property, re-examined

The original calculator's justifying test was parity with the emulator. Now the tool targets a
*different platform*. Does parity still make sense?

**Yes — but only because §3.5 makes both consumers share one registry.** Emulator candles and
instrument specs both come from the same MT5 terminal, so the simulator and the companion agree by
construction and both become more correct together. Had the companion been given its own catalog,
parity would have had to be demoted from a goal to a coincidence. **This is the strongest argument
for the shared-module design and it should be written into the RFC as such.**

### 5.4 The auth question

Under §1.6 the companion is a separate document with no Supabase client. Two options:

- **(a) Behind `authGuard`** — consistent with "login required", but the guard lives in the main
  SPA's router, which the micro-app does not have. Enforcing it would mean *adding* Supabase back to
  the micro-app: reintroducing exactly the cost §1.6 exists to avoid, to protect arithmetic.
- **(b) Public route** — the companion is served without auth. Exposed data: none. A static
  catalog, a formula, and whatever the user types locally.

**Recommendation: (b).** But it is a deliberate reduction of a security control, so it is an
**owner decision (U2)**, not mine to make silently.

---

## 6. Does this actually cross the RFC threshold?

### 6.1 Testing v1's verdict honestly

v1 claimed all three triggers of `decision-frameworks.md` §2. Re-examined:

- **(b) "adds a new architectural layer"** — v1's justification was the cross-realm mounting
  strategy. **That layer was v1's own invention.** Under §1.6 the host is a second entry point and an
  `<iframe>` — the oldest primitives on the web. **Trigger (b) fails.** v1's reasoning was circular:
  it proposed a novel architecture and then cited that novelty as proof the work needed an RFC.
- **(a) "reopens an audited core"** — real but modest. The move is a pure re-export (zero delta) and
  the registry cutover is behaviour-preserving except for deliberate, tested deltas. That is
  spec-and-plan territory on its own. **Trigger (a): weak.**
- **(c) "freezes decisions future work must obey"** — **strong, and sufficient.** Without a written
  freeze, a future session *will* add a TP field, an R:R readout, a drawdown guard, a prop-firm
  preset that branches the formula. The non-goals are the actual product of this work.

Also worth noting: the frozen 008-012 non-goal does **not** by itself force an RFC.
`decision-frameworks.md` §1 says *"New RFC **or explicit user revocation**"* — and PHILOSOPHY §3.1
puts the owner at level 1, above frozen decisions. The owner can simply rule that the freeze is
chart-scoped. That is a legitimate, cheaper resolution.

### 6.2 Verdict

**Yes — an RFC, but a small one, justified by (c) alone.** Its value is the freeze, not the design.
Concretely: an RFC that is mostly *decisions and non-goals*, with the implementation carried by a
spec + plan. That matches PHILOSOPHY §3.3 ("los no-goals son artefactos de primera clase") and §5.2
("ceremonia proporcional al riesgo") far better than v1's large design RFC.

### 6.3 What exactly would be frozen

| ID | Decision | Why it must bind future work |
|---|---|---|
| **D.1** | The tool's single output is a lot figure. Anything that does not change that figure is out of scope. | The scope-defence rule. Answers every future feature request mechanically. |
| **D.2** | Never branch the calculation on prop firm, account type, or platform. Presets store numbers only. | The discarded prop-firm-rules alternative will otherwise return. |
| **D.3** | Risk model is **balance + risk %**. Not fixed-money, not live equity. | Already re-litigated once. |
| **D.4** | Instrument lookup stays **synchronous, pure, module-load-available**. | Forced by the NgRx reducer (§3.1). A future "let's put it in IndexedDB" would break the trading engine. |
| **D.5** | One registry, shared by emulator and companion. Layered provenance: generated → manual → heuristic, always declared. | This is what preserves parity (§5.3). |
| **D.6** | The companion depends on **no** emulator state (`state/trading`, `state/replay`, `state/layout`, `domain/chart`). Grep-enforced. | The real-money/simulation boundary. |
| **D.7** | The emulator's in-replay sizing flow is untouched. No sizing UI is added to chart, dock, or trade panel. | The owner's direction, recorded so it survives context loss. |
| **D.8** | Non-goals: R:R/TP in the companion, "Desde lotes" inverse card, clean-lot snapping, copy-bundles, native shell, global hotkey, PWA, non-USD accounts, non-market orders, futures mode. | The list is the product. |
| **D.9** | The companion window is a **utility surface**, explicitly exempt from the 008-012 "ventanas desacopladas" freeze, which remains in force for chart panels. | Reconciles the frozen decision in writing rather than by interpretation. |

Note that **not one of these freezes a UI or a window technology.** PiP vs. popup, layout, and
density are all reversible and therefore belong in the spec, not the RFC (PHILOSOPHY §3.4).

---

## 7. Retractions and disagreements

### 7.1 Where v1 was wrong

1. **Cross-realm component mounting** — retracted (§1.4). Over-engineered; taxes unrelated
   components forever; depends on undocumented framework behaviour in the middle of an
   industry-wide zoneless migration.
2. **"No second bootstrap" as an invariant** — retracted (§1.6). The real objection was to
   duplicating *stateful actors* (auth check, session sync, workspace restore), not to a second
   Angular application. A micro-app entry point has none of them.
3. **A hand-written seed table** — retracted (§3.4). `source: 'seed'` is a euphemism for a guess. The
   repo owns a machine that knows the real answers.
4. **The spike as a project gate** — softened (§4). Spotify ships this; Firefox now implements it.
   The spike is a fit check, not a go/no-go.
5. **"Hits all three RFC triggers"** — corrected (§6.1). Trigger (b) was self-generated. One trigger
   survives, and it is enough for a *small* RFC.

### 7.2 Where I disagree with the brief

1. **"Document PiP as the primary surface."** Overstated (§2.2). The popup wins on lifetime,
   universality, and positioning; PiP wins on one-click always-on-top. Ship both; the choice costs
   nothing to defer.
2. **"A single reusable COMPONENT with multiple hosts."** The requirement should be *a single source
   of sizing truth* (§1.1). The stronger phrasing forced v1 into cross-realm DOM adoption. Sharing
   code and persisted context achieves the product goal; sharing a live component instance does not
   pay for itself.
3. **"Lives inside the SPA for session/auth reuse."** Auth reuse is a liability, not a benefit
   (§1.1, §5.4). The real reasons are code reuse and deploy reuse.
4. **"Chromium-only."** Out of date — Firefox 151 (2026) ships Document PiP (§2.1). This lowers the
   long-term platform risk materially.
5. **Order of work.** The brief put the spike last; v1 put it first as a gate. Both were wrong. It
   is small, parallel, and gates only the default window host (§4).

### 7.3 The strongest argument against this whole project

Stated for the record, because the owner asked to be contradicted: **an MQL5 panel inside MT5 would
be simpler, more correct, and need no registry, no window management, and no clipboard** (§1.8). The
web tool wins on TradingView coverage, formula parity with the emulator, and single-codebase
maintenance — but it wins on *product scope*, not on engineering elegance. Anyone reviewing this
design later should know that trade was made deliberately.

---

## 8. Owner decisions still open

| # | Decision | Consequence |
|---|---|---|
| **U1** | Are the page and the companion ever used **simultaneously**? | If no: persisted context is the entire sync story, and `BroadcastChannel` is never built (§1.6). |
| **U2** | Is the companion route **public** (no `authGuard`)? | Recommended yes (§5.4). It is a deliberate reduction of a control, so it needs an explicit call. |
| **U3** | RFC → `develop` per `git-workflow.md`, or an authorized product-track exception to reach production sooner? | Decides the branch target and whether a release PR is in scope. |
| **U4** | Confirm the RFC number against `origin/develop` (this branch is off `main` and only shows up to 014). | Numbering. |
| **U5** | Which instruments should `export_symbols.py` emit — all terminal symbols, or a curated list? | Bundle size vs. coverage. Curated is the safer default. |
| **U6** | UI name: **"Lotaje"** (vernacular, terse) vs. "Dimensionador" (precise). Route `/lotaje` vs. keeping `/calculadora`. | Cosmetic, but it is the scope-defence mechanism (§9). |

---

## 9. Product identity: is it still a calculator?

**No — and the name is doing real architectural work, not decoration.**

The decisive observation: **it stopped being a calculator the moment "copy" became the second-most
important action.** A calculator's output is *read* by a human. This tool's output is *transferred*
into another program. That is a different product category — closer to a converter or an emitter: it
turns a market observation into a broker input.

Evaluated as scope-defence mechanisms:

| Candidate | Verdict |
|---|---|
| **Calculadora** | **Worst.** Names the *mechanism*, not the job. A calculator calculates anything — which is precisely why this conversation had to relitigate TP, R:R and the inverse card. The name caused the scope creep. |
| **Risk Companion** | **Actively dangerous.** Risk is the *input*. The name invites drawdown guards and daily-loss limits — the exact prop-firm features already discarded. |
| **Trade Companion** / **Trading Utility** | Too broad. "Companion to trading" has no boundary; it will accrete a journal, a checklist, a news panel. |
| **Lot Size Companion** | Accurate, but "companion" is the weak word again. |
| **Position Sizer** | **Best for code.** Names the job exactly; industry-standard (MT5's own panels are called this). Boundary test: *if it does not change the position size, it does not belong.* |

**Recommendation:** `Position Sizer` for the domain and code (`domain/sizing/`, `sizer.main.ts`);
**"Lotaje"** for the Spanish UI — one word, and it is literally the question the trader is asking
("¿cuánto lotaje?"). Vernacular wins the label; precision wins the identifier.

The rename belongs **in this RFC**, because D.1's scope test is stated in terms of it. Deferring the
name defers the mechanism that keeps the scope closed.
