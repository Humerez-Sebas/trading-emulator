# TD Audit — Styling, Design Tokens, UI Primitives, Layout, Motion & Accessibility

Repo: `C:\Users\78701\Desktop\trading-emulator` · branch `develop` · HEAD `a2ca53b`
Auditor role: Principal Engineer, READ-ONLY. Date: 2026-08-10.
Corpus: `emulador/src/**` — 31 `.css` files (5,732 lines) + 17 `.ts` files carrying inline
`styles:` blocks (~1,175 extracted lines). Total style surface ≈ 6,900 lines.

---

## STATUS

**~95% complete.** All nine investigation areas were reached; every finding below carries
mechanically-generated counts and `file:line` evidence. Only low-value tail work remains.

**AREAS COMPLETE**
- (1) Token architecture — current state, incl. DESIGN.md / DESIGN_SYSTEM.md / TEDS_* conformance
- (2) Hardcoded value census + classification of the px population by property context
- (3) Fragmentation (duplicate/stale token fallbacks, notation drift, foreign palette, scale conflict)
- (4) Theming (dark/light, token-driven vs hardcoded, light-mode breakage sites)
- (5) CSS budget (`angular.json` budgets + measured minified sizes of every component stylesheet)
- (6) UI primitives / design-system drift (inventory + usage counts + divergent-implementation census)
- (8) Motion (durations, easings, CSS-vs-Angular, motion-owning-correctness search)
- (9) Accessibility on reusable primitives (icon-button names, focus, focus trap, roles, keyboard)

**AREAS PARTIAL**
- (7) Layout / responsive — breakpoints, viewport units, absolute positioning, z-index and large
  fixed px are all enumerated and reported. NOT done: reading the chart resize/`ResizeObserver`
  contract in `chart.component.ts` / `workspace-viewport.component.ts` to confirm whether the
  panel-size contract is encoded or implicit. Finding TD-12 is written from the CSS side only.

**AREAS NOT STARTED**
- None.

**Known measurement caveats (stated so no one re-derives them wrongly)**
- The `.ts` px count (366) is over-inclusive: it sweeps whole `.ts` files, so it captures
  `[style.left.px]` template bindings and canvas layout math alongside real style-block literals.
  The clean, trustworthy px population is the **760 in `.css` excluding `styles.css`** — that is
  the number the classification in TD-2 is built on. Only 7 px literals live in `app/domain`
  (the engine), so engine contamination of the count is negligible.
- Inline-TS style blocks were extracted with an `awk` range that stops at the first `],`, so it
  truncates some blocks. Where inline-TS numbers mattered (hex colors) I re-counted directly
  against the real `.ts` files using a declaration-context regex; those numbers are sound.

---

## HEADLINE VERDICT (stated up front)

**A blanket token migration is NOT justified. A narrow, theme-correctness-driven migration IS.**

This repo does **not** have a token problem. It has a healthy, single-source token system
(82 unique tokens, one file, no Sass, `var(--…)` used 1,933 times) that DESIGN.md matches
value-for-value. What it has is a **containment failure at six specific components**, where
hardcoded colors and a foreign palette bypass the token layer and silently break the light
theme — a shipping, user-toggleable feature.

Roughly **40% of raw px literals are legitimately literal** (hairline borders, component
geometry) and tokenizing them would be actively harmful. Only **~23% are mechanical 1:1 token
substitutions**. The remaining ~24% represent a genuine *scale disagreement* that needs a design
decision, not a find-and-replace.

---

## MEASURED FACT — CENSUS

### Corpus

| Metric | Value | Command basis |
|---|---|---|
| `.css` files | 31 | `find emulador/src -name "*.css"` |
| `.css` lines | 5,732 | `find … -exec cat {} + \| wc -l` |
| `.ts` files with inline `styles:` | 17 (of 32 matching `styles:`) | `grep -rl "styles:" --include=*.ts` |
| `.scss` / `.sass` / `.less` files | **0** | `find . -name "*.scss"` → 0 |
| Sass variables (`$foo`) | **0** | `grep -rn '^\$[a-z]'` → 0 |
| Unique CSS custom properties in `styles.css` | **82** | `grep -ohE '^\s*--[a-z0-9-]+:' styles.css \| tr -d ' :' \| sort -u \| wc -l` |
| Custom-property definition lines in `styles.css` | 109 | `grep -cE '^\s*--[a-z0-9-]+:' styles.css` |
| Custom-property definitions OUTSIDE `styles.css` | 22 | same grep, inverted path filter |

### Category census

Command basis (run from `emulador/src`):
`grep -rhoE "<pattern>" --include=*.css .` and `--include=*.ts . | grep -v spec`

| Category | `.css` | `.ts` | TOTAL |
|---|---:|---:|---:|
| `var(--…)` usages | 1,464 | 469 | **1,933** |
| raw `px` | 797 | 366* | 1,163* |
| `font-size:` decls | 190 | 67 | 257 |
| `border-radius:` decls | 140 | 70 | 210 |
| hex colors | 116 | 59** | 175 |
| `font-weight:` decls | 80 | 21 | 101 |
| `transition:` decls | 55 | 19 | 74 |
| `opacity:` decls | 36 | 34 | 70 |
| `box-shadow:` decls | 40 | 19 | 59 |
| `rgb()`/`rgba()` | 46 | — | 46 |
| `color-mix()` | 37 | 3 | 40 |
| `z-index:` literals | 13 | 18 | **31** |
| `rem`/`em` | 17 | 7 | 24 |
| `@keyframes` | 8 | 6 | 14 |
| `@media` | 10 | 3 | **13** |
| `vh`/`vw` | 3 | 4 | 7 |
| `!important` | 8 | 4 | 12 |
| `hsl()` | 0 | 0 | **0** |
| `cubic-bezier()` literals | 2 | 0 | 2 |
| `animationend`/`transitionend` listeners | — | **0** | **0** |
| `@angular/animations` imports | — | **0** | **0** |

\* over-inclusive, see caveat above. \*\* counted with a declaration-context regex:
`grep -rnE '^\s*[a-z-]+:\s*[^;]*#[0-9a-fA-F]{3,8}' --include=*.ts . | grep -v spec`

### Top offending files

**Hex colors (`.css`):** `styles.css` 53 (legitimate — these ARE the token definitions) ·
`playback-controller.component.css` 31 · `trade-panel.component.css` 13 ·
`settings-panel.component.css` 10 · `floating-toolbar.component.css` 7 ·
`calculadora-page.component.css` 2. **63 hex outside `styles.css`.**

**Raw px (`.css`):** `calculadora-page` 87 · `crear-sesion-page` 86 · `r2-markets` 67 ·
`playback-controller` 67 · `settings-panel` 62 · `trade-panel` 58 · `sesiones-page` 41 ·
`session-summary` 38 · `styles.css` 37 (token defs) · `toolbar-tools` 33.

**`rgba()`:** `trade-panel` 19 · `settings-panel` 10 · `styles.css` 6 · `playbook-panel` 6.

### px CLASSIFICATION — the number that decides the migration question

Script: `scratchpad/pxclass.js` — buckets every px literal in the 31 `.css` files
(excluding `styles.css` token definitions) by the CSS property it appears in.
**Total classified: 760.**

