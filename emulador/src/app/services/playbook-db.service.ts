import { Injectable } from '@angular/core';
import { assertNoCandles } from './session-sync.mapping';
import { PlaybookRule } from '../state/playbook/playbook.models';

/**
 * Dedicated IndexedDB database for the Playbook (RFC-015, D15.B).
 * Dedicated (not a store inside `emulador-workspaces`): joining the shared DB
 * requires bumping its version, which a STOP-protected spec pins (RFC-014
 * precedent, `emulador-telemetry`). Survival tier: highest (P-3/N-4) — this DB
 * is never touched by session/workspace/telemetry deletion paths.
 */
const DB_NAME = 'emulador-playbook';
const DB_VERSION = 1;
const STORE = 'rules';

@Injectable({ providedIn: 'root' })
export class PlaybookDbService {
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
        // connection so it is not blocked forever (mirrors WorkspaceDbService)
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

  async loadAll(): Promise<PlaybookRule[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = this.tx(db, 'readonly').getAll();
      req.onsuccess = () => resolve(req.result as PlaybookRule[]);
      req.onerror = () => reject(req.error);
    });
  }

  async upsert(rule: PlaybookRule): Promise<void> {
    return this.upsertMany([rule]);
  }

  async upsertMany(rules: PlaybookRule[]): Promise<void> {
    assertNoCandles(rules);
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const store = this.tx(db, 'readwrite');
      for (const r of rules) store.put(r);
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

  /** Clear all rules from the database (test only). */
  async clear(): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const store = this.tx(db, 'readwrite');
      store.clear();
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
    });
  }
}
