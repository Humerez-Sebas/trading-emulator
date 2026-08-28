import { vi } from 'vitest';
import { WorkspaceDbService } from '../services/workspace-db.service';

/**
 * Stubbed WorkspaceDbService (raw IndexedDB is unavailable in jsdom): every
 * method is a vi.fn() resolving to an empty result; tests override per case
 * with mockResolvedValue / mockRejectedValue. Provide with
 * `{ provide: WorkspaceDbService, useValue: workspaceDbStub() }`.
 */
export function workspaceDbStub(): Partial<
  Record<keyof WorkspaceDbService, ReturnType<typeof vi.fn>>
> {
  const getMeta = vi.fn().mockResolvedValue(undefined);
  const putMeta = vi.fn().mockResolvedValue(undefined);
  const updateMeta = vi.fn(
    async (symbol: string, update: Parameters<WorkspaceDbService['updateMeta']>[1]) => {
      const next = update(await getMeta(symbol));
      if (next) await putMeta(next);
    },
  );
  const putFolder = vi.fn().mockResolvedValue(undefined);
  const deleteFolder = vi.fn().mockResolvedValue(undefined);
  const addPendingDelete = vi.fn().mockResolvedValue(undefined);
  return {
    list: vi.fn().mockResolvedValue([]),
    listMetas: vi.fn().mockResolvedValue([]),
    getWorkspace: vi.fn().mockResolvedValue(undefined),
    getMeta,
    getSeriesInfo: vi.fn().mockResolvedValue(null),
    putMeta,
    updateMeta,
    updateMetaIfUnchanged: vi.fn(async (symbol, expected, update) => {
      let committed = false;
      await updateMeta(symbol, (current) => {
        if (JSON.stringify(current) !== JSON.stringify(expected)) return undefined;
        const next = update(current);
        committed = next !== undefined;
        return next;
      });
      return committed;
    }),
    replaceSessionIfUnchanged: vi.fn(async (symbol, _expected, update) => {
      let committed = false;
      await updateMeta(symbol, (current) => {
        if (!current) return undefined;
        committed = true;
        return update(current);
      });
      return committed;
    }),
    reconcileArchivedSessionIfUnchanged: vi.fn().mockResolvedValue(false),
    restoreArchivedSessionAsActiveIfUnchanged: vi.fn().mockResolvedValue(false),
    deleteSessionIfUnchanged: vi.fn().mockResolvedValue(null),
    promoteSessionIfUnchanged: vi.fn().mockResolvedValue(false),
    compensatePromotionIfUnchanged: vi.fn().mockResolvedValue(false),
    putSeries: vi.fn().mockResolvedValue(undefined),
    appendSeriesChunk: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    listFolders: vi.fn().mockResolvedValue([]),
    putFolder,
    replaceFolderIfUnchanged: vi.fn(async (_expected, next) => {
      if (next) await putFolder(next);
      return true;
    }),
    replaceFoldersIfUnchanged: vi.fn(async (changes) => {
      for (const { next } of changes) await putFolder(next);
      return true;
    }),
    deleteFolder,
    deleteFolderIfUnchanged: vi.fn(async (expected, enqueuePending) => {
      await deleteFolder(expected.id);
      if (enqueuePending) await addPendingDelete({ entity: 'folder', id: expected.id });
      return true;
    }),
    listDatasets: vi.fn().mockResolvedValue([]),
    addPendingDelete,
    listPendingDeletes: vi.fn().mockResolvedValue([]),
    removePendingDelete: vi.fn().mockResolvedValue(undefined),
  };
}