| Bucket | Count | % | Class |
|---|---:|---:|---|
| `E_component_geometry` (width/height/min/max/flex) | 166 | 21.8% | **component geometry — legitimately literal** |
| `D_spacing_offscale` (padding/margin/gap NOT on the 4/8 scale) | 145 | 19.1% | **accidental magic number / competing scale** |
| `A_hairline_border` (border/outline 1–3px) | 138 | 18.2% | **legitimately literal** |
| `D_spacing_TOKENIZABLE` (exact `--space-*` matches) | 100 | 13.2% | **design token — mechanical swap** |
| `C_type_TOKENIZABLE` (exact `--text-*` matches) | 51 | 6.7% | **design token — mechanical swap** |
| `H_optical_misc` (letter-spacing, stroke-width, mask, grid) | 36 | 4.7% | one-off optical alignment |
| `I_other` | 31 | 4.1% | mixed |
| `G_shadow` | 28 | 3.7% | should be `--elevation-*` (see TD-5) |
| `C_type_offscale` (9px, 10px, 11.5px, 15px) | 24 | 3.2% | **off-scale — design decision needed** |
| `B_radius_TOKENIZABLE` | 21 | 2.8% | **design token — mechanical swap** |
| `F_positioning` (top/left/transform) | 16 | 2.1% | legitimately literal |
| `B_radius_offscale` (8px, 12px) | 4 | 0.5% | off-scale |

**Proportions that matter:**
- **~40% legitimately literal** (geometry 21.8 + hairline 18.2) — must NOT be tokenized.
- **~23% mechanical 1:1 token substitution** (100 + 51 + 21 = 172 / 760).
- **~23% genuine scale divergence** (145 + 24 + 4 = 173 / 760) — needs a *design ruling*, not a codemod.
- **~14% optical/other/shadow** — case-by-case.

---

## FINDINGS

### TD-1 — Hardcoded colors bypass the token layer and break the light theme

- **Category:** Design tokens / theming correctness
- **Severity:** **HIGH**
- **Scope:** 6 components; 27 bare-hex lines in `.css` + 45 bare-hex lines in `.ts` style blocks

**Evidence — bare hex (no `var()` fallback), light-theme-breaking:**
- `emulador/src/app/components/trade-panel/trade-panel.component.css:233` `color: #26a69a`
- `emulador/src/app/components/trade-panel/trade-panel.component.css:238` `color: #ef5350`
- `emulador/src/app/components/trade-panel/trade-panel.component.css:243` `color: #eab308`
- `emulador/src/app/components/trade-panel/trade-panel.component.css:256,259,263,285` (same trio repeated)
- `emulador/src/app/components/trade-panel/trade-panel.component.css:318` `background-color: #121417`
- `emulador/src/app/components/settings-panel/settings-panel.component.css:194` `background-color: #1a1a1a`
- `emulador/src/app/components/settings-panel/settings-panel.component.css:214,232,271` `color: #ffffff`
- `emulador/src/app/components/settings-panel/settings-panel.component.css:220` `color: #71717a`
- `emulador/src/app/components/account-card.component.ts:138,143` `#26a69a` / `#ef5350`
- `emulador/src/app/components/account-card.component.ts:123,162` `color: #787b86`

**Evidence — white-overlay pattern, invisible in light theme (10 sites in one file):**
- `emulador/src/app/components/playback-controller/playback-controller.component.css:78,150,153,178,189,226,248,260`
  — `color-mix(in srgb, #fff N%, transparent)` used for hover/active/elevated surfaces
- `emulador/src/app/components/playback-controller/playback-controller.component.css:18` and
  `emulador/src/app/components/floating-toolbar/floating-toolbar.component.css:16`
  — `border: 1px solid color-mix(in srgb, #fff 8%, transparent)`
- `emulador/src/app/components/settings-panel/settings-panel.component.css:302,305`
  — `rgba(255,255,255,0.04)` / `rgba(255,255,255,0.1)` **with `!important`**

**Observed pattern.** Two failure modes. (a) A token exists and holds a *different* value per
theme, but the component writes the dark-theme literal directly. (b) A "lighten with white"
overlay idiom that only reads as elevation on a dark substrate.

**Why it matters HERE.** The light theme is **not** aspirational — it is a shipping, one-click
user setting: `settings-panel.component.html:9-14` renders "Oscuro"/"Claro" buttons dispatching
`SettingsActions.changeTheme`, and `app.ts:30` writes `data-theme` onto `<html>`, which is exactly
the selector `styles.css:55` keys the light palette on. So every literal above is a live defect
the moment a user clicks "Claro".

**Concrete risk.** `--up` is `#26a69a` (dark) but `#089981` (light). Hardcoding `#26a69a` puts a
mid-teal on `--surface: #f0f3fa`. Computed WCAG contrast ≈ **2.7:1** (my calculation from the
sRGB relative-luminance formula; INTERPRETATION, not a measured browser reading) — below the
4.5:1 AA floor that `DESIGN_SYSTEM.md` §5.1 claims the palette meets. Worse, in the trade panel
these are the **profit/loss colors**: in light mode a trader reads P&L direction off a color that
the design system never contrast-verified. The playback-controller white overlays are the other
half — in light mode its hover, active and popover surfaces flatten to near-invisible, so the
primary replay transport loses all state feedback.

**Recommended direction.** Replace bare hexes with the semantic token that already holds that
value. Replace the `#fff N%` overlay idiom with a theme-aware token pair — introduce
`--overlay-hover` / `--overlay-active` / `--overlay-raised` defined once per theme in `styles.css`
(white-alpha under dark, black-alpha under light). Do not invent new color values.

**Migration difficulty.** LOW-MEDIUM. Mechanical for the bare hexes (a 1:1 lookup table). The
overlay idiom needs 3 new tokens defined twice, then ~12 call-site swaps.

**Best mechanism.** One focused PR per component family (trade-panel + account-card;
playback-controller + floating-toolbar; settings-panel), so a visual regression is bisectable.

**Acceptance condition.** `grep -rnE '#[0-9a-fA-F]{3,8}' --include=*.css emulador/src | grep -v
'^.*styles.css'` returns only the `mask-image` luminance stops; **and** a manual pass through
`data-theme="light"` shows correct up/down/warning colors in the trade panel and visible
hover/active states on the playback controller.

---

### TD-2 — `var(--token, #fallback)` fallbacks have gone stale and now disagree with the tokens

- **Category:** Design tokens / fragmentation
- **Severity:** **MEDIUM**
- **Scope:** 36 fallback occurrences in `.css`, plus more in `.ts`; 11 distinct token/fallback pairs

**Evidence — the same token given two different fallbacks:**
- `emulador/src/app/components/playback-controller/playback-controller.component.css:14`
  `var(--surface-2, #181818)` vs
  `emulador/src/app/components/trade-panel/trade-panel.component.css:191`
  `var(--surface-2, #121417)` — **same token, two fallbacks**
- `emulador/src/app/components/playback-controller/playback-controller.component.css:190`
  `var(--surface-3, #1f1f1f)` vs
  `emulador/src/app/components/settings-panel/settings-panel.component.css:253`
  `var(--surface-3, #1f2229)` — **same token, two fallbacks**

**Evidence — fallback contradicts the token's actual value:**
- `emulador/src/app/components/trade-panel/trade-panel.component.css:203,336,347`
  `var(--warning, #eab308)` — but `styles.css:30` defines `--warning: #f0b90b` (dark) and
  `styles.css:69` defines `#bb8800` (light). The fallback matches **neither**.
- `emulador/src/app/components/playback-controller/playback-controller.component.css:74,147,195`
  `var(--duration-fast, 0.15s)` — but `styles.css:137` defines `--duration-fast: 120ms`.
  The fallback is 25% slower than the token.

**Observed pattern.** A defensive `var(--x, literal)` idiom applied at ~36 sites. Because `:root`
in `styles.css` always defines every one of these tokens, **the fallback branch is dead code** —
it can never execute in the app. Its only effect is to encode a second, unmaintained copy of the
value that drifts.

**Why it matters HERE.** These fallbacks are actively lying to the next reader. Someone auditing
"what is `--warning`?" by grepping call sites finds `#eab308` three times and concludes wrongly.
The values have already drifted (two different `--surface-2` fallbacks, a `--warning` that matches
no theme, a duration off by 30ms) — proving the drift is real, not hypothetical.

**One live exception worth preserving.** `emulador/src/app/lotaje/companion-window.ts:281-299`
copies host stylesheets into a `window.open()` popup document. If that copy ever misses `:root`,
fallbacks would matter. Verify before stripping — but the right fix there is to guarantee the
`:root` block is copied, not to keep 36 stale literals.

