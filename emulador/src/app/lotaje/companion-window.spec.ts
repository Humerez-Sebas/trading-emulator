import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { COMPANION_HEIGHT, COMPANION_WIDTH, openCompanionWindow } from './companion-window';
import { LOTAJE_MOUNT_ID, mount, unmount } from './lotaje-view';
import { INITIAL_STATE, type LotajeState } from './sizing-view-model';

// `Mock` defaults its type param to vitest's own `Procedure` (`(...args: any[])
// => any`) — exactly what a bare `vi.fn()` (no type args) already infers, so
// using the bare alias here keeps every fake's mocks assignable without
// fighting mismatched generic instantiations across these test doubles.

/**
 * Task D-6. Exercises the REAL `./lotaje-view` (`mount`/`unmount`) — the
 * point is proof that the adapter actually moves the real mounted view, not
 * that it calls mocked stand-ins. Only the browser-only surfaces
 * (`documentPictureInPicture`, `window.open`, `pagehide`) are doubled, via
 * plain fake `Window`/`Document` objects — the unit suite has no PiP/popup
 * implementation to call for real (brief §6). PiP conformance itself (the
 * 240px floor, topmost, real focus, the OS clipboard) is NOT re-asserted
 * here against these doubles — that would only prove the double behaves as
 * written (the L-1 vacuous-test class). Those live in §7's real-browser
 * measurements instead.
 */
