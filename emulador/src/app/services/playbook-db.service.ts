/* eslint-disable @angular-eslint/prefer-inject -- constructor inject()-defaults keep this service unit-testable via direct construction (new Service(deps)) without TestBed; see services design note. */
import { inject, Injectable } from '@angular/core';
import { assertNoCandles } from './session-sync.mapping';
import { PlaybookRule } from '../state/playbook/playbook.models';
import { NO_OWNER_MESSAGE, ownerPlaybookDbName } from './owner-scope';
import { type OwnerIdentity, OwnerIdentityService } from './owner-identity.service';

/**
 * Dedicated IndexedDB database for the Playbook (RFC-015, D15.B).
 * Dedicated (not a store inside `emulador-workspaces`): joining the shared DB
 * requires bumping its version, which a STOP-protected spec pins (RFC-014
 * precedent, `emulador-telemetry`). Survival tier: highest (P-3/N-4) — this DB
 * is never touched by session/workspace/telemetry deletion paths.
 *
 * Session Sovereignty V2: the database is now named PER OWNER. A trader's rules
 * are private state, and `bootstrapHydrate$` loads this store on
 * `ROOT_EFFECTS_INIT` — before the split, a second account signing in on the
 * same browser profile rendered the FIRST account's rules and could push the
 * dirty ones into its own cloud account. The legacy un-suffixed
 * `emulador-playbook` database is left on disk untouched (quarantine, O-7); any
 * rule that was ever pushed comes straight back from the cloud pull, whose merge
 * has no delete branch.
 */
const DB_VERSION = 1;
const STORE = 'rules';

@Injectable({ providedIn: 'root' })
export class PlaybookDbService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private dbOwnerId: string | null = null;

  constructor(private readonly owner: OwnerIdentity = inject(OwnerIdentityService)) {}

  private async open(): Promise<IDBDatabase> {
    const ownerId = await this.owner.ownerId();
    if (!ownerId) throw new Error(NO_OWNER_MESSAGE);
    if (this.dbPromise && this.dbOwnerId === ownerId) return this.dbPromise;
    if (this.dbPromise) {
      const stale = this.dbPromise;
      void stale.then((db) => db.close()).catch(() => undefined);
    }
    this.dbOwnerId = ownerId;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(ownerPlaybookDbName(ownerId), DB_VERSION);
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