**Concrete risk.** A token value change in `styles.css` silently fails to propagate to any reader
who trusts the fallback, and code review of a future theme change will miss these sites entirely
because they *look* tokenized.

**Recommended direction.** Delete the fallback argument everywhere the token is defined in
`:root`. Keep `var(--x)` bare. Confirm the companion-window stylesheet copy includes `:root` first.

**Migration difficulty.** LOW — a regex-assisted mechanical edit, reviewable in one pass.

**Best mechanism.** Single chore PR; pair it with TD-1 since they touch the same files.

**Acceptance condition.** `grep -rnoE 'var\(--[a-z0-9-]+,\s*[#0-9]' --include=*.css --include=*.ts
emulador/src` returns 0, and the lotaje companion window still renders themed.

---

### TD-3 — A foreign (Tailwind `zinc`) palette lives inside six live components

- **Category:** Fragmentation / component-local mini design system
- **Severity:** **MEDIUM**
- **Scope:** 6 components, all reachable from the two most-used panels

**Evidence — the components self-document the foreign palette:**
- `emulador/src/app/components/custom-color-picker.component.ts:265` `color: #71717a; /* zinc-500 */`
- `emulador/src/app/components/custom-color-picker.component.ts:299` `color: #52525b; /* zinc-600 */`
- `emulador/src/app/components/interactive-candles.component.ts:245` `fill: #71717a; /* zinc-500 */`
- `emulador/src/app/components/risk-slider.component.ts:106` `background-color: #3f3f46; /* zinc-700 */`
- Un-commented members of the same palette: `account-card.component.ts:175` `#a1a1aa`,
  `account-card.component.ts:180` `#d4d4d8`, `risk-slider.component.ts:182` `#e4e4e7`,
  `custom-opacity-slider.component.ts:67` `#3d72ff`, `interactive-candles.component.ts:223` `#2a2d33`

**These are live, not dead code** (verified by selector usage search):
`app-account-card` and `app-risk-slider` → used by `trade-panel.component.html`;
`app-custom-color-picker`, `app-interactive-candles`, `app-custom-switch`,
`app-custom-opacity-slider` → used by `settings-panel.component.html`.

**Observed pattern.** A cluster of six components authored against a Tailwind mental model, using
a grey ramp (`zinc-500/600/700`, `#a1a1aa`, `#d4d4d8`, `#e4e4e7`) that has **no counterpart in the
82-token system** and no theme variant. `#3d72ff` is a near-miss of `--accent: #2962ff`;
`#2a2d33` is a near-miss of `--surface-3`.

**Why it matters HERE.** This is the clearest instance of a component-local design system in the
repo, and it sits in Settings — the surface a user visits *specifically* to change the theme. The
near-miss values are worse than obvious ones: `#3d72ff` next to `#2962ff` reads as a rendering bug,
not a design choice. And because these greys have no light variant, the whole cluster is a second
copy of the TD-1 defect.

**Concrete risk.** Settings and the trade panel drift visibly from the rest of the app; a designer
changing the grey ramp updates 82 tokens and still misses six components.

**Recommended direction.** Map each zinc value to the nearest existing semantic token
(`--text-muted`, `--border-strong`, `--surface-3`, `--accent`) and delete the foreign palette. If a
value genuinely has no token counterpart, that is the signal to *add one token* — deliberately,
with a theme pair — not to keep the literal.

**Migration difficulty.** MEDIUM — needs a designer's eye on ~10 substitutions, then visual check.

**Best mechanism.** One PR covering all six components together; they share the palette, so
splitting them guarantees an inconsistent intermediate state.

**Acceptance condition.** Zero `zinc-` comments remain; no hex in those six files except
canvas/gradient stops that provably cannot read CSS custom properties.

---

### TD-4 — `calculadora-page.component.css` has 97 bytes of budget headroom

- **Category:** Build / CSS budget
- **Severity:** **MEDIUM** (build-breaking on the next small edit)
- **Scope:** 1 file

**Evidence.** Budget config, `emulador/angular.json:43-53`:
`{"type":"anyComponentStyle","maximumWarning":"20kB","maximumError":"24kB"}`.
Angular treats `kB` as **decimal** — 20,000 / 24,000 bytes.

Measured with the repo's own esbuild (`node_modules/@esbuild/win32-x64/esbuild.exe 0.27.3`),
command: `esbuild <file> --minify --bundle | wc -c`

| minified | % of 20,000 warn | raw | file |
|---:|---:|---:|---|
| **19,903** | **99.5%** | 31,952 | `emulador/src/app/pages/calculadora/calculadora-page.component.css` |
| 9,231 | 46% | 11,541 | `emulador/src/app/pages/sesiones/sesiones-page.component.css` |
| 6,156 | 30% | 8,017 | `emulador/src/app/components/trade-panel/trade-panel.component.css` |
| 4,788 | 23% | 6,054 | `emulador/src/app/components/settings-panel/settings-panel.component.css` |
| 4,474 | 22% | 5,788 | `emulador/src/app/components/playback-controller/playback-controller.component.css` |
| 3,723 | 18% | 4,711 | `emulador/src/app/pages/crear-sesion/crear-sesion-page.component.css` |

Everything else ≤ 18%.

**Observed pattern.** One stylesheet is 3.5× the next largest and sits **97 bytes** under the
warning threshold. It also carries 87 raw px and 9 of the repo's 25 `outline: none` declarations.

**Why it matters HERE.** This is a booby trap with a name on it. The next person to add a single
CSS rule to the calculadora page trips a build warning with no idea why, and ~4,100 bytes later
trips a hard build **error**. The existing repo memory already flags this file, which means it has
already cost someone time.

**Concrete risk.** A trivial styling change fails the build at an unrelated-looking gate; the
likely reaction under time pressure is to raise the budget, which silently removes the guardrail
for every component in the app.

**Recommended direction.** Reduce the file rather than the budget. The cheapest honest win is
extracting its shared patterns (it re-implements inputs, buttons and cards that `ui-primitives.css`
already provides — see TD-8) into the global primitives layer, which is not budget-scoped. Do
**not** raise `maximumWarning`.

**Migration difficulty.** MEDIUM — requires reading all 1,161 lines to find what is genuinely
page-specific.

**Best mechanism.** Dedicated PR with the before/after minified byte count in the description.

**Acceptance condition.** `esbuild calculadora-page.component.css --minify --bundle | wc -c`
< 16,000 (a 20% margin), with `angular.json` budgets unchanged.

---

### TD-5 — Elevation tokens exist but 15 shadows are hand-rolled

- **Category:** Design tokens
- **Severity:** **LOW-MEDIUM**
- **Scope:** 15 sites across 9 files

**Evidence.** `styles.css:45-49` defines a four-rung, theme-aware ladder
(`--elevation-0..3`, plus `--shadow` alias); `styles.css:81-85` defines the light-theme
counterparts using `rgba(100,110,130,…)` rather than black. Bypassed at:
- `emulador/src/app/components/playback-controller/playback-controller.component.css:20,194`
- `emulador/src/app/components/floating-toolbar/floating-toolbar.component.css:18`
- `emulador/src/app/components/trade-panel/trade-panel.component.css:195,200`
- `emulador/src/app/components/playbook-panel/playbook-panel.component.css:103,108`
- `emulador/src/app/components/settings-panel/settings-panel.component.css:198`
- `emulador/src/app/components/account-card.component.ts:72`
- `emulador/src/app/components/custom-color-picker.component.ts:219,246`
- `emulador/src/app/components/custom-opacity-slider.component.ts:60`
- `emulador/src/app/components/custom-switch.component.ts:46`
- `emulador/src/app/components/risk-slider.component.ts:120`
- `emulador/src/app/components/ui/modal.component.ts:88` (`rgba(0,0,0,0.55)` scrim — arguably fine)

