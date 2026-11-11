# Domain: Market Data — MT5 → Parquet → R2 → IndexedDB

Why the data path has no server, and the operational knowledge for each hop.

## Shape and rationale

```
MT5 terminal (Windows PC, or a Mac under Wine) → pipeline/fill_r2.py → Parquet (M1 by year + H1/D1)
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

Requires the MT5 terminal open on the same machine (the `MetaTrader5` lib talks to it). On
the Windows PC (on a Mac, see "Running on macOS" below):

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

## Running on macOS (MT5 under Wine)

`MetaTrader 5.app` runs the terminal through its bundled Wine 10.0 (an x86_64 build, so it
also depends on Rosetta), and the `MetaTrader5` package only ships Windows wheels. So the
pipeline runs with a **Windows Python inside the terminal's own Wine prefix**, where it reaches
the open terminal through the same wineserver. The pipeline itself only needs
`MT5_TERMINAL_PATH`. Verified by following this section from scratch on 2026-11-06 (terminal
build 6230), so re-check it if the app ships a newer Wine.

Setup, once. Everything lives in its own folder, so deleting `drive_c/py312` undoes it:

```bash
export WINEPREFIX="$HOME/Library/Application Support/net.metaquotes.wine.metatrader5"
PY="$WINEPREFIX/drive_c/py312"
TMP="$(mktemp -d)"
mkdir -p "$PY/Lib/site-packages"
curl -fsSL -o "$TMP/python.zip" https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip
unzip -q "$TMP/python.zip" -d "$PY"
printf 'python312.zip\r\n.\r\nLib\\site-packages\r\nimport site\r\n' > "$PY/python312._pth"
python3 -m pip download -q --only-binary=:all: --platform win_amd64 --python-version 3.12 \
  --implementation cp --abi cp312 --abi none -d "$TMP/wheels" \
  MetaTrader5 pandas pyarrow boto3 tzdata 'numpy==2.0.2'
for w in "$TMP"/wheels/*.whl; do unzip -q -o "$w" -d "$PY/Lib/site-packages"; done
```

Run, with the terminal open, from a scratch directory (`--out-dir` is relative to it). Always
`--skip-upload` first, read its summary, then repeat without the flag. Read the output rather
than the exit status: `update_r2.py` prints a failed symbol but still exits 0, even when all fail.

```bash
export WINEPREFIX="$HOME/Library/Application Support/net.metaquotes.wine.metatrader5"
export WINEDEBUG=-all ARROW_DEFAULT_MEMORY_POOL=system
export MT5_TERMINAL_PATH='C:\Program Files\MetaTrader 5\terminal64.exe'
WINE="/Applications/MetaTrader 5.app/Contents/SharedSupport/wine/bin/wine64"
REPO='Z:\Users\<you>\dev\trading-emulator'  # the repo as Wine sees it (Z: is /)
perl -e 'alarm 900; exec @ARGV' "$WINE" 'C:\py312\python.exe' "$REPO\pipeline\update_r2.py" \
  --env "$REPO\.env" --out-dir parquet_update --skip-upload
```

Why each piece is there (each one was a real failure):

- **`MT5_TERMINAL_PATH`:** the package's auto-discovery fails under Wine with
  `(-10003, 'IPC initialize failed, MetaTrader 5 x64 not found')`, even with the terminal open.
  Unset, `mt5_common.conectar` behaves exactly as on Windows.
- **`numpy==2.0.2`:** wheels from 2.1.3 on reference `ucrtbase.dll.crealf`, which this Wine does
  not implement, so importing numpy aborts. It is also the minimum pandas 3.1.1 accepts. A newer
  Wine in the app may lift this.
- **`ARROW_DEFAULT_MEMORY_POOL=system`:** without it pyarrow raises
  `ArrowMemoryError: malloc of size 256 failed`.
- **`tzdata` named explicitly:** pip evaluates dependency markers on the Mac, so the
  Windows-only dependency of pandas would otherwise be left out.
- **Wheels downloaded on the Mac, unzipped by hand:** nothing has to install under Wine.
- **`python312._pth`:** it enables `site-packages`, and it also takes the script's own folder off
  `sys.path`. The entry points insert theirs; an ad-hoc script has to do the same.
- **`perl ... alarm`:** a native crash opens `winedbg` and hangs instead of exiting. If one hangs,
  find its pids with `ps` and kill only that `python.exe` and `winedbg`, never `terminal64.exe`.

The pipeline only makes read calls to the terminal and has no way to send orders, but
`symbol_select` does leave the cold symbols visible in Market Watch (see below).

The unit tests need none of this, because `tests/conftest.py` replaces `MetaTrader5` with a test
double. Note that `/verify-gates` says `py`, which is Windows-only; on a Mac use a Python 3.12
venv (CI's version):

```bash
cd pipeline && uv venv --python 3.12 .venv && . .venv/bin/activate
uv pip install -r requirements-dev.txt
python -m pytest -q && ruff check . && ruff format --check .
```

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

The display side compensates for this in the app. `SettingsState.displayZone` names the
clock the chart is painted in, and `domain/chart/display-time.ts` implements the two
families:

- **server-relative** (`ny`, `server`): a constant shift over the stored clock, which
  tracks US DST for free because the server already does. `ny` is a constant −7 h, is
  exact all year, and is the default — it also keeps the daily candle cutting at 17:00 ET.
- **utc-fixed** (`utc-4`, `utc+9`, …): a real UTC offset, recovered by subtracting the
  server's own +2/+3 via the US DST rule. Exact for zones without DST (Tokyo, La Paz);
  for a zone that observes DST the clock stays put while the zone moves, so e.g. UTC−4
  shows the New York open at 09:30 from March to November and at 10:30 in winter.

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

- **R2 responses carry no `Cache-Control`** (only `ETag` and `Last-Modified`), so a browser
  reuses them heuristically for a share of their age (about 10%, i.e. days for a months-old
  file). A plain `fetch` therefore hid a fresh upload, and could store an old partition under
  the manifest's new etag. `ManifestService` and `ParquetDownloadService` fetch with
  `cache: 'no-cache'`, which always revalidates (a cheap 304 when nothing changed). Observed
  2026-11-06: after an R2 update the app still read the July manifest.
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
