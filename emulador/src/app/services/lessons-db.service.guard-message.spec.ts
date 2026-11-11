import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { LessonsDbService } from './lessons-db.service';
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
    ...over,
  };
}

describe('LessonsDbService J-1 guard message (audit L-2)', () => {
  let svc: LessonsDbService;
  beforeEach(async () => {
    svc = new LessonsDbService(fixedOwnerIdentity('owner-test'));
    await svc.clear();
  });

  it('says the free text tripped it', async () => {
    await expect(svc.upsert(lesson('a', { avoid: 'data:image/png;base64,AAA' }))).rejects.toThrow(
      /raster guard.*free text/s,
    );
  });

  it('says the evidence tripped it', async () => {
    await expect(
      svc.upsert(lesson('b', { evidence: [{ x: 'blob:abc' }] as never })),
    ).rejects.toThrow(/raster guard.*evidence/s);
  });
});
