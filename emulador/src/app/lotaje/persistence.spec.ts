import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOTAJE_STORAGE_KEY,
  loadLotajeContext,
  saveLotajeContext,
  type LotajeContext,
} from './persistence';

/**
 * RFC-020 Task C-2. Pure specs for the framework-free persistence module:
 * the per-field load guard, the best-effort save, and the reserved-unread
 * `v` field (PU-07 is the runtime proof that a disguised property read
 * would fail this suite, not just a grep).
 */
describe('lotaje persistence', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fakeStorage(initial?: Record<string, string>): Storage {
    const store = new Map<string, string>(initial ? Object.entries(initial) : []);
    return {
      getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    } as unknown as Storage;
  }

  function fakeWindow(storage: Storage): Window {
    return { localStorage: storage } as unknown as Window;
  }

  function defaults(): LotajeContext {
    return { balanceText: '10000', riskPctText: '1', symbolText: '', method: 'distance' };
  }

  it('PU-01 missing key: reads the exact key and returns a fresh P2 context object', () => {
    const storage = fakeStorage();
    const getItemSpy = vi.spyOn(storage, 'getItem');
    const win = fakeWindow(storage);

    const result = loadLotajeContext(win);

    expect(getItemSpy).toHaveBeenCalledTimes(1);
    expect(getItemSpy).toHaveBeenCalledWith(LOTAJE_STORAGE_KEY);
    expect(result).toEqual(defaults());
  });

  it('PU-02 malformed JSON: a JSON.parse failure returns P2 defaults without throwing', () => {
    const storage = fakeStorage({ [LOTAJE_STORAGE_KEY]: 'not json {' });
    const win = fakeWindow(storage);

    expect(() => loadLotajeContext(win)).not.toThrow();
    expect(loadLotajeContext(win)).toEqual(defaults());
  });

  it('PU-03 malformed roots: null, array, string, number, and boolean roots each return P2 defaults', () => {
    const storage = fakeStorage();
    const win = fakeWindow(storage);
    const roots: unknown[] = [null, [1, 2, 3], 'oops', 42, true];

    for (const root of roots) {
      storage.setItem(LOTAJE_STORAGE_KEY, JSON.stringify(root));
      expect(loadLotajeContext(win)).toEqual(defaults());
    }
  });

  it('PU-04 raw load: valid raw strings and both method literals are returned byte-for-byte', () => {
    const storage = fakeStorage();
    const win = fakeWindow(storage);

    for (const method of ['distance', 'prices'] as const) {
      storage.setItem(
        LOTAJE_STORAGE_KEY,
        JSON.stringify({
          v: 1,
          balanceText: ' 012,345.00 ',
          riskPctText: '0.5',
          symbolText: ' US30 ',
          method,
        }),
      );

      expect(loadLotajeContext(win)).toEqual({
        balanceText: ' 012,345.00 ',
        riskPctText: '0.5',
        symbolText: ' US30 ',
        method,
      });
    }
  });

  it('PU-05 text guards: an invalid field alone falls back while valid siblings survive', () => {
    const storage = fakeStorage();
    const win = fakeWindow(storage);
    const validSiblings = {
      balanceText: '5000',
      riskPctText: '2',
      symbolText: 'XAUUSD',
      method: 'prices' as const,
    };

    storage.setItem(LOTAJE_STORAGE_KEY, JSON.stringify({ ...validSiblings, balanceText: 12345 }));
    expect(loadLotajeContext(win)).toEqual({
      ...validSiblings,
      balanceText: defaults().balanceText,
    });

    storage.setItem(LOTAJE_STORAGE_KEY, JSON.stringify({ ...validSiblings, riskPctText: null }));
    expect(loadLotajeContext(win)).toEqual({
      ...validSiblings,
      riskPctText: defaults().riskPctText,
    });

    storage.setItem(LOTAJE_STORAGE_KEY, JSON.stringify({ ...validSiblings, symbolText: false }));
    expect(loadLotajeContext(win)).toEqual({ ...validSiblings, symbolText: defaults().symbolText });
  });

  it('PU-06 method guard: only distance/prices survive; anything else falls back to distance while text siblings survive', () => {
    const storage = fakeStorage();
    const win = fakeWindow(storage);
    const textSiblings = { balanceText: '7000', riskPctText: '3', symbolText: 'NAS100' };
    const badMethods: unknown[] = [undefined, 'Distance', 'PRICES', 7, 'bogus'];

    for (const method of badMethods) {
      const payload: Record<string, unknown> = { v: 1, ...textSiblings };
      if (method !== undefined) payload['method'] = method;
      storage.setItem(LOTAJE_STORAGE_KEY, JSON.stringify(payload));
      expect(loadLotajeContext(win)).toEqual({ ...textSiblings, method: 'distance' });
    }
  });

  it('PU-07 v unread: a throwing getter named v on an otherwise-valid parsed object is never touched', () => {
    const storage = fakeStorage({ [LOTAJE_STORAGE_KEY]: '{"placeholder":true}' });
    const win = fakeWindow(storage);
    const validContext = {
      balanceText: '8000',
      riskPctText: '4',
      symbolText: 'SP500',
      method: 'prices' as const,
    };
    const trap = {
      ...validContext,
      get v(): number {
        throw new Error('v must never be read by loadLotajeContext');
      },
    };
    vi.spyOn(JSON, 'parse').mockReturnValue(trap);

    expect(loadLotajeContext(win)).toEqual(validContext);
  });

  it('PU-08 read failures: a throwing localStorage getter and a throwing getItem both fall back silently', () => {
    const throwingGetterWindow = {
      get localStorage(): Storage {
        throw new Error('localStorage disabled');
      },
    } as unknown as Window;
    expect(() => loadLotajeContext(throwingGetterWindow)).not.toThrow();
    expect(loadLotajeContext(throwingGetterWindow)).toEqual(defaults());

    const throwingGetItemWindow = {
      localStorage: {
        getItem: () => {
          throw new Error('quota/read error');
        },
      },
    } as unknown as Window;
    expect(() => loadLotajeContext(throwingGetItemWindow)).not.toThrow();
    expect(loadLotajeContext(throwingGetItemWindow)).toEqual(defaults());
  });

  it('PU-09 exact write: setItem is called once with the exact key and exact compact JSON property order', () => {
    const storage = fakeStorage();
    const win = fakeWindow(storage);
    const runtimeState = {
      balanceText: '10000',
      riskPctText: '1',
      symbolText: 'US30',
      method: 'distance' as const,
      distanceText: '45',
      entryText: '',
      slText: '',
      lots: 2.22,
      requestedRiskUsd: 100,
      isHeuristic: false,
      symbolDisclosureOpen: true,
    };

    saveLotajeContext(win, runtimeState);

    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(
      LOTAJE_STORAGE_KEY,
      '{"v":1,"balanceText":"10000","riskPctText":"1","symbolText":"US30","method":"distance"}',
    );
  });

  it('PU-10 write failures: a throwing localStorage getter, JSON.stringify, and setItem are each silent', () => {
    const context: LotajeContext = {
      balanceText: '10000',
      riskPctText: '1',
      symbolText: 'US30',
      method: 'distance',
    };

    const throwingGetterWindow = {
      get localStorage(): Storage {
        throw new Error('localStorage disabled');
      },
    } as unknown as Window;
    expect(() => saveLotajeContext(throwingGetterWindow, context)).not.toThrow();

    const storageForStringify = fakeStorage();
    const stringifySpy = vi.spyOn(JSON, 'stringify').mockImplementation(() => {
      throw new Error('stringify failure');
    });
    expect(() => saveLotajeContext(fakeWindow(storageForStringify), context)).not.toThrow();
    expect(storageForStringify.setItem).not.toHaveBeenCalled();
    stringifySpy.mockRestore();

    const throwingSetItemStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage;
    expect(() => saveLotajeContext(fakeWindow(throwingSetItemStorage), context)).not.toThrow();
  });
});