**Observed pattern.** All 15 use `rgba(0,0,0,α)` with bespoke offsets/blurs
(`0 8px 30px/.35`, `0 12px 40px/.5`, `0 1px 3px/.15`, `0 2px 8px/.25`, `0 4px 24px/.4`…).

**Why it matters HERE.** `DESIGN_SYSTEM.md` §2.6 states the product is "flat by default" with
shadows appearing "only as a response to state" — a four-rung ladder is the mechanism enforcing
that. Fifteen ad-hoc shadows mean the elevation hierarchy is not actually a hierarchy. And
because the light theme deliberately switches shadows from black to blue-grey, every hardcoded
`rgba(0,0,0,…)` is a light-theme defect of the same family as TD-1.

**Concrete risk.** Shadow depth stops encoding stacking order, so a popover can read as flatter
than the card beneath it. In light mode all 15 render as harsh black smudges.

**Recommended direction.** Map each to the nearest rung. Where none fits (the modal scrim is a
scrim, not an elevation), keep the literal and comment why.

**Migration difficulty.** LOW.

**Best mechanism.** Fold into the TD-1 per-component PRs — same files, same review.

**Acceptance condition.** `grep -rn 'box-shadow' --include=*.css --include=*.ts emulador/src |
grep 'rgba(0'` returns only sites with an explanatory comment.

---

### TD-6 — 31 z-index literals with no scale; the layering contract is entirely implicit

- **Category:** Layout / design tokens
- **Severity:** **MEDIUM**
- **Scope:** 20 files

**Evidence.** Every literal, sorted (command:
`grep -rnoE 'z-index:\s*[0-9-]+' --include=*.css --include=*.ts emulador/src | grep -v spec`):

| z | site |
|---:|---|
| 1100 | `emulador/src/styles/ui-primitives.css:244` (`.ui-tooltip`) |
| 1000 | `emulador/src/app/components/ui/modal.component.ts:82` |
| 95 | `emulador/src/app/components/ui/dropdown.component.ts:154`, `ui/date-picker.component.ts:154`, `playback-controller.component.css:187` |
| 90 | `emulador/src/app/components/ui/menu.component.ts:62` |
| 80 | `emulador/src/app/app.css:94` |
| 60 | `emulador/src/app/components/toolbar-tools/toolbar-tools.component.css:102` |
| 50 | `emulador/src/app/components/settings-panel/settings-panel.component.css:192` |
| 41/40/40/39 | `emulador/src/app/components/chart/chart.component.ts:271,243,204,257` |
| 30 ×6 | `calculadora-page.component.css:192,417`, `risk-slider.component.ts:128`, `playback-controller.component.css:23`, `floating-toolbar.component.css:4`, `floating-pnl.component.ts:28` |
| 20 ×3 | `workspace-viewport.component.ts:273`, `chart-panel.component.ts:245,300` |
| 10 ×2 | `reflection-cabin-page.component.css:118`, `settings-panel.component.css:294` |
| 2/1/0 | reflection + calculadora internals |

**Observed pattern.** There IS a coherent intended order — tooltip 1100 above modal 1000 above
popovers ~90-95 above chrome 80 above floating panels 30 above workspace 20 — and it is currently
*correct*. But it is encoded nowhere. Note `styles.css` defines **zero** z-index tokens despite
defining 82 others, and the two most important values (1000, 1100) live in two different files
neither of which is the token file.

**Why it matters HERE.** The product is a multi-layer trading workspace: floating toolbar,
draggable playback controller, floating P&L, chart context menus, per-panel dropdowns, modals,
tooltips. Layering *is* a core product contract here, not incidental. The four values 39/40/40/41
in `chart.component.ts` are the tell — someone was already resolving a collision by nudging
numbers with no map to consult.

**Concrete risk.** The next floating surface picks a plausible number and lands wrong; the bug
appears only when two specific panels are open at once, which is exactly the case unit tests do
not cover.

**Recommended direction.** Add a `--z-*` scale to `styles.css` naming the existing tiers
(`--z-workspace: 20; --z-floating: 30; --z-chrome: 80; --z-popover: 95; --z-modal: 1000;
--z-tooltip: 1100`). Adopt the semantics, keep the numbers. This is *documentation that compiles*
— it changes no pixels.

**Migration difficulty.** LOW — zero visual risk, since values are preserved.

**Best mechanism.** Small chore PR; high documentation value per line changed.

**Acceptance condition.** No bare `z-index:` literal outside `styles.css` except the deliberate
`0/1/2` locals inside a single stacking context.

---

### TD-7 — Composite ARIA roles without the keyboard behavior the role promises

- **Category:** Accessibility
- **Severity:** **MEDIUM-HIGH** (propagates via `ui-menu`, a shared primitive)
- **Scope:** 13 role declarations; arrow-key handling in only 4 files

**Evidence — declared composite roles (command:
`grep -rn 'role="menu"\|role="listbox"\|role="tablist"' --include=*.html --include=*.ts`):**
- `emulador/src/app/components/ui/menu.component.ts:47` `role="menu"` ← **shared primitive**
- `emulador/src/app/app.html:56` `role="menu"`
- `emulador/src/app/components/chart/chart.component.ts:128` `role="menu"`
- `emulador/src/app/components/toolbar-tools/toolbar-tools.component.html:171` `role="menu"` (with `role="menuitemcheckbox"` children at :179)
- `emulador/src/app/components/playback-controller/playback-controller.component.html:73,153` `role="listbox"` (with `role="option"` at :77)
- `emulador/src/app/components/workspace/chart-panel.component.ts:64,115` `role="menu"`
- `emulador/src/app/components/workspace/workspace-viewport.component.ts:64,138` `role="tablist"`
- `emulador/src/app/components/ui/dropdown.component.ts:66` `role="listbox"`
- `emulador/src/app/pages/reflection/waypoint-timeline.component.ts:53` `role="tablist"`

**Evidence — files that actually implement Arrow key navigation (only 4):**
`emulador/src/app/components/ui/dropdown.component.ts`, `emulador/src/app/lotaje/lotaje-view.ts`,
`emulador/src/app/pages/journal/journal-page.component.ts`,
`emulador/src/app/pages/reflection/reflection-cabin-page.component.ts`.

**The primitive contrast is the finding.** `ui-dropdown` is exemplary —
`dropdown.component.ts:37-79` has `aria-haspopup="listbox"`, `aria-expanded`, `role="listbox"`,
`role="option"`, `aria-selected`, `aria-activedescendant`, and full ↑/↓/Home/End/Enter/Esc
handling. `ui-menu` (`menu.component.ts`) declares `role="menu"` and `aria-haspopup="menu"` but its
**only** keyboard handler is `'(document:keydown.escape)': 'close()'` (`menu.component.ts:18`).
Two sibling overlay primitives, two different keyboard contracts.

**Why it matters HERE.** `role="menu"` and `role="listbox"` are not decorative — they switch a
screen reader into application mode and tell the user "arrow keys navigate this". Where the
handler is absent, the ARIA is actively worse than none: the AT promises an interaction the app
does not honor, and Tab (which would otherwise work) is now semantically wrong for the widget.
`DESIGN_SYSTEM.md` §5.2 explicitly mandates "Every surface defines its keyboard map. No surface is
mouse-only," and §5.3 mandates "Tab order follows visual order… No `tabindex` hacks" — yet
`menu.component.ts` and the playback listboxes ship `tabindex="-1"` children with no roving focus.

**Concrete risk.** Keyboard-only operation of the replay speed selector, the trade-box visibility
menu, and every `ui-menu` consumer is broken-but-announced-as-working. Because `ui-menu` is a
primitive, every future adopter inherits the defect.

**Recommended direction.** Fix `ui-menu` first — lift the roving-focus/arrow-key logic already
proven in `dropdown.component.ts` into a shared helper and apply it to `ui-menu`. Then migrate the
ad-hoc menus (TD-8) onto the fixed primitive, which retires most of the other 10 sites for free.
Where a surface genuinely only needs Tab, **remove the composite role** rather than adding handlers.

