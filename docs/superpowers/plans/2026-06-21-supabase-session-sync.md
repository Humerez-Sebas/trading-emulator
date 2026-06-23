# Supabase Session Sync — Implementation Plan (Phase 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync user-generated backtest **sessions** and **folders** to Supabase Postgres + RLS as an additive, local-first layer — durable, portable sessions for a small invite-only group — without ever storing candles/datasets in Supabase.

**Architecture:** A pure mapping module (`session-sync.mapping.ts`) flattens the workspace-centric IndexedDB model into session-centric cloud rows and reconstructs it back (the riskiest logic, hard-TDD). A `SessionSyncService` wraps Supabase CRUD + the login pull/merge + dirty/pending-delete flushers. `SessionSyncEffects` wires the existing NgRx edges (debounced) and runs the pull when auth becomes `authenticated`. The Sessions page renders from a lightweight `SessionSummary` (no payload), with sparklines, folder drag-drop, and dataset recovery.

**Tech Stack:** Angular 21 (standalone + signals), NgRx (store + effects), `@supabase/supabase-js` v2, IndexedDB (`emulador-workspaces`), Vitest via `@angular/build:unit-test` (`ng test`).

**Spec:** `docs/superpowers/specs/2026-06-21-supabase-session-sync-design.md` (read it first — §4 schema, §5 SessionSummary, §7 payload+validators, §10–§11 sync, §14 testing).

## Prerequisite (manual, before Task 1)

The base `sessions`/`folders` tables + RLS already exist in project `nfcgfrsxvdvuasbgrxdy` (migration `create_sessions_and_folders`). Task 1 ALTERs them to the final shape via the Supabase MCP `apply_migration`. No tables are dropped. The anon key + URL are already in `environment*.ts` (Phase 1).

## Global Constraints

- **Stack/style:** Angular 21 standalone + signals + NgRx; **Spanish** user-facing text; match surrounding files. App state + candle `time` are unix **seconds**.
- **Local-first / additive:** IndexedDB stays the working copy; every mutation writes IndexedDB first, sync is additive and never blocks the UI. Logged-out = guest = local-only, no sync. Login is never a wall.
- **Bounded context (enforced):** Supabase NEVER stores candles, parquet, datasets, OHLC, chart `series`, or derived bulk market data. Only session data. `assertNoCandles` runs before every upsert and every `.emul` export.
- **LWW key is `client_updated_at`** (client edit time), NOT server `updated_at`. Conflict = Last-Write-Wins by `client_updated_at`, enforced by a conditional upsert (`... where sessions.client_updated_at < excluded.client_updated_at`) and the pull-merge comparison.
- **Membership is cloud-authoritative (D1):** after a login pull, a previously-synced local session absent from the pull is deleted locally; never-synced local sessions are kept and pushed.
- **Offline catch-up (D2):** dirty ⇔ `clientUpdatedAt > (syncedAt ?? 0)`; offline deletes go to a persistent pending-delete list.
- **Only real sessions sync (D3):** `isRealSession` = ≥1 trade (orders|positions|history non-empty) OR `sessionName != null` OR archived.
- **Active = last-worked (D4):** `WorkspaceMeta.activeSessionId`; fresh device → newest `client_updated_at` per symbol opens.
- **Payload size guard:** soft warning ≥ 512 KB, hard reject > 2 MB (over-cap = not pushed + non-blocking Spanish warning; keeps working locally).
- **Cursor write-amplification:** never push per replay tick — debounce + flush only on pause/switch/close/navigate-away (+ slow heartbeat while playing).
- **CI gates before every commit that touches `emulador/`** (from `emulador/`): `npm run lint`, `npm run format:check` (or `npm run format`), `npx ng test --no-watch`, `npm run build`. The IndexedDB test isolation in `src/test-setup.ts` stays.
- **Lockfile:** this plan adds **no** npm dependencies. Do NOT run `npm install`. If `git status` shows a spurious `package-lock.json` change, restore it (`git checkout -- package-lock.json`). (See the npm-ci optional-dep pruning lesson.)
- **Supabase client is mocked in unit tests** (no network). RLS is verified by a scripted check outside the Angular suite (Task 14).

## File Structure

