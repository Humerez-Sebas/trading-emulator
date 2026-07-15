import { Injectable } from '@angular/core';
import { MAX_EVIDENCE_SCENES } from '../domain/reflection/scene-spec';
import { assertNoCandles } from './session-sync.mapping';
import { Lesson } from '../state/lessons/lessons.models';

/**
 * Dedicated IndexedDB database for Lessons (RFC-016, D15.B, J-1..J-5).
 * Dedicated (not a store inside `emulador-workspaces`): joining the shared DB
 * requires bumping its version, which a STOP-protected spec pins. Survival
 * tier: highest (P-3/N-4) — this DB is never touched by session/workspace/
 * telemetry deletion paths (J-4 detector).
 */
const DB_NAME = 'emulador-lessons';
const DB_VERSION = 1;
const STORE = 'lessons';

@Injectable({ providedIn: 'root' })
export class LessonsDbService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
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
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  private tx(db: IDBDatabase, mode: IDBTransactionMode) {
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  async loadAll(): Promise<Lesson[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = this.tx(db, 'readonly').getAll();
      req.onsuccess = () => resolve(req.result as Lesson[]);
      req.onerror = () => reject(req.error);
    });
  }

  async upsert(lesson: Lesson): Promise<void> {
    return this.upsertMany([lesson]);
  }

  async upsertMany(lessons: Lesson[]): Promise<void> {
    assertNoCandles(lessons);
    this.assertNoRasterizedContent(lessons);
    this.assertEvidenceCap(lessons);
    const db = await this.open();
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
   * J-1 Raster guard: reject any lesson whose serialized form smuggles
   * rasterized content (data:image patterns). The system NEVER stores pixels;
   * scenes are recomputed on demand from SceneSpec (TKM §2.1, RFC-016 §4).
   * Rejects, never strips (strict guard).
   */
  private assertNoRasterizedContent(lessons: Lesson[]): void {
    const rasterPattern = /data:image|base64|blob:/i;
    for (const lesson of lessons) {
      const serialized = JSON.stringify(lesson);
      if (rasterPattern.test(serialized)) {
        throw new Error(
          `J-1 raster guard: lesson ${lesson.id} smuggles rasterized content (data:image/base64/blob patterns forbidden)`,
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