**Migration difficulty.** MEDIUM — the logic exists and is tested; the work is extraction + adoption.

**Best mechanism.** Sequenced: (1) extract keyboard helper + fix `ui-menu` with tests;
(2) per-consumer migration PRs.

**Acceptance condition.** Every element declaring `role="menu"|"listbox"|"tablist"` is either
served by a primitive with arrow-key support, or has had the role removed with a comment.

---

### TD-8 — Dropdown/menu/popover semantics reimplemented ≥6 times; primitives are bypassed

- **Category:** UI primitives / design-system drift
- **Severity:** **MEDIUM**
- **Scope:** app-wide

**Evidence — independent implementations of "click a trigger, get a floating list of choices":**
1. `emulador/src/app/components/ui/dropdown.component.ts` — the primitive (listbox, full keyboard). **3 consumers:** `controls`, `settings-panel`, `trade-panel` component HTML.
2. `emulador/src/app/components/ui/menu.component.ts` — second primitive (`role="menu"`). **1 consumer:** `sesiones-page.component.html`.
3. `emulador/src/app/components/toolbar-tools/toolbar-tools.component.css:100` `.dropdown` + `.component.html:171`.
4. `emulador/src/app/components/playback-controller/playback-controller.component.css:131` `.menu` / `.pop-list` + `.component.html:73,153`.
5. `emulador/src/app/app.css:90-114` `.menu` (user menu) + `app.html:56`.
6. `emulador/src/app/components/chart/chart.component.ts:128` `.ctx-menu`.
7. `emulador/src/app/components/workspace/chart-panel.component.ts:64,115` `.link-chip-menu` / `.eye-menu`; `emulador/src/app/components/workspace/link-groups-menu.component.ts` (no role, no `aria-haspopup`, no keydown at all).
8. `emulador/src/app/components/settings-panel/settings-panel.component.css:204` `.popover-header`.

**Evidence — native `<select>` still in use despite the primitive existing to replace it:**
- `emulador/src/app/components/playbook-panel/playbook-panel.component.html:67`
- `emulador/src/app/components/workspace/chart-panel.component.ts:49` (`.panel-tf-select`)

`dropdown.component.ts:20-21` states its purpose verbatim: a "themed replacement for native
`<select>`… whose chrome clashes with the dark theme." Two native selects remain.

**Evidence — buttons:** 128 `<button>` elements total; **93 use neither `appButton` nor
`appIconButton`** (script: `scratchpad/btns.js`). `ui-primitives.css:9-100` provides
`.ui-btn` with 5 variants, 2 sizes, focus-visible and disabled handling.

**Observed pattern.** A well-designed primitives layer (`ui-primitives.css`, 351 lines, fully
tokenized, 0 hardcoded colors) that a majority of the app routes around. **Two** competing overlay
primitives with different a11y contracts, plus six bespoke ones, plus the native control the
primitive was written to replace.

**Why it matters HERE.** This satisfies the ≥3-divergent-implementations bar decisively (8 for
dropdown/menu). It is also the root cause multiplier for TD-1, TD-5, TD-6 and TD-7: every bespoke
popover re-derives its own colors (TD-1), its own shadow (TD-5), its own z-index (TD-6) and its own
keyboard contract (TD-7). Fixing the primitive adoption fixes four findings at once.

**Concrete risk.** Escape closes some menus and not others; click-outside works inconsistently;
the light theme breaks per-implementation; a11y quality varies by which component a user lands on.

**Recommended direction.** (a) Merge `ui-menu` and `ui-dropdown` behind one overlay engine
(shared trigger/positioning/dismiss/roving-focus), keeping two thin role-specific wrappers.
(b) Migrate the 6 bespoke popovers onto it, highest-traffic first: playback-controller →
toolbar-tools → chart context menu → workspace menus → app user menu. (c) Replace the two native
`<select>`s. (d) Adopt `appButton` opportunistically — do **not** do a 93-site sweep.

**Migration difficulty.** MEDIUM-HIGH — behavioral, needs per-site verification.

**Best mechanism.** RFC-shaped, incremental. One overlay engine PR, then one PR per consumer.
Explicitly NOT a big-bang refactor.

**Acceptance condition.** ≤2 overlay implementations remain (the merged primitive + a documented
canvas-anchored exception for the chart context menu); zero `<select>` outside a primitive.

---

### TD-9 — Documented authority partially unimplemented: 2 of 4 density profiles, 0 of 2 TEDS motion tokens

- **Category:** Docs-vs-code conformance
- **Severity:** **LOW** (mostly honestly declared)
- **Scope:** `DESIGN_SYSTEM.md` §2.3, §2.4; `docs/architecture/TEDS_MOTION.md` §3, §5

**MEASURED FACT — what conforms.** `DESIGN.md` front-matter (colors, typography, radius, spacing)
matches `styles.css` **value-for-value**: `#2962ff`, `#26a69a`, `#ef5350`, `#f0b90b`, `#000000`,
`#0a0a0a`, `#181818`, `#1f1f1f`, `#222222`, `#333333`, `#d1d4dc`, `#787b86`; radius 4/6/10/14/999/50%;
spacing 4/8/12/16/20/24/32/40. `DESIGN_SYSTEM.md` §2.2's type scale matches `styles.css:93-100`
exactly. §2.6's elevation ladder matches `styles.css:45-49` exactly. **The documented token system
is real and honored at the definition layer.**

**MEASURED FACT — density profiles: 2 of 4 implemented.** `DESIGN_SYSTEM.md` §2.3 specifies four
profiles (`compact`/Journal, `comfortable`/Reflection Cabin, `reading`/Playbook, `forms`/Settings).
Implemented:
- `emulador/src/app/pages/journal/journal-page.component.css:3-8` (all six `--density-*`)
- `emulador/src/app/pages/reflection/reflection-cabin-page.component.css:3-8` (all six)

Not implemented: **Playbook** and **Settings** define zero `--density-*` and consume none.
Consumption is otherwise healthy — 13 files read `var(--density-*)`, all under `pages/journal/`
and `pages/reflection/`.

**MEASURED FACT — TEDS motion additions: 0 of 2 present.**
`--duration-exit` → 0 hits. `--ease-linear` → 0 hits. The five mandated utility classes
(`.motion-enter`, `.motion-exit`, `.motion-veil`, `.motion-quiet`, `.motion-truth`,
`TEDS_MOTION.md` §5) → **0 hits each**. `TEDS_MOTION.md` §3 also flags two keyframes to
de-spatialize; both still carry translate:
- `emulador/src/app/components/side-dock/side-dock.component.css:33` `transform: translateY(6px)`
- `emulador/src/app/components/trade-panel/trade-panel.component.css:371` `transform: translateY(-6px)`

**INTERPRETATION — this is mostly honest, not drift.** `TEDS_MOTION.md` §3 states plainly that
these values are "approved-for-integration… the actual edits… happen at **implementation** time (a
downstream plan), not in this document." So the motion gap is a *declared* pending item, correctly
scoped. It should be tracked, not treated as a violation. The density gap is the weaker case: §2.3
reads as descriptive of four surfaces, and two silently lack it.

**Concrete risk.** Low today. The risk is doc credibility: a reader who checks §2.3 against
Settings and finds nothing starts discounting the whole document — including §5.1's contrast
claims, which TD-1 already shows are being violated elsewhere.

**Recommended direction.** Either implement `reading`/`forms` profiles, or amend §2.3 to mark them
"specified, not yet adopted" with the RFC that will land them. Add a status column to §2.3 and
§2.4 mirroring the honest one TEDS_MOTION §3 already uses.

**Migration difficulty.** LOW (doc amendment) / MEDIUM (implementing two profiles).

**Best mechanism.** Doc amendment now; implementation folded into the next Settings/Playbook RFC.