- `emulador/src/app/services/session-sync.models.ts` (new) — `SessionSummary`, `SessionPayloadV1`, `CloudSessionRow`, `CloudFolderRow`, `DatasetRef` re-export (Task 2).
- `emulador/src/app/services/session-sync.mapping.ts` (new, pure) — `toPayload`/`fromPayload` (T2), `assertNoCandles`/`assertPayloadSize` (T3), `buildSummary`/`computeSparkline`/`isRealSession` (T4), `flattenWorkspace`/`reconstructWorkspaces` (T5), `mergeFolders`/`mergeSessions` (T6). One pure module, split into files only if it grows past ~400 lines.
- `emulador/src/app/services/session-sync.service.ts` (new) — `SessionSyncService` (T8, T9).
- `emulador/src/app/state/sync/session-sync.effects.ts` (new) — `SessionSyncEffects` (T10).
- `emulador/src/app/services/market-data-db.ts` (modify) — add `SYNC_STORE`, bump `DB_VERSION` (T7).
- `emulador/src/app/services/workspace-db.service.ts` (modify) — sync-store CRUD: pending-deletes + `lastPullAt` (T7).
- `emulador/src/app/state/workspaces/workspaces.models.ts` (modify) — `WorkspaceMeta.activeSessionId?` (T7).
- `emulador/src/app/state/trading/trading.models.ts` (modify) — `SavedSession`/`SessionFolder` LWW fields `clientUpdatedAt`/`syncedAt` (T7).
- `emulador/src/app/pages/sesiones/sesiones-page.component.ts` + `.html` (modify) — summary list, sparkline, dataset-recovery, offline status (T11); folder drag-drop (T12).
- `emulador/src/app/app.config.ts` (modify) — provide `SessionSyncEffects` (T10).
- `emulador/src/app/services/session.service.ts` (modify) — `.emul` lossless export/import + migrate legacy (T13).

---

## Task 1: Supabase schema finalization (ALTER) + TS types

**Files:**
- Migration (applied via Supabase MCP `apply_migration`, project `nfcgfrsxvdvuasbgrxdy`, name `session_sync_finalize`).
- No Angular files. Verification only.

**Interfaces:**
- Produces (cloud): `sessions.client_updated_at`, `sessions.last_opened_at`, `sessions.required_datasets`; `folders.updated_at`, `folders.client_updated_at`; index `sessions_owner_client_updated`; `folders` `set_updated_at` trigger. Consumed by `SessionSyncService` (T8).

- [ ] **Step 1: Apply the migration** via `apply_migration` with this exact SQL:

```sql
alter table public.sessions
  add column if not exists client_updated_at timestamptz not null default now(),
  add column if not exists last_opened_at    timestamptz,
  add column if not exists required_datasets jsonb not null default '[]'::jsonb;

create index if not exists sessions_owner_client_updated
  on public.sessions (owner_id, client_updated_at desc);

alter table public.folders
  add column if not exists updated_at        timestamptz not null default now(),
  add column if not exists client_updated_at timestamptz not null default now();

create trigger folders_set_updated_at
  before update on public.folders
  for each row execute function public.set_updated_at();
```

- [ ] **Step 2: Verify.** Run `list_tables` (schemas `["public"]`, verbose) → both tables show the new columns. Run `get_advisors` (type `security`) → no new RLS/search-path warnings (the pre-existing leaked-password auth lint is unrelated).

- [ ] **Step 3: Generate TS types** via `generate_typescript_types` and save the relevant `sessions`/`folders` row shapes into `session-sync.models.ts` as reference comments (Task 2 defines the hand-written interfaces the app uses). No commit needed (no repo file changed yet); record the column list in the Task 2 commit.

> Note: this task changes only the remote DB. Its "deliverable" is the verified schema; there is no Angular test. The reviewer checks the SQL matches the spec §4 and that `list_tables` confirms it.

---

## Task 2: Session payload model + `toPayload`/`fromPayload` (lossless round-trip)

**Files:**
- Create: `emulador/src/app/services/session-sync.models.ts`
- Create: `emulador/src/app/services/session-sync.mapping.ts`
- Test: `emulador/src/app/services/session-sync.mapping.spec.ts`

**Interfaces:**
- Consumes: `TradingData`, `SavedSession` from `state/trading/trading.models`; `Drawing` from `state/drawings/drawings.models`; `Timeframe` from `models`; `RequiredDataset`/`AnchorTf` from `services/session.service`.
- Produces: `SESSION_PAYLOAD_VERSION = 1`; `interface SessionPayloadV1`; `toPayload(input): SessionPayloadV1`; `fromPayload(p): { trading; cursor; activeTf; customTfMinutes; playbackSpeed; drawings; notes; selectedTfs; startRange; endRange }`. Consumed by T5 flatten/reconstruct and T13 export.

- [ ] **Step 1: Define the payload types** in `session-sync.models.ts`:

```ts
import type { RequiredDataset } from './session.service';
import type { TradingData } from '../state/trading/trading.models';
import type { Drawing } from '../state/drawings/drawings.models';
import type { Timeframe } from '../models';

export type DatasetRef = RequiredDataset; // { symbol, timeframe: 'M1'|'H1'|'D1', year? }

export const SESSION_PAYLOAD_VERSION = 1;

/** The lossless, candle-free session payload stored in sessions.payload (and .emul). */
export interface SessionPayloadV1 {
  schemaVersion: number;            // = SESSION_PAYLOAD_VERSION
  trading: TradingData;             // full state incl. open positions, riskPct, sessionEnd, balance
  currentTime: number;              // replay cursor, unix seconds
  activeTf: Timeframe | null;
  customTfMinutes: number | null;
  playbackSpeed: number;
  drawings: Drawing[];
  notes: unknown[];
  selectedTfs: Timeframe[];
  startRange: number;               // unix seconds
  endRange: number;                 // unix seconds
  requiredDatasets: DatasetRef[];   // self-contained copy; summary column is source of truth
}

/** What `toPayload` reads from a workspace/session (unix seconds throughout). */
export interface PayloadInput {
  trading: TradingData;
  currentTime: number;
  activeTf: Timeframe | null;
  customTfMinutes: number | null;
  playbackSpeed: number;
  drawings: Drawing[];
  notes: unknown[];
  selectedTfs: Timeframe[];
  startRange: number;
  endRange: number;
  requiredDatasets: DatasetRef[];
}
```

