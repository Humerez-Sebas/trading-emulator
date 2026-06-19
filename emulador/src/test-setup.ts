/**
 * Global unit-test setup (wired via angular.json `test.options.setupFiles`).
 *
 * Every spec gets a pristine in-memory IndexedDB. `fake-indexeddb/auto` installs
 * a single shared global factory; a connection left open by one spec FILE can
 * block `deleteDatabase` in the next when vitest runs files in a shared worker
 * context (which happens on CI runners with fewer CPUs than a dev machine),
 * deadlocking the open and timing the test out. Swapping in a fresh factory once
 * per file isolates them regardless of vitest pooling, without disturbing the
 * intra-file persistence some specs rely on (e.g. a `beforeAll` that seeds data).
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll } from 'vitest';

beforeAll(() => {
  globalThis.indexedDB = new IDBFactory();
});
