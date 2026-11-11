## STATUS

**100% complete.**

**AREAS COMPLETE:** panel-to-engine resize contract and companion-window global token copying.

**AREAS PARTIAL:** optional calculadora CSS extraction was not needed to settle the report scope.

**AREAS NOT STARTED:** none.

## FINDINGS SO FAR

The original established a healthy token system and rejected a broad token migration.
It prioritized narrow light-theme, overlay, keyboard, and calculadora-budget fixes.
This addendum closes the sole resize uncertainty and de-risks stale fallback removal.

### TD-13 [CAP] - Panel-to-chart sizing is explicitly delegated to the engine/library

- **Finding name:** Resize contract closure
- **Category:** Layout / lifecycle
- **Severity:** INFO; close the unverified half of original TD-12
- **Scope:** chart system
- **Evidence:** `components/chart/chart.component.ts:126,339,629` passes the actual chart container to `new ChartEngine(...)`; `domain/chart/chart-engine.ts:86-95` sets `autoSize:true` and documents lightweight-charts' internal `ResizeObserver`; teardown calls `chart.remove()` at `chart-engine.ts:254-259`. App-wide search found no competing application `ResizeObserver` or explicit `.resize(width,height)` handoff.
- **Observed pattern:** CSS sizes the container; the engine constructor explicitly enables library observation of that same element.
- **Why it matters HERE:** this is a deliberate third-party sizing contract, not hidden Angular-to-engine coupling or a RenderModel leak.
- **Concrete risk:** only dependency-upgrade regression if lightweight-charts changes `autoSize` behavior; no current sizing defect.
- **Recommended direction:** keep `autoSize:true` and its concise comment; do not add app-owned resize plumbing. Retain TD-12 only for duplicated container maxima/undocumented viewport support at LOW severity.
- **Migration difficulty:** NONE
- **Best mechanism:** Documentation plus upgrade smoke test
- **Acceptance condition:** future lightweight-charts upgrades preserve an auto-size smoke/manual check.

### TD-14 - Companion-window theming includes global `:root` tokens

- **Finding name:** Token-fallback cleanup safety
- **Category:** Design-token containment
- **Severity:** INFO
- **Scope:** Lotaje companion window
- **Evidence:** `lotaje/companion-window.ts:280-305` clones every readable host stylesheet rule or links its `href`; global tokens begin at `emulador/src/styles.css:15-16`; `mirrorTheme()` at `companion-window.ts:307-314` copies `data-theme`.
- **Observed pattern:** companion and host share token definitions and active theme.
- **Why it matters HERE:** stale `var(--x, literal)` fallbacks are not required to compensate for a missing token realm.
- **Concrete risk:** none beyond an unreadable stylesheet with no href, which cannot be reproduced by browser APIs.
- **Recommended direction:** proceed with original TD-2 fallback removal and retain companion style/theme tests.
- **Migration difficulty:** LOW
- **Best mechanism:** Mechanical cleanup plus existing tests
- **Acceptance condition:** companion remains themed after fallback removal and its document contains global token definitions.

**Headline verdict unchanged:** no blanket token migration. Prioritize live light-theme defects, shared menu keyboard behavior, overlay consolidation, and calculadora CSS budget; preserve literal geometry and chart-engine colors.

## RESUME BRIEF

- **Role/scope:** read-only styling/UI/a11y audit at `develop` / `a2ca53b`.
- **Commands/output:** app-wide search found engine `autoSize` references and no app-owned resize observer/explicit resize handoff.
- **Closed questions:** sizing is encoded through `ChartEngine(autoSize:true)`; companion copies `:root` and mirrors `data-theme`.
- **Dead ends:** do not add a second observer, tokenize engine colors, rerun button/token censuses, or add broad responsive breakpoints.
- **Remaining steps:** synthesis only.
- **Digest spec:** preserve narrow-migration verdict and original TD-1/2/3/4/6/7/8 priorities; close resize as a non-finding.