- [ ] **Step 2: Write the failing round-trip test** in `session-sync.mapping.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toPayload, fromPayload } from './session-sync.mapping';
import { SESSION_PAYLOAD_VERSION, type PayloadInput } from './session-sync.models';
import { defaultTradingData } from '../state/trading/trading.models';

function sampleInput(): PayloadInput {
  const trading = defaultTradingData(10000);
  trading.positions = [
    { id: 'p1', side: 'buy', entryPrice: 1.1, sl: 1.0, tp: 1.3, lots: 0.1, riskPct: 1,
      riskUsd: 100, openTime: 1700000000, origin: 'market' },
  ];
  trading.riskPct = 2;
  trading.sessionEnd = 1700100000;
  return {
    trading, currentTime: 1700050000, activeTf: 'H1', customTfMinutes: null,
    playbackSpeed: 4, drawings: [], notes: [], selectedTfs: ['M1', 'H1'],
    startRange: 1699000000, endRange: 1700200000,
    requiredDatasets: [{ symbol: 'EURUSD', timeframe: 'H1' }],
  };
}

describe('toPayload / fromPayload', () => {
  it('stamps the schema version', () => {
    expect(toPayload(sampleInput()).schemaVersion).toBe(SESSION_PAYLOAD_VERSION);
  });
  it('round-trips losslessly (open positions, riskPct, sessionEnd, cursor, view)', () => {
    const input = sampleInput();
    const back = fromPayload(toPayload(input));
    expect(back.trading).toEqual(input.trading);
    expect(back.currentTime).toBe(input.currentTime);
    expect(back.activeTf).toBe(input.activeTf);
    expect(back.playbackSpeed).toBe(input.playbackSpeed);
    expect(back.selectedTfs).toEqual(input.selectedTfs);
    expect(back.startRange).toBe(input.startRange);
    expect(back.endRange).toBe(input.endRange);
  });
});
```

- [ ] **Step 3: Run it, verify it fails.** `cd emulador && npx vitest run src/app/services/session-sync.mapping.spec.ts` → FAIL (`toPayload` not exported).

- [ ] **Step 4: Implement** `toPayload`/`fromPayload` in `session-sync.mapping.ts`:

```ts
import { SESSION_PAYLOAD_VERSION, type PayloadInput, type SessionPayloadV1 } from './session-sync.models';

export function toPayload(i: PayloadInput): SessionPayloadV1 {
  return {
    schemaVersion: SESSION_PAYLOAD_VERSION,
    trading: i.trading,
    currentTime: i.currentTime,
    activeTf: i.activeTf,
    customTfMinutes: i.customTfMinutes,
    playbackSpeed: i.playbackSpeed,
    drawings: i.drawings,
    notes: i.notes,
    selectedTfs: i.selectedTfs,
    startRange: i.startRange,
    endRange: i.endRange,
    requiredDatasets: i.requiredDatasets,
  };
}

export function fromPayload(p: SessionPayloadV1) {
  return {
    trading: p.trading,
    cursor: p.currentTime,
    activeTf: p.activeTf,
    customTfMinutes: p.customTfMinutes,
    playbackSpeed: p.playbackSpeed,
    drawings: p.drawings,
    notes: p.notes,
    selectedTfs: p.selectedTfs,
    startRange: p.startRange,
    endRange: p.endRange,
    requiredDatasets: p.requiredDatasets,
  };
}
```

- [ ] **Step 5: Run it, verify it passes.** `npx vitest run src/app/services/session-sync.mapping.spec.ts` → PASS.

- [ ] **Step 6: Gate + commit.** From `emulador/`: `npm run lint && npm run format:check && npx ng test --no-watch && npm run build`. Then:

```bash
git add emulador/src/app/services/session-sync.models.ts emulador/src/app/services/session-sync.mapping.ts emulador/src/app/services/session-sync.mapping.spec.ts
git commit -m "feat(sync): session payload model + lossless toPayload/fromPayload"
```

---

## Task 3: Payload validators — `assertNoCandles` + `assertPayloadSize`

**Files:**
- Modify: `emulador/src/app/services/session-sync.mapping.ts`
- Modify (tests): `emulador/src/app/services/session-sync.mapping.spec.ts`

**Interfaces:**
- Produces: `PAYLOAD_WARN_BYTES = 512*1024`; `PAYLOAD_MAX_BYTES = 2*1024*1024`; `assertNoCandles(payload: unknown): void` (throws on a candle/series/OHLC field); `payloadSizeBytes(payload): number`; `assertPayloadSize(payload): { ok: boolean; bytes: number; warn: boolean }` (throws when `> PAYLOAD_MAX_BYTES`, returns `warn:true` when `>= PAYLOAD_WARN_BYTES`). Consumed by T8 upsert + T13 export.

