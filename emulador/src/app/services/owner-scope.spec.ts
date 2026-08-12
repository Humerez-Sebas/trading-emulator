import { describe, expect, it } from 'vitest';
import {
  decideAdoption,
  ownerLessonsDbName,
  ownerPlaybookDbName,
  ownerWorkspaceDbName,
} from './owner-scope';

/**
 * `decideAdoption` is where owner policy O-7 is actually enforced, so it is
 * tested as a pure function too, independently of IndexedDB: a rule that only
 * holds when the storage layer cooperates is not a rule.
 */
describe('owner-scope — database names', () => {
  it('never collides with the legacy un-owned names (the quarantine must stay reachable)', () => {
    expect(ownerWorkspaceDbName('u1')).not.toBe('emulador-workspaces');
    expect(ownerPlaybookDbName('u1')).not.toBe('emulador-playbook');
    expect(ownerLessonsDbName('u1')).not.toBe('emulador-lessons');
  });

  it('gives different owners different databases', () => {
    expect(ownerWorkspaceDbName('u1')).not.toBe(ownerWorkspaceDbName('u2'));
    expect(ownerPlaybookDbName('u1')).not.toBe(ownerPlaybookDbName('u2'));
    expect(ownerLessonsDbName('u1')).not.toBe(ownerLessonsDbName('u2'));
  });
});

interface Rec {
  key: string;
  ids: (string | null | undefined)[];
}

const keyOf = (r: Rec) => r.key;
const idsOf = (r: Rec) => r.ids;
const empty = new Set<string>();

describe('owner-scope — decideAdoption (O-7)', () => {
  it('claims a record whose id the cloud proves this owner owns', () => {
    const claimed = decideAdoption(
      [{ key: 'EURUSD', ids: ['s1'] }],
      keyOf,
      idsOf,
      new Set(['s1']),
      empty,
      empty,
    );
    expect(claimed.map(keyOf)).toEqual(['EURUSD']);
  });

  it('NEVER claims an uncorrelated record (no auto-adoption on ambiguity)', () => {
    const claimed = decideAdoption(
      [{ key: 'EURUSD', ids: ['stranger'] }],
      keyOf,
      idsOf,
      new Set(['s1']),
      empty,
      empty,
    );
    expect(claimed).toEqual([]);
  });

  it('claims nothing at all when the cloud proved nothing (empty proven set)', () => {
    const claimed = decideAdoption(
      [{ key: 'EURUSD', ids: ['s1'] }],
      keyOf,
      idsOf,
      empty,
      empty,
      empty,
    );
    expect(claimed).toEqual([]);
  });

  it('never claims a key the owner already holds (no overwrite of live state)', () => {
    const claimed = decideAdoption(
      [{ key: 'EURUSD', ids: ['s1'] }],
      keyOf,
      idsOf,
      new Set(['s1']),
      new Set(['EURUSD']),
      empty,
    );
    expect(claimed).toEqual([]);
  });

  it('never re-claims a key already adopted (no resurrection of deleted data)', () => {
    const claimed = decideAdoption(
      [{ key: 'EURUSD', ids: ['s1'] }],
      keyOf,
      idsOf,
      new Set(['s1']),
      empty,
      new Set(['EURUSD']),
    );
    expect(claimed).toEqual([]);
  });

  it('is per-record: a proven neighbour does not drag an unproven one along', () => {
    const claimed = decideAdoption(
      [
        { key: 'EURUSD', ids: ['mine'] },
        { key: 'GBPUSD', ids: ['theirs'] },
      ],
      keyOf,
      idsOf,
      new Set(['mine']),
      empty,
      empty,
    );
    expect(claimed.map(keyOf)).toEqual(['EURUSD']);
  });

  it('tolerates null/undefined ids without treating them as a match', () => {
    const claimed = decideAdoption(
      [{ key: 'EURUSD', ids: [null, undefined] }],
      keyOf,
      idsOf,
      new Set(['s1']),
      empty,
      empty,
    );
    expect(claimed).toEqual([]);
  });

  it('is non-destructive by construction: the input is never mutated', () => {
    const input: Rec[] = [{ key: 'EURUSD', ids: ['s1'] }];
    const snapshot = JSON.stringify(input);
    decideAdoption(input, keyOf, idsOf, new Set(['s1']), empty, empty);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