**Acceptance condition.** Every row of §2.3 and every token in TEDS_MOTION §3 carries an explicit
`existing` / `ADD — pending <ref>` status, and no unqualified claim of implementation remains.

---

### TD-10 — A second, undeclared spacing scale (5/6/7/10px) competes with the 8px grid

- **Category:** Fragmentation / design tokens
- **Severity:** **LOW-MEDIUM**
- **Scope:** 145 occurrences — the single largest "magic number" bucket

**Evidence.** `DESIGN_SYSTEM.md` §2.5: "8px base grid with half-step", tokens 4/8/12/16/20/24/32/40.
Actual padding/margin/gap literals off that scale (145 sites), e.g.:
- `emulador/src/app/app.css:11` `padding: 12px … 6px`, `:20` `gap: 7px`, `:29` `padding: 6px 10px`, `:59` `gap: 7px`, `:60` `padding: 10px`, `:104` `padding: 10px`
- `emulador/src/app/components/controls/controls.component.css:49,69` `padding: 5px 10px`, `:92` `gap: 6px`, `:100` `padding: 5px`
- `emulador/src/app/components/drawing-toolbar/drawing-toolbar.component.css:5` `padding: 6px`

Frequency across all non-token `.css` (command:
`grep -ohE '[0-9]+(\.[0-9]+)?px' $(find . -name "*.css" ! -name "styles.css") | sort | uniq -c | sort -rn`):
`6px` ×58, `10px` ×40, `7px` ×8, `5px` ×4 — versus in-scale `8px` ×49, `4px` ×45, `12px` ×44.
Oddities worth a look but not a scale: `12.5px` ×6, `11.5px` ×4, `0.4px` ×5.

Type has the same shape: 24 `font-size` literals sit off the scale, and `9px`/`10px` fall **below**
`--text-2xs` (11px), the documented floor — e.g. `trade-panel.component.css:224,339` `font-size: 9px`,
`settings-panel.component.css:183,212,258` `10px`, `calculadora-page.component.css:395` `9px`.
Radius likewise: `8px` and `12px` are not on the 4/6/10/14 scale
(`playbook-panel.component.css:101`, `trade-panel.component.css:193`,
`playback-controller.component.css:188`, `settings-panel.component.css:196`).

**Observed pattern.** A dense-UI reality (6/10px) coexisting with a documented 8px grid, at
comparable frequency. Neither wins.

**Why it matters HERE — and why I am NOT recommending a codemod.** This is the finding most likely
to be mishandled. `6px` and `10px` appearing 98 times is not 98 mistakes; it is evidence that a
trading-terminal density genuinely wants a finer step than the 8px grid provides. The 9-10px font
sizes are the same signal at the type layer. Replacing them with `--space-2`/`--space-3` would
visibly change the product and be wrong.

**Concrete risk.** Today: mild visual inconsistency, and a design system that cannot be enforced
because half the app disagrees with it. If someone "fixes" this mechanically: a large, hard-to-
review visual regression across every panel.

**Recommended direction.** A **design decision precedes any code change.** Either (a) extend the
scale to admit the reality — add `--space-1_5: 6px` and `--space-2_5: 10px`, plus a `--text-3xs`
if 10px is genuinely wanted — then adopt tokens at the 145 + 24 sites; or (b) rule that 6/10px are
errors and accept a deliberate visual normalization pass. Option (a) is almost certainly correct
given the density evidence, and it converts 169 magic numbers into token usages *without changing
a single pixel*.

**Migration difficulty.** LOW mechanically, MEDIUM in decision cost. Requires the design owner.

**Best mechanism.** A short RFC recording the ruling, then a mechanical adoption PR.

**Acceptance condition.** Every padding/margin/gap/font-size literal either matches a token or
carries a comment explaining why it is optically off-scale.

---

### TD-11 — Color notation is inconsistent across the codebase

- **Category:** Fragmentation
- **Severity:** **LOW**
- **Scope:** repo-wide

**Evidence** (`grep -rho … --include=*.css --include=*.ts emulador/src`):
white expressed 4 ways — `#fff` ×19, `#ffffff` ×30, `white` ×28, `rgba(255,255,255,…)` ×37;
black 3 ways — `#000` ×5, `#000000` ×28, `black` ×6. `hsl()` ×0 (consistently avoided).

**Why it matters HERE.** Low intrinsic harm, but it defeats grep-based auditing — the very method
this audit depends on. Anyone verifying TD-1 is fixed by grepping `#ffffff` misses `#fff`, `white`
and `rgba(255,255,255,…)`.

**Recommended direction.** Do not chase this on its own. Fold notation normalization into TD-1/TD-3
(most of these sites are the same lines), and let Prettier's existing formatting pass hold the line.

**Migration difficulty.** LOW. **Best mechanism.** Rider on TD-1/TD-3.
**Acceptance condition.** Post-TD-1, the surviving white/black literals are only scrims, masks and
canvas stops.

---

### TD-12 — Responsive strategy is implicit; 4 breakpoints, no scale (PARTIAL)

- **Category:** Layout / responsive
- **Severity:** **LOW**
- **Scope:** 13 `@media` blocks total, of which only **4** are viewport breakpoints

**Evidence.** All `@media` (command: `grep -rn "@media" --include=*.css --include=*.ts`):
- `max-width` breakpoints — **4, all different, none tokenized:**
  `emulador/src/app/pages/journal/behavior-section.component.css:64` `900px`;
  `emulador/src/app/pages/journal/performance-grid.component.css:43` `900px`;
  `emulador/src/app/pages/reflection/reflection-cabin-page.component.css:65` `1100px`;
  `emulador/src/app/pages/sesiones/sesiones-page.component.css:550` `760px`
- `prefers-reduced-motion` — 7 blocks (`styles.css:214` global + 6 component-local)
- `hover: none` — 1 (`calculadora-page.component.css:853`)

Only 7 viewport-unit literals repo-wide. Fixed layout maxima are hardcoded and duplicated:
`1400px` at `journal-page.component.css:12` **and** `reflection-cabin-page.component.css:12`;
`1100px` at `r2-markets.component.css:9` **and** `reflection-cabin-page.component.css:64`;
`1280px` at `sesiones-page.component.css:5`.

**INTERPRETATION.** This is a desktop-only professional trading tool; the near-absence of
responsive CSS is a legitimate product decision, not neglect. The finding is not "add
breakpoints" — it is that the decision is **undocumented**, and the container maxima
(1400/1280/1100) are duplicated literals that read like a scale but are not one.

**Recommended direction.** Add `--container-page: 1400px` / `--container-narrow: 1100px` (or
similar) to `styles.css`, and state the minimum supported viewport in `DESIGN_SYSTEM.md`. Do not
add breakpoints.

**Migration difficulty.** LOW. **Best mechanism.** Rider on TD-6 (same file, same nature).
**Acceptance condition.** Container maxima are tokens; `DESIGN_SYSTEM.md` states the supported
viewport range explicitly.

**NOT YET VERIFIED (the one open thread in this audit).** Whether the chart/panel resize contract
is encoded or implicit — `chart.component.ts` and `workspace-viewport.component.ts` were not read
for `ResizeObserver` / explicit sizing handoff to the engine. Given Invariant 1 (engine takes
immutable `RenderModel` data), a CSS-driven size that the engine learns about only via an observer
would be an implicit contract worth encoding. **See RESUME BRIEF step 1.**

---

## POSITIVE FINDINGS (deliberately recorded — these are load-bearing and must not be "refactored")

These carry the same evidentiary weight as the defects. Several are the reason the overall
verdict is "narrow migration, not broad."

1. **Single-source token architecture, zero fragmentation at the definition layer.** 82 unique
   tokens, one file (`emulador/src/styles.css`), no Sass, no competing token files, no duplicate
   definitions of the same concept. 22 custom-property definitions exist outside it and are all
   legitimate *local* scoping (12 density-profile values + `--lotaje-tone`), not shadow tokens.
   `var(--…)` appears 1,933 times against 175 hex literals — an ~11:1 ratio in favor of tokens.