- [ ] **Step 1: Write the failing tests** (append to the spec):

```ts
import { assertNoCandles, assertPayloadSize, PAYLOAD_MAX_BYTES } from './session-sync.mapping';

describe('assertNoCandles', () => {
  it('passes a clean payload', () => {
    expect(() => assertNoCandles({ trading: {}, drawings: [] })).not.toThrow();
  });
  it('throws when a series/candles/ohlc field is present (any depth)', () => {
    expect(() => assertNoCandles({ trading: {}, series: [{ time: 1, open: 1 }] })).toThrow(/candle|series|ohlc/i);
    expect(() => assertNoCandles({ a: { candles: [] } })).toThrow();
  });
});

describe('assertPayloadSize', () => {
  it('returns warn:false for a small payload', () => {
    const r = assertPayloadSize({ x: 1 });
    expect(r.ok).toBe(true);
    expect(r.warn).toBe(false);
  });
  it('throws when over the 2 MB hard cap', () => {
    const huge = { blob: 'x'.repeat(PAYLOAD_MAX_BYTES + 10) };
    expect(() => assertPayloadSize(huge)).toThrow(/grande|large|size/i);
  });
});
```

- [ ] **Step 2: Run, verify fail.** `npx vitest run src/app/services/session-sync.mapping.spec.ts` → FAIL.

- [ ] **Step 3: Implement** in `session-sync.mapping.ts`:

```ts
export const PAYLOAD_WARN_BYTES = 512 * 1024;
export const PAYLOAD_MAX_BYTES = 2 * 1024 * 1024;

const CANDLE_KEYS = new Set(['series', 'candles', 'ohlc', 'parquet']);

/** Defense-in-depth: reject any candle/series/OHLC/parquet field at any depth. */
export function assertNoCandles(payload: unknown): void {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object') return;
    if (seen.has(v as object)) return;
    seen.add(v as object);
    if (!Array.isArray(v)) {
      for (const k of Object.keys(v as Record<string, unknown>)) {
        if (CANDLE_KEYS.has(k.toLowerCase())) {
          throw new Error(`El payload no puede contener velas (campo prohibido: "${k}").`);
        }
        walk((v as Record<string, unknown>)[k]);
      }
    } else {
      for (const item of v) walk(item);
    }
  };
  walk(payload);
}

export function payloadSizeBytes(payload: unknown): number {
  return new Blob([JSON.stringify(payload)]).size;
}

export function assertPayloadSize(payload: unknown): { ok: boolean; bytes: number; warn: boolean } {
  const bytes = payloadSizeBytes(payload);
  if (bytes > PAYLOAD_MAX_BYTES) {
    throw new Error('Esta sesión es demasiado grande para sincronizarse.');
  }
  return { ok: true, bytes, warn: bytes >= PAYLOAD_WARN_BYTES };
}
```

- [ ] **Step 4: Run, verify pass.** `npx vitest run src/app/services/session-sync.mapping.spec.ts` → PASS.

- [ ] **Step 5: Gate + commit.** Gates as Task 2. Then `git commit -am "feat(sync): assertNoCandles + payload size guard (512KB warn / 2MB cap)"`.

---

## Task 4: `buildSummary` + `computeSparkline` + `isRealSession`

**Files:**
- Modify: `emulador/src/app/services/session-sync.mapping.ts`, `session-sync.models.ts`
- Modify (tests): `session-sync.mapping.spec.ts`

**Interfaces:**
- Produces: `interface SessionSummary` (in models, per spec §5); `isRealSession(t: TradingData): boolean`; `computeSparkline(t: TradingData, maxPoints = 32): number[]`; `winRateOf(t: TradingData): number | undefined`. T5 assembles a row's summary fields (`tradesCount/initialBalance/balance/cursor/winRate/sparkline`) from these primitives. Consumed by T5 flatten + T8/T11.

- [ ] **Step 1: Add `SessionSummary`** to `session-sync.models.ts` (per spec §5; `requiredDatasets: DatasetRef[]`, `sparkline?: number[]`, `winRate?: number`, `updatedAt`/`lastOpenedAt` as ISO strings, `cursor: number`).

- [ ] **Step 2: Write the failing tests:**

