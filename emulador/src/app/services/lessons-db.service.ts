/* eslint-disable @angular-eslint/prefer-inject -- constructor inject()-defaults keep this service unit-testable via direct construction (new Service(deps)) without TestBed; see services design note. */
import { inject, Injectable } from '@angular/core';
import { MAX_EVIDENCE_SCENES } from '../domain/reflection/scene-spec';
import { assertNoCandles } from './session-sync.mapping';
import { Lesson } from '../state/lessons/lessons.models';
import { NO_OWNER_MESSAGE, ownerLessonsDbName } from './owner-scope';
import { OwnerIdentityService } from './owner-identity.service';

/**
 * Dedicated IndexedDB database for Lessons (RFC-016, D15.B, J-1..J-5).
 * Dedicated (not a store inside `emulador-workspaces`): joining the shared DB
 * requires bumping its version, which a STOP-protected spec pins. Survival
 * tier: highest (P-3/N-4) — this DB is never touched by session/workspace/
 * telemetry deletion paths (J-4 detector).
 *
 * Session Sovereignty V2: the database is now named PER OWNER. Lessons are the
 * trader's journal — `whatHappened`/`repeat`/`avoid` free text — the most private
 * thing this app stores, and before the split any other account signing in on the
 * same browser profile rendered them (`LessonsEffects` hydrates from here on
 * `ROOT_EFFECTS_INIT`). Same treatment as the playbook: the legacy un-suffixed
 * `emulador-lessons` database is left on disk untouched (quarantine, O-7) and the
 * cloud pull, whose merge has no delete branch, repopulates whatever was pushed.
 */
const DB_VERSION = 1;
const STORE = 'lessons';

@Injectable({ providedIn: 'root' })
export class LessonsDbService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private dbOwnerId: string | null = null;

  constructor(private readonly owner: OwnerIdentityService = inject(OwnerIdentityService)) {}

  private async open(expectedOwnerId?: string): Promise<IDBDatabase> {
    const ownerId = await this.owner.ownerId();
    if (!ownerId) throw new Error(NO_OWNER_MESSAGE);
    if (expectedOwnerId && ownerId !== expectedOwnerId) {
      throw new Error('El propietario autenticado no coincide con las lecciones locales.');
    }
    if (this.dbPromise && this.dbOwnerId === ownerId) return this.dbPromise;
    if (this.dbPromise) {
      const stale = this.dbPromise;
      void stale.then((db) => db.close()).catch(() => undefined);
    }
    this.dbOwnerId = ownerId;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(ownerLessonsDbName(ownerId), DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // if another tab/context upgrades or deletes the DB, release our
        // connection so it is not blocked forever (mirrors PlaybookDbService)
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
          this.dbOwnerId = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
    this.dbPromise = opening;
    return opening;
  }

  private tx(db: IDBDatabase, mode: IDBTransactionMode) {
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  async loadAll(expectedOwnerId?: string): Promise<Lesson[]> {
    const db = await this.open(expectedOwnerId);
    return new Promise((resolve, reject) => {
      const req = this.tx(db, 'readonly').getAll();
      req.onsuccess = () => resolve(req.result as Lesson[]);
      req.onerror = () => reject(req.error);
    });
  }

  async upsert(lesson: Lesson): Promise<void> {
    return this.upsertMany([lesson]);
  }

  async upsertMany(lessons: Lesson[], expectedOwnerId?: string): Promise<void> {
    assertNoCandles(lessons);
    this.assertNoRasterizedContent(lessons);
    this.assertEvidenceCap(lessons);
    const db = await this.open(expectedOwnerId);
    return new Promise((resolve, reject) => {
      const store = this.tx(db, 'readwrite');
      for (const lesson of lessons) store.put(lesson);
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
    });
  }

  async remove(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const store = this.tx(db, 'readwrite');
      store.delete(id);
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
    });
  }

  /** Clear all lessons from the database (test only). */
  async clear(): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const store = this.tx(db, 'readwrite');
      store.clear();
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
    });
  }

  /**
   * J-1 Raster guard: reject any lesson that smuggles rasterized content. The
   * system NEVER stores pixels; scenes are recomputed on demand from SceneSpec
   * (TKM §2.1, RFC-016 §4). Rejects, never strips (strict guard).
   *
   * Scope: `evidence` is scanned for any raster pattern (`data:image`, `base64`,
   * `blob:`). The trader's free text (`whatHappened`/`repeat`/`avoid`) is opaque
   * (D16.G, J-2) and is NOT scanned for those words — a lesson that merely
   * mentions "base64" is valid prose — but a complete pasted image data URI
   * (`data:image/…;base64,`) is still refused there, since that would be pixels.
   */
  private assertNoRasterizedContent(lessons: Lesson[]): void {
    const evidencePattern = /data:image|base64|blob:/i;
    const dataUriPattern = /data:image\/[a-z0-9.+-]+;base64,/i;
    for (const lesson of lessons) {
      const text = JSON.stringify([lesson.whatHappened, lesson.repeat, lesson.avoid]);
      if (evidencePattern.test(JSON.stringify(lesson.evidence)) || dataUriPattern.test(text)) {
        throw new Error(
          `J-1 raster guard: lesson ${lesson.id} smuggles rasterized content (data:image/base64/blob patterns forbidden in evidence)`,
        );
      }
    }
  }

  /**
   * Evidence cap guard (J-2): reject any lesson with more than
   * MAX_EVIDENCE_SCENES frozen scene specs. Size guard pattern, P-3.
   */
  private assertEvidenceCap(lessons: Lesson[]): void {
    for (const lesson of lessons) {
      if (lesson.evidence.length > MAX_EVIDENCE_SCENES) {
        throw new Error(
          `J-2 evidence cap: lesson ${lesson.id} has ${lesson.evidence.length} scenes, max is ${MAX_EVIDENCE_SCENES}`,
        );
      }
    }
  }
}
