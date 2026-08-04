import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERATED_ASSETS, GENERATED_SOURCE } from '../domain/sizing/asset-registry.generated';
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

  function dispatchKey(
    target: Element,
    key: string,
    init: KeyboardEventInit = {},
  ): KeyboardEvent {
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

  function driveRealLot(doc: Document, distance = '45'): void {
    setValue(doc, 'balance', '10000');
    setValue(doc, 'riskPct', '1');
    setValue(doc, 'symbol', 'US30');
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
    setValue(doc, 'symbol', 'US30');
    setValue(doc, 'distance', '50');
    expect(doc.querySelector('.lotaje-lots-value')?.textContent?.trim()).toBe('1.00');
    expect(doc.querySelector('.lotaje-invalid-state')).toBeNull();
  });

  it('the heuristic badge shows only for a non-empty, non-curated symbol', () => {
    const doc = freshDoc();
    mount(doc, window);
    const badge = () => doc.querySelector<HTMLElement>('.lotaje-symbol-badge');

    expect(badge()?.hidden).toBe(true); // blank symbol at cold start
    setValue(doc, 'symbol', 'US30');
    expect(badge()?.hidden).toBe(true); // curated symbol
    setValue(doc, 'symbol', 'GBPJPY');
    expect(badge()?.hidden).toBe(false); // unrecognised -> heuristic
  });

  it('renders a collapsed native symbol chip instead of an always-visible text field', () => {
    const doc = freshDoc();
    mount(doc, window);

    const chip = doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip');
    const disclosure = doc.querySelector<HTMLElement>('#lotaje-symbol-disclosure');
    const symbolInput = doc.querySelector<HTMLInputElement>('input[name="symbol"]');
    const badge = doc.querySelector<HTMLElement>('.lotaje-symbol-badge');

    expect(chip?.tagName).toBe('BUTTON');
    expect(chip?.type).toBe('button');
    expect(chip?.querySelector('.lotaje-symbol-value')?.textContent).toBe('Símbolo');
    expect(chip?.getAttribute('aria-expanded')).toBe('false');
    expect(chip?.getAttribute('aria-controls')).toBe('lotaje-symbol-disclosure');
    expect(disclosure).not.toBeNull();
    expect(disclosure?.hidden).toBe(true);
    expect(doc.querySelectorAll('#lotaje-symbol-disclosure')).toHaveLength(1);
    expect(disclosure?.contains(symbolInput ?? null)).toBe(true);
    expect(chip?.contains(symbolInput ?? null)).toBe(false);
    expect(badge?.hidden).toBe(true);
  });

  it('opens selection, free text and the Ficha from the same chip and toggles closed', () => {
    const doc = freshDoc();
    mount(doc, window);
    const chip = doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!;

    chip.click();

    const disclosure = doc.querySelector<HTMLElement>('#lotaje-symbol-disclosure');
    const select = doc.querySelector<HTMLSelectElement>('#lotaje-symbol-preset');
    const symbolInput = doc.querySelector<HTMLInputElement>('#lotaje-symbol-input');
    const sheet = doc.querySelector<HTMLElement>('.lotaje-asset-sheet');
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(disclosure?.hidden).toBe(false);
    expect(doc.querySelector('label[for="lotaje-symbol-preset"]')?.textContent).toBe('Activos');
    expect(select?.tagName).toBe('SELECT');
    expect(select?.name).toBe('symbolPreset');
    expect(doc.querySelector('label[for="lotaje-symbol-input"]')?.textContent).toBe('Otro símbolo');
    expect(symbolInput?.type).toBe('text');
    expect(symbolInput?.name).toBe('symbol');
    expect(symbolInput?.classList.contains('ui-input')).toBe(true);
    expect(sheet?.tagName).toBe('SECTION');
    expect(sheet?.getAttribute('aria-labelledby')).toBe('lotaje-asset-sheet-title');
    expect(sheet?.querySelector('#lotaje-asset-sheet-title')?.textContent).toBe('Ficha del activo');

    chip.click();
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure?.hidden).toBe(true);
    expect(doc.querySelectorAll('#lotaje-symbol-disclosure')).toHaveLength(1);
  });

  it('sources exactly four selectable symbols from GENERATED_ASSETS', () => {
    const doc = freshDoc();
    mount(doc, window);
    doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!.click();

    const expectedKeys = Object.keys(GENERATED_ASSETS);
    const select = doc.querySelector<HTMLSelectElement>('#lotaje-symbol-preset');
    expect(select).not.toBeNull();
    const prompt = select!.querySelector<HTMLOptionElement>('option[value=""]');
    const generatedOptions = Array.from(select!.options).filter((option) => option.value !== '');
    expect(prompt?.disabled).toBe(true);
    expect(prompt?.textContent).toBe('Selecciona un activo');
    expect(generatedOptions.map((option) => option.value)).toEqual(expectedKeys);
    expect(generatedOptions.map((option) => option.textContent)).toEqual(expectedKeys);
    expect(generatedOptions).toHaveLength(4);
  });

  it('choosing XAUUSD resizes through the live state, preserves context, and closes the disclosure', () => {
    const doc = freshDoc();
    mount(doc, window);
    setValue(doc, 'balance', '5000');
    setValue(doc, 'riskPct', '1');
    setValue(doc, 'distance', '50');
    const balanceInput = doc.querySelector<HTMLInputElement>('input[name="balance"]')!;
    const riskInput = doc.querySelector<HTMLInputElement>('input[name="riskPct"]')!;
    const distanceInput = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    const methodToggle = doc.querySelector<HTMLButtonElement>('.lotaje-method-toggle')!;
    const chip = doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!;
    chip.click();
    const disclosure = doc.querySelector<HTMLElement>('#lotaje-symbol-disclosure')!;
    const select = doc.querySelector<HTMLSelectElement>('#lotaje-symbol-preset');
    expect(select).not.toBeNull();

    select!.value = 'XAUUSD';
    select!.dispatchEvent(new Event('change'));

    expect(doc.querySelector('.lotaje-lots-value')?.textContent).toBe('0.01');
    expect(chip.querySelector('.lotaje-symbol-value')?.textContent).toBe('XAUUSD');
    expect(doc.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe('XAUUSD');
    expect(select!.value).toBe('XAUUSD');
    expect(doc.querySelector<HTMLElement>('.lotaje-symbol-badge')?.hidden).toBe(true);
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure.hidden).toBe(true);
    expect(balanceInput.value).toBe('5000');
    expect(riskInput.value).toBe('1');
    expect(distanceInput.value).toBe('50');
    expect(methodToggle.textContent).toBe('⇄ precios');
    expect(doc.querySelector('input[name="balance"]')).toBe(balanceInput);
    expect(doc.querySelector('input[name="riskPct"]')).toBe(riskInput);
    expect(doc.querySelector('input[name="distance"]')).toBe(distanceInput);
  });

  it('typing free text updates the chip, sizing and heuristic badge while disclosure stays open', () => {
    const doc = freshDoc();
    mount(doc, window);
    setValue(doc, 'balance', '10000');
    setValue(doc, 'riskPct', '1');
    setValue(doc, 'distance', '45');
    const chip = doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!;
    chip.click();
    const disclosure = doc.querySelector<HTMLElement>('#lotaje-symbol-disclosure');
    const symbolInput = doc.querySelector<HTMLInputElement>('input[name="symbol"]');
    expect(disclosure).not.toBeNull();
    expect(symbolInput).not.toBeNull();

    symbolInput!.value = 'EURUSD';
    symbolInput!.dispatchEvent(new Event('input'));

    expect(chip.querySelector('.lotaje-symbol-value')?.textContent).toBe('EURUSD');
    expect(doc.querySelector<HTMLElement>('.lotaje-symbol-badge')?.hidden).toBe(false);
    expect(doc.querySelector('.lotaje-symbol-badge')?.textContent).toBe('heurística');
    expect(doc.querySelector('.lotaje-stop-unit')?.textContent).toBe('pips');
    expect(doc.querySelector('.lotaje-lots-value')?.textContent).toBe('0.22');
    expect(doc.querySelector('input[name="symbol"]')).toBe(symbolInput);
    expect(symbolInput!.value).toBe('EURUSD');
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(disclosure!.hidden).toBe(false);
  });

  it('renders the full generated XAUUSD Ficha with derived point size and dated provenance', () => {
    const doc = freshDoc();
    mount(doc, window);
    doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!.click();
    setValue(doc, 'symbol', 'XAUUSD');
    const rows = Array.from(
      doc.querySelectorAll<HTMLElement>('.lotaje-asset-sheet [data-asset-field]'),
    );

    expect(rows.map((row) => row.dataset['assetField'])).toEqual([
      'contractSize',
      'tickSize',
      'pointSize',
      'pipSize',
      'volumeStep',
      'volumeMin',
      'currency',
      'aliases',
      'source',
    ]);
    expect(rows.map((row) => row.querySelector('dt')?.textContent)).toEqual([
      'Contrato',
      'Tick',
      'Punto',
      'Pip',
      'Paso de volumen',
      'Volumen mínimo',
      'Divisa',
      'Alias',
      'Procedencia',
    ]);
    expect(rows.map((row) => row.querySelector('dd')?.textContent)).toEqual([
      '100',
      '0.01',
      String(10 ** -GENERATED_ASSETS['XAUUSD'].digits),
      'No aplica',
      '0.01',
      '0.01',
      'USD',
      'No disponible',
      GENERATED_SOURCE,
    ]);
    const source = rows.at(-1)?.querySelector('dd')?.textContent;
    expect(source).toBe(GENERATED_SOURCE);
    expect(source).toContain('Five Percent Online Ltd');
    expect(source).toContain('2026-08-03');
  });

  it('renders heuristic EURUSD metadata with honest unavailable rows', () => {
    const doc = freshDoc();
    mount(doc, window);
    doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!.click();
    setValue(doc, 'symbol', 'EURUSD');
    const rows = Array.from(
      doc.querySelectorAll<HTMLElement>('.lotaje-asset-sheet [data-asset-field]'),
    );
    const values = rows.map((row) => row.querySelector('dd')?.textContent);

    expect(values).toEqual([
      '100000',
      'No disponible',
      'No disponible',
      '0.0001',
      'No disponible',
      'No disponible',
      'No disponible',
      'No disponible',
      'heurística',
    ]);
    expect(rows).toHaveLength(9);
    expect(doc.querySelector('.lotaje-asset-sheet')?.textContent).not.toContain(
      'Five Percent Online Ltd',
    );
    expect(doc.querySelector('.lotaje-asset-sheet')?.textContent).not.toContain('2026-08-03');
  });

  it('contains no unit control and keeps the stop unit as a derived label', () => {
    const doc = freshDoc();
    mount(doc, window);
    doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!.click();
    setValue(doc, 'symbol', 'EURUSD');
    const disclosure = doc.querySelector<HTMLElement>('#lotaje-symbol-disclosure');
    expect(disclosure).not.toBeNull();
    const controls = Array.from(
      disclosure!.querySelectorAll<HTMLElement>('button, input, select, textarea'),
    );
    const select = disclosure!.querySelector<HTMLSelectElement>('select[name="symbolPreset"]');
    const symbolInput = disclosure!.querySelector<HTMLInputElement>('input[name="symbol"]');

    expect(controls).toEqual([select, symbolInput]);
    expect(disclosure!.querySelector('[name*="unit" i]')).toBeNull();
    expect(disclosure!.querySelector('input[type="checkbox"], input[type="radio"]')).toBeNull();
    expect(disclosure!.querySelector('.lotaje-asset-sheet button')).toBeNull();
    const stopUnit = doc.querySelector<HTMLElement>('.lotaje-stop-unit');
    expect(stopUnit?.tagName).toBe('SPAN');
    expect(stopUnit?.textContent).toBe('pips');
    expect(stopUnit?.hasAttribute('role')).toBe(false);
    expect(stopUnit?.hasAttribute('tabindex')).toBe(false);
  });

  it('preserves D-3 target-realm copy after symbol selection and disclosure renders', () => {
    const doc = freshDoc();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    mount(doc, targetWindow(writeText));
    setValue(doc, 'balance', '10000');
    setValue(doc, 'riskPct', '1');
    setValue(doc, 'distance', '45');
    const chip = doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!;
    chip.click();
    const select = doc.querySelector<HTMLSelectElement>('#lotaje-symbol-preset');
    expect(select).not.toBeNull();
    select!.value = 'US30';
    select!.dispatchEvent(new Event('change'));
    chip.click();
    chip.click();

    doc.querySelector<HTMLButtonElement>('.lotaje-copy-action')!.click();

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('2.22');
  });

  // Wave 4 audit L-1: same disposition as the remount test above — this pins
  // DOM hygiene (no duplicate disclosure/select/input nodes) across
  // open/close cycles and an omitted-arity remount. It cannot detect a
  // genuine in-memory cross-mount leak (that claim is IN-05's, below); see
  // the comment on the earlier remount test for why.
  it('open/close cycles leave no duplicate or leaked symbol DOM', () => {
    const firstDoc = freshDoc();
    mount(firstDoc, window);
    const chip = firstDoc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      chip.click();
      expect(chip.getAttribute('aria-expanded')).toBe('true');
      expect(firstDoc.querySelectorAll('#lotaje-symbol-disclosure')).toHaveLength(1);
      expect(firstDoc.querySelectorAll('#lotaje-symbol-preset')).toHaveLength(1);
      expect(firstDoc.querySelectorAll('input[name="symbol"]')).toHaveLength(1);
      expect(firstDoc.querySelectorAll('.lotaje-asset-sheet')).toHaveLength(1);
      chip.click();
      expect(chip.getAttribute('aria-expanded')).toBe('false');
      expect(firstDoc.querySelector<HTMLElement>('#lotaje-symbol-disclosure')?.hidden).toBe(true);
    }
    chip.click();
    setValue(firstDoc, 'symbol', 'EURUSD');
    unmount();
    // Task C-2: as above — scrub the key so this test still isolates the
    // in-memory symbol-disclosure leak it names, not a storage round trip.
    window.localStorage.removeItem(LOTAJE_STORAGE_KEY);

    const secondDoc = freshDoc();
    mount(secondDoc, window);
    const secondChip = secondDoc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip');
    const secondDisclosure = secondDoc.querySelector<HTMLElement>('#lotaje-symbol-disclosure');
    const secondSelect = secondDoc.querySelector<HTMLSelectElement>('#lotaje-symbol-preset');
    const secondSymbolInput = secondDoc.querySelector<HTMLInputElement>('input[name="symbol"]');
    expect(secondDoc.querySelectorAll('#lotaje-symbol-disclosure')).toHaveLength(1);
    expect(secondDisclosure?.hidden).toBe(true);
    expect(secondChip?.getAttribute('aria-expanded')).toBe('false');
    expect(secondSelect).not.toBeNull();
    expect(Array.from(secondSelect!.options).filter((option) => option.value !== '')).toHaveLength(4);
    expect(secondSymbolInput?.value).toBe('');
    expect(secondDisclosure?.contains(secondSymbolInput ?? null)).toBe(true);
    expect(secondChip?.querySelector('.lotaje-symbol-value')?.textContent).toBe('Símbolo');
    expect(secondDoc.querySelector<HTMLElement>('.lotaje-symbol-badge')?.hidden).toBe(true);
  });

  it('renders a real lot as a native named copy button with the lot label and discreet glyph', () => {
    const doc = freshDoc();
    mount(doc, targetWindow(vi.fn().mockResolvedValue(undefined)));
    driveRealLot(doc);

    const button = doc.querySelector<HTMLButtonElement>('.lotaje-copy-action');
    const hero = doc.querySelector<HTMLElement>('.lotaje-hero');
    const shell = doc.querySelector<HTMLElement>('.lotaje-copy-shell');
    const content = button?.querySelector<HTMLElement>('.lotaje-copy-content');
    const value = content?.querySelector<HTMLElement>('.lotaje-lots-value');
    const label = content?.querySelector<HTMLElement>('.lotaje-lots-label');
    const glyph = button?.querySelector<HTMLElement>('.lotaje-copy-affordance');
    const feedback = shell?.querySelector<HTMLElement>('.lotaje-copy-feedback');

    expect(button?.tagName).toBe('BUTTON');
    expect(button?.type).toBe('button');
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute('aria-label')).toBe('Copiar lotaje');
    expect(button?.title).toBe('Copiar lotaje');
    expect(value?.textContent).toBe('2.22');
    expect(label?.textContent).toBe('lotes');
    expect(Array.from(content?.children ?? [])).toEqual([value, label]);
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
    expect(button?.lastElementChild).toBe(glyph);
    expect(hero?.contains(button ?? null)).toBe(true);
    expect(shell?.contains(hero ?? null)).toBe(true);
    expect(feedback?.getAttribute('role')).toBe('status');
    expect(feedback?.getAttribute('aria-live')).toBe('polite');
    expect(feedback?.getAttribute('aria-atomic')).toBe('true');
    expect(feedback?.textContent).toBe('');
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
      ['symbol', 'US30'],
      ['distance', '4'],
      ['distance', '45'],
    ] as const) {
      setValue(doc, name, text);
      expect(writeText).not.toHaveBeenCalled();
    }

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

  it('replaces an honest-state figure but keeps a visible natively disabled copy affordance', () => {
    const doc = freshDoc();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    mount(doc, targetWindow(writeText));

    const shell = doc.querySelector<HTMLElement>('.lotaje-copy-shell');
    const message = shell?.querySelector<HTMLElement>('.lotaje-invalid-state');
    const button = shell?.querySelector<HTMLButtonElement>('.lotaje-copy-action');
    const glyph = button?.querySelector<HTMLElement>('.lotaje-copy-affordance');
    expect(message?.textContent).toBe(
      'La cuenta, el riesgo y la entrada deben ser valores positivos.',
    );
    expect(message?.id).toBe('lotaje-copy-unavailable-reason');
    expect(doc.querySelector('.lotaje-lots-value')).toBeNull();
    expect(doc.querySelector('.lotaje-lots-label')).toBeNull();
    expect(doc.querySelector('.lotaje-hero')).toBeNull();
    expect(shell).not.toBeNull();
    expect(glyph).not.toBeNull();
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('aria-describedby')).toBe('lotaje-copy-unavailable-reason');
    button?.click();
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
    setValue(doc, 'symbol', 'US30');
    setValue(doc, 'distance', '45');

    expect(doc.querySelector('.lotaje-hero')).toBeNull();
    expect(doc.querySelector('.lotaje-lots-value')).toBeNull();
    const button = doc.querySelector<HTMLButtonElement>('.lotaje-copy-action');
    expect(button?.disabled).toBe(true);
    button?.click();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('keeps copy enabled when the minimum-lot warning accompanies a real 0.01 figure', () => {
    const doc = freshDoc();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    mount(doc, targetWindow(writeText));
    setValue(doc, 'balance', '100');
    setValue(doc, 'riskPct', '0.1');
    setValue(doc, 'symbol', 'US30');
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

    doc.querySelector<HTMLButtonElement>('.lotaje-method-toggle')!.click();

    expect(doc.querySelector('input[name="distance"]')).toBeNull();
    expect(doc.querySelector('input[name="entry"]')).not.toBeNull();
    expect(doc.querySelector('input[name="sl"]')).not.toBeNull();

    doc.querySelector<HTMLButtonElement>('.lotaje-method-toggle')!.click();

    // Back to distance: the value survives the round trip (nothing typed is lost).
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
    expect(doc.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe('US30');
    const distance = doc.querySelector<HTMLInputElement>('input[name="distance"]')!;
    expect(distance.value).toBe('');
    expect(doc.activeElement).toBe(distance);
  });

  it('restored Method A context focuses the literal SL input rather than Entrada', () => {
    const doc = freshFocusableDoc();

    mount(
      doc,
      window,
      state({ method: 'prices', entryText: '40000', slText: '39955' }),
    );

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
    expect(doc.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe('US30');
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('');
    expect(doc.querySelector('input[name="entry"]')).toBeNull();
    caller.balanceText = '99999';
    caller.symbolText = 'XAUUSD';
    const liveRisk = doc.querySelector<HTMLInputElement>('input[name="riskPct"]')!;
    liveRisk.dispatchEvent(new Event('input'));
    expect(doc.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('25000');
    expect(doc.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe('US30');

    const whitespaceDoc = freshFocusableDoc();
    mount(whitespaceDoc, window, state({ symbolText: '   ' }));
    expect(whitespaceDoc.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe('   ');
    expect(whitespaceDoc.activeElement).toBe(
      whitespaceDoc.querySelector('input[name="balance"]'),
    );

    const infinityDoc = freshFocusableDoc();
    mount(infinityDoc, window, state({ riskPctText: 'Infinity' }));
    expect(infinityDoc.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe(
      'Infinity',
    );
    expect(infinityDoc.activeElement).toBe(infinityDoc.querySelector('input[name="balance"]'));
  });

  it('focus selects all five numeric fields but preserves the free-text symbol caret', () => {
    const doc = freshFocusableDoc();
    mount(
      doc,
      window,
      state({ entryText: '40000', slText: '39955' }),
    );
    const chip = doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!;

    const expectSelectedOnFocus = (input: HTMLInputElement): void => {
      chip.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      input.focus();
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
    };

    expectSelectedOnFocus(doc.querySelector<HTMLInputElement>('input[name="balance"]')!);
    expectSelectedOnFocus(doc.querySelector<HTMLInputElement>('input[name="riskPct"]')!);
    expectSelectedOnFocus(doc.querySelector<HTMLInputElement>('input[name="distance"]')!);

    doc.querySelector<HTMLButtonElement>('.lotaje-method-toggle')!.click();
    expectSelectedOnFocus(doc.querySelector<HTMLInputElement>('input[name="entry"]')!);
    expectSelectedOnFocus(doc.querySelector<HTMLInputElement>('input[name="sl"]')!);

    chip.click();
    const symbol = doc.querySelector<HTMLInputElement>('input[name="symbol"]')!;
    symbol.setSelectionRange(2, 2);
    symbol.focus();
    expect(symbol.selectionStart).toBe(2);
    expect(symbol.selectionEnd).toBe(2);
  });

  it('Escape in Method B clears only distance and preserves all context and disclosure state', () => {
    const doc = freshFocusableDoc();
    mount(
      doc,
      window,
      state({ entryText: '40000', slText: '39955' }),
    );
    const chip = doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!;
    chip.click();
    const symbol = doc.querySelector<HTMLInputElement>('input[name="symbol"]')!;
    symbol.focus();

    const escape = dispatchKey(symbol, 'Escape');

    expect(escape.defaultPrevented).toBe(false);
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('');
    expect(doc.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('10000');
    expect(doc.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe('1');
    expect(doc.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe('US30');
    expect(doc.querySelector<HTMLButtonElement>('.lotaje-method-toggle')?.textContent).toBe(
      '⇄ precios',
    );
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(doc.querySelector<HTMLElement>('#lotaje-symbol-disclosure')?.hidden).toBe(false);

    doc.querySelector<HTMLButtonElement>('.lotaje-method-toggle')!.click();
    expect(doc.querySelector<HTMLInputElement>('input[name="entry"]')?.value).toBe('40000');
    expect(doc.querySelector<HTMLInputElement>('input[name="sl"]')?.value).toBe('39955');
  });

  it('Escape in Method A clears only literal SL and preserves entry, distance memory, and disclosure', () => {
    const doc = freshFocusableDoc();
    mount(
      doc,
      window,
      state({ method: 'prices', entryText: '40000', slText: '39955' }),
    );
    const chip = doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!;
    chip.click();
    const balance = doc.querySelector<HTMLInputElement>('input[name="balance"]')!;
    balance.focus();

    const escape = dispatchKey(balance, 'Escape');

    expect(escape.defaultPrevented).toBe(false);
    expect(doc.querySelector<HTMLInputElement>('input[name="sl"]')?.value).toBe('');
    expect(doc.querySelector<HTMLInputElement>('input[name="entry"]')?.value).toBe('40000');
    expect(doc.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe('10000');
    expect(doc.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe('1');
    expect(doc.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe('US30');
    expect(doc.querySelector<HTMLButtonElement>('.lotaje-method-toggle')?.textContent).toBe(
      '⇄ distancia',
    );
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(doc.querySelector<HTMLElement>('#lotaje-symbol-disclosure')?.hidden).toBe(false);

    doc.querySelector<HTMLButtonElement>('.lotaje-method-toggle')!.click();
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
    mount(
      doc,
      targetWindow(writeText),
      state({ entryText: '40000', slText: '39955' }),
    );
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

    doc.querySelector<HTMLButtonElement>('.lotaje-method-toggle')!.click();
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
    distanceDoc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!.click();
    expect(targetWriteText).not.toHaveBeenCalled();
    expect(ambientWriteText).not.toHaveBeenCalled();
    for (const name of ['balance', 'riskPct', 'symbol', 'distance']) {
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
    pricesDoc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!.click();
    for (const name of ['balance', 'riskPct', 'symbol', 'entry', 'sl']) {
      const input = pricesDoc.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
      input.focus();
      const enter = dispatchKey(input, 'Enter');
      expect(enter.defaultPrevented).toBe(true);
    }

    expect(distanceWindow).not.toBe(pricesWindow);
    expect(targetWriteText).toHaveBeenCalledTimes(9);
    expect(targetWriteText.mock.calls.map(([payload]) => payload)).toEqual(
      Array<string>(9).fill('2.22'),
    );
    expect(ambientWriteText).not.toHaveBeenCalled();
  });

  it('Enter leaves native copy chip select and stepper activation to native semantics without double fire', () => {
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
    const chip = doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!;
    chip.focus();
    const chipEnter = dispatchKey(chip, 'Enter');
    chip.click();
    expect(chipEnter.defaultPrevented).toBe(false);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(writeText).not.toHaveBeenCalled();

    const select = doc.querySelector<HTMLSelectElement>('select[name="symbolPreset"]')!;
    const changeSpy = vi.fn();
    select.addEventListener('change', changeSpy);
    select.focus();
    const selectEnter = dispatchKey(select, 'Enter');
    select.value = 'XAUUSD';
    select.dispatchEvent(new Event('change'));
    expect(selectEnter.defaultPrevented).toBe(false);
    expect(changeSpy).toHaveBeenCalledTimes(1);
    expect(doc.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe('XAUUSD');
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
    expect(doc.querySelector<HTMLButtonElement>('.lotaje-method-toggle')?.textContent).toBe(
      '⇄ precios',
    );
    expect(doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')?.getAttribute('aria-expanded')).toBe(
      'false',
    );
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
    oldBalance.dispatchEvent(
      new oldDoc.defaultView!.FocusEvent('focusin', { bubbles: true }),
    );
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

  it('D-5 state actions preserve D-4 disclosure and D-3 generation guards', async () => {
    const pendingWrite = deferred<void>();
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockReturnValueOnce(pendingWrite.promise)
      .mockResolvedValue(undefined);
    const target = targetWindow(writeText);
    const doc = freshFocusableDoc();
    mount(doc, target, state());
    const chip = doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!;
    chip.click();
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
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(doc.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe('US30');
    const escape = dispatchKey(distance, 'Escape');
    expect(escape.defaultPrevented).toBe(false);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(doc.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe('US30');

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
    expect(doc.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe('');
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
    expect(doc.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe('US30');
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
    expect(doc.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe('XAUUSD');
    const entry = doc.querySelector<HTMLInputElement>('input[name="entry"]')!;
    const sl = doc.querySelector<HTMLInputElement>('input[name="sl"]')!;
    expect(entry.value).toBe('');
    expect(sl.value).toBe('');
    expect(doc.activeElement).toBe(sl);
    expect(
      doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')?.getAttribute('aria-expanded'),
    ).toBe('false');
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
    expect(doc.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe('US30');

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
    expect(undefinedDoc.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe('');
  });

  it('IN-06 raw round trip: comma/whitespace/leading-zero context survives unmount + omitted remount byte-for-byte while question fields reopen blank', () => {
    const storage = fakeStorage();
    const win = persistedWindow(storage);
    const doc = freshDoc();
    mount(doc, win);

    setValue(doc, 'balance', '012,345.00');
    setValue(doc, 'riskPct', ' 1.5 ');
    doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!.click();
    setValue(doc, 'symbol', '  US30  ');
    setValue(doc, 'distance', '45');

    unmount();

    const reopened = freshDoc();
    mount(reopened, win);

    expect(reopened.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe(
      '012,345.00',
    );
    expect(reopened.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe(' 1.5 ');
    expect(reopened.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe(
      '  US30  ',
    );
    expect(reopened.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('');
  });

  it('IN-07 positive trigger matrix: balance, risk, free-symbol, curated-symbol, and method changes each write exactly once with the exact latest JSON', () => {
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

    const chip = doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!;
    chip.click();
    setValue(doc, 'symbol', 'EURUSD');
    expect(storage.setItem).toHaveBeenCalledTimes(3);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      LOTAJE_STORAGE_KEY,
      '{"v":1,"balanceText":"20000","riskPctText":"2","symbolText":"EURUSD","method":"distance"}',
    );

    const select = doc.querySelector<HTMLSelectElement>('#lotaje-symbol-preset')!;
    select.value = 'XAUUSD';
    select.dispatchEvent(new Event('change'));
    expect(storage.setItem).toHaveBeenCalledTimes(4);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      LOTAJE_STORAGE_KEY,
      '{"v":1,"balanceText":"20000","riskPctText":"2","symbolText":"XAUUSD","method":"distance"}',
    );
    // Curated selection also closes the disclosure — no duplicate write from that.
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(storage.setItem).toHaveBeenCalledTimes(4);

    doc.querySelector<HTMLButtonElement>('.lotaje-method-toggle')!.click();
    expect(storage.setItem).toHaveBeenCalledTimes(5);
    expect(storage.setItem).toHaveBeenLastCalledWith(
      LOTAJE_STORAGE_KEY,
      '{"v":1,"balanceText":"20000","riskPctText":"2","symbolText":"XAUUSD","method":"prices"}',
    );
  });

  it('IN-08 Method B no-trigger matrix: distance typing, stepping, Esc, disclosure toggling, and copy settlement write zero times', async () => {
    const storage = fakeStorage();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const win = persistedWindow(storage, writeText);
    const doc = freshFocusableDoc();
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

    const chip = doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!;
    chip.click();
    chip.click();

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

    expect(reopened.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe(
      '77777',
    );
    expect(reopened.querySelector<HTMLInputElement>('input[name="riskPct"]')?.value).toBe('9');
    expect(reopened.querySelector<HTMLInputElement>('input[name="symbol"]')?.value).toBe(
      'SP500',
    );
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

    const chip = doc.querySelector<HTMLButtonElement>('.lotaje-symbol-chip')!;
    chip.click();
    expect(chip.getAttribute('aria-expanded')).toBe('true');

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
    expect(reopened.querySelector<HTMLInputElement>('input[name="balance"]')?.value).toBe(
      '10000',
    );
  });

  // ---- Task D-6: the «Abrir ventana» trigger --------------------------------
  it('renders the "Abrir ventana" trigger as a native button, not part of any zone', () => {
    const doc = freshDoc();
    mount(doc, window);

    const trigger = doc.querySelector<HTMLButtonElement>('.lotaje-companion-trigger');
    expect(trigger?.tagName).toBe('BUTTON');
    expect(trigger?.type).toBe('button');
    expect(trigger?.textContent).toBe('Abrir ventana');
    expect(trigger?.closest('[aria-label="Contexto"]')).toBeNull();
    expect(trigger?.closest('[aria-label="La pregunta"]')).toBeNull();
    expect(trigger?.closest('[aria-label="La respuesta"]')).toBeNull();
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

  function setValue(doc: Document, name: string, text: string): void {
    const input = doc.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (!input) throw new Error(`no input[name="${name}"] found`);
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }
});