```ts
import { isRealSession, computeSparkline } from './session-sync.mapping';
import { defaultTradingData } from '../state/trading/trading.models';

describe('isRealSession', () => {
  it('false for an untouched default session', () => {
    expect(isRealSession(defaultTradingData())).toBe(false);
  });
  it('true with a closed trade, a custom name, or sessionEnded archived', () => {
    const withTrade = defaultTradingData();
    withTrade.history = [{ id: 't', profit: 5 } as never];
    expect(isRealSession(withTrade)).toBe(true);
    const named = defaultTradingData();
    named.sessionName = 'Mi plan';
    expect(isRealSession(named)).toBe(true);
  });
});

describe('computeSparkline', () => {
  it('returns [] with no closed trades', () => {
    expect(computeSparkline(defaultTradingData())).toEqual([]);
  });
  it('builds a downsampled cumulative-equity curve capped at maxPoints', () => {
    const t = defaultTradingData(1000);
    t.history = Array.from({ length: 100 }, (_, i) => ({ closeTime: i + 1, profit: 1 }) as never);
    const sp = computeSparkline(t, 32);
    expect(sp.length).toBeLessThanOrEqual(32);
    expect(sp.at(-1)).toBeGreaterThan(sp[0]); // equity rose
  });
});
```

- [ ] **Step 3: Run, verify fail.**

- [ ] **Step 4: Implement** in `session-sync.mapping.ts`:

```ts
import type { TradingData, ClosedTrade } from '../state/trading/trading.models';

export function isRealSession(t: TradingData): boolean {
  return (
    t.orders.length > 0 ||
    t.positions.length > 0 ||
    t.history.length > 0 ||
    t.sessionName != null ||
    t.sessionEnded
  );
}

export function computeSparkline(t: TradingData, maxPoints = 32): number[] {
  const closed = [...t.history].sort((a, b) => a.closeTime - b.closeTime);
  if (!closed.length) return [];
  let equity = t.initialBalance;
  const curve = closed.map((c: ClosedTrade) => (equity += c.profit));
  if (curve.length <= maxPoints) return curve.map((v) => Math.round(v));
  const step = (curve.length - 1) / (maxPoints - 1);
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(Math.round(curve[Math.round(i * step)]));
  return out;
}

export function winRateOf(t: TradingData): number | undefined {
  if (!t.history.length) return undefined;
  const wins = t.history.filter((c) => c.profit > 0).length;
  return wins / t.history.length;
}
```

- [ ] **Step 5: Run, verify pass.**

- [ ] **Step 6: Gate + commit.** `git commit -am "feat(sync): SessionSummary + sparkline + isRealSession"`.

---

## Task 5: `flattenWorkspace` + `reconstructWorkspaces` (the core risk — round-trip)

**Files:**
- Modify: `emulador/src/app/services/session-sync.mapping.ts`, `session-sync.models.ts`
- Modify (tests): `session-sync.mapping.spec.ts`

**Interfaces:**
- Consumes: `WorkspaceMeta` (state/workspaces), `SavedSession`/`TradingData` (state/trading), `toPayload`/`fromPayload` (T2), `isRealSession`/`computeSparkline`/`winRateOf` (T4).
- Produces: `interface CloudSessionRow` (cloud session incl. `payload`, `summary` fields, `clientUpdatedAt`, `activeForSymbol` derived helper only — not a column); `flattenWorkspace(meta, view): CloudSessionRow[]` (active if real + each archived); `reconstructWorkspaces(rows): Map<symbol, { activeSessionId; activeTrading; activeCursor; sessions: SavedSession[] }>` applying D4 (active = newest `clientUpdatedAt` per symbol, or the row whose id matches a passed `knownActiveIds`). Consumed by T8/T9.

- [ ] **Step 1: Write the failing round-trip test** (the lossless core):

```ts
import { flattenWorkspace, reconstructWorkspaces } from './session-sync.mapping';
// Build a WorkspaceMeta with: an active 'trading' that has a closed trade (real) + activeSessionId,
// and two archived SavedSession (one real, one named-empty). Provide the view fields (activeTf, ranges...).
// Assert:
//   - flatten emits 3 rows (active + 2 archived), all with symbol set, schemaVersion stamped, no candles.
//   - flatten OMITS an untouched default active session (isRealSession false) — add a second case.
//   - reconstructWorkspaces(flattened) yields the same active session id and the same archived set,
//     and trading round-trips (positions, history, riskPct) via fromPayload.
//   - D4: with no knownActiveIds, the newest clientUpdatedAt row becomes active.
```

Write concrete assertions (real objects, not placeholders) following the Task 2 round-trip style; cover the lossless round-trip AND the D3 omission AND the D4 active-selection.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** `flattenWorkspace` + `reconstructWorkspaces`. `flatten`: build one `CloudSessionRow` for the active session **iff `isRealSession`**, id = `meta.activeSessionId` (mint a uuid if absent — return it so the caller can persist it), plus one row per `SavedSession` (id = its `id`). Each row: `payload = toPayload(...)` (run `assertNoCandles` + `assertPayloadSize`), `summary` fields from T4, `requiredDatasets` derived (reuse `buildRequiredDatasets`), `name` = `sessionName ?? autoName(symbol, createdAt)`, `folderId = trading.folderId`. `reconstruct`: group rows by `symbol`; active = row whose id ∈ `knownActiveIds` else `max(clientUpdatedAt)`; map active → `{ activeTrading: fromPayload(...).trading, activeCursor, activeSessionId }`, the rest → `SavedSession[]` (id, name, createdAt, currentTime, trading). Keep it pure (no DI/IO).