2. **Motion never owns correctness.** `animationend` / `transitionend` listeners: **0**.
   `@angular/animations`: **0** — all motion is CSS. `setTimeout` with a literal delay: only 2 in
   the whole app (`sesiones-page.component.ts:1292` a 4s toast; `telemetry.effects.ts:160` a 0ms
   microtask), **neither coupled to a CSS duration**. No state transition anywhere waits on an
   animation to complete. This is the single most valuable property in this whole audit and it
   should be protected by an explicit rule.

3. **Icon-only button accessible names: 19 of 19 named. Zero defects.** (script:
   `scratchpad/btns.js` — parses full multi-line `<button>…</button>` elements, classifies those
   with no text content but an icon child, checks for `aria-label` / `aria-labelledby` /
   `appTooltip` / `title` on the opening tag.) A line-based grep suggests ~123 unnamed buttons;
   that number is an **artifact of multi-line tags** and is wrong. Do not report it.

4. **`app-modal` is a genuinely correct dialog primitive.**
   `emulador/src/app/components/ui/modal.component.ts` — focus trap (`:190-213`), ESC + backdrop
   dismiss, `role="dialog"` + `aria-modal="true"`, `aria-labelledby` wired to a generated id
   (`:41,163`), return-focus-to-trigger on destroy (`:179`), body scroll lock (`:169,178`),
   configurable initial focus target (`:159,171-174`). Fully tokenized. 4 consumers.

5. **`ui-primitives.css` is exemplary** — 351 lines, **zero** hardcoded colors, every value a
   token, `:focus-visible` on every interactive class, `:disabled` and `[aria-disabled='true']`
   handled together (`:33-38`). The problem is adoption (TD-8), not quality.

6. **`ui-dropdown` is a correct listbox** — see TD-7 evidence. It is the reference implementation
   the other overlays should be measured against.

7. **`:focus-visible` is used in 24 files (46 occurrences)** and `DESIGN_SYSTEM.md` §5.3's ring
   spec (`2px solid var(--accent)`, `outline-offset: 2px`) is honored in `ui-primitives.css:29-32`
   and `:126-129`. The 25 `outline: none` sites are overwhelmingly paired with a `:focus-visible`
   replacement rather than being bare suppressions.

8. **Reduced motion is respected globally** (`styles.css:214-221`) plus 6 component-local blocks —
   including the keyframe-heavy ones (`side-dock.component.css:50`, `trade-panel.component.css:388`).

9. **`draggable.directive.ts` is properly centralized** — one implementation, two consumers
   (floating-toolbar, playback-controller). No divergence. Not a candidate for extraction work.

10. **Chart-engine color literals are correct and must stay.**
    `emulador/src/app/state/settings/settings.models.ts:86-104,177-179`,
    `emulador/src/app/domain/chart/chart-engine.ts:91`,
    `emulador/src/app/domain/chart/capabilities/drawings-primitive.ts:254-256` hold hex values.
    These are **chart-library requirement**, not drift: per Invariant 1 the engine is vanilla TS
    that cannot read Angular/NgRx or CSS custom properties, and canvas needs concrete colors. They
    are also a *user-customizable* parallel theme (dark/light presets in settings state). **Do not
    tokenize these.** The only real (LOW) issue is that `#787B86`, `#1A1A1A`, `#000000` duplicate
    token values with no documented link — worth a comment, not a refactor.

---

## RECOMMENDED SCOPE — the minimum viable migration

**Justified now (theme correctness — these are live defects):**
1. TD-1 — hardcoded colors + white-overlay idiom → tokens + 3 new overlay tokens. **HIGH.**
2. TD-3 — retire the zinc palette from the 6 live components. **MEDIUM.**
3. TD-2 — delete the 36 stale `var(--x, #lit)` fallbacks (verify companion-window first). **MEDIUM.**
4. TD-5 — 15 hand-rolled shadows → `--elevation-*`. **LOW-MEDIUM**, same files as (1).

**Justified now (cheap, zero visual risk, high documentation value):**
5. TD-6 — add a `--z-*` scale preserving current values. **MEDIUM.**
6. TD-4 — shrink `calculadora-page.component.css` below 16 kB minified; do **not** raise the budget. **MEDIUM.**
7. TD-12 (partial) — tokenize the duplicated container maxima. **LOW.**

**Justified but needs a decision first:**
8. TD-10 — rule on 6/10px before touching any of the 169 sites. **Do not codemod.**
9. TD-9 — amend the docs to mark unimplemented rows honestly.

**Justified but sequenced separately (behavioral, RFC-shaped):**
10. TD-7 — fix `ui-menu`'s keyboard contract (shared primitive → propagates). **MEDIUM-HIGH.**
11. TD-8 — merge the two overlay primitives, migrate the 6 bespoke popovers, kill the 2 native selects.

**Explicitly NOT justified:**
- Tokenizing the 138 hairline borders or the 166 component-geometry px (~40% of the population).
- Tokenizing chart-engine / settings-preset colors (Invariant 1 forbids it).
- A 93-site `appButton` sweep. Adopt opportunistically when a file is touched for another reason.
- Adding responsive breakpoints. Desktop-only is a correct product decision here.

**Primitives that genuinely deserve extraction (≥3 divergent implementations of the same semantics):**
- **Overlay/popover engine** — 8 implementations. The clearest case in the repo; also the root-cause
  multiplier for TD-1/TD-5/TD-6/TD-7.
- **Roving-focus keyboard helper** — 13 composite roles, 1 correct implementation.
- Nothing else clears the bar. Buttons, inputs, badges, tooltips, modals, empty-states, date-picker,
  draggable and segmented-control **already have** correct primitives — those are adoption problems,
  not extraction problems, and must not be re-extracted.

---

## RESUME BRIEF (self-contained — for a fresh agent with zero history)

### (a) Role and remaining scope

You are a Principal Engineer performing a **READ-ONLY** technical-debt audit of
`C:\Users\78701\Desktop\trading-emulator` (branch `develop`, HEAD `a2ca53b`), covering styling,
design tokens, UI primitives, layout, motion and accessibility.