describe('companion-window: openCompanionWindow', () => {
  const activeFakeCompanions: FakeWindow[] = [];

  afterEach(() => {
    try {
      // Idempotent: closing an already-closed fake is a harmless no-op
      // (companion-window.ts removes its own listener on first teardown, so
      // a second dispatch finds nothing to call). This is what guarantees
      // companion-window.ts's own module-level singleton state never leaks
      // into the next test under this suite's isolate:false runner
      // (docs/engineering/testing.md).
      for (const win of activeFakeCompanions.splice(0)) win.close();
    } finally {
      unmount();
      vi.restoreAllMocks();
    }
  });

  interface FakeWindow {
    readonly document: Document;
    readonly navigator: Navigator;
    closed: boolean;
    focus: Mock;
    close: Mock;
    setTimeout: Mock;
    clearTimeout: Mock;
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
    open?: Mock;
    documentPictureInPicture?: { requestWindow: Mock };
  }

  function fakeStorage(): Storage {
    const store = new Map<string, string>();
    return {
      getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    } as unknown as Storage;
  }

  /** A companion realm double: real DOM (so `mount()` builds real nodes into
   *  it and specs can assert on them), a real `EventTarget` behind
   *  add/removeEventListener so `pagehide` really fires, and `close()`
   *  simulating what a real close does — flips `closed` and fires
   *  `pagehide`, exactly the sequence S-1 observed. */
  function fakeCompanionWindow(
    writeText: (text: string) => Promise<void> = () => Promise.resolve(),
  ): FakeWindow {
    const doc = document.implementation.createHTMLDocument('companion');
    const bus = new EventTarget();
    const win: FakeWindow = {
      document: doc,
      navigator: { clipboard: { writeText } } as unknown as Navigator,
      closed: false,
      focus: vi.fn(),
      close: vi.fn(() => {
        if (win.closed) return;
        win.closed = true;
        bus.dispatchEvent(new Event('pagehide'));
      }),
      // Needed because the moved-in view's own copy-feedback lifecycle
      // (`showCopySuccess`/`showCopyFailure` in lotaje-view.ts) calls
      // `mountedWindow.setTimeout`/`clearTimeout` on whichever realm is
      // currently mounted — real timers so a resolved/rejected write's
      // `.then()` continuation actually runs under real microtask timing.
      setTimeout: vi.fn(window.setTimeout.bind(window)),
      clearTimeout: vi.fn(window.clearTimeout.bind(window)),
      addEventListener: (type, listener) => bus.addEventListener(type, listener),
      removeEventListener: (type, listener) => bus.removeEventListener(type, listener),
    };
    activeFakeCompanions.push(win);
    return win;
  }

  /** A host realm double: a fresh document shaped like the real
   *  `calculadora-page.component.html` (a bare `#lotaje-mount` div), plus
   *  whichever companion-opening mechanism(s) a given test wants present. */
  function fakeHostWindow(overrides: {
    pip?: Mock;
    open?: Mock;
  } = {}): { doc: Document; win: FakeWindow } {
    const doc = document.implementation.createHTMLDocument('host');
    const container = doc.createElement('div');
    container.id = LOTAJE_MOUNT_ID;
    doc.body.appendChild(container);

    const bus = new EventTarget(); // hosts never receive pagehide, but shape stays uniform
    const win: FakeWindow = {
      document: doc,
      navigator: { clipboard: { writeText: () => Promise.resolve() } } as unknown as Navigator,
      closed: false,
      focus: vi.fn(),
      close: vi.fn(),
      setTimeout: vi.fn(window.setTimeout.bind(window)),
      clearTimeout: vi.fn(window.clearTimeout.bind(window)),
      addEventListener: (type, listener) => bus.addEventListener(type, listener),
      removeEventListener: (type, listener) => bus.removeEventListener(type, listener),
      ...(overrides.open ? { open: overrides.open } : {}),
      ...(overrides.pip ? { documentPictureInPicture: { requestWindow: overrides.pip } } : {}),
    };
    return { doc, win: withStorage(win) };
  }

  function withStorage(win: FakeWindow): FakeWindow {
    return Object.assign(win, { localStorage: fakeStorage() });
  }

  async function settleMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
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

  function setValue(doc: Document, name: string, text: string): void {
    const input = doc.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (!input) throw new Error(`no input[name="${name}"] found`);
    input.value = text;
    input.dispatchEvent(new Event('input'));
  }

  it('prefers documentPictureInPicture, requesting the preferred 320x300 composition', async () => {
    const openPopup = vi.fn();
    const requestWindow = vi.fn().mockResolvedValue(fakeCompanionWindow());
    const { doc, win } = fakeHostWindow({ pip: requestWindow, open: openPopup });
    mount(doc, win as unknown as Window, state());

    openCompanionWindow(doc, win as unknown as Window);
    await settleMicrotasks();

    expect(requestWindow).toHaveBeenCalledTimes(1);
    expect(requestWindow).toHaveBeenCalledWith({
      width: COMPANION_WIDTH,
      height: COMPANION_HEIGHT,
    });
    expect(openPopup).not.toHaveBeenCalled();
    // The preferred size of the polish brief §2.2 — still above the ~240 CSS
    // px floor the S-1 spike measured, so the request is granted exactly.
    expect(COMPANION_WIDTH).toBe(320);
    expect(COMPANION_HEIGHT).toBe(300);
    expect(COMPANION_WIDTH).toBeGreaterThanOrEqual(240);
  });

  it('falls back to window.open when documentPictureInPicture is absent', () => {
    const openPopup = vi.fn().mockReturnValue(fakeCompanionWindow());
    const { doc, win } = fakeHostWindow({ open: openPopup });
    mount(doc, win as unknown as Window, state());

    openCompanionWindow(doc, win as unknown as Window);

    expect(openPopup).toHaveBeenCalledTimes(1);
    expect(openPopup).toHaveBeenCalledWith('', '', `width=${COMPANION_WIDTH},height=${COMPANION_HEIGHT}`);
  });

  it('falls back to window.open when requestWindow rejects', async () => {
    const requestWindow = vi.fn().mockRejectedValue(new Error('denied'));
    const openPopup = vi.fn().mockReturnValue(fakeCompanionWindow());
    const { doc, win } = fakeHostWindow({ pip: requestWindow, open: openPopup });
    mount(doc, win as unknown as Window, state());

    openCompanionWindow(doc, win as unknown as Window);
    await settleMicrotasks();

    expect(requestWindow).toHaveBeenCalledTimes(1);
    expect(openPopup).toHaveBeenCalledTimes(1);
  });

  // Wave 5 audit L-3: `opening` used to be cleared piecemeal inside
  // `attachCompanion()`/`openPopup()`'s blocked branch — a guarantee spread
  // across two unrelated call sites instead of centralized in one that
  // structurally cannot be skipped. A rejecting `requestWindow()` whose own
  // `.then()`/`.catch()` chain never reaches either of those two lines (or
  // did in a future refactor that forgot one) would leave the latch stuck at
  // `true` forever — every later click on the trigger silently doing nothing,
  // with no way back for the rest of the session (the actual reported bug).
  it('L-3: a rejecting requestWindow() does not strand the "opening" latch — a later click still opens a fresh companion', async () => {
    const firstCompanion = fakeCompanionWindow();
    const firstRequestWindow = vi.fn().mockRejectedValue(new Error('denied'));
    const firstOpenPopup = vi.fn().mockReturnValue(firstCompanion);
    const { doc, win } = fakeHostWindow({ pip: firstRequestWindow, open: firstOpenPopup });
    mount(doc, win as unknown as Window, state());

    openCompanionWindow(doc, win as unknown as Window);
    await settleMicrotasks();
    expect(firstOpenPopup).toHaveBeenCalledTimes(1);

    // Close the first companion so the singleton guard
    // (`companionWindow && !companionWindow.closed`) is out of the way too —
    // this test is specifically about the `opening` latch, not that guard.
    firstCompanion.close();

    const secondRequestWindow = vi.fn().mockResolvedValue(fakeCompanionWindow());
    win.documentPictureInPicture = { requestWindow: secondRequestWindow };

    openCompanionWindow(doc, win as unknown as Window);
    await settleMicrotasks();

    // If the first attempt's rejection had left `opening` stuck at `true`,
    // this second, completely independent request would never even start.
    expect(secondRequestWindow).toHaveBeenCalledTimes(1);
  });

  it('a blocked popup (open returns null) leaves the host mount untouched', () => {
    const openPopup = vi.fn().mockReturnValue(null);
    const { doc, win } = fakeHostWindow({ open: openPopup });
    mount(doc, win as unknown as Window, state({ distanceText: '77' }));

    expect(() => openCompanionWindow(doc, win as unknown as Window)).not.toThrow();

    expect(openPopup).toHaveBeenCalledTimes(1);
    // Host was never torn down — still the real view, not the placeholder.
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('77');
    expect(doc.querySelector('.lotaje-companion-placeholder')).toBeNull();
  });

  it('mounts the companion with the live carried state, not fresh defaults', () => {
    const companion = fakeCompanionWindow();
    const openPopup = vi.fn().mockReturnValue(companion);
    const { doc, win } = fakeHostWindow({ open: openPopup });
    mount(doc, win as unknown as Window, state({ distanceText: '77', symbolText: 'XAUUSD' }));

    openCompanionWindow(doc, win as unknown as Window);

    expect(companion.document.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe(
      '77',
    );
    expect(
      companion.document.querySelector('.lotaje-asset-trigger .lotaje-symbol-value')?.textContent,
    ).toBe('XAUUSD');
    // Not the module's INITIAL_STATE defaults (which this carried state
    // deliberately differs from) — proves the carried state actually moved,
    // rather than the companion just cold-starting on its own.
    expect(companion.document.querySelector<HTMLInputElement>('input[name="distance"]')?.value).not.toBe(
      INITIAL_STATE.distanceText,
    );
  });

  it('the page shows a placeholder with a return affordance while the companion owns the view', () => {
    const companion = fakeCompanionWindow();
    const openPopup = vi.fn().mockReturnValue(companion);
    const { doc, win } = fakeHostWindow({ open: openPopup });
    mount(doc, win as unknown as Window, state());

    openCompanionWindow(doc, win as unknown as Window);

    expect(doc.querySelector('input[name="distance"]')).toBeNull();
    const placeholder = doc.querySelector('.lotaje-companion-placeholder');
    expect(placeholder).not.toBeNull();
    const returnButton = doc.querySelector<HTMLButtonElement>('.lotaje-companion-return');
    expect(returnButton?.tagName).toBe('BUTTON');
    expect(returnButton?.type).toBe('button');
  });

  /**
   * `document.implementation.createHTMLDocument()` produces a DETACHED
   * document with no browsing context — measured directly against this
   * repo's jsdom: a `<style>` appended to it never gets a `CSSStyleSheet`
   * entry in `document.styleSheets` (that list stays empty), unlike a real
   * document attached to a window. These fakes sidestep that jsdom quirk by
   * providing `styleSheets` entries directly, shaped exactly like the
   * `CSSStyleSheet.cssRules`/`.href` surface `copyStylesheets()` reads —
   * deterministic either way, and closer to what production actually calls
   * (the real ambient `document`, which does populate `styleSheets`).
   */
  function fakeStyleSheet(cssText: string, href: string | null = null): CSSStyleSheet {
    return {
      cssRules: [{ cssText }] as unknown as CSSRuleList,
      href,
    } as unknown as CSSStyleSheet;
  }

  it('copies host stylesheets into the companion and mirrors data-theme', () => {
    const companion = fakeCompanionWindow();
    const openPopup = vi.fn().mockReturnValue(companion);
    const { doc, win } = fakeHostWindow({ open: openPopup });
    Object.defineProperty(doc, 'styleSheets', {
      value: [fakeStyleSheet('.probe-rule { color: red; }')],
      configurable: true,
    });
    doc.documentElement.setAttribute('data-theme', 'light');
    mount(doc, win as unknown as Window, state());

    openCompanionWindow(doc, win as unknown as Window);

    const copiedStyle = Array.from(companion.document.head.querySelectorAll('style')).find((s) =>
      (s.textContent ?? '').includes('probe-rule'),
    );
    expect(copiedStyle?.textContent).toContain('red');
    expect(companion.document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('wraps a throwing stylesheet per-sheet instead of aborting the whole copy', () => {
    const companion = fakeCompanionWindow();
    const openPopup = vi.fn().mockReturnValue(companion);
    const { doc, win } = fakeHostWindow({ open: openPopup });
    const okSheet = fakeStyleSheet('.ok-rule { color: blue; }');

    const throwingWithHref = {
      get cssRules(): CSSRuleList {
        throw new DOMException('blocked', 'SecurityError');
      },
      href: 'https://cdn.example.test/blocked.css',
    } as unknown as CSSStyleSheet;
    const throwingWithoutHref = {
      get cssRules(): CSSRuleList {
        throw new DOMException('blocked', 'SecurityError');
      },
      href: null,
    } as unknown as CSSStyleSheet;
    Object.defineProperty(doc, 'styleSheets', {
      value: [throwingWithHref, okSheet, throwingWithoutHref],
      configurable: true,
    });
    mount(doc, win as unknown as Window, state());

    expect(() => openCompanionWindow(doc, win as unknown as Window)).not.toThrow();

    const styles = Array.from(companion.document.head.querySelectorAll('style'));
    const links = Array.from(companion.document.head.querySelectorAll('link[rel="stylesheet"]'));
    expect(styles.some((s) => (s.textContent ?? '').includes('ok-rule'))).toBe(true);
    expect(styles).toHaveLength(1); // only the OK sheet produced a <style>
    expect(links).toHaveLength(1); // only the throwing-with-href sheet produced a <link>
    expect(links[0]?.getAttribute('href')).toBe('https://cdn.example.test/blocked.css');
  });

  it('stamps data-lotaje-companion on the companion document only, never the host', () => {
    const companion = fakeCompanionWindow();
    const openPopup = vi.fn().mockReturnValue(companion);
    const { doc, win } = fakeHostWindow({ open: openPopup });
    mount(doc, win as unknown as Window, state());

    openCompanionWindow(doc, win as unknown as Window);

    expect(companion.document.documentElement.getAttribute('data-lotaje-companion')).toBe('true');
    expect(doc.documentElement.hasAttribute('data-lotaje-companion')).toBe(false);
  });

  it('titles the moved-in view «Calculadora flotante» and swaps the launcher for a real close action', () => {
    const companion = fakeCompanionWindow();
    const openPopup = vi.fn().mockReturnValue(companion);
    const { doc, win } = fakeHostWindow({ open: openPopup });
    mount(doc, win as unknown as Window, state());

    // The host titles itself, and offers the launcher — never a close.
    expect(doc.querySelector('.lotaje-title')?.textContent).toBe('Calculadora de lotes');
    expect(doc.querySelector('.lotaje-companion-trigger')?.textContent).toBe(
      'Abrir mini calculadora',
    );
    expect(doc.querySelector('.lotaje-companion-close')).toBeNull();

    openCompanionWindow(doc, win as unknown as Window);

    const companionDoc = companion.document;
    expect(companionDoc.querySelector('.lotaje-title')?.textContent).toBe('Calculadora flotante');
    // No launcher inside the companion (it would only re-focus itself) and no
    // minimise button beside the close: nothing in the platform implements one,
    // so painting one would be an inert control.
    expect(companionDoc.querySelector('.lotaje-companion-trigger')).toBeNull();
    expect(companionDoc.querySelectorAll('.lotaje-header-actions button')).toHaveLength(1);
    const close = companionDoc.querySelector<HTMLButtonElement>('.lotaje-companion-close');
    expect(close?.tagName).toBe('BUTTON');
    expect(close?.type).toBe('button');
    expect(close?.getAttribute('aria-label')).toBe('Cerrar la calculadora flotante');
  });

  it('the companion close button really closes the realm and drives the same single teardown', () => {
    const companion = fakeCompanionWindow();
    const openPopup = vi.fn().mockReturnValue(companion);
    const { doc, win } = fakeHostWindow({ open: openPopup });
    mount(doc, win as unknown as Window, state({ distanceText: '77' }));

    openCompanionWindow(doc, win as unknown as Window);
    setValue(companion.document, 'distance', '88');
    companion.document.querySelector<HTMLButtonElement>('.lotaje-companion-close')!.click();

    // `close()` fires pagehide, which is the adapter's ONE teardown path —
    // the same one the window manager's own close button drives.
    expect(companion.close).toHaveBeenCalledTimes(1);
    expect(companion.closed).toBe(true);
    expect(doc.querySelector('.lotaje-companion-placeholder')).toBeNull();
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('88');
  });

  it('registers pagehide on open and removes exactly that listener on teardown', () => {
    const companion = fakeCompanionWindow();
    const addSpy = vi.spyOn(companion, 'addEventListener');
    const removeSpy = vi.spyOn(companion, 'removeEventListener');
    const openPopup = vi.fn().mockReturnValue(companion);
    const { doc, win } = fakeHostWindow({ open: openPopup });
    mount(doc, win as unknown as Window, state());

    openCompanionWindow(doc, win as unknown as Window);
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(addSpy.mock.calls[0]?.[0]).toBe('pagehide');
    const registeredHandler = addSpy.mock.calls[0]?.[1];

    companion.close();

    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy.mock.calls[0]?.[0]).toBe('pagehide');
    expect(removeSpy.mock.calls[0]?.[1]).toBe(registeredHandler);
  });

  it('closing the companion (pagehide) moves the view back into the host with whatever was typed there', () => {
    const companion = fakeCompanionWindow();
    const openPopup = vi.fn().mockReturnValue(companion);
    const { doc, win } = fakeHostWindow({ open: openPopup });
    mount(doc, win as unknown as Window, state({ distanceText: '77' }));

    openCompanionWindow(doc, win as unknown as Window);
    setValue(companion.document, 'distance', '99');

    companion.close(); // fires pagehide, same as the user closing the window

    expect(doc.querySelector('.lotaje-companion-placeholder')).toBeNull();
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('99');
  });

  it('the host placeholder\'s "Volver aquí" button closes the companion, which drives the same teardown', () => {
    const companion = fakeCompanionWindow();
    const openPopup = vi.fn().mockReturnValue(companion);
    const { doc, win } = fakeHostWindow({ open: openPopup });
    mount(doc, win as unknown as Window, state({ distanceText: '77' }));

    openCompanionWindow(doc, win as unknown as Window);
    doc.querySelector<HTMLButtonElement>('.lotaje-companion-return')!.click();

    expect(companion.close).toHaveBeenCalledTimes(1);
    expect(companion.closed).toBe(true);
    expect(doc.querySelector<HTMLInputElement>('input[name="distance"]')?.value).toBe('77');
    expect(doc.querySelector('.lotaje-companion-placeholder')).toBeNull();
  });

  it('a second open while one is active focuses the existing companion instead of spawning another', async () => {
    const requestWindow = vi.fn().mockResolvedValue(fakeCompanionWindow());
    const { doc, win } = fakeHostWindow({ pip: requestWindow });
    mount(doc, win as unknown as Window, state());

    openCompanionWindow(doc, win as unknown as Window);
    await settleMicrotasks();
    expect(requestWindow).toHaveBeenCalledTimes(1);
    const companion = activeFakeCompanions[0]!;

    openCompanionWindow(doc, win as unknown as Window);
    await settleMicrotasks();

    expect(requestWindow).toHaveBeenCalledTimes(1); // still one — no second window
    expect(companion.focus).toHaveBeenCalledTimes(1);
  });

  it('a rapid second click before the pending PiP request resolves does not spawn a second request', async () => {
    const requestWindow = vi.fn().mockResolvedValue(fakeCompanionWindow());
    const { doc, win } = fakeHostWindow({ pip: requestWindow });
    mount(doc, win as unknown as Window, state());

    openCompanionWindow(doc, win as unknown as Window);
    openCompanionWindow(doc, win as unknown as Window); // same tick, promise still pending
    await settleMicrotasks();

    expect(requestWindow).toHaveBeenCalledTimes(1);
  });

  it('teardown clears the singleton — a later open really opens a new companion, not a focus on the closed one', async () => {
    const firstRequestWindow = vi.fn().mockResolvedValue(fakeCompanionWindow());
    const { doc, win } = fakeHostWindow({ pip: firstRequestWindow });
    mount(doc, win as unknown as Window, state());

    openCompanionWindow(doc, win as unknown as Window);
    await settleMicrotasks();
    const firstCompanion = activeFakeCompanions[0]!;
    firstCompanion.close();

    const secondCompanion = fakeCompanionWindow();
    const secondRequestWindow = vi.fn().mockResolvedValue(secondCompanion);
    win.documentPictureInPicture = { requestWindow: secondRequestWindow };

    openCompanionWindow(doc, win as unknown as Window);
    await settleMicrotasks();

    expect(secondRequestWindow).toHaveBeenCalledTimes(1);
    expect(firstCompanion.focus).not.toHaveBeenCalled();
  });

  it('clipboard after the move is still read off the companion\'s own navigator (D-3 must not regress)', async () => {
    const companionWriteText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const companion = fakeCompanionWindow(companionWriteText);
    const openPopup = vi.fn().mockReturnValue(companion);
    const { doc, win } = fakeHostWindow({ open: openPopup });
    mount(doc, win as unknown as Window, state()); // US30 / 45 / 10000 / 1% -> 2.22 lots

    openCompanionWindow(doc, win as unknown as Window);
    const copyButton = companion.document.querySelector<HTMLButtonElement>('.lotaje-copy-action');
    expect(copyButton?.disabled).toBe(false);
    copyButton!.click();

    expect(companionWriteText).toHaveBeenCalledTimes(1);
    expect(companionWriteText).toHaveBeenCalledWith('2.22');
    await settleMicrotasks(); // let the resolved write's .then() settle before teardown
  });
});
