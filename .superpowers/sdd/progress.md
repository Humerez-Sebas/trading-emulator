# SDD Progress Ledger — RFC-012 Performance

- **Plan:** `docs/superpowers/plans/2026-07-04-rfc-012-performance.md`
- **RFC:** `docs/architecture/rfcs/012-performance.md`
- **Branch:** `feature/rfc-012-performance` (off develop @ cce9e80 — RFC-011 PR #30 merged)
- **Base commit:** `cce9e80`

## Task Progress

Task 1 (shared-candle-series reference-identity proof, R4): complete (commit 4ef3930, verified 2026-07-04: 928 tests green at commit time, tsc app+spec clean, lint 0; Opus review PASS, 0 findings of any severity)
  - Proof validity independently confirmed non-tautological: panelChartView$ candles = direct `series[descriptor.timeframe]` property read, zero copy sites in the mapper (the only .map is memoizeMap on the trade-overlay path); a future .slice()/spread WOULD fail the toBe gate. Cross-instance independence real (mappers new'd via runInInjectionContext, own memo slots; shared ref comes from the single store slice).
  - NOTES for Tasks 2-5 (carry into briefs): (1) HARNESS: bare `npx vitest run <spec>` fails with "TestBed.initTestEnvironment" for ALL these specs — only `npm test`/`ng test` bootstraps the env; never judge a spec red from bare vitest. (2) The sync-read pattern (subscribe then immediate expect) is valid ONLY because configurePanel runs BEFORE subscribe (ReplaySubject buffer) + MockStore emits synchronously — keep that order. (3) Test-2 nuance: same-value overrideSelector + refreshState memo-hits and distinctUntilChanged suppresses — to exercise a REAL post-tick re-emission, change a value (bump currentTime/utcOffset). (4) `?? []` fallback: a panel on an UNLOADED timeframe gets a fresh [] per memo-miss (NOT shared) — Task 5's 8-panel scenario must seed every profiled TF or empty-series panels won't share references.
Task 2 (D6 update-gating proof: hidden panel zero render work, one resync on show): incomplete
Task 3 (lazy chart creation on first show — sticky @if latch in ChartPanelComponent): incomplete
Task 4 (lazy-creation instance-count proof at the viewport): incomplete
Task 5 (8-panel deterministic profiling suite + documented findings): incomplete
Final audit: incomplete
