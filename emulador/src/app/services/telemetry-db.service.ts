import { Injectable } from '@angular/core';
import type { TelemetryEvent } from '../state/telemetry/telemetry.models';
import { assertNoCandles } from './session-sync.mapping';

/**
 * Dedicated IndexedDB database name for the telemetry store.
 *
 * DECISION (T5a): a dedicated database, NOT a new object store bolted onto
 * the shared `emulador-workspaces` database (`market-data-db.ts` DB_NAME).
 * The RFC names the conceptual store `emulador-workspaces`, and joining it
 * was tried first — but `workspace-db.service.spec.ts` (pre-existing,
 * STOP-protected) hard-asserts the exact object-store count at the current
 * schema version:
 *
 *   describe('WorkspaceDbService — v5 schema: all existing stores still
 *   present') → `expect(names).toHaveLength(6)`.
 *
 * Bumping the shared `DB_VERSION` to add a 7th store makes that assertion
 * fail; editing the assertion is forbidden by the STOP rule (pre-existing
 * specs are never modified, not even cosmetically). That is exactly the
 * brief's escape hatch ("the upgrade path is owned by code you may not touch
 * per STOP"), so a dedicated single-store database is used instead. It costs
 * one extra `indexedDB.open` connection and duplicates ~15 lines of the
 * open()/request() plumbing already in `WorkspaceDbService` — a small price
 * for leaving the shared schema, and its pinned test, untouched.
 */
const DB_NAME = 'emulador-telemetry';
const DB_VERSION = 1;
const STORE_NAME = 'events';

/**
 * R4 — bounded telemetry volume per session. The register is local-only and
 * its loss is tolerable by design (asymmetric conservation, see
 * TRADER_KNOWLEDGE_MODEL §2.2): this cap exists only so a single very
 * long-lived session cannot grow IndexedDB without bound. 50,000 events
 * comfortably covers a full trading day of combined GUI + order telemetry
 * (roughly one event/second sustained for ~14h) with headroom. Append-only:
 * once a session reaches the cap, events newer than the cap are dropped —
 * never deleted, never overwritten.
 */
export const TELEMETRY_MAX_EVENTS_PER_SESSION = 50_000;

/** Buffered/stored row shape: the envelope plus its compound-key fields. */
interface TelemetryRecord extends TelemetryEvent {
  sessionId: string;
}

/** What `append` accepts: the envelope minus `seq`, which the service assigns. */
export type TelemetryAppendInput = Omit<TelemetryEvent, 'seq'>;

/** Size-triggered flush threshold — keeps each flush transaction small. */
const FLUSH_BATCH_SIZE = 200;
/** Idle-triggered flush — guarantees buffered events reach durable storage
 * during a quiet stretch (e.g. only low-frequency seeks/jumps). */
const FLUSH_IDLE_MS = 2_000;

/**
 * Append-only IndexedDB store for the RFC-014 telemetry envelope (§4 — La
 * Caja Negra): local-only, candle-free, passive. Writes are batched in
 * memory and flushed asynchronously — `append` never performs a synchronous
 * IndexedDB write in the caller's frame (N-2 passivity); the 16 ms/frame
 * hot path never blocks on this store.
 *
 * Outside `SessionPayloadV2` entirely (D9 intact) — nothing here is synced.
 *
 * NOT wired into app config, NgRx, or any effect by this task (T5a is
 * storage-only); the passive observer that produces events for this service
 * is a separate, later dispatch (T5b).
 */
@Injectable({ providedIn: 'root' })
export class TelemetryDbService {
  /** Per-instance so a test subclass can shrink it (see spec: bounded-size tests). */
  protected readonly maxEventsPerSession: number = TELEMETRY_MAX_EVENTS_PER_SESSION;

  private dbPromise: Promise<IDBDatabase> | null = null;