**READ-ONLY on all repository source.** The ONLY writes permitted are files under
`C:\Users\78701\Desktop\trading-emulator\.superpowers\audit-2026-08-10\`. Do not edit, refactor,
format, or create anything else in the repo. Do not run `npm run build`, `ng build`, or any
gate that writes to `dist/`.

Every claim needs `path/to/file:line` evidence. Counts must be generated mechanically and the
command stated. Separate MEASURED FACT / INTERPRETATION / RECOMMENDATION. **Do not recommend
tokenizing every literal** — discrimination is the point of this audit.

The audit is **~95% complete** and this file already contains 12 TD findings plus 10 positive
findings, all with evidence. **Your job is to close the ONE open thread (below), not to redo it.**

### (b) Commands already run — DO NOT RE-RUN. Key outputs:

Run from `emulador/src` unless noted.

```
find emulador/src -type f \( -name "*.css" -o -name "*.scss" \)   → 31 .css, 0 .scss
find … -exec cat {} + | wc -l                                      → 5732 lines
grep -rl "styles:" --include=*.ts .                                → 32 files, 17 with real blocks (~1175 lines)
grep -ohE '^\s*--[a-z0-9-]+:' styles.css | tr -d ' :' | sort -u|wc → 82 unique tokens
grep -cE '^\s*--[a-z0-9-]+:' styles.css                            → 109 definition lines
grep -rn '^\$[a-z]' --include=*.scss --include=*.css .             → 0 Sass vars
```

Census — `grep -rhoE "<pat>" --include=*.css .` / `--include=*.ts . | grep -v spec`:
`px 797/366` · `font-size 190/67` · `border-radius 140/70` · `hex 116/59` · `font-weight 80/21` ·
`transition 55/19` · `opacity 36/34` · `box-shadow 40/19` · `rgba 46/—` · `color-mix 37/3` ·
`z-index 13/18 (31 precise)` · `rem/em 17/7` · `@keyframes 8/6` · `@media 10/3` · `vh/vw 3/4` ·
`!important 8/4` · `hsl 0/0` · `cubic-bezier 2/0`.

Per-file hex (.css): styles.css 53 · playback-controller 31 · trade-panel 13 · settings-panel 10 ·
floating-toolbar 7 · calculadora 2. **63 outside styles.css.**
Per-file px (.css): calculadora 87 · crear-sesion 86 · r2-markets 67 · playback-controller 67 ·
settings-panel 62 · trade-panel 58 · sesiones 41 · session-summary 38 · styles.css 37 · toolbar-tools 33.

Bare-hex separation:
`grep -rnE '#[0-9a-fA-F]{3,8}' --include=*.css . | grep -v styles.css | grep -vE 'var\(--[a-z0-9-]+,\s*#'`
→ **27 lines**. `var()`-fallback occurrences → **36**; 11 distinct pairs (listed in TD-2).
TS declaration-context hex: `grep -rnE '^\s*[a-z-]+:\s*[^;]*#[0-9a-fA-F]{3,8}' --include=*.ts . | grep -v spec`
→ **59**, of which **45 bare**.

px classification — script at `scratchpad/pxclass.js` (temp; **re-create from the TD-2 table in
this file if needed** — buckets px by CSS property). Total 760 in .css excl. styles.css:
geometry 166 (21.8%) · spacing-offscale 145 (19.1%) · hairline 138 (18.2%) · spacing-tokenizable
100 (13.2%) · type-tokenizable 51 (6.7%) · optical 36 · other 31 · shadow 28 · type-offscale 24 ·
radius-tokenizable 21 · positioning 16 · radius-offscale 4.

Button a11y — script at `scratchpad/btns.js` (temp): parses full multi-line `<button>` elements.
→ **128 total buttons; 93 use neither appButton nor appIconButton; 19 icon-only, ALL named; 0 defects.**
(A line-based grep yields a bogus "123 unnamed" — that is a multi-line-tag artifact. Ignore it.)

Minified CSS sizes — `node_modules/@esbuild/win32-x64/esbuild.exe <f> --minify --bundle | wc -c`
(NOTE: `node_modules/.bin/esbuild` does NOT work in Git Bash; use the `.exe` path directly, and
`--bundle` is required or it errors on `--loader` without stdin):
calculadora **19,903** / 20,000 · sesiones 9,231 · trade-panel 6,156 · settings-panel 4,788 ·
playback-controller 4,474 · crear-sesion 3,723 · r2-markets 3,695 · rest ≤ 2,721.

Motion: `animationend|transitionend` → **0**. `@angular/animations` → **0**.
`setTimeout(…, <literal>)` → **2**, neither CSS-coupled.
Density tokens: defined only in `journal-page.component.css:3-8` and
`reflection-cabin-page.component.css:3-8`; consumed by 13 files. `--duration-exit` → 0,
`--ease-linear` → 0, `.motion-*` classes → 0 each.
Arrow-key handlers exist in exactly 4 files; 13 composite roles declared.

### (c) Files already read, and the conclusion on each

- `emulador/src/styles.css` (228 ln) — **full read.** The token file. Healthy, well-commented,
  dark+light palettes, scales, motion, zone/rule/viz colors. `:root[data-theme='light']` at :55.
- `emulador/src/styles/ui-primitives.css` (351 ln) — **full read.** Exemplary; zero hardcoded
  colors; `.ui-btn`, `.ui-icon-btn`, `.ui-badge`, `.ui-input`, `.ui-tooltip`, `.ui-menu-item`,
  `.ui-kbd`, `.ui-field`, modal helpers. Adoption is the problem, not quality.
- `emulador/src/app/components/ui/modal.component.ts` — **full read.** Correct dialog primitive
  (focus trap, ESC, aria-modal, return focus, scroll lock). No defects.
- `DESIGN.md` (146 ln) — front-matter read. Matches `styles.css` value-for-value.
- `DESIGN_SYSTEM.md` (603 ln) — §2.1-2.6, §5.1-5.5 read. §2.3 density = 4 profiles (2 built).
  §2.5 = 8px grid (contradicted by TD-10). §5.1 contrast table (contradicted by TD-1).
- `docs/architecture/TEDS_MOTION.md` (159 ln) — §3, §5, §6 read. Its additions are **honestly
  declared as pending implementation**; treat as tracked, not as drift.
- `emulador/angular.json:38-70` — budgets: initial 500kB/1MB; anyComponentStyle 20kB/24kB.
- `emulador/src/app/app.ts:15-45` — theme wiring: `selectTheme` → `data-theme` on `<html>`.
- `emulador/src/app/components/settings-panel/settings-panel.component.html:1-20` — the
  Oscuro/Claro toggle. **This is what makes TD-1 a live defect, not a theoretical one.**
- `emulador/src/app/components/ui/dropdown.component.ts` + `menu.component.ts` — a11y compared;
  dropdown correct, menu escape-only. Basis of TD-7.
- Selector-usage checks confirmed all 6 zinc-palette components are LIVE (TD-3).

### (d) Dead ends and non-issues — do not spend time here

- **"123 buttons without accessible names"** — FALSE. Line-based grep artifact. The real number
  is 0 defects out of 19 icon-only buttons. Verified with a proper element parser.
- **Chart-engine / settings-preset hex colors** — NOT drift. Invariant 1 forbids the engine from
  reading CSS custom properties, and these double as a user-customizable chart theme. Leave them.
- **`hsl()` usage** — zero. Not a fragmentation vector here.
- **Sass / SCSS / competing token files** — none exist. Token architecture is genuinely single-source.
- **`draggable.directive.ts`** — already centralized, 2 consumers. Not an extraction candidate.
- **Missing responsive breakpoints** — a deliberate desktop-only product decision, not debt.
  The debt is only that it is undocumented and the container maxima are duplicated.
- **TEDS motion tokens missing** — explicitly declared pending in TEDS_MOTION §3. Low severity.
- **`node_modules/.bin/esbuild`** — does not execute under Git Bash. Use
  `node_modules/@esbuild/win32-x64/esbuild.exe` with `--minify --bundle`.
- **`python`** — is the Microsoft Store stub on this box and fails. Use `py`, or `node`.

### (e) ORDERED remaining steps

1. **[THE ONE OPEN THREAD — do this first]** Close TD-12's unverified half. Read
   `emulador/src/app/components/chart/chart.component.ts` and
   `emulador/src/app/components/workspace/workspace-viewport.component.ts` (plus
   `chart-panel.component.ts`) for `ResizeObserver`, explicit `resize(width,height)` handoffs to
   `ChartEngine`, and any CSS-driven size the engine only learns about via observation. Question to
   answer: **is the panel→engine sizing contract encoded, or implicit?** Given Invariant 1
   (engine receives immutable `RenderModel` data), an implicit contract is a genuine finding.
   Update TD-12 in place with `file:line` evidence and set its final severity.
2. Optional, low value: spot-check `emulador/src/app/pages/calculadora/calculadora-page.component.css`
   (1,161 ln) for extractable duplication, to make TD-4's recommendation concrete rather than
   directional. Only worth it if TD-4 is going to be actioned immediately.
3. Optional: verify the `lotaje/companion-window.ts` stylesheet copy (`:281-299`) definitely
   carries the `:root` block. This is the one scenario where TD-2's fallbacks could be load-bearing;
   confirming it de-risks that cleanup.
4. Re-read this file's HEADLINE VERDICT and RECOMMENDED SCOPE and confirm nothing in steps 1-3
   changed them. They are the deliverable.

**Do not** re-run the census, re-classify px, re-count buttons, or re-measure minified sizes.
Those numbers are in this file and were expensive to produce.
