import { afterEach, describe, expect, it, vi } from 'vitest';
import { GENERATED_ASSETS, GENERATED_SOURCE } from '../domain/sizing/asset-registry.generated';
import { getMountedWindow, LOTAJE_MOUNT_ID, mount, unmount } from './lotaje-view';

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
        vi.useRealTimers();
        vi.restoreAllMocks();
      }
    }
  });

  function freshDoc(): Document {
    return document.implementation.createHTMLDocument('lotaje-test');
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

  it('remounts cleanly into a second document after unmount (no cross-mount state leak)', () => {
    const docA = freshDoc();
    mount(docA, window);
    const balanceA = docA.querySelector<HTMLInputElement>('input[name="balance"]')!;
    balanceA.value = '99999';
    balanceA.dispatchEvent(new Event('input'));
    unmount();

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

  it('repeats open-close cycles and remounts closed without duplicate or leaked symbol state', () => {
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

  function setValue(doc: Document, name: string, text: string): void {
    const input = doc.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (!input) throw new Error(`no input[name="${name}"] found`);
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }
});
