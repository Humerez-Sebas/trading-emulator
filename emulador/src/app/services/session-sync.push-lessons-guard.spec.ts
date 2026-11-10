import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionSyncService } from './session-sync.service';
import type { SupabaseService } from '../auth/supabase.service';
import { WorkspaceDbService } from './workspace-db.service';
import { fixedOwnerIdentity } from './owner-identity.service';
import type { Lesson } from '../state/lessons/lessons.models';

function lesson(id: string, over: Partial<Lesson> = {}): Lesson {
  return {
    id,
    authoredAt: 1,
    whatHappened: 't',
    repeat: 't',
    avoid: 't',
    linkedRuleIds: [],
    evidence: [],
    tradeRefs: [],
    sessionRef: 's',
    clientUpdatedAt: 5,
    ...over,
  };
}

describe('SessionSyncService.pushLessons J-1 guard (audit L-2, defense in depth)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('skips and logs a lesson the local guard refuses, and pushes the rest', async () => {
    const pushed: string[] = [];
    const client = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'owner-test' } } } }) },
      from: () => ({
        upsert: (row: { id: string }) => {
          pushed.push(row.id);
          return Promise.resolve({ data: null, error: null });
        },
      }),
    };
    const service = new SessionSyncService(
      { client } as unknown as SupabaseService,
      new WorkspaceDbService(fixedOwnerIdentity('owner-test')),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await service.pushLessons([
      lesson('good1'),
      lesson('pixels', { whatHappened: 'data:image/png;base64,AAA' }),
      lesson('good2'),
    ]);

    expect(pushed).toEqual(['good1', 'good2']);
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0].join(' '))).toContain('pixels');
  });
});
