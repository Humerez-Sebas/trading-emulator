# Domain: Market Data — MT5 → Parquet → R2 → IndexedDB

Why the data path has no server, and the operational knowledge for each hop.

## Shape and rationale

```
MT5 terminal (Windows PC) → pipeline/fill_r2.py → Parquet (M1 by year + H1/D1)
  → R2 bucket (+ manifest.json) → browser fetch → parquet-wasm decode → IndexedDB
```

There is deliberately **no backend**: the SPA talks to R2 directly (CORS on the bucket)
and caches into IndexedDB for offline-after-download use. The FastAPI backend that once
existed was retired (PR #9) because Supabase + R2 covered auth/sync/data with zero
servers to operate.

## Bucket layout (contract with the frontend)

- Manifest at `${base}/manifest.json` (bucket root).
- Parquet at `${base}/market-data/v1/<SYMBOL>/<tf>/<file>`.
- `pipeline/manifest.py` is pure (no network) and documents the manifest schema in its
  module docstring; `r2_uploader.py` builds the records during upload.
- Dev CORS works out of the box: `pub-*.r2.dev` reflects the localhost origin.

## Running the pipeline

Requires the MT5 terminal open on the Windows PC (the `MetaTrader5` lib talks to it):

```
py pipeline/fill_r2.py --symbols US30,NAS100,XAUUSD --desde 2024-01-01 --env C:/ruta/.env
```

`--skip-upload` for local-only Parquet; `--env <path>` matters in git worktrees (the
root `.env` isn't there). Credentials: `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, optional `R2_ENDPOINT` (see `.env.example`).

For a **daily top-up** use `pipeline/update_r2.py` instead — it reads the last stored M1
timestamp from R2, harvests only the missing tail, recomputes H1/D1 for the affected
window, and uploads only the touched files, **patching** `manifest.json` so untouched
partitions keep their size/etag/updatedAt. `fill_r2.py` stays the tool for the initial
load of a symbol. Both are safe to re-run: they resume from what is already in R2.

## Timestamps are BROKER SERVER time, not UTC

Every candle epoch in R2 is the MT5 server's wall clock, not real UTC. Measured against
this broker (FivePercentOnline): **server = New York + 7 h, year-round** — UTC+2 in NY
winter, UTC+3 in NY summer, flipping on *US* DST dates (verified: the weekly close sits
at a constant stored 23:49 across both the US and EU transitions, and US half-days close
at a stored 20:00 = 13:00 ET).

**Do not "fix" this by converting to UTC.** D1 buckets are resampled on the server clock,
so they run 00:00→00:00 server = **17:00→17:00 New York** — the correct FX/CFD trading
day, the same one MT5 and TradingView show. Converting would cut every daily candle at
20:00 ET and invalidate all stored dailies.

Two consequences the pipeline handles explicitly:

- `datetime.now(UTC)` runs ~3 h *behind* the newest available bar, so every harvest
  silently stopped short. `mt5_common.aplicar_margen_servidor` extends the requested end
  by `MARGEN_SERVIDOR_HORAS` (4 h — covers +2/+3 with headroom, DST-proof).
- The forming M1 candle must be dropped (`descartar_vela_en_formacion`), or it also
  corrupts the H1/D1 bucket containing it. `ultimo_minuto_cerrado` reads it from
  `symbol_info_tick`, which is on the same server clock as the bars.

The display side compensates for this in the app; see `SettingsState.utcOffset`.

## Cold symbols truncate silently — always warm up first

`copy_rates_range` does **not** trigger a server download. For a symbol that is not
visible in Market Watch it returns only the terminal's local cache and the harvest ends
early *with no error* — observed with NAS100 and SP500 stopping at 2026-06-18 while
US30/XAUUSD reached the current minute, which `fill_r2.py` would have uploaded as
truncated history.

`mt5_common.calentar_historial` (`symbol_select` + retried `copy_rates_from_pos`, which
*is* what forces the sync) now runs once before the first range copy in
`iter_rango_troceado`, so every caller is covered. Afterwards coverage is verified
against the terminal's own newest bar: short by >24 h raises `HistorialTruncado` (the
symbol fails and is reported instead of uploading), short by >5 min only warns — with a
large backlog the terminal serves the newest bar before the download finishes, and the
next run completes it.

## The performance truth of this domain

**Ingest is the bottleneck, not the network.** M1 fetch ≈ 3.8 s vs IndexedDB insert
≈ 700 s per symbol (~1.4k rows/s — per-`add()` autoIncrement + compound index
`by_symbol_tf_time` maintenance). Consequences (see `performance.md`): download
pipelining is REJECTED with numbers; worker reuse + 50k chunks are modest wins already
taken; the real (deferred) lever is a per-row index cost rework.

## Frontend data services worth knowing

- `MarketDataRepository.getCoverage` (cursor first/last) + `intersectBounds` exist so
  symbol pickers answer availability **instantly** (24 ms) without loading candles —
  heavy `getCandles` loads are deferred until session creation. Preserve this pattern:
  availability questions must never trigger candle loads.
- `DataOnboardingService` reuses ONE parquet-wasm worker per batch.
- IndexedDB candle store is shared per symbol/tf (`emulador-workspaces`); it doubles as
  the shared candle cache the panels reference (R4: never add a second cache).

## Timeframe policy

M1 is the ground truth (partitioned by year); H1/D1 are pipeline-side conveniences;
other TFs derive client-side (`aggregateCandles`, custom TFs from best base). UI must
offer only TFs with data (`selectSessionTfs`).