- [ ] **Step 4: Run, verify pass.** Iterate until the round-trip + D3 + D4 cases are green.

- [ ] **Step 5: Gate + commit.** `git commit -am "feat(sync): flattenWorkspace/reconstructWorkspaces (lossless round-trip)"`.

---

## Task 6: Merge logic — `mergeFolders` + `mergeSessions` (LWW + cloud-authoritative membership)

**Files:**
- Modify: `emulador/src/app/services/session-sync.mapping.ts`
- Modify (tests): `session-sync.mapping.spec.ts`

**Interfaces:**
- Produces: `mergeByLww<T extends { id: string; clientUpdatedAt: number }>(local: T[], cloud: T[]): { merged: T[]; toPushIds: string[]; toDeleteLocalIds: string[] }`. `toPushIds` = local-only (never synced) + local-newer; `toDeleteLocalIds` = previously-synced locals absent from cloud (D1, takes a `syncedIds: Set<string>` arg). Used by both folders and sessions in T9.

- [ ] **Step 1: Write failing tests** for: cloud-newer overwrites local; local-newer stays + is in `toPushIds`; cloud-only is added; local never-synced (not in `syncedIds`) is kept + pushed; local previously-synced (in `syncedIds`) but absent from cloud → `toDeleteLocalIds` (D1).

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** the pure LWW merge using `clientUpdatedAt` comparisons and the `syncedIds` set for the membership rule.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Gate + commit.** `git commit -am "feat(sync): LWW merge with cloud-authoritative membership"`.

---

## Task 7: Local model additions + `sync` IndexedDB store

**Files:**
- Modify: `emulador/src/app/services/market-data-db.ts` (add `SYNC_STORE = 'sync'`, bump `DB_VERSION`)
- Modify: `emulador/src/app/services/workspace-db.service.ts` (sync-store CRUD + onupgradeneeded create)
- Modify: `emulador/src/app/state/workspaces/workspaces.models.ts` (`WorkspaceMeta.activeSessionId?: string`)
- Modify: `emulador/src/app/state/trading/trading.models.ts` (`SavedSession`/`SessionFolder` optional `clientUpdatedAt?: number; syncedAt?: number`)
- Modify (tests): `emulador/src/app/services/workspace-db.service.spec.ts`

**Interfaces:**
- Produces: `WorkspaceDbService.addPendingDelete(d: { entity: 'session'|'folder'; id: string })`, `listPendingDeletes()`, `removePendingDelete(id)`, `getLastPullAt()`, `setLastPullAt(ms)`. Consumed by T9.

- [ ] **Step 1: Read** `market-data-db.ts` (DB_VERSION + store constants) and the `onupgradeneeded` handler in `workspace-db.service.ts:49-116` to follow the existing idempotent-create pattern.
- [ ] **Step 2: Write failing tests** in `workspace-db.service.spec.ts`: add a pending-delete, list it, remove it; set/get `lastPullAt`. (Follow the spec's per-file IndexedDB reset.)
- [ ] **Step 3: Run, verify fail.**
- [ ] **Step 4: Implement** — bump `DB_VERSION` by 1; in `onupgradeneeded` add `if (!db.objectStoreNames.contains(SYNC_STORE)) db.createObjectStore(SYNC_STORE, { keyPath: 'key' })`. Store two record shapes by `key`: `{ key: 'pendingDelete:<id>', entity, id }` and `{ key: 'lastPullAt', value }`. Add the optional model fields (no behavior change to existing flows — defaults absent).
- [ ] **Step 5: Run, verify pass** (full `ng test` — confirm no existing workspace-db/migration test broke).
- [ ] **Step 6: Gate + commit.** `git commit -am "feat(sync): activeSessionId + LWW fields + sync IndexedDB store"`.

---

## Task 8: `SessionSyncService` — Supabase CRUD (mocked in tests)

**Files:**
- Create: `emulador/src/app/services/session-sync.service.ts`
- Test: `emulador/src/app/services/session-sync.service.spec.ts`

**Interfaces:**
- Consumes: `SupabaseService.client` (Phase 1); the mapping module (T2–T6); `WorkspaceDbService` (T7).
- Produces (methods): `listFolders()`, `listSummaries(): Promise<SessionSummary[]>` (selects every column EXCEPT `payload`), `fetchPayload(id): Promise<SessionPayloadV1>`, `upsertSession(row)` / `upsertFolder(row)` (conditional LWW upsert), `deleteSession(id)` / `deleteFolder(id)`. Consumed by T9/T10/T11.

- [ ] **Step 1: Write failing tests** with a fake Supabase client (a `from()` builder returning canned `{ data, error }`): `listSummaries` issues a `select` WITHOUT `payload` and maps rows→`SessionSummary`; `fetchPayload` selects `payload` by id; `upsertSession` calls `assertNoCandles`+`assertPayloadSize` then upserts; an over-2MB payload makes `upsertSession` reject without calling the network.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `SessionSyncService` (`providedIn:'root'`, `inject(SupabaseService)`, `inject(WorkspaceDbService)`). Use `client.from('sessions').select('id,name,symbol,folder_id,client_updated_at,last_opened_at,required_datasets,trades_count,initial_balance,balance,cursor,schema_version,summary')` for `listSummaries`. For the conditional LWW upsert, call an RPC or use `.upsert(row, { onConflict: 'id' })` and rely on the DB rule from Task 1; document that the `where client_updated_at <` guard is enforced by the migration's upsert rule (if `@supabase/supabase-js` cannot express the WHERE, wrap it in a Postgres function `upsert_session(...)` created in Task 1's migration and call it via `client.rpc`). Map errors → thrown `Error` (Spanish where user-facing).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Gate + commit.** `git commit -am "feat(sync): SessionSyncService Supabase CRUD"`.