  /** Per-session next seq to assign; lazily seeded from the store's existing rows. */
  private nextSeq = new Map<string, number>();
  /** Per-session count of events admitted (stored or buffered, pending flush) — cap accounting. */
  private admitted = new Map<string, number>();
  /** Dedupes concurrent lazy-init reads for the same session. */
  private initPromises = new Map<string, Promise<void>>();

  private buffer: TelemetryRecord[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: ['sessionId', 'seq'] });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          // if another tab/context upgrades or deletes the DB, release our
          // connection so it is not blocked forever (mirrors WorkspaceDbService)
          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
          };
          resolve(db);
        };
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  private request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private sessionRange(sessionId: string): IDBKeyRange {
    return IDBKeyRange.bound([sessionId, -Infinity], [sessionId, +Infinity]);
  }

  /** Seeds `nextSeq`/`admitted` for a session from its existing rows, exactly once. */
  private async ensureInit(sessionId: string): Promise<void> {
    if (this.nextSeq.has(sessionId)) return;
    let init = this.initPromises.get(sessionId);
    if (!init) {
      init = this.loadSessionState(sessionId);
      this.initPromises.set(sessionId, init);
    }
    await init;
  }

  private async loadSessionState(sessionId: string): Promise<void> {
    const db = await this.open();
    const range = this.sessionRange(sessionId);
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const count = await this.request<number>(store.count(range));
    const maxSeq = await new Promise<number>((resolve, reject) => {
      const cursorReq = store.openCursor(range, 'prev');
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        resolve(cursor ? (cursor.value as TelemetryRecord).seq : -1);
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
    if (!this.nextSeq.has(sessionId)) {
      this.nextSeq.set(sessionId, maxSeq + 1);
      this.admitted.set(sessionId, count);
    }
  }

  /**
   * Queues events for a session: assigns each a monotonic `seq` continuing
   * from the store's existing rows, then schedules an async flush. Never
   * performs a synchronous IndexedDB write in the caller's frame (N-2) — the
   * write happens on a later flush (size- or idle-triggered).
   *
   * The whole batch is rejected (nothing queued, nothing flushed) if any
   * event's payload fails `assertNoCandles` (N-5/V-9).
   *
   * Bounded by `maxEventsPerSession` (R4, default `TELEMETRY_MAX_EVENTS_
   * PER_SESSION`): once a session is at its cap, events beyond it are
   * silently dropped — append-only semantics forbid deleting older rows to
   * make room, so newest is what gives.
   */
  async append(sessionId: string, events: TelemetryAppendInput[]): Promise<void> {
    if (!events.length) return;
    assertNoCandles(events);
    await this.ensureInit(sessionId);

    const already = this.admitted.get(sessionId) ?? 0;
    const room = Math.max(0, this.maxEventsPerSession - already);
    const admitted = events.slice(0, room);
    if (!admitted.length) return;

    let seq = this.nextSeq.get(sessionId)!;
    for (const e of admitted) {
      this.buffer.push({ sessionId, seq: seq++, ...e });
    }
    this.nextSeq.set(sessionId, seq);
    this.admitted.set(sessionId, already + admitted.length);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.buffer.length >= FLUSH_BATCH_SIZE) {
      void this.flush();
      return;
    }
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, FLUSH_IDLE_MS);
  }

  /** Flushes buffered events to IndexedDB. Exposed for tests and teardown. */
  async flush(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.buffer.length) return;
    const pending = this.buffer;
    this.buffer = [];
    const db = await this.open();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const record of pending) store.put(record);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** All stored events for one session, ordered by `seq` (test/inspection helper). */
  async listForSession(sessionId: string): Promise<TelemetryEvent[]> {
    const db = await this.open();
    const records = await this.request<TelemetryRecord[]>(
      db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll(this.sessionRange(sessionId)),
    );
    return records
      .sort((a, b) => a.seq - b.seq)
      .map((r) => ({ seq: r.seq, wallClockMs: r.wallClockMs, marketTime: r.marketTime, kind: r.kind, payload: r.payload }));
  }
}
