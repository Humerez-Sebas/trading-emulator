# Progress Ledger — RFC-002 (Local Event Bus)

Branch: feature/rfc-002-event-bus-bridge (off develop)
Base commit (run start): 1fc53ec
Merge-base with develop: 1fc53ec
Plan: docs/superpowers/plans/2026-06-30-rfc-002-local-event-bus.md
RFC: docs/architecture/rfcs/002-local-event-bus-and-render-model.md
Workspace: emulador/ (all paths under emulador/src/app/...)
Verification gate (per task, run inside emulador/): `npx tsc -p tsconfig.app.json --noEmit` (exit 0) + `npm run build` (bundle generation complete). Bundle-budget warning is preexisting, not a failure.
User decision: ADD a co-located unit test for ChartEventBus (chart-event-bus.spec.ts).

## Tasks
- [x] Task 1: Create ChartEventBus (typed, no `any`) + chart-event-bus.spec.ts (TDD)
- [x] Task 2: Integrate bus into ChartEngine (private bus, public `events` getter, subscribe 4 LWC sources, bus.destroy() in destroy())
- [x] Task 3: Bridge bus -> handlers in ChartComponent (replace 4 direct subs, preserve NgZone, busUnsubs cleanup in ngOnDestroy)

## Minor findings roll-up (for final review)
- [T1] chart-event-bus.ts:21 — no inline comment explaining the scoped cast / TS2322 strict-mode workaround; risk a future reader "simplifies" back to the plan's non-compiling `??=`. (Weigh against user's no-excessive-comments pref; a single "why" comment is arguably justified for a non-obvious TS limitation.)
- [T1] chart-event-bus.spec.ts:25,38,54,74,85 — payloads are `{} as MouseEventParams<Time>` (empty casts); fine for identity/delivery/keying tests, gives no signal on payload-shape regressions. Forward-looking only.

## Log
- [x] Task 1 complete (1fc53ec..e9b3954, review clean — Spec ✅, quality Approved, 0 Critical/Important; 6/6 spec green, tsc exit 0)
- [x] Task 2 complete (e9b3954..c34a6d2, review clean — Spec ✅, quality Approved, 0 issues; tsc exit 0 + build complete; bridge getters intact, destroy() ordering bus->chart, click/dblClick->ChartClicked preserved). Reviewer ⚠️ on emit<K>() generics resolved by controller: Task 2 tsc gate compiles engine against real bus types end-to-end.
- [x] Task 3 complete (c34a6d2..de6466c, review clean — Spec ✅, quality Approved, 0 Critical/Important; tsc exit 0 + build complete). DoD met: zero direct chart/timeScale subscriptions remain; zone semantics byte-for-byte (ChartClicked->zone.run; CrosshairMoved/VisibleRangeChanged out-of-zone); busUnsubs torn down before engine.destroy(); only 1 file touched, no any. Minor (reviewer): progress.md is controller-owned, maintained here — not an implementer gap.

=== ALL 3 TASKS COMPLETE ===

## Final whole-branch review (opus, 1fc53ec..de6466c)
- **Verdict: Ready to merge — YES.** 0 Critical, 0 Important.
- DoD verified: zero direct LWC subscriptions in component; exact NgZone semantics; leak-safe teardown both ends (busUnsubs drained before engine.destroy(); bus.destroy() before chart.remove()); bridge getters intact; no `any`; spec verifies the real transport contract. No stale-unsubscribe resurrection bug (unsubscribe reads this.listeners[type] fresh; safe no-op after destroy()).
- 3 Minors, all triaged DO-NOT-FIX:
  - chart-event-bus.ts:23-27 scoped cast unexplained in-source — accept (idiomatic + owner's no-excess-comments pref).
  - chart-event-bus.spec.ts empty-cast payloads — accept (bus is transport; payload-shape belongs to engine/handlers, out of scope).
  - chart-event-bus.ts:28 unsubscribe leaves empty Set bucket — harmless at bounded 3-key space; not worth the code.
- Forward note (for RFC-004/005 plan, NOT this RFC): preserve the invariant "drain bus listeners before removing the chart" if an engine-internal bus consumer is ever added or teardown is reordered.

## Close-out
- Ledger committed; branch pushed; PR opened to develop.