> Reviewer note: if the conditional-upsert WHERE needs a Postgres function, that is a Task-1 migration addition — flag back to the controller so Task 1's SQL is amended before this task is marked complete.

---

## Task 9: `SessionSyncService` — login pull + flushers

**Files:**
- Modify: `emulador/src/app/services/session-sync.service.ts`
- Modify (tests): `session-sync.service.spec.ts`

**Interfaces:**
- Produces: `pullAndMerge(): Promise<void>` (the §11 order), `flushDirty(): Promise<void>`, `flushPendingDeletes(): Promise<void>`. Consumed by T10.

- [ ] **Step 1: Write failing tests** (fake client + in-memory `WorkspaceDbService`): `pullAndMerge` runs in order — flush pending-deletes → pull+merge folders → pull+merge sessions (LWW) → membership removal of previously-synced-absent locals (D1) → flush dirty → reconstruct active (D4) → set `lastPullAt`. Assert a cloud-newer session overwrites local; a never-synced local is pushed; a synced-absent local is removed.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `pullAndMerge`/`flushDirty`/`flushPendingDeletes` composing T6 merge + T8 CRUD + T7 store, exactly per spec §11. Wrap each network step in try/catch so an offline pull leaves local state intact (sync resumes next time).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Gate + commit.** `git commit -am "feat(sync): login pull/merge + dirty + pending-delete flush"`.

---

## Task 10: `SessionSyncEffects` — wire edges + login pull

**Files:**
- Create: `emulador/src/app/state/sync/session-sync.effects.ts`
- Modify: `emulador/src/app/app.config.ts` (add to `provideEffects([...])`)
- Test: `emulador/src/app/state/sync/session-sync.effects.spec.ts`

**Interfaces:**
- Consumes: `SessionSyncService` (T8/T9); `AuthActions` (Phase 1); the edge actions — `WorkspacesActions` (persist), `TradingActions.renameSession/setSessionFolder/nameActiveSession/switchSession`, folder actions used by the Sesiones page.
- Produces: effects only (no new actions).

- [ ] **Step 1: Read** `workspaces.effects.ts:73 persistMeta$`, `trading.actions.ts`, and the Sesiones page to enumerate the exact edge actions and the debounce points.
- [ ] **Step 2: Write failing tests**: on `AuthActions.sessionResolved`/`authSuccess` with an authenticated user → `pullAndMerge` is called once; an edge action → after debounce, `flushDirty` is called; guest/anonymous → neither is called (local-first, no sync when logged out).
- [ ] **Step 3: Run, verify fail.**
- [ ] **Step 4: Implement** `SessionSyncEffects`: a `login$` effect (`ofType(authSuccess, sessionResolved)` filtered to authenticated) → `from(sync.pullAndMerge())`; a `flush$` effect that maps the edge actions through `debounceTime(2000)` (and immediate flush on close/switch) → `from(sync.flushDirty())`, `{ dispatch: false }`. Only active when status is `authenticated` (read auth state). Register in `app.config.ts`.
- [ ] **Step 5: Run, verify pass** (full `ng test`).
- [ ] **Step 6: Gate + commit.** `git commit -am "feat(sync): NgRx effects — login pull + debounced edge flush"`.

---

## Task 11: Sessions page — summary list + sparkline + dataset recovery + offline status (browser-validated)

**Files:**
- Modify: `emulador/src/app/pages/sesiones/sesiones-page.component.ts` + `.html`
- Modify (tests): `sesiones-page.component.spec.ts`

**Interfaces:**
- Consumes: `SessionSummary` (T4), `SessionSyncService.listSummaries/fetchPayload` (T8), the existing missing-dataset download flow.

- [ ] **Step 1: Read** `sesiones-page.component.ts` + `.html` to follow its current list/folder rendering and signals.
- [ ] **Step 2: Update the component** to source rows as `SessionSummary` (local list merged with cloud summaries when authenticated), render a small inline SVG **sparkline** from `summary.sparkline`, a **"necesita descarga"** badge when `requiredDatasets` aren't all in the local datasets cache (reuse `SessionService.findMissingDatasets`-style check), and an **offline/sync status** indicator (idle/syncing/offline) from the sync service. Opening a session calls `fetchPayload` (when cloud-only) → reconstruct → existing missing-dataset flow.
- [ ] **Step 3: Update the spec** to assert summary rendering + the dataset-recovery badge logic (pure where possible).
- [ ] **Step 4: Gate** (`build && ng test && lint && format:check`).
- [ ] **Step 5: Commit.** `git commit -am "feat(sync): Sesiones summary list + sparkline + dataset recovery + sync status"`.
- [ ] **Step 6 (browser-validate):** with `ng serve` + a Supabase user: a synced session created in browser A appears in browser B; opening a cloud-only session downloads missing datasets then restores; sparkline renders; offline indicator reflects state.

