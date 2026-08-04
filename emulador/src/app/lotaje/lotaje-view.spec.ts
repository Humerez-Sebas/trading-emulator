import { afterEach, describe, expect, it } from 'vitest';
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
  afterEach(() => {
    unmount();
  });

  function freshDoc(): Document {
    return document.implementation.createHTMLDocument('lotaje-test');
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

  it('clicking the symbol chip does nothing (Task D-4 wires the Ficha; D-1 renders it inert)', () => {
    const doc = freshDoc();
    mount(doc, window);
    const before = doc.getElementById(LOTAJE_MOUNT_ID)?.innerHTML;
    const chip = doc.querySelector<HTMLElement>('.lotaje-symbol-chip')!;
    chip.click();
    expect(doc.getElementById(LOTAJE_MOUNT_ID)?.innerHTML).toBe(before);
  });

  it('the copy affordance renders next to a real lot figure but has no click behaviour (Task D-3)', () => {
    const doc = freshDoc();
    mount(doc, window);
    setValue(doc, 'balance', '5000');
    setValue(doc, 'riskPct', '1');
    setValue(doc, 'symbol', 'US30');
    setValue(doc, 'distance', '50');
    const glyph = doc.querySelector<HTMLElement>('.lotaje-copy-affordance');
    expect(glyph).not.toBeNull();
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
    expect(() => glyph!.click()).not.toThrow();
    // Clicking it must not have copied anything or changed the rendered value.
    expect(doc.querySelector('.lotaje-lots-value')?.textContent?.trim()).toBe('1.00');
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
