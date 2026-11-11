# Performance Guide & Measured Ledger

Applies PHILOSOPHY §1.2 (measure before opining) and §2.9 (performance is a budget).

## The budget

- Render: 16 ms/frame. The audited render sum across capabilities is ≪ 16 ms/frame —
  which is exactly why web workers were rejected (D7): postMessage overhead isn't
  justified without a measured budget gap.
- Panels: `MAX_PANELS_PER_TAB = 8`, a hard constant derived from the measured 8-panel
  profile, not a tunable.

## Measured facts (do not re-litigate without new measurements)

| Fact | Number | Consequence | Measured |
|---|---|---|---|
| M1 Parquet fetch (one symbol) | ≈ 3.8 s | Not the bottleneck | 2026-06-19 |
| M1 IndexedDB bulk ingest (one symbol) | ≈ 700 s (~1.4k rows/s) | THE bottleneck: per-`add()` cost of autoIncrement id + compound index `by_symbol_tf_time` maintenance | 2026-06-19 |
| ⇒ Download pipelining / parallel fetch | would save < 1 % | **REJECTED — do not re-propose.** The real lever is a deep insert rework (per-row index cost), deliberately deferred | 2026-06-19 |
| 8 panels, shared candles | 1 `Candle[]` per symbol, O(1) sharing by reference | R4: formalize the existing cache; never add a second one | 2026-07-04 (RFC-012 proofs) |
| 1 replay tick, 8 panels | 8 recomputes (linear, per-panel mapper) | Acceptable; per-instance memoization keeps each recompute minimal | 2026-07-04 |
| Hidden panels | 0 render work (update-gated) | Gating works; resync uses latest snapshot on show | 2026-07-04 |
| Initial bundle | 648 kB vs 500 kB budget (WARNING) | Known-accepted, Arrow/parquet-dominated, predates RFC-008. Watch for NEW chunk types, not the number | ongoing |

## Heuristics

1. **Measure first, decide by orders of magnitude.** A rejected optimization with its
   number recorded (like pipelining above) is a permanent asset — record yours here.
2. **Optimize the mechanism, not the surroundings.** The ingest fix is per-row index
   cost, not parallelism around the insert.
3. **The panel perf triad:** update-gating on hidden panels (+ latest-snapshot resync on
   show), lazy engine creation on first visibility (sticky `hasBeenVisible` latch),
   keep-alive via `[hidden]` with stable track keys (never recreate instances on
   visibility flips).
4. **Memoization is per-consumer.** N consumers of a parameterized derivation need N
   per-instance memoizers; a shared single-slot memoizer yields 0 % hits (see
   anti-patterns.md #1).
5. **Registry liveness ≠ mounting.** Proof specs count leaf mounts, never
   `registry.count()` — the decoupling is deliberate.
6. **Stop optimizing when the budget is met** — not when ideas run out.

## Known deferred work

- Deep IndexedDB insert rework (the 700 s lever): reduce per-row index maintenance
  (bulk strategies, staging store, or schema change). Nothing else meaningfully moves
  download time.
- Dev-DB note: a past micro-benchmark left ~100k throwaway rows with timeframe `BENCH`
  in local `emulador-workspaces` candle stores — invisible to the app, disposable.
