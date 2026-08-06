import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERATED_ASSETS } from '../domain/sizing/asset-registry.generated';
import { COMPANION_HEIGHT, COMPANION_WIDTH } from './companion-window';
import { getMountedState, getMountedWindow, LOTAJE_MOUNT_ID, mount, unmount } from './lotaje-view';
import { LOTAJE_STORAGE_KEY } from './persistence';
import { INITIAL_STATE, type LotajeState } from './sizing-view-model';

/**
 * New specs for the framework-free view itself (as opposed to the ported/
 * re-expressed regression specs in `pages/calculadora/calculadora-page.component.spec.ts`,
 * which exercise the SAME view mounted through the real Angular host).
 *
 * These specs deliberately construct a FRESH `Document` via
 * `document.implementation.createHTMLDocument()` for most cases — proof, not
 * just a grep, that `mount(doc, win)` builds into whatever document it is
 * given and never touches the ambient global `document`.
 */
describe('lotaje-view: mount/unmount', () => {
  let ambientClipboardDescriptor: PropertyDescriptor | undefined;
  let ambientClipboardInstrumented = false;
  const focusFrames: HTMLIFrameElement[] = [];

  // Task C-2: many pre-existing tests mount into the real ambient `window`,
  // which now means a real (jsdom) `window.localStorage` round trip whenever
  // context actually changes. Under this suite's isolate:false runner
  // (docs/engineering/testing.md) that ambient storage is shared across every
  // test in this file, so the key is scrubbed before AND after each test —
  // never `localStorage.clear()`, which could poison another spec file.
  beforeEach(() => {
    window.localStorage.removeItem(LOTAJE_STORAGE_KEY);
  });

  afterEach(() => {
    try {
      unmount();
    } finally {
      try {
        if (ambientClipboardInstrumented) {
          if (ambientClipboardDescriptor) {
            Object.defineProperty(navigator, 'clipboard', ambientClipboardDescriptor);
          } else {
            Reflect.deleteProperty(navigator, 'clipboard');
          }
          ambientClipboardDescriptor = undefined;
          ambientClipboardInstrumented = false;
        }
      } finally {
        for (const frame of focusFrames.splice(0)) frame.remove();
        vi.useRealTimers();
        vi.restoreAllMocks();
        window.localStorage.removeItem(LOTAJE_STORAGE_KEY);
      }
    }
  });

  function freshDoc(): Document {
    return document.implementation.createHTMLDocument('lotaje-test');
  }

  function freshFocusableDoc(): Document {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    focusFrames.push(frame);
    return frame.contentDocument!;
  }

  /**
   * D-7: a focusable document stamped the same way `./companion-window`
   * stamps the real companion document (`companion-window.ts:135`) BEFORE
   * `mount()` is ever called on it — the only honest way `isCompanionDocument`
   * has to tell the two hosts apart. Focusable (not `freshDoc()`) because the
   * `Alt+S` specs below assert a real `document.activeElement` change.
   */
  function freshCompanionDoc(): Document {
    const doc = freshFocusableDoc();
    doc.documentElement.setAttribute('data-lotaje-companion', 'true');
    return doc;
  }

  function state(overrides: Partial<LotajeState> = {}): LotajeState {
    return {
      balanceText: '10000',
      riskPctText: '1',
      symbolText: 'US30',
      method: 'distance',
      distanceText: '45',
      entryText: '',
      slText: '',
      ...overrides,
    };
  }

  function dispatchKey(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const EventConstructor = target.ownerDocument.defaultView?.KeyboardEvent ?? KeyboardEvent;
    const event = new EventConstructor('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    target.dispatchEvent(event);
    return event;
  }

  function dispatchPreventedKey(target: Element, key: string): KeyboardEvent {
    const EventConstructor = target.ownerDocument.defaultView?.KeyboardEvent ?? KeyboardEvent;
    const event = new EventConstructor('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    target.dispatchEvent(event);
    return event;
  }

  function deferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
  } {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });
    return { promise, resolve, reject };
  }

  function targetWindow(writeText: (text: string) => Promise<void>): Window {
    return {
      navigator: { clipboard: { writeText } } as unknown as Navigator,
      setTimeout: vi.fn(window.setTimeout.bind(window)),
      clearTimeout: vi.fn(window.clearTimeout.bind(window)),
    } as unknown as Window;
  }

  function instrumentAmbientClipboard(writeText: (text: string) => Promise<void>): void {
    ambientClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    ambientClipboardInstrumented = true;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  }

  /** Task C-2: an in-memory `Storage` double, never the ambient realm. */
  function fakeStorage(initial?: Record<string, string>): Storage {
    const store = new Map<string, string>(initial ? Object.entries(initial) : []);
    return {
      getItem: vi.fn((key: string) => (store.has(key) ? (store.get(key) as string) : null)),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key);
      }),
      clear: vi.fn(() => store.clear()),
      key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
      get length() {
        return store.size;
      },
    } as unknown as Storage;
  }

  /** Task C-2: a target-realm window carrying its own storage double, clipboard, and timers. */
  function persistedWindow(
    storage: Storage,
    writeText: (text: string) => Promise<void> = () => Promise.resolve(),
  ): Window {
    return {
      localStorage: storage,
      navigator: { clipboard: { writeText } } as unknown as Navigator,
      setTimeout: vi.fn(window.setTimeout.bind(window)),
      clearTimeout: vi.fn(window.clearTimeout.bind(window)),
    } as unknown as Window;
  }

  /**
   * F21-3: the free-text «Otro símbolo» field is gone, so the ONLY way a user
   * names an instrument is the curated listbox. Every spec that used to type a
   * symbol picks one here instead; the handful that need a symbol OUTSIDE the
   * catalogue (a context persisted by an older build) supply it as explicit
   * mount state, which is the only way it can still arrive.
   */
  function selectSymbol(doc: Document, symbol: string): void {
    const trigger = doc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger');
    if (!trigger) throw new Error('no .lotaje-asset-trigger found');
    if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
    const option = doc.querySelector<HTMLButtonElement>(
      `.lotaje-asset-option[data-symbol="${symbol}"]`,
    );
    if (!option) throw new Error(`no catalogue option for "${symbol}"`);
    option.click();
  }

  /** What the collapsed asset trigger currently displays. */
  function shownSymbol(doc: Document): string | null {
    return doc.querySelector('.lotaje-asset-trigger .lotaje-symbol-value')?.textContent ?? null;
  }

  function methodOption(doc: Document, method: 'distance' | 'prices'): HTMLButtonElement {
    const option = doc.querySelector<HTMLButtonElement>(
      `.lotaje-method-option[data-method="${method}"]`,
    );
    if (!option) throw new Error(`no .lotaje-method-option[data-method="${method}"] found`);
    return option;
  }

  /** The mode the segmented control reports as chosen, via ARIA — never via colour. */
  function checkedMethod(doc: Document): string | null {
    return (
      doc
        .querySelector('.lotaje-method-option[aria-checked="true"]')
        ?.getAttribute('data-method') ?? null
    );
  }

  function driveRealLot(doc: Document, distance = '45'): void {
    setValue(doc, 'balance', '10000');
    setValue(doc, 'riskPct', '1');
    selectSymbol(doc, 'US30');
    setValue(doc, 'distance', distance);
  }

  async function settleMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('builds the three zones with their aria-labels into an explicit document, not the global one', () => {
    const doc = freshDoc();
    mount(doc, window);

    // Never touched: the ambient global document gained no #lotaje-mount.
    expect(document.getElementById(LOTAJE_MOUNT_ID)).toBeNull();

    const container = doc.getElementById(LOTAJE_MOUNT_ID);
    expect(container).not.toBeNull();
    expect(container?.querySelector('[aria-label="Contexto"]')).not.toBeNull();
    expect(container?.querySelector('[aria-label="La pregunta"]')).not.toBeNull();
    expect(container?.querySelector('[aria-label="La respuesta"]')).not.toBeNull();
  });

  it('creates its own #lotaje-mount container when the document has none (the D-6 companion-window case)', () => {
    const doc = freshDoc();
    expect(doc.getElementById(LOTAJE_MOUNT_ID)).toBeNull();
    mount(doc, window);
    expect(doc.getElementById(LOTAJE_MOUNT_ID)).not.toBeNull();
    expect(doc.body.contains(doc.getElementById(LOTAJE_MOUNT_ID))).toBe(true);
  });

  it('reuses an existing #lotaje-mount container instead of creating a second one', () => {
    const doc = freshDoc();
    const provided = doc.createElement('div');
    provided.id = LOTAJE_MOUNT_ID;
    doc.body.appendChild(provided);

    mount(doc, window);

    expect(doc.querySelectorAll(`#${LOTAJE_MOUNT_ID}`).length).toBe(1);
    expect(provided.children.length).toBeGreaterThan(0);
  });

  it('starts at the P2 cold-start honest state: no symbol, blank stop, "positivos" message', () => {
    const doc = freshDoc();
    mount(doc, window);
    const text = doc.getElementById(LOTAJE_MOUNT_ID)?.textContent?.toLowerCase() ?? '';
    expect(text).toContain('positivos');
    expect(doc.querySelector('.lotaje-hero')).toBeNull();
  });

  it('captures the given window (not the global one), retrievable via getMountedWindow()', () => {
    const doc = freshDoc();
    const fakeWindow = { marker: 'not-the-real-window' } as unknown as Window;
    mount(doc, fakeWindow);
    expect(getMountedWindow()).toBe(fakeWindow);
  });

  it('unmount() clears the captured window and empties the container', () => {
    const doc = freshDoc();
    mount(doc, window);
    const container = doc.getElementById(LOTAJE_MOUNT_ID);
    expect(container?.children.length).toBeGreaterThan(0);

    unmount();

    expect(container?.children.length).toBe(0);
    expect(getMountedWindow()).toBeNull();
  });

  it('unmount() is safe to call when nothing is mounted', () => {
    expect(() => unmount()).not.toThrow();
  });

  it('mount() is idempotent: calling it twice tears down the first mount rather than doubling the DOM', () => {
    const doc = freshDoc();
    mount(doc, window);
    mount(doc, window);
    const roots = doc.querySelectorAll('.lotaje-root');
    expect(roots.length).toBe(1);
  });

  // Wave 4 audit L-1: this pins the OMITTED-arity cold-start path only.
  // `loadLotajeContext` always returns four strings, so `mount()`'s per-field
  // `INITIAL_STATE` fallbacks are unreachable here — a genuine in-memory
  // cross-mount leak would NOT be caught by this test (proved by mutation,
  // wave4-audit-report.md E2). That claim belongs to IN-05 (explicit-arity
  // precedence, below), which exercises the path where the fallbacks are live.
  it('a clean remount renders P2 defaults from empty storage', () => {
    const docA = freshDoc();
    mount(docA, window);
    const balanceA = docA.querySelector<HTMLInputElement>('input[name="balance"]')!;
    balanceA.value = '99999';
    balanceA.dispatchEvent(new Event('input'));
    unmount();
    // Task C-2: this test's cold-start precondition predates persistence — the
    // edit above now also writes real ambient `window.localStorage`. Scrub the
    // key (never `localStorage.clear()`) so this test still isolates the
    // in-memory leak it names, not a storage round trip a later task owns.
    window.localStorage.removeItem(LOTAJE_STORAGE_KEY);

    const docB = freshDoc();
    mount(docB, window);
    const balanceB = docB.querySelector<HTMLInputElement>('input[name="balance"]')!;
    // Cold start again — docA's edit must not have leaked into the fresh mount.
    expect(balanceB.value).toBe('10000');
  });

  it('typing into the stop field never recreates the input node (focus/caret survive)', () => {
    const doc = freshDoc();
    mount(doc, window);
    const input = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    for (const text of ['4', '45', '45.', '45.5']) {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      expect(doc.querySelector('input[name="distance"]')).toBe(input); // same node, never rebuilt
      expect(input.value).toBe(text); // never written back mid-edit (F1)
    }
  });

  it('a real lot figure renders once balance/risk/symbol/stop are all valid', () => {
    const doc = freshDoc();
    mount(doc, window);
    setValue(doc, 'balance', '5000');
    setValue(doc, 'riskPct', '1');
    selectSymbol(doc, 'US30');
    setValue(doc, 'distance', '50');
    expect(doc.querySelector('.lotaje-lots-value')?.textContent?.trim()).toBe('1.00');
    expect(doc.querySelector('.lotaje-invalid-state')).toBeNull();
  });

  // F21-3 removed the free-text entry that used to produce a non-curated
  // symbol, but NOT the provenance badge: a context persisted by an older
  // build can still carry one, and when it does the heuristic origin must
  // still be declared rather than silently dropped.
  it('the heuristic badge shows only for a non-empty, non-curated symbol', () => {
    const badge = (doc: Document) => doc.querySelector<HTMLElement>('.lotaje-symbol-badge');

    const coldDoc = freshDoc();
    mount(coldDoc, window);
    expect(badge(coldDoc)?.hidden).toBe(true); // blank symbol at cold start
    selectSymbol(coldDoc, 'US30');
    expect(badge(coldDoc)?.hidden).toBe(true); // curated symbol

    const legacyDoc = freshDoc();
    mount(legacyDoc, window, state({ symbolText: 'GBPJPY' }));
    expect(badge(legacyDoc)?.hidden).toBe(false); // unrecognised -> heuristic
    expect(shownSymbol(legacyDoc)).toBe('GBPJPY');
  });

  it('renders a collapsed combobox and no free-text symbol entry anywhere (F21-3)', () => {
    const doc = freshDoc();
    mount(doc, window);

    const trigger = doc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger');
    const menu = doc.querySelector<HTMLElement>('#lotaje-asset-menu');
    const badge = doc.querySelector<HTMLElement>('.lotaje-symbol-badge');

    expect(trigger?.tagName).toBe('BUTTON');
    expect(trigger?.type).toBe('button');
    expect(trigger?.getAttribute('role')).toBe('combobox');
    expect(trigger?.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger?.querySelector('.lotaje-symbol-value')?.textContent).toBe('Símbolo');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(trigger?.getAttribute('aria-controls')).toBe('lotaje-asset-menu');
    expect(menu?.getAttribute('role')).toBe('listbox');
    expect(menu?.hidden).toBe(true);
    expect(badge?.hidden).toBe(true);

    // The whole point of F21-3: nothing anywhere accepts an arbitrary symbol.
    expect(doc.querySelector('input[name="symbol"]')).toBeNull();
    expect(doc.querySelector('#lotaje-symbol-input')).toBeNull();
    expect(doc.querySelector('#lotaje-symbol-preset')).toBeNull();
    expect(doc.body.textContent).not.toContain('Otro símbolo');
  });

  it('opens the listbox from the trigger and toggles it closed without disturbing the layout around it', () => {
    const doc = freshDoc();
    mount(doc, window);
    const trigger = doc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger')!;
    const menu = doc.querySelector<HTMLElement>('#lotaje-asset-menu')!;

    trigger.click();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(menu.hidden).toBe(false);
    expect(menu.getAttribute('aria-label')).toBe('Selecciona un activo');
    expect(doc.querySelector('.lotaje-asset-menu-title')?.textContent).toBe('Selecciona un activo');
    // The menu is a sibling of the trigger inside the same positioned wrapper,
    // never injected into the summary row — that is what keeps opening it from
    // reflowing the cells beside it.
    expect(menu.parentElement).toBe(trigger.parentElement);
    expect(menu.parentElement?.classList.contains('lotaje-asset-select')).toBe(true);

    trigger.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(menu.hidden).toBe(true);
    expect(doc.querySelectorAll('#lotaje-asset-menu')).toHaveLength(1);
  });

  /**
   * «Especificaciones del activo» is gone from both hosts — the trigger, the
   * disclosure and the contract/tick/pip/point/volume/currency/provenance
   * sheet with it. This asserts the ABSENCE by every hook the removed feature
   * ever exposed, in the page and in the companion, so a partial revival
   * (say, the DOM without the trigger) still fails here rather than shipping
   * as dead markup.
   */
  it('renders no asset-specification trigger, disclosure or sheet in either host', () => {
    for (const doc of [freshDoc(), freshCompanionDoc()]) {
      mount(doc, window, state());

      for (const selector of [
        '.lotaje-specs',
        '.lotaje-spec-trigger',
        '.lotaje-spec-trigger-label',
        '#lotaje-symbol-disclosure',
        '.lotaje-symbol-disclosure',
        '.lotaje-asset-sheet',
        '#lotaje-asset-sheet-title',
        '[data-asset-field]',
        '[aria-controls="lotaje-symbol-disclosure"]',
      ]) {
        expect(doc.querySelectorAll(selector)).toHaveLength(0);
      }
      expect(doc.querySelector('.lotaje-root')?.textContent).not.toContain(
        'Especificaciones del activo',
      );
      expect(doc.querySelector('.lotaje-root')?.textContent).not.toContain('Ficha del activo');

      // The selector and the sizing it feeds are untouched by the removal.
      expect(doc.querySelector('.lotaje-asset-trigger')).not.toBeNull();
      expect(doc.querySelector('.lotaje-symbol-value')?.textContent).toBe('US30');
      expect(doc.querySelector('.lotaje-lots-value')?.textContent).toBe('2.22');

      unmount();
    }
  });

  it('sources exactly four selectable symbols from GENERATED_ASSETS, each with its ticker and name', () => {
    const doc = freshDoc();
    mount(doc, window);
    doc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger')!.click();

    const expectedKeys = Object.keys(GENERATED_ASSETS);
    const options = Array.from(doc.querySelectorAll<HTMLButtonElement>('.lotaje-asset-option'));
    expect(options).toHaveLength(4);
    expect(options.map((option) => option.getAttribute('data-symbol'))).toEqual(expectedKeys);
    expect(options.map((option) => option.getAttribute('role'))).toEqual(
      Array<string>(4).fill('option'),
    );
    expect(
      options.map((option) => option.querySelector('.lotaje-asset-option-symbol')?.textContent),
    ).toEqual(expectedKeys);
    expect(
      options.map((option) => option.querySelector('.lotaje-asset-option-name')?.textContent),
    ).toEqual(['US Tech 100', 'S&P 500', 'US Wall Street 30', 'Oro / Dólar']);
    // Nothing is selected yet at cold start — the trigger still reads «Símbolo».
    expect(options.map((option) => option.getAttribute('aria-selected'))).toEqual(
      Array<string>(4).fill('false'),
    );
  });

  it('the listbox is keyboard operable: arrows move, Enter selects, Escape closes without clearing the stop', () => {
    const doc = freshFocusableDoc();
    mount(doc, window, state());
    const trigger = doc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger')!;
    const options = Array.from(doc.querySelectorAll<HTMLButtonElement>('.lotaje-asset-option'));
    trigger.focus();

    // ArrowDown from the collapsed trigger opens and lands on the selected row.
    dispatchKey(trigger, 'ArrowDown');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(doc.activeElement).toBe(options[2]); // US30 is the mounted symbol
    dispatchKey(options[2], 'ArrowDown');
    expect(doc.activeElement).toBe(options[3]);
    dispatchKey(options[3], 'ArrowDown'); // wraps
    expect(doc.activeElement).toBe(options[0]);
    dispatchKey(options[0], 'End');
    expect(doc.activeElement).toBe(options[3]);
    dispatchKey(options[3], 'Home');
    expect(doc.activeElement).toBe(options[0]);

    // Escape dismisses the menu and returns focus — and must NOT reach the root
    // handler, whose bare-Escape meaning is "clear the stop field".
    const escape = dispatchKey(options[0], 'Escape');
    expect(escape.defaultPrevented).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(doc.activeElement).toBe(trigger);
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('45');

    // Reopen and commit with a real activation.
    dispatchKey(trigger, 'ArrowUp');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(doc.activeElement).toBe(options[2]); // reopens on the current symbol
    dispatchKey(options[2], 'ArrowDown');
    options[3].click();
    expect(shownSymbol(doc)).toBe('XAUUSD');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(doc.activeElement).toBe(trigger);
  });

  it('choosing XAUUSD retains price-unit pts and preserves context', () => {
    const doc = freshDoc();
    mount(doc, window);
    setValue(doc, 'balance', '10000');
    setValue(doc, 'riskPct', '1');
    setValue(doc, 'distance', '10');
    const balanceInput = doc.querySelector<HTMLInputElement>('input[name="balance"]')!;
    const riskInput = doc.querySelector<HTMLInputElement>('input[name="riskPct"]')!;
    const distanceInput = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    const trigger = doc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger')!;
    const menu = doc.querySelector<HTMLElement>('#lotaje-asset-menu')!;

    selectSymbol(doc, 'XAUUSD');

    expect(doc.querySelector('.lotaje-stop-unit')?.textContent).toBe('pts');
    expect(doc.querySelector('.lotaje-lots-value')?.textContent).toBe('0.10');
    expect(doc.querySelector('.lotaje-risk-usd')?.textContent).toContain('100.00');
    expect(shownSymbol(doc)).toBe('XAUUSD');
    expect(
      doc
        .querySelector('.lotaje-asset-option[data-symbol="XAUUSD"]')
        ?.getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      doc.querySelector('.lotaje-asset-option[data-symbol="US30"]')?.getAttribute('aria-selected'),
    ).toBe('false');
    expect(doc.querySelector<HTMLElement>('.lotaje-symbol-badge')?.hidden).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(menu.hidden).toBe(true);
    expect(balanceInput.value).toBe('10000');
    expect(riskInput.value).toBe('1');
    expect(distanceInput.value).toBe('10');
    expect(checkedMethod(doc)).toBe('distance');
    expect(doc.querySelector('input[name="balance"]')).toBe(balanceInput);
    expect(doc.querySelector('input[name="riskPct"]')).toBe(riskInput);
    expect(doc.querySelector('input[name="distance"]')).toBe(distanceInput);
  });

  // The FX path (pip-derived unit label and pip-scaled distance) is no longer
  // reachable by typing, because the catalogue is index/metal only — it is
  // still reachable, and still asserted, through a context carried in from
  // persistence or from the companion move.
  it('a non-catalogue symbol carried in as state still sizes, labels its unit and declares its provenance', () => {
    const doc = freshDoc();
    mount(doc, window, state({ symbolText: 'EURUSD', distanceText: '45' }));

    expect(shownSymbol(doc)).toBe('EURUSD');
    expect(doc.querySelector<HTMLElement>('.lotaje-symbol-badge')?.hidden).toBe(false);
    expect(doc.querySelector('.lotaje-symbol-badge')?.textContent).toBe('heurística');
    expect(doc.querySelector('.lotaje-stop-unit')?.textContent).toBe('pips');
    expect(doc.querySelector('.lotaje-lots-value')?.textContent).toBe('0.22');
    // It is not in the catalogue, so no option claims to be it.
    expect(doc.querySelectorAll('.lotaje-asset-option[aria-selected="true"]')).toHaveLength(0);
  });

  it('contains no unit control and keeps the stop unit as a derived label', () => {
    const doc = freshDoc();
    mount(doc, window, state({ symbolText: 'EURUSD' }));

    // The unit is derived from the symbol, never chosen: nothing anywhere in
    // the view offers to set it.
    const root = doc.querySelector<HTMLElement>('.lotaje-root')!;
    expect(root.querySelector('[name*="unit" i]')).toBeNull();
    expect(root.querySelector('input[type="checkbox"], input[type="radio"]')).toBeNull();
    const stopUnit = doc.querySelector<HTMLElement>('.lotaje-stop-unit');
    expect(stopUnit?.tagName).toBe('SPAN');
    expect(stopUnit?.textContent).toBe('pips');
    expect(stopUnit?.hasAttribute('role')).toBe(false);
    expect(stopUnit?.hasAttribute('tabindex')).toBe(false);
  });

  it('preserves D-3 target-realm copy after symbol selection re-renders the view', () => {
    const doc = freshDoc();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    mount(doc, targetWindow(writeText));
    setValue(doc, 'balance', '10000');
    setValue(doc, 'riskPct', '1');
    setValue(doc, 'distance', '45');
    selectSymbol(doc, 'US30');

    doc.querySelector<HTMLButtonElement>('.lotaje-copy-action')!.click();

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('2.22');
  });

  // Wave 4 audit L-1: same disposition as the remount test above — this pins
  // DOM hygiene (no duplicate select/menu/option nodes) across open/close
  // cycles and an omitted-arity remount. It cannot detect a genuine in-memory
  // cross-mount leak (that claim is IN-05's, below); see the comment on the
  // earlier remount test for why.
  it('open/close cycles leave no duplicate or leaked symbol DOM', () => {
    const firstDoc = freshDoc();
    mount(firstDoc, window);
    const trigger = firstDoc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger')!;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      trigger.click();
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(firstDoc.querySelectorAll('#lotaje-asset-menu')).toHaveLength(1);
      expect(firstDoc.querySelectorAll('.lotaje-asset-option')).toHaveLength(4);
      trigger.click();
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(firstDoc.querySelector<HTMLElement>('#lotaje-asset-menu')?.hidden).toBe(true);
    }
    selectSymbol(firstDoc, 'XAUUSD');
    unmount();
    // Task C-2: as above — scrub the key so this test still isolates the
    // in-memory leak it names, not a storage round trip.
    window.localStorage.removeItem(LOTAJE_STORAGE_KEY);

    const secondDoc = freshDoc();
    mount(secondDoc, window);
    const secondTrigger = secondDoc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger');
    const secondMenu = secondDoc.querySelector<HTMLElement>('#lotaje-asset-menu');
    expect(secondDoc.querySelectorAll('#lotaje-asset-menu')).toHaveLength(1);
    expect(secondMenu?.hidden).toBe(true);
    expect(secondTrigger?.getAttribute('aria-expanded')).toBe('false');
    expect(secondDoc.querySelectorAll('.lotaje-asset-option')).toHaveLength(4);
    expect(shownSymbol(secondDoc)).toBe('Símbolo');
    expect(secondDoc.querySelector<HTMLElement>('.lotaje-symbol-badge')?.hidden).toBe(true);
  });

  // Brief §2.4/§3.7: the ⧉ glyph is gone from both result surfaces. The figure
  // itself remains the control, so the copy behaviour (click here, `Enter`
  // below) is unchanged — what disappeared is an icon-only affordance, and the
  // accessible name grew to carry the figure it copies.
  it('renders a real lot as a named copy control carrying the figure, with no copy icon', () => {
    const doc = freshDoc();
    mount(doc, targetWindow(vi.fn().mockResolvedValue(undefined)));
    driveRealLot(doc);

    const button = doc.querySelector<HTMLButtonElement>('.lotaje-copy-action');
    const hero = doc.querySelector<HTMLElement>('.lotaje-hero');
    const shell = doc.querySelector<HTMLElement>('.lotaje-copy-shell');
    const content = button?.querySelector<HTMLElement>('.lotaje-copy-content');
    const value = content?.querySelector<HTMLElement>('.lotaje-lots-value');
    const label = content?.querySelector<HTMLElement>('.lotaje-lots-label');
    const feedback = shell?.querySelector<HTMLElement>('.lotaje-copy-feedback');

    expect(button?.tagName).toBe('BUTTON');
    expect(button?.type).toBe('button');
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute('aria-label')).toBe('Copiar 2.22 lotes');
    expect(button?.title).toBe('Copiar lotaje');
    expect(value?.textContent).toBe('2.22');
    expect(label?.textContent).toBe('lotes');
    expect(Array.from(content?.children ?? [])).toEqual([value, label]);
    expect(button?.querySelector('.lotaje-copy-affordance')).toBeNull();
    expect(button?.querySelector('svg')).toBeNull();
    expect(button?.textContent).toBe('2.22lotes');
    expect(hero?.contains(button ?? null)).toBe(true);
    expect(shell?.contains(hero ?? null)).toBe(true);
    expect(feedback?.getAttribute('role')).toBe('status');
    expect(feedback?.getAttribute('aria-live')).toBe('polite');
    expect(feedback?.getAttribute('aria-atomic')).toBe('true');
    expect(feedback?.textContent).toBe('');
  });

  it('surrounds the figure with the result surface: target mark, heading, explanation and disclaimer', () => {
    const doc = freshDoc();
    mount(doc, targetWindow(vi.fn().mockResolvedValue(undefined)));
    driveRealLot(doc);

    const result = doc.querySelector<HTMLElement>('.lotaje-zone--answer .lotaje-result');
    expect(result).not.toBeNull();
    expect(result?.querySelector('.lotaje-result-mark svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(result?.querySelector('.lotaje-result-title')?.textContent).toBe('Tamaño de posición');
    expect(result?.querySelector('.lotaje-result-hint')?.textContent).toBe(
      'Con los parámetros actuales, puedes operar el siguiente tamaño.',
    );
    expect(result?.querySelector('.lotaje-result-note')?.textContent).toBe(
      'Valor aproximado. Verifica siempre antes de operar.',
    );
    // The figure lives in the rebuilt slot; the chrome around it does not move.
    expect(result?.querySelector('.lotaje-result-body .lotaje-lots-value')?.textContent).toBe(
      '2.22',
    );
  });

  it('copies exactly the bare dot-decimal two-place payload 2.22 from a user click', () => {
    const doc = freshDoc();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    mount(doc, targetWindow(writeText));
    driveRealLot(doc);

    expect(writeText).not.toHaveBeenCalled();
    doc.querySelector<HTMLButtonElement>('.lotaje-copy-action')!.click();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('2.22');
  });

  it('calls the mounted target window navigator and never the ambient navigator', () => {
    const doc = freshDoc();
    const targetWriteText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const ambientWriteText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const target = targetWindow(targetWriteText);
    instrumentAmbientClipboard(ambientWriteText);

    expect(target.navigator).not.toBe(navigator);
    mount(doc, target);
    driveRealLot(doc);
    doc.querySelector<HTMLButtonElement>('.lotaje-copy-action')!.click();

    expect(targetWriteText).toHaveBeenCalledTimes(1);
    expect(ambientWriteText).not.toHaveBeenCalled();
  });

  it('never auto-copies while inputs recalculate; only the later click writes', () => {
    const doc = freshDoc();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    mount(doc, targetWindow(writeText));

    for (const [name, text] of [
      ['balance', '10000'],
      ['riskPct', '1'],
      ['distance', '4'],
      ['distance', '45'],
    ] as const) {
      setValue(doc, name, text);
      expect(writeText).not.toHaveBeenCalled();
    }
    selectSymbol(doc, 'US30');
    expect(writeText).not.toHaveBeenCalled();

    const button = doc.querySelector<HTMLButtonElement>('.lotaje-copy-action')!;
    const displayedValue = button.querySelector('.lotaje-lots-value')?.textContent;
    expect(displayedValue).toBe('2.22');
    button.click();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(displayedValue);
  });

  it('shows Copiado and the accent state only after fulfillment, then clears both at 1200 ms', async () => {
    vi.useFakeTimers();
    const doc = freshDoc();
    const pendingWrite = deferred<void>();
    const target = targetWindow(vi.fn().mockReturnValue(pendingWrite.promise));
    mount(doc, target);
    driveRealLot(doc);
    const button = doc.querySelector<HTMLButtonElement>('.lotaje-copy-action')!;
    const feedback = doc.querySelector<HTMLElement>('.lotaje-copy-feedback')!;

    button.click();
    expect(feedback.textContent).toBe('');
    expect(button.classList.contains('lotaje-copy-action--copied')).toBe(false);

    pendingWrite.resolve(undefined);
    await settleMicrotasks();
    expect(feedback.textContent).toBe('Copiado');
    expect(button.classList.contains('lotaje-copy-action--copied')).toBe(true);
    expect(target.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1200);

    vi.advanceTimersByTime(1199);
    expect(feedback.textContent).toBe('Copiado');
    expect(button.classList.contains('lotaje-copy-action--copied')).toBe(true);

    vi.advanceTimersByTime(1);
    expect(feedback.textContent).toBe('');
    expect(button.classList.contains('lotaje-copy-action--copied')).toBe(false);
  });

  it('shows the exact fallback on rejection or synchronous throw and leaves the 2.22 figure present for manual selection', async () => {
    const rejectedDoc = freshDoc();
    const rejectedWrite = deferred<void>();
    mount(rejectedDoc, targetWindow(vi.fn().mockReturnValue(rejectedWrite.promise)));
    driveRealLot(rejectedDoc);
    const rejectedButton = rejectedDoc.querySelector<HTMLButtonElement>('.lotaje-copy-action')!;
    rejectedButton.click();
    rejectedWrite.reject(new Error('denied'));
    await settleMicrotasks();

    expect(rejectedDoc.querySelector('.lotaje-copy-feedback')?.textContent).toBe(
      'No se pudo copiar — selecciona y copia',
    );
    expect(rejectedDoc.body.textContent).not.toContain('Copiado');
    expect(rejectedButton.classList.contains('lotaje-copy-action--copied')).toBe(false);
    expect(rejectedDoc.querySelector('.lotaje-lots-value')?.textContent).toBe('2.22');

    const thrownDoc = freshDoc();
    const throwingWrite = vi.fn<(_text: string) => Promise<void>>(() => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    mount(thrownDoc, targetWindow(throwingWrite));
    driveRealLot(thrownDoc);
    const thrownButton = thrownDoc.querySelector<HTMLButtonElement>('.lotaje-copy-action')!;
    thrownButton.click();

    expect(thrownDoc.querySelector('.lotaje-copy-feedback')?.textContent).toBe(
      'No se pudo copiar — selecciona y copia',
    );
    expect(thrownDoc.body.textContent).not.toContain('Copiado');
    expect(thrownButton.classList.contains('lotaje-copy-action--copied')).toBe(false);
    expect(thrownDoc.querySelector('.lotaje-lots-value')?.textContent).toBe('2.22');
  });

  // The honest state REPLACES the figure (§5.3) and, with the glyph gone
  // (brief §2.4), there is no copy control left to disable — the message
  // occupies the figure's own slot. The no-jump guarantee that
  // "disabled, not hidden" protected now comes from `.lotaje-copy-shell`'s
  // `min-height` alone, and there is no reachable copy path here at all.
  it('replaces an honest-state figure with its message and offers no copy path', () => {
    const doc = freshDoc();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    mount(doc, targetWindow(writeText));

    const shell = doc.querySelector<HTMLElement>('.lotaje-copy-shell');
    const message = shell?.querySelector<HTMLElement>('.lotaje-invalid-state');
    expect(message?.textContent).toBe(
      'La cuenta, el riesgo y la entrada deben ser valores positivos.',
    );
    expect(message?.id).toBe('lotaje-copy-unavailable-reason');
    expect(message?.getAttribute('role')).toBe('alert');
    expect(doc.querySelector('.lotaje-lots-value')).toBeNull();
    expect(doc.querySelector('.lotaje-lots-label')).toBeNull();
    expect(doc.querySelector('.lotaje-hero')).toBeNull();
    expect(shell).not.toBeNull();
    expect(doc.querySelector('.lotaje-copy-action')).toBeNull();
    expect(doc.querySelector('.lotaje-copy-affordance')).toBeNull();
    // The surrounding result surface is unchanged — only the slot's contents.
    expect(doc.querySelector('.lotaje-result-title')?.textContent).toBe('Tamaño de posición');
    expect(doc.querySelector('.lotaje-copy-feedback')).not.toBeNull();
    expect(writeText).not.toHaveBeenCalled();
  });

  // Wave 4 audit L-4: `balanceText='1e400'` overflows to Infinity, which
  // passes every "positive" check (`Infinity > 0` is true) so `invalidReason`
  // stays null, yet `lotsForRiskDistance` also returns Infinity. Before the
  // `Number.isFinite(derived.lots)` gate, this rendered an ENABLED hero with
  // `formatLots(Infinity) = '—'` as the copy payload — a false success state
  // that copies a literal em dash.
  it('a non-finite lot figure from an extreme balance is an honest state, not an enabled em dash', () => {
    const doc = freshDoc();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    mount(doc, targetWindow(writeText));
    setValue(doc, 'balance', '1e400');
    setValue(doc, 'riskPct', '1');
    selectSymbol(doc, 'US30');
    setValue(doc, 'distance', '45');

    expect(doc.querySelector('.lotaje-hero')).toBeNull();
    expect(doc.querySelector('.lotaje-lots-value')).toBeNull();
    expect(doc.querySelector('.lotaje-copy-action')).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('keeps copy enabled when the minimum-lot warning accompanies a real 0.01 figure', () => {
    const doc = freshDoc();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    mount(doc, targetWindow(writeText));
    setValue(doc, 'balance', '100');
    setValue(doc, 'riskPct', '0.1');
    selectSymbol(doc, 'US30');
    setValue(doc, 'distance', '50');

    expect(doc.querySelector('.lotaje-floor-warning')?.textContent).toBe(
      'El mínimo de 0.01 lotes arriesga $0.50, por encima de los $0.10 solicitados.',
    );
    expect(doc.querySelector('.lotaje-lots-value')?.textContent).toBe('0.01');
    const button = doc.querySelector<HTMLButtonElement>('.lotaje-copy-action')!;
    expect(button.disabled).toBe(false);
    button.click();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('0.01');
  });

  it('ignores fulfilled and rejected writes from an old mount after a later mount replaces it', async () => {
    vi.useFakeTimers();
    const fulfilledWrite = deferred<void>();
    const docA = freshDoc();
    mount(docA, targetWindow(vi.fn().mockReturnValue(fulfilledWrite.promise)));
    driveRealLot(docA);
    docA.querySelector<HTMLButtonElement>('.lotaje-copy-action')!.click();

    const docB = freshDoc();
    mount(docB, targetWindow(vi.fn().mockResolvedValue(undefined)));
    fulfilledWrite.resolve(undefined);
    await settleMicrotasks();
    expect(docB.querySelector('.lotaje-copy-feedback')?.textContent).toBe('');
    expect(docB.querySelector('.lotaje-copy-action--copied')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    const rejectedWrite = deferred<void>();
    const docC = freshDoc();
    mount(docC, targetWindow(vi.fn().mockReturnValue(rejectedWrite.promise)));
    driveRealLot(docC);
    docC.querySelector<HTMLButtonElement>('.lotaje-copy-action')!.click();

    const docD = freshDoc();
    mount(docD, targetWindow(vi.fn().mockResolvedValue(undefined)));
    rejectedWrite.reject(new Error('denied'));
    await settleMicrotasks();
    expect(docD.querySelector('.lotaje-copy-feedback')?.textContent).toBe('');
    expect(docD.querySelector('.lotaje-copy-action--copied')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  // Wave 4 audit L-2: `copyAttemptGeneration` (isCurrentCopyAttempt) is the
  // ONLY one of the three stale-settlement guards this exercises — mount
  // generation and `currentRoot.contains(button)` are unchanged here (same
  // mount, same button, no render between the two clicks). Two copy
  // activations on the SAME button with no intervening render: the second
  // click fulfils first (`Copiado` + its timer), then the first click's
  // write rejects. Without the generation guard, that stale rejection would
  // overwrite the real success with `No se pudo copiar` and clear its timer.
  it('a stale rejection from an earlier click on the same button does not override a later success', async () => {
    vi.useFakeTimers();
    const firstWrite = deferred<void>();
    const secondWrite = deferred<void>();
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockReturnValueOnce(firstWrite.promise)
      .mockReturnValueOnce(secondWrite.promise);
    const target = targetWindow(writeText);
    const doc = freshDoc();
    mount(doc, target);
    driveRealLot(doc);

    const button = doc.querySelector<HTMLButtonElement>('.lotaje-copy-action')!;
    button.click(); // attempt 1 (never settles until after attempt 2)
    button.click(); // attempt 2, same button/feedback nodes, no render between

    secondWrite.resolve(undefined);
    await settleMicrotasks();
    expect(doc.querySelector('.lotaje-copy-feedback')?.textContent).toBe('Copiado');
    expect(button.classList.contains('lotaje-copy-action--copied')).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    firstWrite.reject(new Error('denied'));
    await settleMicrotasks();

    expect(doc.querySelector('.lotaje-copy-feedback')?.textContent).toBe('Copiado');
    expect(button.classList.contains('lotaje-copy-action--copied')).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('clears an active success timer on unmount and cannot clear or update a later mount', async () => {
    vi.useFakeTimers();
    const firstDoc = freshDoc();
    const firstTarget = targetWindow(vi.fn().mockResolvedValue(undefined));
    mount(firstDoc, firstTarget);
    driveRealLot(firstDoc);
    firstDoc.querySelector<HTMLButtonElement>('.lotaje-copy-action')!.click();
    await settleMicrotasks();
    expect(firstDoc.querySelector('.lotaje-copy-feedback')?.textContent).toBe('Copiado');
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(firstTarget.clearTimeout).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    const laterDoc = freshDoc();
    mount(laterDoc, targetWindow(vi.fn().mockResolvedValue(undefined)));
    vi.advanceTimersByTime(1201);
    expect(laterDoc.querySelector('.lotaje-copy-feedback')?.textContent).toBe('');
    expect(laterDoc.querySelector('.lotaje-copy-action--copied')).toBeNull();
  });

  it('the method toggle rebuilds Zone 2 (distance field <-> entry/SL fields) and converts, never resets', () => {
    const doc = freshDoc();
    mount(doc, window);
    setValue(doc, 'distance', '50');
    expect(doc.querySelector('input[name="distance"]')).not.toBeNull();
    expect(doc.querySelector('input[name="entry"]')).toBeNull();

    methodOption(doc, 'prices').click();

    expect(doc.querySelector('input[name="distance"]')).toBeNull();
    expect(doc.querySelector('input[name="entry"]')).not.toBeNull();
    expect(doc.querySelector('input[name="sl"]')).not.toBeNull();

    methodOption(doc, 'distance').click();

    // Back to distance: the value survives the round trip (nothing typed is lost).
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('50');
  });

  it('the mode control is a two-option radio group that shows only the active mode fields (F21-1)', () => {
    const doc = freshDoc();
    mount(doc, window);

    const group = doc.querySelector<HTMLElement>('.lotaje-method-toggle')!;
    const points = methodOption(doc, 'distance');
    const prices = methodOption(doc, 'prices');
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(group.getAttribute('aria-labelledby')).toBe('lotaje-method-label');
    expect(doc.querySelector('#lotaje-method-label')?.textContent).toBe('Modo');
    expect([points.textContent, prices.textContent]).toEqual(['Distancia', 'Precios']);
    expect([points.getAttribute('role'), prices.getAttribute('role')]).toEqual(['radio', 'radio']);

    // Distancia: exactly one field, named «Distancia» — no reserved Entrada/SL row.
    expect(checkedMethod(doc)).toBe('distance');
    expect(points.classList.contains('lotaje-method-option--selected')).toBe(true);
    expect(prices.getAttribute('aria-checked')).toBe('false');
    expect(doc.querySelector('label[for="lotaje-distance"]')?.textContent).toBe('Distancia');
    expect(doc.querySelectorAll('.lotaje-question-fields .lotaje-field-group')).toHaveLength(1);
    expect(doc.querySelector('.lotaje-field-entry')).toBeNull();
    expect(doc.querySelector('.lotaje-field-sl')).toBeNull();

    prices.click();

    // Precios: Entrada above SL, and the distance field is gone entirely.
    expect(checkedMethod(doc)).toBe('prices');
    expect(prices.classList.contains('lotaje-method-option--selected')).toBe(true);
    expect(points.classList.contains('lotaje-method-option--selected')).toBe(false);
    const groups = Array.from(
      doc.querySelectorAll<HTMLElement>('.lotaje-question-fields .lotaje-field-group'),
    );
    expect(groups).toHaveLength(2);
    expect(groups.map((field) => field.querySelector('label')?.textContent)).toEqual([
      'Entrada',
      'SL',
    ]);
    expect(doc.querySelector('.lotaje-field-stop')).toBeNull();

    // Re-picking the already-active mode is a no-op, not a second conversion.
    setValue(doc, 'entry', '40000');
    setValue(doc, 'sl', '39950');
    prices.click();
    expect(checkedMethod(doc)).toBe('prices');
    expect(doc.querySelector<HTMLInputElement>('input[name="entry"]')?.value).toBe('40000');
    expect(doc.querySelector<HTMLInputElement>('input[name="sl"]')?.value).toBe('39950');
  });

  it('the mode group is one tab stop and an arrow key both moves and switches', () => {
    const doc = freshFocusableDoc();
    mount(doc, window, state({ distanceText: '50' }));
    const points = methodOption(doc, 'distance');
    const prices = methodOption(doc, 'prices');

    // Roving tabindex: only the checked option is in the tab order.
    expect([points.tabIndex, prices.tabIndex]).toEqual([0, -1]);

    points.focus();
    const arrow = dispatchKey(points, 'ArrowRight');
    expect(arrow.defaultPrevented).toBe(true);
    expect(checkedMethod(doc)).toBe('prices');
    expect(doc.activeElement).toBe(prices);
    expect([points.tabIndex, prices.tabIndex]).toEqual([-1, 0]);

    dispatchKey(prices, 'ArrowLeft');
    expect(checkedMethod(doc)).toBe('distance');
    expect(doc.activeElement).toBe(points);
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('50');
  });

  it('cold two-argument mount focuses Cuenta and selects its complete default text', () => {
    const doc = freshFocusableDoc();

    mount(doc, window);

    const balance = doc.querySelector<HTMLInputElement>('input[name="balance"]')!;
    expect(doc.activeElement).toBe(balance);
    expect(balance.value).toBe('10000');
    expect(balance.selectionStart).toBe(0);
    expect(balance.selectionEnd).toBe(5);
  });

  it('restored Method B context focuses the distance question even when its stop is blank', () => {
    const doc = freshFocusableDoc();

    mount(doc, window, state({ distanceText: '' }));

    expect(doc.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('10000');
    expect(doc.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe('1');
    expect(shownSymbol(doc)).toBe('US30');
    const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    expect(distance.value).toBe('');
    expect(doc.activeElement).toBe(distance);
  });

  it('restored Method A context focuses the literal SL input rather than Entrada', () => {
    const doc = freshFocusableDoc();

    mount(doc, window, state({ method: 'prices', entryText: '40000', slText: '39955' }));

    const entry = doc.querySelector<HTMLInputElement>('input[name="entry"]')!;
    const sl = doc.querySelector<HTMLInputElement>('input[name="sl"]')!;
    expect(entry.value).toBe('40000');
    expect(sl.value).toBe('39955');
    expect(doc.activeElement).toBe(sl);
    expect(doc.activeElement).not.toBe(entry);
    expect(sl.selectionStart).toBe(0);
    expect(sl.selectionEnd).toBe(5);
  });

  it('initial state is copied and guarded per field without retaining the caller object', () => {
    const caller = {
      balanceText: '25000',
      riskPctText: 2,
      symbolText: 'US30',
      method: 'bogus',
      distanceText: 45,
      entryText: '40000',
      slText: '39955',
      unknown: 'discard me',
    };
    const doc = freshFocusableDoc();

    mount(doc, window, caller as unknown as LotajeState);

    expect(doc.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('25000');
    expect(doc.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe('1');
    expect(shownSymbol(doc)).toBe('US30');
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('');
    expect(doc.querySelector('input[name="entry"]')).toBeNull();
    caller.balanceText = '99999';
    caller.symbolText = 'XAUUSD';
    const liveRisk = doc.querySelector<HTMLInputElement>('input[name="riskPct"]')!;
    liveRisk.dispatchEvent(new Event('input'));
    expect(doc.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('25000');
    expect(shownSymbol(doc)).toBe('US30');

    const whitespaceDoc = freshFocusableDoc();
    mount(whitespaceDoc, window, state({ symbolText: '   ' }));
    // Whitespace-only is not a symbol: the trigger shows its empty label while
    // the raw text is kept verbatim in state (what persistence round-trips).
    expect(shownSymbol(whitespaceDoc)).toBe('Símbolo');
    expect(getMountedState().symbolText).toBe('   ');
    expect(whitespaceDoc.activeElement).toBe(whitespaceDoc.querySelector('input[name="balance"]'));

    const infinityDoc = freshFocusableDoc();
    mount(infinityDoc, window, state({ riskPctText: 'Infinity' }));
    expect(infinityDoc.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe(
      'Infinity',
    );
    expect(infinityDoc.activeElement).toBe(infinityDoc.querySelector('input[name="balance"]'));
  });

  it('focus selects the content of every numeric field, in both methods', () => {
    const doc = freshFocusableDoc();
    mount(doc, window, state({ entryText: '40000', slText: '39955' }));
    const trigger = doc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger')!;

    const expectSelectedOnFocus = (input: HTMLInputElement): void => {
      trigger.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      input.focus();
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
    };

    expectSelectedOnFocus(doc.querySelector<HTMLInputElement>('input[name="balance"]')!);
    expectSelectedOnFocus(doc.querySelector<HTMLInputElement>('input[name="riskPct"]')!);
    expectSelectedOnFocus(doc.querySelector<HTMLInputElement>('input[name="distance"]')!);

    methodOption(doc, 'prices').click();
    expectSelectedOnFocus(doc.querySelector<HTMLInputElement>('input[name="entry"]')!);
    expectSelectedOnFocus(doc.querySelector<HTMLInputElement>('input[name="sl"]')!);
  });

  it('Escape in Method B clears only distance and preserves all context', () => {
    const doc = freshFocusableDoc();
    mount(doc, window, state({ entryText: '40000', slText: '39955' }));
    const balance = doc.querySelector<HTMLInputElement>('input[name="balance"]')!;
    balance.focus();

    const escape = dispatchKey(balance, 'Escape');

    expect(escape.defaultPrevented).toBe(false);
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('');
    expect(doc.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('10000');
    expect(doc.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe('1');
    expect(shownSymbol(doc)).toBe('US30');
    expect(checkedMethod(doc)).toBe('distance');

    methodOption(doc, 'prices').click();
    expect(doc.querySelector<HTMLInputElement>('input[name="entry"]')?.value).toBe('40000');
    expect(doc.querySelector<HTMLInputElement>('input[name="sl"]')?.value).toBe('39955');
  });

  it('Escape in Method A clears only literal SL and preserves entry and distance memory', () => {
    const doc = freshFocusableDoc();
    mount(doc, window, state({ method: 'prices', entryText: '40000', slText: '39955' }));
    const balance = doc.querySelector<HTMLInputElement>('input[name="balance"]')!;
    balance.focus();

    const escape = dispatchKey(balance, 'Escape');

    expect(escape.defaultPrevented).toBe(false);
    expect(doc.querySelector<HTMLInputElement>('input[name="sl"]')?.value).toBe('');
    expect(doc.querySelector<HTMLInputElement>('input[name="entry"]')?.value).toBe('40000');
    expect(doc.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('10000');
    expect(doc.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe('1');
    expect(shownSymbol(doc)).toBe('US30');
    expect(checkedMethod(doc)).toBe('prices');

    methodOption(doc, 'distance').click();
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('45');
  });

  it('Arrow keys step an FX distance in displayed pips by 1 or 10', () => {
    const doc = freshFocusableDoc();
    mount(doc, window, state({ symbolText: 'EURUSD' }));
    const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    const expectDistance = (value: string): void => {
      expect(doc.querySelector('.lotaje-stop-unit')?.textContent).toBe('pips');
      expect(distance.value).toBe(value);
      expect(doc.querySelector('input[name="distance"]')).toBe(distance);
    };
    const step = (key: 'ArrowUp' | 'ArrowDown', shiftKey = false): void => {
      distance.focus();
      const event = dispatchKey(distance, key, { shiftKey });
      expect(event.defaultPrevented).toBe(true);
    };

    expectDistance('45');
    step('ArrowUp');
    expectDistance('46');
    step('ArrowUp', true);
    expectDistance('56');
    step('ArrowDown');
    expectDistance('55');
    step('ArrowDown', true);
    expectDistance('45');
  });

  it('Arrow keys step a non-FX distance in displayed points by 1 or 10', () => {
    const doc = freshFocusableDoc();
    mount(doc, window, state({ symbolText: 'US30' }));
    const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    const expectDistance = (value: string): void => {
      expect(doc.querySelector('.lotaje-stop-unit')?.textContent).toBe('pts');
      expect(distance.value).toBe(value);
      expect(doc.querySelector('input[name="distance"]')).toBe(distance);
    };
    const step = (key: 'ArrowUp' | 'ArrowDown', shiftKey = false): void => {
      distance.focus();
      const event = dispatchKey(distance, key, { shiftKey });
      expect(event.defaultPrevented).toBe(true);
    };

    expectDistance('45');
    step('ArrowUp');
    expectDistance('46');
    step('ArrowUp', true);
    expectDistance('56');
    step('ArrowDown');
    expectDistance('55');
    step('ArrowDown', true);
    expectDistance('45');
  });

  it('explicit stepping defines blank invalid comma negative and zero-floor behavior without rewriting ordinary typing', () => {
    const doc = freshFocusableDoc();
    mount(doc, window, state({ distanceText: '' }));
    const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    const step = (
      raw: string,
      key: 'ArrowUp' | 'ArrowDown',
      expected: string,
      shiftKey = false,
    ): void => {
      setValue(doc, 'distance', raw);
      distance.focus();
      const event = dispatchKey(distance, key, { shiftKey });
      expect(event.defaultPrevented).toBe(true);
      expect(distance.value).toBe(expected);
    };

    step('', 'ArrowUp', '1');
    step('abc', 'ArrowUp', '10', true);
    step('abc', 'ArrowDown', '0');
    step('-3', 'ArrowUp', '1');
    step('0.5', 'ArrowDown', '0');
    setValue(doc, 'distance', '1,5');
    expect(distance.value).toBe('1,5');
    distance.focus();
    const commaStep = dispatchKey(distance, 'ArrowUp');
    expect(commaStep.defaultPrevented).toBe(true);
    expect(distance.value).toBe('2.5');
  });

  it('native touch steppers flank only Method B and share its single-step behavior', () => {
    const doc = freshFocusableDoc();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    mount(doc, targetWindow(writeText), state({ entryText: '40000', slText: '39955' }));
    const wrapper = doc.querySelector<HTMLElement>('.lotaje-distance-control')!;
    const field = doc.querySelector<HTMLElement>('.lotaje-field-stop')!;
    const decrement = doc.querySelector<HTMLButtonElement>(
      '.lotaje-stop-step[aria-label="Disminuir distancia del stop"]',
    )!;
    const increment = doc.querySelector<HTMLButtonElement>(
      '.lotaje-stop-step[aria-label="Aumentar distancia del stop"]',
    )!;
    expect(decrement.tagName).toBe('BUTTON');
    expect(decrement.type).toBe('button');
    expect(decrement.textContent).toBe('-');
    expect(increment.tagName).toBe('BUTTON');
    expect(increment.type).toBe('button');
    expect(increment.textContent).toBe('+');
    expect(Array.from(wrapper.children)).toEqual([decrement, field, increment]);

    increment.click();
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('46');
    decrement.click();
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('45');
    expect(writeText).not.toHaveBeenCalled();

    methodOption(doc, 'prices').click();
    expect(doc.querySelector('.lotaje-distance-control')).toBeNull();
    expect(doc.querySelector('.lotaje-stop-step')).toBeNull();
    const entry = doc.querySelector<HTMLInputElement>('input[name="entry"]')!;
    const sl = doc.querySelector<HTMLInputElement>('input[name="sl"]')!;
    const entryBefore = entry.value;
    const slBefore = sl.value;
    entry.focus();
    const entryArrow = dispatchKey(entry, 'ArrowUp');
    expect(entryArrow.defaultPrevented).toBe(false);
    expect(entry.value).toBe(entryBefore);
    sl.focus();
    const slArrow = dispatchKey(sl, 'ArrowUp');
    expect(slArrow.defaultPrevented).toBe(false);
    expect(sl.value).toBe(slBefore);
  });

  it('Enter copies the exact current lot from every editable field through the target realm and never ambiently or automatically', () => {
    const targetWriteText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const ambientWriteText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const distanceDoc = freshFocusableDoc();
    const distanceWindow = targetWindow(targetWriteText);
    const pricesDoc = freshFocusableDoc();
    const pricesWindow = targetWindow(targetWriteText);
    instrumentAmbientClipboard(ambientWriteText);

    mount(distanceDoc, distanceWindow, state());
    expect(targetWriteText).not.toHaveBeenCalled();
    expect(ambientWriteText).not.toHaveBeenCalled();
    for (const name of ['balance', 'riskPct', 'distance']) {
      const input = distanceDoc.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
      input.focus();
      const enter = dispatchKey(input, 'Enter');
      expect(enter.defaultPrevented).toBe(true);
    }

    mount(
      pricesDoc,
      pricesWindow,
      state({ method: 'prices', entryText: '40000', slText: '39955' }),
    );
    for (const name of ['balance', 'riskPct', 'entry', 'sl']) {
      const input = pricesDoc.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
      input.focus();
      const enter = dispatchKey(input, 'Enter');
      expect(enter.defaultPrevented).toBe(true);
    }

    expect(distanceWindow).not.toBe(pricesWindow);
    expect(targetWriteText).toHaveBeenCalledTimes(7);
    expect(targetWriteText.mock.calls.map(([payload]) => payload)).toEqual(
      Array<string>(7).fill('2.22'),
    );
    expect(ambientWriteText).not.toHaveBeenCalled();
  });

  it('Enter leaves copy, combobox, listbox and stepper activation to native semantics without double fire', () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const contrastDoc = freshFocusableDoc();
    mount(contrastDoc, targetWindow(writeText), state());
    const contrastDistance = contrastDoc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    contrastDistance.focus();
    expect(dispatchKey(contrastDistance, 'Enter').defaultPrevented).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);

    writeText.mockClear();
    const doc = freshFocusableDoc();
    mount(doc, targetWindow(writeText), state());

    const copy = doc.querySelector<HTMLButtonElement>('.lotaje-copy-action')!;
    copy.focus();
    const copyEnter = dispatchKey(copy, 'Enter');
    copy.click();
    expect(copyEnter.defaultPrevented).toBe(false);
    expect(writeText).toHaveBeenCalledTimes(1);

    writeText.mockClear();
    const trigger = doc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger')!;
    trigger.focus();
    const triggerEnter = dispatchKey(trigger, 'Enter');
    trigger.click();
    expect(triggerEnter.defaultPrevented).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(writeText).not.toHaveBeenCalled();

    const option = doc.querySelector<HTMLButtonElement>(
      '.lotaje-asset-option[data-symbol="XAUUSD"]',
    )!;
    option.focus();
    const optionEnter = dispatchKey(option, 'Enter');
    option.click();
    expect(optionEnter.defaultPrevented).toBe(false);
    expect(shownSymbol(doc)).toBe('XAUUSD');
    expect(writeText).not.toHaveBeenCalled();

    const increment = doc.querySelector<HTMLButtonElement>(
      '.lotaje-stop-step[aria-label="Aumentar distancia del stop"]',
    )!;
    increment.focus();
    const incrementEnter = dispatchKey(increment, 'Enter');
    increment.click();
    expect(incrementEnter.defaultPrevented).toBe(false);
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('46');
    expect(writeText).not.toHaveBeenCalled();

    const decrement = doc.querySelector<HTMLButtonElement>(
      '.lotaje-stop-step[aria-label="Disminuir distancia del stop"]',
    )!;
    decrement.focus();
    const decrementEnter = dispatchKey(decrement, 'Enter');
    decrement.click();
    expect(decrementEnter.defaultPrevented).toBe(false);
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('45');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('root key filtering prevents only consumed Arrow and editable Enter actions', () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const doc = freshFocusableDoc();
    mount(doc, targetWindow(writeText), state());
    const balance = doc.querySelector<HTMLInputElement>('input[name="balance"]')!;
    balance.focus();

    const balanceArrow = dispatchKey(balance, 'ArrowUp');
    expect(balanceArrow.defaultPrevented).toBe(false);
    expect(balance.value).toBe('10000');
    for (const init of [
      { shiftKey: true },
      { isComposing: true },
      { altKey: true },
      { ctrlKey: true },
      { metaKey: true },
    ]) {
      const ignoredEnter = dispatchKey(balance, 'Enter', init);
      expect(ignoredEnter.defaultPrevented).toBe(false);
    }
    const alreadyPrevented = dispatchPreventedKey(balance, 'Enter');
    expect(alreadyPrevented.defaultPrevented).toBe(true);
    expect(writeText).not.toHaveBeenCalled();

    for (const key of ['m', 'a', 's']) {
      const shortcut = dispatchKey(balance, key, { altKey: true });
      expect(shortcut.defaultPrevented).toBe(false);
    }
    expect(checkedMethod(doc)).toBe('distance');
    expect(
      doc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger')?.getAttribute('aria-expanded'),
    ).toBe('false');
    expect(doc.activeElement).toBe(balance);

    const disabledDoc = freshFocusableDoc();
    mount(disabledDoc, targetWindow(writeText), state({ distanceText: '' }));
    const disabledBalance = disabledDoc.querySelector<HTMLInputElement>('input[name="balance"]')!;
    disabledBalance.focus();
    const disabledEnter = dispatchKey(disabledBalance, 'Enter');
    expect(disabledEnter.defaultPrevented).toBe(false);
    expect(writeText).not.toHaveBeenCalled();

    const handledDoc = freshFocusableDoc();
    mount(handledDoc, targetWindow(writeText), state());
    const handledDistance = handledDoc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    handledDistance.focus();
    const handledArrow = dispatchKey(handledDistance, 'ArrowUp');
    expect(handledArrow.defaultPrevented).toBe(true);
    expect(handledDistance.value).toBe('46');
    const handledEnter = dispatchKey(handledDistance, 'Enter');
    expect(handledEnter.defaultPrevented).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    const handledEscape = dispatchKey(handledDistance, 'Escape');
    expect(handledEscape.defaultPrevented).toBe(false);
    expect(handledDistance.value).toBe('');
  });

  // ---- D-7: companion-only Alt+M / Alt+S shortcuts --------------------------
  describe('D-7 companion-only Alt shortcuts', () => {
    it('stay inert in the page host — no preventDefault, and no method/focus effect either', () => {
      const doc = freshFocusableDoc(); // the page host: never stamped `data-lotaje-companion`.
      mount(doc, window, state({ distanceText: '45' }));
      const assetTrigger = doc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger')!;
      const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
      distance.focus();

      for (const key of ['m', 'a', 's']) {
        const event = dispatchKey(distance, key, { altKey: true });
        expect(event.defaultPrevented).toBe(false);
      }

      // Pin the EFFECT, not just the flag: a handler that acts but forgets
      // `preventDefault` would still pass the loop above.
      expect(checkedMethod(doc)).toBe('distance');
      expect(assetTrigger.getAttribute('aria-expanded')).toBe('false');
      expect(doc.activeElement).toBe(distance);
      expect(distance.value).toBe('45');
    });

    it('Alt+M converts distance to prices in the companion, keeping entry and deriving SL (P4)', () => {
      const doc = freshCompanionDoc();
      // Blank symbol resolves to `pipSize: null` (asset-registry.ts), so the
      // display unit and the price unit are the same magnitude — the
      // conversion arithmetic below does not also have to reproduce a
      // specific instrument's pip size.
      mount(doc, window, state({ symbolText: '', distanceText: '50', entryText: '40000' }));
      const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
      distance.focus();

      const event = dispatchKey(distance, 'm', { altKey: true });

      expect(event.defaultPrevented).toBe(true);
      expect(checkedMethod(doc)).toBe('prices');
      expect(doc.querySelector<HTMLInputElement>('input[name="entry"]')?.value).toBe('40000');
      expect(doc.querySelector<HTMLInputElement>('input[name="sl"]')?.value).toBe('39950');
    });

    it('Alt+M alternates even when the already-active mode is Prices — the pick-not-flip regression', () => {
      // Starting in `prices` (not the P2 default `distance`) is the point:
      // the segmented control's own click path (`onMethodOptionClick`)
      // early-returns when asked to select the CURRENTLY active method, so a
      // handler that mistakenly "clicks the active option" would silently
      // no-op here forever, on both presses.
      const doc = freshCompanionDoc();
      mount(
        doc,
        window,
        state({ symbolText: '', method: 'prices', entryText: '40000', slText: '39950' }),
      );
      const balance = doc.querySelector<HTMLInputElement>('input[name="balance"]')!;
      balance.focus();

      const toDistance = dispatchKey(balance, 'm', { altKey: true });
      expect(toDistance.defaultPrevented).toBe(true);
      expect(checkedMethod(doc)).toBe('distance');
      expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('50');

      const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
      const toPrices = dispatchKey(distance, 'm', { altKey: true });
      expect(toPrices.defaultPrevented).toBe(true);
      expect(checkedMethod(doc)).toBe('prices');
      // Exact round trip: the SAME conversion path ran a second time rather
      // than being stuck (a "no-op forever" bug would leave this at `distance`).
      expect(doc.querySelector<HTMLInputElement>('input[name="entry"]')?.value).toBe('40000');
      expect(doc.querySelector<HTMLInputElement>('input[name="sl"]')?.value).toBe('39950');
    });

    /**
     * `Alt+A` belonged to «Especificaciones del activo» and went away with
     * it. The risk-settings disclosure that now occupies the header did NOT
     * inherit the combo — it has a real, labelled, tab-reachable trigger. The
     * combo must be genuinely inert, not silently rebound: this asserts it
     * neither claims the key nor moves any of the state it could plausibly
     * have been repointed at.
     */
    it('Alt+A is inert in the companion — the removed disclosure left no shortcut behind', () => {
      const doc = freshCompanionDoc();
      mount(doc, window, state());
      const settingsTrigger = doc.querySelector<HTMLButtonElement>('.lotaje-settings-trigger')!;
      const panel = doc.querySelector<HTMLElement>('#lotaje-risk-settings')!;
      const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
      distance.focus();

      const event = dispatchKey(distance, 'a', { altKey: true });

      expect(event.defaultPrevented).toBe(false);
      expect(settingsTrigger.getAttribute('aria-expanded')).toBe('false');
      expect(panel.hidden).toBe(true);
      expect(checkedMethod(doc)).toBe('distance');
      expect(doc.activeElement).toBe(distance);
    });

    it('Alt+S moves focus to the asset trigger from anywhere in the companion, without opening its menu', () => {
      const doc = freshCompanionDoc();
      mount(doc, window, state());
      const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
      distance.focus();
      const assetTrigger = doc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger')!;
      expect(doc.activeElement).not.toBe(assetTrigger);

      const event = dispatchKey(distance, 's', { altKey: true });

      expect(event.defaultPrevented).toBe(true);
      expect(doc.activeElement).toBe(assetTrigger);
      expect(assetTrigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('ignores Ctrl/Meta-carrying combos and a bare "m", leaving the method untouched and the key unhandled', () => {
      const doc = freshCompanionDoc();
      mount(doc, window, state());
      const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
      distance.focus();

      for (const init of [
        { ctrlKey: true },
        { metaKey: true },
        { altKey: true, ctrlKey: true },
        { altKey: true, metaKey: true },
        {},
      ]) {
        const event = dispatchKey(distance, 'm', init);
        expect(event.defaultPrevented).toBe(false);
        expect(checkedMethod(doc)).toBe('distance');
      }
    });

    it('leaves Enter, Escape, and Arrow behaviour unchanged in the companion (guards against duplicating D-5)', () => {
      const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
      const doc = freshCompanionDoc();
      mount(doc, targetWindow(writeText), state());
      const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
      distance.focus();

      const arrow = dispatchKey(distance, 'ArrowUp');
      expect(arrow.defaultPrevented).toBe(true);
      expect(distance.value).toBe('46');

      const enter = dispatchKey(distance, 'Enter');
      expect(enter.defaultPrevented).toBe(true);
      expect(writeText).toHaveBeenCalledTimes(1);

      const escape = dispatchKey(distance, 'Escape');
      expect(escape.defaultPrevented).toBe(false);
      expect(distance.value).toBe('');
    });
  });

  it('unmount removes root focus and key listeners and remount handles each event once', () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const oldDoc = freshFocusableDoc();
    mount(oldDoc, targetWindow(writeText), state());
    const oldRoot = oldDoc.querySelector<HTMLElement>('.lotaje-root')!;
    const oldBalance = oldDoc.querySelector<HTMLInputElement>('input[name="balance"]')!;
    const oldDistance = oldDoc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    const removeListenerSpy = vi.spyOn(oldRoot, 'removeEventListener');

    unmount();

    const focusRemovals = removeListenerSpy.mock.calls.filter(([type]) => type === 'focusin');
    const keyRemovals = removeListenerSpy.mock.calls.filter(([type]) => type === 'keydown');
    expect(focusRemovals).toHaveLength(1);
    expect(focusRemovals[0]?.[1]).toEqual(expect.any(Function));
    expect(keyRemovals).toHaveLength(1);
    expect(keyRemovals[0]?.[1]).toEqual(expect.any(Function));

    const newDoc = freshFocusableDoc();
    mount(newDoc, targetWindow(writeText), state());
    oldBalance.setSelectionRange(oldBalance.value.length, oldBalance.value.length);
    oldBalance.dispatchEvent(new oldDoc.defaultView!.FocusEvent('focusin', { bubbles: true }));
    dispatchKey(oldDistance, 'ArrowUp');
    dispatchKey(oldDistance, 'Escape');
    dispatchKey(oldDistance, 'Enter');
    expect(oldBalance.selectionStart).toBe(oldBalance.value.length);
    expect(oldDistance.value).toBe('45');
    expect(newDoc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('45');
    expect(writeText).not.toHaveBeenCalled();

    const newDistance = newDoc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    newDistance.focus();
    dispatchKey(newDistance, 'ArrowUp');
    expect(newDistance.value).toBe('46');
    dispatchKey(newDistance, 'Enter');
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('D-5 state actions preserve D-4 symbol state and D-3 generation guards', async () => {
    const pendingWrite = deferred<void>();
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockReturnValueOnce(pendingWrite.promise)
      .mockResolvedValue(undefined);
    const target = targetWindow(writeText);
    const doc = freshFocusableDoc();
    mount(doc, target, state());
    const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    distance.focus();

    const firstEnter = dispatchKey(distance, 'Enter');
    expect(firstEnter.defaultPrevented).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    dispatchKey(distance, 'ArrowUp');
    pendingWrite.resolve(undefined);
    await settleMicrotasks();

    expect(doc.querySelector('.lotaje-copy-feedback')?.textContent).toBe('');
    expect(doc.querySelector('.lotaje-copy-action--copied')).toBeNull();
    expect(target.setTimeout).not.toHaveBeenCalled();
    expect(shownSymbol(doc)).toBe('US30');
    const escape = dispatchKey(distance, 'Escape');
    expect(escape.defaultPrevented).toBe(false);
    expect(shownSymbol(doc)).toBe('US30');

    setValue(doc, 'distance', '45');
    distance.focus();
    const currentEnter = dispatchKey(distance, 'Enter');
    expect(currentEnter.defaultPrevented).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(writeText).toHaveBeenLastCalledWith('2.22');
    await settleMicrotasks();
    expect(doc.querySelector('.lotaje-copy-feedback')?.textContent).toBe('Copiado');
    expect(target.setTimeout).toHaveBeenCalledTimes(1);
  });

  it('IN-01 absent cold mount reads the supplied realm once, writes zero times, and focuses Cuenta with P2 defaults', () => {
    const storage = fakeStorage();
    const win = persistedWindow(storage);
    const doc = freshFocusableDoc();

    mount(doc, win);

    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.getItem).toHaveBeenCalledWith(LOTAJE_STORAGE_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
    const balance = doc.querySelector<HTMLInputElement>('input[name="balance"]')!;
    expect(balance.value).toBe('10000');
    expect(doc.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe('1');
    expect(shownSymbol(doc)).toBe('Símbolo');
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('');
    expect(doc.activeElement).toBe(balance);
    expect(balance.selectionStart).toBe(0);
    expect(balance.selectionEnd).toBe(5);
  });

  it('IN-02 corrupt cold mount: malformed JSON and a malformed root each stay P2-cold with no mount write', () => {
    const jsonStorage = fakeStorage({ [LOTAJE_STORAGE_KEY]: 'not json {' });
    const jsonWin = persistedWindow(jsonStorage);
    const jsonDoc = freshFocusableDoc();
    mount(jsonDoc, jsonWin);
    const jsonBalance = jsonDoc.querySelector<HTMLInputElement>('input[name="balance"]')!;
    expect(jsonBalance.value).toBe('10000');
    expect(jsonDoc.activeElement).toBe(jsonBalance);
    expect(jsonStorage.setItem).not.toHaveBeenCalled();

    const rootStorage = fakeStorage({ [LOTAJE_STORAGE_KEY]: JSON.stringify([1, 2, 3]) });
    const rootWin = persistedWindow(rootStorage);
    const rootDoc = freshFocusableDoc();
    mount(rootDoc, rootWin);
    const rootBalance = rootDoc.querySelector<HTMLInputElement>('input[name="balance"]')!;
    expect(rootBalance.value).toBe('10000');
    expect(rootDoc.activeElement).toBe(rootBalance);
    expect(rootStorage.setItem).not.toHaveBeenCalled();
  });

  it('IN-03 restored Method B: omitted mount restores raw context, leaves distance blank, and focuses distance without a write', () => {
    const storage = fakeStorage({
      [LOTAJE_STORAGE_KEY]: JSON.stringify({
        v: 1,
        balanceText: '25000',
        riskPctText: '2',
        symbolText: 'US30',
        method: 'distance',
      }),
    });
    const win = persistedWindow(storage);
    const doc = freshFocusableDoc();

    mount(doc, win);

    expect(doc.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('25000');
    expect(doc.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe('2');
    expect(shownSymbol(doc)).toBe('US30');
    const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    expect(distance.value).toBe('');
    expect(doc.activeElement).toBe(distance);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('IN-04 restored Method A/exclusions: extra runtime fields in storage restore only context, leave entry/SL blank, and focus SL', () => {
    const storage = fakeStorage({
      [LOTAJE_STORAGE_KEY]: JSON.stringify({
        v: 1,
        balanceText: '40000',
        riskPctText: '1.5',
        symbolText: 'XAUUSD',
        method: 'prices',
        distanceText: '999',
        entryText: '40000',
        slText: '39955',
        lots: 4.4,
        requestedRiskUsd: 600,
        isHeuristic: true,
        symbolDisclosureOpen: true,
        copyFeedback: 'Copiado',
        focusedField: 'sl',
      }),
    });
    const win = persistedWindow(storage);
    const doc = freshFocusableDoc();

    mount(doc, win);

    expect(doc.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('40000');
    expect(doc.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe('1.5');
    expect(shownSymbol(doc)).toBe('XAUUSD');
    const entry = doc.querySelector<HTMLInputElement>('input[name="entry"]')!;
    const sl = doc.querySelector<HTMLInputElement>('input[name="sl"]')!;
    expect(entry.value).toBe('');
    expect(sl.value).toBe('');
    expect(doc.activeElement).toBe(sl);
    expect(
      doc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger')?.getAttribute('aria-expanded'),
    ).toBe('false');
    // `symbolDisclosureOpen` above is a genuinely stale key an older build
    // wrote: the disclosure it named no longer exists, and restoring a
    // context must not resurrect any DOM for it.
    expect(doc.querySelector('.lotaje-spec-trigger')).toBeNull();
    expect(doc.querySelector('#lotaje-symbol-disclosure')).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('IN-05 explicit precedence: an explicit third argument wins over stored context and never reads storage; explicit undefined validates to P2 with no read either', () => {
    const storage = fakeStorage({
      [LOTAJE_STORAGE_KEY]: JSON.stringify({
        v: 1,
        balanceText: '99999',
        riskPctText: '9',
        symbolText: 'NAS100',
        method: 'prices',
      }),
    });
    const win = persistedWindow(storage);
    const doc = freshFocusableDoc();

    mount(
      doc,
      win,
      state({ balanceText: '12345', riskPctText: '2', symbolText: 'US30', distanceText: '45' }),
    );

    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(doc.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('12345');
    expect(doc.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe('2');
    expect(shownSymbol(doc)).toBe('US30');

    setValue(doc, 'balance', '54321');
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      LOTAJE_STORAGE_KEY,
      '{"v":1,"balanceText":"54321","riskPctText":"2","symbolText":"US30","method":"distance"}',
    );

    const undefinedStorage = fakeStorage({
      [LOTAJE_STORAGE_KEY]: JSON.stringify({
        v: 1,
        balanceText: '77777',
        riskPctText: '7',
        symbolText: 'SP500',
        method: 'prices',
      }),
    });
    const undefinedWin = persistedWindow(undefinedStorage);
    const undefinedDoc = freshFocusableDoc();

    mount(undefinedDoc, undefinedWin, undefined);

    expect(undefinedStorage.getItem).not.toHaveBeenCalled();
    expect(undefinedStorage.setItem).not.toHaveBeenCalled();
    expect(undefinedDoc.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe(
      '10000',
    );
    expect(undefinedDoc.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe('1');
    expect(shownSymbol(undefinedDoc)).toBe('Símbolo');
  });

  it('IN-06 raw round trip: comma/whitespace/leading-zero context survives unmount + omitted remount byte-for-byte while question fields reopen blank', () => {
    const storage = fakeStorage();
    const win = persistedWindow(storage);
    const doc = freshDoc();
    mount(doc, win);

    setValue(doc, 'balance', '012,345.00');
    setValue(doc, 'riskPct', ' 1.5 ');
    selectSymbol(doc, 'US30');
    setValue(doc, 'distance', '45');

    unmount();

    const reopened = freshDoc();
    mount(reopened, win);

    // Balance/risk are still stored and restored as RAW text, byte for byte.
    // The symbol is no longer free text (F21-3), so its round trip is the
    // curated value the picker committed.
    expect(reopened.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe(
      '012,345.00',
    );
    expect(reopened.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe(' 1.5 ');
    expect(shownSymbol(reopened)).toBe('US30');
    expect(getMountedState().symbolText).toBe('US30');
    expect(reopened.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('');
  });

  it('IN-07 positive trigger matrix: balance, risk, curated-symbol, and method changes each write exactly once with the exact latest JSON', () => {
    const storage = fakeStorage();
    const win = persistedWindow(storage);
    const doc = freshDoc();
    mount(doc, win);
    expect(storage.setItem).not.toHaveBeenCalled();

    setValue(doc, 'balance', '20000');
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      LOTAJE_STORAGE_KEY,
      '{"v":1,"balanceText":"20000","riskPctText":"1","symbolText":"","method":"distance"}',
    );

    setValue(doc, 'riskPct', '2');
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      LOTAJE_STORAGE_KEY,
      '{"v":1,"balanceText":"20000","riskPctText":"2","symbolText":"","method":"distance"}',
    );

    const trigger = doc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger')!;
    selectSymbol(doc, 'SP500');
    expect(storage.setItem).toHaveBeenCalledTimes(3);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      LOTAJE_STORAGE_KEY,
      '{"v":1,"balanceText":"20000","riskPctText":"2","symbolText":"SP500","method":"distance"}',
    );

    selectSymbol(doc, 'XAUUSD');
    expect(storage.setItem).toHaveBeenCalledTimes(4);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      LOTAJE_STORAGE_KEY,
      '{"v":1,"balanceText":"20000","riskPctText":"2","symbolText":"XAUUSD","method":"distance"}',
    );
    // Selecting also closes the menu — no duplicate write from that.
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(storage.setItem).toHaveBeenCalledTimes(4);

    methodOption(doc, 'prices').click();
    expect(storage.setItem).toHaveBeenCalledTimes(5);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      LOTAJE_STORAGE_KEY,
      '{"v":1,"balanceText":"20000","riskPctText":"2","symbolText":"XAUUSD","method":"prices"}',
    );
  });

  // Companion host: the risk-settings disclosure this matrix toggles only
  // exists there, and merely OPENING it must stay as write-free as every
  // other non-context action.
  it('IN-08 Method B no-trigger matrix: distance typing, stepping, Esc, disclosure toggling, and copy settlement write zero times', async () => {
    const storage = fakeStorage();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const win = persistedWindow(storage, writeText);
    const doc = freshCompanionDoc();
    mount(doc, win, state());
    expect(storage.setItem).not.toHaveBeenCalled();

    setValue(doc, 'distance', '50');
    const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    distance.focus();
    dispatchKey(distance, 'ArrowUp');
    dispatchKey(distance, 'ArrowUp', { shiftKey: true });
    dispatchKey(distance, 'Escape');

    const increment = doc.querySelector<HTMLButtonElement>(
      '.lotaje-stop-step[aria-label="Aumentar distancia del stop"]',
    )!;
    increment.click();

    const assetTrigger = doc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger')!;
    assetTrigger.click();
    assetTrigger.click();
    const settingsTrigger = doc.querySelector<HTMLButtonElement>('.lotaje-settings-trigger')!;
    settingsTrigger.click();
    settingsTrigger.click();

    distance.focus();
    const enter = dispatchKey(distance, 'Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    await settleMicrotasks();

    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('IN-09 Method A no-trigger matrix: entry typing, SL typing, Esc, focus, and Enter-copy write zero times', async () => {
    const storage = fakeStorage();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const win = persistedWindow(storage, writeText);
    const doc = freshFocusableDoc();
    mount(doc, win, state({ method: 'prices', entryText: '40000', slText: '39955' }));
    expect(storage.setItem).not.toHaveBeenCalled();

    setValue(doc, 'entry', '40100');
    setValue(doc, 'sl', '40000');
    const sl = doc.querySelector<HTMLInputElement>('input[name="sl"]')!;
    sl.focus();
    dispatchKey(sl, 'Escape');
    const entry = doc.querySelector<HTMLInputElement>('input[name="entry"]')!;
    entry.focus();
    dispatchKey(entry, 'Enter');
    await settleMicrotasks();

    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('IN-10 target realm only: omitted load and a later write hit the target double while ambient localStorage stays untouched', () => {
    const ambientGetItemSpy = vi.spyOn(window.localStorage, 'getItem');
    const ambientSetItemSpy = vi.spyOn(window.localStorage, 'setItem');
    const storage = fakeStorage();
    const win = persistedWindow(storage);
    const doc = freshDoc();

    mount(doc, win);
    setValue(doc, 'balance', '30000');

    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(ambientGetItemSpy).not.toHaveBeenCalled();
    expect(ambientSetItemSpy).not.toHaveBeenCalled();
  });

  it('IN-11 no synchronization listener: mount, transitions, unmount, and remount never touch storage listeners', () => {
    const storage = fakeStorage();
    const addEventListenerSpy = vi.fn();
    const removeEventListenerSpy = vi.fn();
    const win = {
      ...persistedWindow(storage),
      addEventListener: addEventListenerSpy,
      removeEventListener: removeEventListenerSpy,
    } as unknown as Window;
    const doc = freshDoc();

    mount(doc, win);
    setValue(doc, 'balance', '15000');
    unmount();
    mount(doc, win);

    expect(addEventListenerSpy).not.toHaveBeenCalled();
    expect(removeEventListenerSpy).not.toHaveBeenCalled();
  });

  it('IN-12 remount/read-only timing: changing backing storage while mounted does not mutate the live DOM; a later omitted remount reads the new context with no mount write', () => {
    const storage = fakeStorage({
      [LOTAJE_STORAGE_KEY]: JSON.stringify({
        v: 1,
        balanceText: '10000',
        riskPctText: '1',
        symbolText: 'US30',
        method: 'distance',
      }),
    });
    const win = persistedWindow(storage);
    const doc = freshDoc();
    mount(doc, win);
    expect(doc.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('10000');

    storage.setItem(
      LOTAJE_STORAGE_KEY,
      JSON.stringify({
        v: 1,
        balanceText: '77777',
        riskPctText: '9',
        symbolText: 'SP500',
        method: 'prices',
      }),
    );

    expect(doc.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('10000');

    unmount();
    (storage.setItem as ReturnType<typeof vi.fn>).mockClear();
    const reopened = freshDoc();
    mount(reopened, win);

    expect(reopened.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('77777');
    expect(reopened.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe('9');
    expect(shownSymbol(reopened)).toBe('SP500');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('IN-13 write-failure preservation: a throwing setItem keeps context correct in memory and D-3/D-4/D-5 behavior intact', async () => {
    const throwingStorage = {
      getItem: () => null,
      setItem: vi.fn(() => {
        throw new Error('quota exceeded');
      }),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(() => null),
      length: 0,
    } as unknown as Storage;
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const win = persistedWindow(throwingStorage, writeText);
    const doc = freshFocusableDoc();

    mount(doc, win, state());

    expect(() => setValue(doc, 'balance', '31000')).not.toThrow();
    expect(doc.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('31000');
    expect(throwingStorage.setItem).toHaveBeenCalled();

    const assetTrigger = doc.querySelector<HTMLButtonElement>('.lotaje-asset-trigger')!;
    assetTrigger.click();
    expect(assetTrigger.getAttribute('aria-expanded')).toBe('true');
    assetTrigger.click();

    const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    distance.focus();
    const enter = dispatchKey(distance, 'Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    await settleMicrotasks();
    expect(doc.querySelector('.lotaje-copy-feedback')?.textContent).toBe('Copiado');

    dispatchKey(distance, 'ArrowUp');
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('46');
    dispatchKey(distance, 'Escape');
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('');

    const removeListenerSpy = vi.spyOn(doc.querySelector('.lotaje-root')!, 'removeEventListener');
    expect(() => unmount()).not.toThrow();
    expect(removeListenerSpy.mock.calls.filter(([type]) => type === 'focusin')).toHaveLength(1);
    expect(removeListenerSpy.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);

    const reopened = freshFocusableDoc();
    expect(() => mount(reopened, win, state())).not.toThrow();
    expect(reopened.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('10000');
  });

  // ---- Task D-6 / F21-4: the «Abrir mini calculadora» launcher --------------
  it('renders the "Abrir mini calculadora" launcher as a real button in the header, not in any zone', () => {
    const doc = freshDoc();
    mount(doc, window);

    const trigger = doc.querySelector<HTMLButtonElement>('.lotaje-companion-trigger');
    expect(trigger?.tagName).toBe('BUTTON');
    expect(trigger?.type).toBe('button');
    // F21-4: named for what it opens, and placed in the header beside the
    // title — never the placeholder «Abrir ventana».
    expect(trigger?.textContent).toBe('Abrir mini calculadora');
    expect(doc.body.textContent).not.toContain('Abrir ventana');
    expect(trigger?.closest('.lotaje-header')).not.toBeNull();
    expect(trigger?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(trigger?.closest('[aria-label="Contexto"]')).toBeNull();
    expect(trigger?.closest('[aria-label="La pregunta"]')).toBeNull();
    expect(trigger?.closest('[aria-label="La respuesta"]')).toBeNull();
    // The page titles itself, and carries no close action of its own.
    expect(doc.querySelector('.lotaje-title')?.textContent).toBe('Calculadora de lotes');
    expect(doc.querySelector('.lotaje-companion-close')).toBeNull();
  });

  // `vi.mock` cannot substitute a sibling relative import under this
  // repo's Angular vitest builder ("The 'vi.mock' and related methods are
  // not supported for relative imports with the Angular unit-test system" —
  // measured, not assumed) — so this proves the wiring end to end against
  // the REAL `./companion-window`, the same way the rest of this file
  // proves behaviour against the real `mount`/`unmount`. `companion-window
  // .spec.ts` separately covers the adapter's own mechanics (PiP/popup
  // choice, singleton, teardown, style copy) for every doc/win pair — this
  // test's only job is proving the trigger hands off the CURRENTLY MOUNTED
  // doc/window, not some other pair.
  it('the trigger hands the currently mounted document/window to the real companion adapter', () => {
    const doc = freshDoc();
    const popupDoc = document.implementation.createHTMLDocument('popup');
    const popupBus = new EventTarget();
    const popup = {
      document: popupDoc,
      closed: false,
      focus: vi.fn(),
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) =>
        popupBus.addEventListener(type, listener),
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) =>
        popupBus.removeEventListener(type, listener),
      close: vi.fn(() => popupBus.dispatchEvent(new Event('pagehide'))),
    };
    const openPopup = vi.fn().mockReturnValue(popup);
    const hostWin = { open: openPopup } as unknown as Window;
    mount(doc, hostWin, state({ distanceText: '77' }));

    doc.querySelector<HTMLButtonElement>('.lotaje-companion-trigger')!.click();

    expect(openPopup).toHaveBeenCalledTimes(1);
    expect(openPopup).toHaveBeenCalledWith(
      '',
      '',
      `width=${COMPANION_WIDTH},height=${COMPANION_HEIGHT}`,
    );
    // The real adapter moved the REAL mount into `popupDoc`, carrying the
    // live distance — proof the handler forwarded THIS mount's doc/window,
    // not some other pair.
    expect(popupDoc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('77');
    expect(doc.querySelector('.lotaje-companion-placeholder')).not.toBeNull();
    expect(doc.querySelector('input[name="distance"]')).toBeNull();

    // Tear down the real adapter's own module state (a SEPARATE module from
    // this file's `unmount()`) so it cannot leak into
    // companion-window.spec.ts under this suite's isolate:false runner
    // (docs/engineering/testing.md) — mirrors a real window close.
    popup.close();
  });

  it('getMountedState() exposes the live in-memory state D-6 carries across the move', () => {
    const doc = freshDoc();
    mount(doc, window, state({ distanceText: '77' }));

    expect(getMountedState().distanceText).toBe('77');
    expect(getMountedState()).toEqual(state({ distanceText: '77' }));

    setValue(doc, 'distance', '88');
    expect(getMountedState().distanceText).toBe('88');

    // unmount() resets to INITIAL_STATE (D-6 brief §4.2) — this is exactly
    // why the adapter must read getMountedState() BEFORE calling mount() on
    // the other side, never after.
    unmount();
    expect(getMountedState()).toEqual(INITIAL_STATE);
  });

  // ---- companion composition + risk-settings disclosure --------------------
  describe('companion composition', () => {
    function pressOutside(doc: Document): void {
      const outside = doc.querySelector('.lotaje-zone--answer')!;
      const EventConstructor = doc.defaultView?.Event ?? Event;
      outside.dispatchEvent(new EventConstructor('pointerdown', { bubbles: true }));
    }

    /**
     * The 320x340 fit is a LAYOUT fact, and this suite runs on jsdom, which
     * has no layout engine — asserting pixel heights here would pass
     * vacuously and prove nothing. What this suite CAN own is the structural
     * premise the measured fit rests on: the four things the page renders and
     * the companion deliberately does not. The pixel measurement itself is a
     * browser measurement, recorded in the PR (330.9 px of content in a 340
     * px viewport, 0 px of vertical overflow).
     */
    it('omits everything the compact composition drops, and nothing else', () => {
      const doc = freshCompanionDoc();
      mount(doc, window, state({ method: 'prices', entryText: '39500', slText: '39300' }));
      const root = doc.querySelector<HTMLElement>('.lotaje-root')!;

      // 1. account/risk are not in the visible composition (they live in the
      //    header disclosure, closed).
      expect(root.querySelector('.lotaje-summary input[name="balance"]')).toBeNull();
      expect(root.querySelector('.lotaje-summary input[name="riskPct"]')).toBeNull();
      expect(root.querySelector('.lotaje-summary .lotaje-risk-usd')).toBeNull();
      // 2. the result block carries no title, hint or standing note.
      expect(root.querySelector('.lotaje-result-title')).toBeNull();
      expect(root.querySelector('.lotaje-result-hint')).toBeNull();
      expect(root.querySelector('.lotaje-result-note')).toBeNull();
      expect(root.querySelector('.lotaje-result-mark')).toBeNull();
      expect(root.querySelector('.lotaje-result-lede')).toBeNull();
      // 3. no asset-spec disclosure (asserted in full by its own spec above).
      expect(root.querySelector('.lotaje-specs')).toBeNull();

      // What IS there: activo, modo/campos, and one result block.
      expect(root.querySelector('.lotaje-asset-trigger')).not.toBeNull();
      expect(root.querySelectorAll('.lotaje-method-option')).toHaveLength(2);
      expect(
        Array.from(root.querySelectorAll('.lotaje-method-option span')).map((s) => s.textContent),
      ).toEqual(['Puntos', 'Precios']);
      expect(root.querySelector('input[name="entry"]')).not.toBeNull();
      expect(root.querySelector('input[name="sl"]')).not.toBeNull();
      expect(root.querySelectorAll('.lotaje-result')).toHaveLength(1);
      expect(root.querySelector('.lotaje-lots-value')?.textContent).toBe('0.50');
      expect(root.querySelector('.lotaje-lots-label')?.textContent).toBe('lotes');
      expect(root.querySelectorAll('.lotaje-copy-action')).toHaveLength(1);
    });

    it('the page keeps its full composition — account, risk, derived risk and the result lede', () => {
      const doc = freshDoc();
      mount(doc, window, state());
      const root = doc.querySelector<HTMLElement>('.lotaje-root')!;

      expect(root.querySelector('.lotaje-summary input[name="balance"]')).not.toBeNull();
      expect(root.querySelector('.lotaje-summary input[name="riskPct"]')).not.toBeNull();
      expect(root.querySelector('.lotaje-summary .lotaje-risk-usd')?.textContent).toBe('$100.00');
      expect(root.querySelector('.lotaje-result-title')?.textContent).toBe('Tamaño de posición');
      expect(root.querySelector('.lotaje-result-hint')).not.toBeNull();
      expect(root.querySelector('.lotaje-result-note')).not.toBeNull();
      // The page has no settings disclosure: its risk controls are never hidden.
      expect(root.querySelector('.lotaje-settings-trigger')).toBeNull();
      expect(root.querySelector('#lotaje-risk-settings')).toBeNull();
      expect(root.querySelector('.lotaje-copy-glyph')).toBeNull();
      expect(
        Array.from(root.querySelectorAll('.lotaje-method-option span')).map((s) => s.textContent),
      ).toEqual(['Distancia', 'Precios']);
    });

    it('the risk settings start closed, with a named trigger that owns the panel', () => {
      const doc = freshCompanionDoc();
      mount(doc, window, state());
      const trigger = doc.querySelector<HTMLButtonElement>('.lotaje-settings-trigger')!;
      const panel = doc.querySelector<HTMLElement>('#lotaje-risk-settings')!;

      expect(trigger.tagName).toBe('BUTTON');
      expect(trigger.type).toBe('button');
      expect(trigger.getAttribute('aria-label')).toBe('Ajustes de riesgo');
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(trigger.getAttribute('aria-controls')).toBe('lotaje-risk-settings');
      expect(panel.hidden).toBe(true);
      expect(panel.getAttribute('role')).toBe('group');
      expect(panel.getAttribute('aria-label')).toBe('Ajustes de riesgo');
      // The trigger sits BEFORE the close action, inside the header.
      expect(trigger.closest('.lotaje-header')).not.toBeNull();
      expect(
        trigger.compareDocumentPosition(doc.querySelector('.lotaje-companion-close')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // Every decorative glyph in the header stays out of the a11y tree.
      for (const icon of Array.from(doc.querySelectorAll('.lotaje-header svg'))) {
        expect(icon.getAttribute('aria-hidden')).toBe('true');
      }
    });

    it('the trigger opens the settings, moves focus into them, and reports the state truthfully', () => {
      const doc = freshCompanionDoc();
      mount(doc, window, state());
      const trigger = doc.querySelector<HTMLButtonElement>('.lotaje-settings-trigger')!;
      const panel = doc.querySelector<HTMLElement>('#lotaje-risk-settings')!;

      trigger.click();

      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(panel.hidden).toBe(false);
      expect(doc.activeElement).toBe(doc.querySelector('input[name="balance"]'));
      expect(panel.querySelector('input[name="balance"]')).not.toBeNull();
      expect(panel.querySelector('input[name="riskPct"]')).not.toBeNull();
      expect(panel.querySelector('.lotaje-risk-usd')).not.toBeNull();

      trigger.click();
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(panel.hidden).toBe(true);
    });

    it('editing account and risk in the settings re-derives the figure without closing them', () => {
      const doc = freshCompanionDoc();
      mount(doc, window, state({ distanceText: '50' }));
      const trigger = doc.querySelector<HTMLButtonElement>('.lotaje-settings-trigger')!;
      trigger.click();

      setValue(doc, 'balance', '40000');
      setValue(doc, 'riskPct', '2.5');

      expect(doc.querySelector('.lotaje-risk-usd')?.textContent).toBe('$1000.00');
      expect(doc.querySelector('.lotaje-lots-value')?.textContent).toBe('20.00');
      // A re-render must not tear the open disclosure down under the cursor.
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(doc.querySelector<HTMLElement>('#lotaje-risk-settings')?.hidden).toBe(false);
    });

    it('Escape closes the settings, returns focus to the trigger, and leaves the stop field alone', () => {
      const doc = freshCompanionDoc();
      mount(doc, window, state({ distanceText: '45' }));
      const trigger = doc.querySelector<HTMLButtonElement>('.lotaje-settings-trigger')!;
      trigger.click();
      const balance = doc.querySelector<HTMLInputElement>('input[name="balance"]')!;

      const escape = dispatchKey(balance, 'Escape');

      expect(escape.defaultPrevented).toBe(true);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(doc.querySelector<HTMLElement>('#lotaje-risk-settings')?.hidden).toBe(true);
      expect(doc.activeElement).toBe(trigger);
      // The open disclosure consumed the key: the stop is untouched.
      expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('45');

      // Closed again, Escape goes back to meaning "clear the stop".
      const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
      distance.focus();
      dispatchKey(distance, 'Escape');
      expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('');
    });

    it('an outside press closes the settings; a press inside them does not', () => {
      const doc = freshCompanionDoc();
      mount(doc, window, state());
      const trigger = doc.querySelector<HTMLButtonElement>('.lotaje-settings-trigger')!;
      const panel = doc.querySelector<HTMLElement>('#lotaje-risk-settings')!;
      trigger.click();

      panel
        .querySelector('input[name="balance"]')!
        .dispatchEvent(new (doc.defaultView?.Event ?? Event)('pointerdown', { bubbles: true }));
      expect(panel.hidden).toBe(false);

      pressOutside(doc);

      expect(panel.hidden).toBe(true);
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      // Focus is NOT yanked back on an outside press — the trader is pointing
      // somewhere else, and stealing focus there would fight them.
      expect(doc.activeElement).not.toBe(trigger);
    });

    it('unmount removes the settings dismiss listener from the realm it was added to', () => {
      const doc = freshCompanionDoc();
      mount(doc, window, state());
      doc.querySelector<HTMLButtonElement>('.lotaje-settings-trigger')!.click();
      const removeSpy = vi.spyOn(doc, 'removeEventListener');

      unmount();

      expect(
        removeSpy.mock.calls.filter(
          ([type, , options]) => type === 'pointerdown' && options === true,
        ),
      ).toHaveLength(1);
    });
  });

  function setValue(doc: Document, name: string, text: string): void {
    const input = doc.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (!input) throw new Error(`no input[name="${name}"] found`);
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }
});
