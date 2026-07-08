# Domain: Chart Engine & Capabilities

Why the engine exists and the rules that keep it trustworthy. Authoritative decisions:
RFC-001..007 (`docs/architecture/rfcs/`).

## Why

The original `ChartComponent` was a 1500+ line monolith coupled to Angular and NgRx.
The migration goal was **not** cleanliness for its own sake: it was a 5-year
maintainability bet — a lightweight vanilla-TS `ChartEngine` whose lifespan is decoupled
from framework churn, extended through `Capabilities` so the audited core never reopens.

## The boundary (the most defended invariant in the repo)

- The engine (under `emulador/src/app/domain/chart/`) imports **no Angular, no NgRx** —
  ever. Angular is a host; NgRx is a data source the engine doesn't know exists.
- Data crosses INTO the engine as an immutable **`RenderModel`** (Angular →
  `ChartModelMapper` → engine). Events cross OUT through the **`ChartEventBus`**.
  Nothing else crosses.
- Why immutability matters here: the reactive layer's short-circuits are referential.
  The P1 audit added a regression suite over referential short-circuiting; mutating a
  model in place silently defeats it.

## Capabilities

New chart behavior = new `Capability` registered against the engine (trading boxes,
drawings, countdown, sessions). The core stays closed to modification (RFC-003). If a
change seems to require editing the core, that's an RFC-level decision, not a PR-level
one. Trade-off accepted: some indirection and per-capability lifecycle code, in exchange
for the core keeping its audit validity over years.

## The mapper (Angular-side twin)

`ChartModelMapper` (`components/chart/chart-model-mapper.service.ts`) is a **local,
per-instance** service: each panel gets its own, parameterized by
`{symbol, tf, linkGroupId}`, composing raw store slices with `combineLatest` and
memoizing per instance. It is provided at panel/page level so a panel and its inner
chart share one instance. This is decision **D8** and it is load-bearing — see
anti-patterns #1 for why shared factory selectors are banned.

## Library knowledge (lightweight-charts v5)

- Range-change callbacks fire on the **next animation frame**, and same-frame
  invalidations coalesce into a single callback. Any echo-suppression must survive the
  RAF gap (one-shot flags armed across it), not rely on synchronous re-entrancy checks.
- Programmatic crosshair moves need no suppression — the library passes `skipEvent=true`
  internally.
- Series markers: the real `createSeriesMarkers` attaches its own primitive — relevant
  when counting `attachPrimitive` calls in tests (and why its mock must win reliably;
  see testing.md on optimized-dep mocking).

## Working here

Engine changes carry the highest ceremony in the repo (framework-independence greps,
purity checks, multi-instance/destroy safety — the P1 A-3 lifecycle/leak suite pattern).
Prefer extending a capability; prefer a new capability over touching the core; prefer an
RFC over "small" core edits.
