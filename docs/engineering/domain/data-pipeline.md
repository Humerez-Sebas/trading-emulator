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
