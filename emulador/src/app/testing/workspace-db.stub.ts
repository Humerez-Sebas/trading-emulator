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
  return {
    list: vi.fn().mockResolvedValue([]),
    listMetas: vi.fn().mockResolvedValue([]),
    getWorkspace: vi.fn().mockResolvedValue(undefined),
    getMeta: vi.fn().mockResolvedValue(undefined),
    getSeriesInfo: vi.fn().mockResolvedValue(null),
    putMeta: vi.fn().mockResolvedValue(undefined),
    putSeries: vi.fn().mockResolvedValue(undefined),
    appendSeriesChunk: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    listFolders: vi.fn().mockResolvedValue([]),
    putFolder: vi.fn().mockResolvedValue(undefined),
    deleteFolder: vi.fn().mockResolvedValue(undefined),
    getSymbol: vi.fn().mockResolvedValue(undefined),
    listSymbols: vi.fn().mockResolvedValue([]),
    putSymbol: vi.fn().mockResolvedValue(undefined),
    removeSymbol: vi.fn().mockResolvedValue(undefined),
    listDatasets: vi.fn().mockResolvedValue([]),
    addPendingDelete: vi.fn().mockResolvedValue(undefined),
    listPendingDeletes: vi.fn().mockResolvedValue([]),
    removePendingDelete: vi.fn().mockResolvedValue(undefined),
  };
}