---

## Task 12: Folder drag-drop ordering + sync (browser-validated)

**Files:**
- Modify: `emulador/src/app/pages/sesiones/sesiones-page.component.ts` + `.html`
- Modify (tests): `sesiones-page.component.spec.ts`

**Interfaces:**
- Consumes: `WorkspaceDbService.putFolder/listFolders` (T7), `SessionSyncService.upsertFolder` (T8).

- [ ] **Step 1: Write failing test** for the pure reorder helper: moving folder C above A reassigns sparse `sort` values preserving order, marks moved folders dirty (`clientUpdatedAt` bumped).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the reorder helper + drag-drop handlers (Angular CDK if already a dep, else native HTML5 DnD — check `package.json`, do NOT add a dep). Persist `sort` locally + upsert folders.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Gate + commit.** `git commit -am "feat(sync): folder drag-drop ordering + sync"`.
- [ ] **Step 6 (browser-validate):** reorder folders in browser A → order persists on reload and appears in browser B.

---

## Task 13 (optional / last): `.emul` lossless export/import + migrate legacy `.session.json`

**Files:**
- Modify: `emulador/src/app/services/session.service.ts` (+ spec)

**Interfaces:**
- Consumes: `toPayload`/`fromPayload` (T2), `assertNoCandles`/`assertPayloadSize` (T3), the existing `classifySession`/`migrateToCurrent` seam.

- [ ] **Step 1: Write failing tests**: `exportEmul(session)` produces `{ schemaVersion, summary, payload }`, runs `assertNoCandles`; `importEmul(text)` round-trips it back; a legacy lossy `.session.json` still imports via `classifySession` (migrated).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** the lossless `.emul` export/import reusing the mapping; keep `.session.json` import working (migration path). Forbid candles on import.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Gate + commit.** `git commit -am "feat(sync): lossless .emul export/import + legacy migration"`.
- [ ] **Step 6 (browser-validate):** export a session to `.emul`, clear it, re-import → full lossless restore incl. open positions; import a legacy `.session.json` → migrates.

> Scope note: Tasks 1–11 are the Phase-2 core (durable sync + summary UX). Tasks 12–13 are valuable but separable; if scope must shrink, ship 1–11 first and defer 12–13 to a follow-up PR. Do NOT build any §13-"Future" item (sharing/templates/teams/public links).

---

## Task 14: RLS verification (scripted — not the Angular suite)

**Files:**
- Create: `backend/scripts/verify_session_rls.py` (or a `docs/`-referenced SQL snippet run via the Supabase MCP). No production Angular code.

**Interfaces:** none (verification only). Must pass before the final whole-branch review.

- [ ] **Step 1:** Sign in as user A (email/password via `supabase.auth`), `insert` a session row, capture its id.
- [ ] **Step 2:** Sign in as user B; attempt `select`/`update`/`delete` on A's row id.
- [ ] **Step 3: Assert** B's `select` returns 0 rows and B's `update`/`delete` affect 0 rows (RLS `owner_id = auth.uid()` blocks cross-user access). Print PASS/FAIL.
- [ ] **Step 4:** Document the run + result in the PR description. This is a gate, not a commit-per-step task; commit the script: `git commit -m "test(sync): scripted RLS cross-user isolation check"`.

> Requires two provisioned Supabase users (the group already has at least one; create a second throwaway test user in the dashboard for this check, or reuse two group users).

---

## Self-review (coverage)

- Spec §4 schema → T1. §5 SessionSummary → T4/T11. §6 sparkline → T4. §7 payload+validators → T2/T3. §8 requiredDatasets-in-summary → T1/T5/T11. §9 folder ordering → T7/T12. §10 local additions → T7. §11 sync behavior (edges, pull order, LWW by client_updated_at, D1/D4) → T6/T9/T10. §12 `.emul` import/export → T13. §14 testing → every task is TDD; RLS scripted check → T14 below. §13 roadmap Future → explicitly excluded.
- **RLS verification (T14, scripted, not Angular):** a small Node/SQL script signs in as user A, inserts a session, then signs in as user B and confirms `select`/`update`/`delete` of A's row returns nothing / is blocked. Document the script in the handoff; run it once before the final review. (No production code; can run via the Supabase MCP `execute_sql` with two JWTs or a `supabase` CLI script.)
- Every task ends with the CI gate + a commit; pure-core tasks (T2–T6) are full TDD; integration/UX tasks (T7–T13) read the named neighbor files for exact wiring and are browser-validated where they touch the DOM.
