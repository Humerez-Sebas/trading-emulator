/**
 * RFC-020 Lotaje view. Framework-free: this module and its siblings under
 * `emulador/src/app/lotaje` import nothing from Angular, NgRx, the app's NgRx
 * state tree, its shared UI component library, or the chart engine (RFC §7.1
 * item 6, grep-checked in task reports). May import `domain/sizing/*` — the
 * Shared Kernel exists for exactly this.
 *
 * `mount(doc, win, initialState?)` / `unmount()` take their document and window
 * as EXPLICIT arguments and never reference the bare globals
 * `document`/`window`. This is not a style preference: Task D-6 mounts this
 * same view into a Document Picture-in-Picture window, a different realm
 * (`win.navigator !== window.navigator`, measured in the S-1 spike), and a
 * single global reference is what would break that. An OMITTED third
 * argument loads persisted context from the mounted `win` (Task C-2,
 * `./persistence`); an explicit third argument — including an explicit
 * `undefined` — bypasses storage entirely and is arity-detected, never
 * value-detected.
 *
 * Builds the three zones of product design §3 and the method-state switch of
 * §4.1/P4 (distance ⇄ prices; switching CONVERTS, never resets), inside the
 * header + summary + result composition the owner's polish brief made the
 * visual authority. The host stylesheet supplies every surface, the
 * page-vs-companion responsive arrangement, and the focus/hover states. D-5
 * owns the root-scoped focus and keyboard listeners here. C-2 owns the one
 * centralized post-transition persistence side effect (`transitionState`,
 * below). The «Abrir mini calculadora» trigger hands off to
 * `./companion-window`, which MOVES this same mounted view into a companion
 * realm and back — there is exactly one active mount module-wide (see
 * `mount`/`unmount` below), so opening the companion is a relocation, never a
 * second copy. `./companion-window` itself imports nothing from Angular/NgRx/
 * `state/*`/`components/*`/`domain/chart/*` either. D-7 adds companion-only
 * `Alt+M`/`Alt+S` shortcuts as one more branch of the same root keydown
 * handler (`onRootKeyDown`), gated on `isCompanionDocument` — the page host
 * stays exactly as inert to them as before.
 *
 * The one thing this module reads about its own host is
 * `data-lotaje-companion` on the mounted document's root element — the
 * attribute `./companion-window` already stamps on the companion document
 * before calling `mount()`. It is read ONCE per `mount()` into a `companion`
 * boolean threaded explicitly through the builders, and it decides three
 * things:
 *
 *   - the title, and whether the header offers «Abrir mini calculadora»
 *     (page) or the risk-settings + close pair (companion);
 *   - WHERE the account/risk controls live. They are the same three cells and
 *     the same two `<input>` elements in both hosts — built once by
 *     `buildRiskFields` — but the page lays them out in its summary row while
 *     the companion tucks them into the header's collapsed risk-settings
 *     disclosure, so the floating window's initial composition is just
 *     activo → modo/campos → resultado. Editing them there writes the same
 *     `LotajeState` through the same `transitionState`, so the values set on
 *     the page are the ones the companion opens with and the ones the page
 *     gets back when it closes;
 *   - whether the result block carries its page-only title/hint/note.
 *
 * Still no second mount, no second state, no host-injected configuration.
 */
import { resolveAsset } from '../domain/sizing/asset-registry';
import { GENERATED_ASSETS } from '../domain/sizing/asset-registry.generated';
import { assetDisplay } from './asset-catalog';
import { openCompanionWindow } from './companion-window';
import {
  deriveLots,
  switchMethod,
  INITIAL_STATE,
  type LotajeDerived,
  type LotajeState,
  type Method,
} from './sizing-view-model';
import { formatLots, formatMoney } from './format';
import { parseDecimal } from './parse-decimal';
import { loadLotajeContext, saveLotajeContext } from './persistence';

/**
 * The Angular host (`pages/calculadora/calculadora-page.component.ts`)
 * creates a container element with this id in its own template. If `mount()`
 * doesn't find one in the given document, it creates one on `doc.body` — a
 * deliberate fallback so a bare companion document (Task D-6, which starts
 * with nothing but an empty body) can call `mount(doc, win, initialState?)`
 * without first having to know about this id.
 */
export const LOTAJE_MOUNT_ID = 'lotaje-mount';

// ---- module-level mount state -------------------------------------------
// A SINGLE active mount at a time is a deliberate simplification, not an
// oversight: RFC-020 Q2 (dev-log §6.2/§1.2) established that the page and the
// companion window are never open at once. `mount()` is idempotent (it always
// tears down any previous mount first) specifically so repeated mount/unmount
// cycles across many test fixtures under the suite's isolate:false runner
// (docs/engineering/testing.md) can never leak state between specs.
let currentState: LotajeState = INITIAL_STATE;
let currentDoc: Document | null = null;
let currentWindow: Window | null = null;
let currentRoot: HTMLElement | null = null;
let refs: Refs | null = null;
let mountGeneration = 0;
let copyAttemptGeneration = 0;
let activeFeedbackTimer: { window: Window; id: number } | null = null;
let assetMenuOpen = false;
let assetDismissHandler: ((event: Event) => void) | null = null;
let riskSettingsOpen = false;
let riskSettingsDismissHandler: ((event: Event) => void) | null = null;
/**
 * `isCompanionDocument(doc)` resolved once by `mount()`. Zone 3 is rebuilt on
 * every `render()` and needs the same answer the builders got, so it is held
 * here rather than re-read from the DOM per render — one read, one decision,
 * no way for the two to disagree mid-mount.
 */
let companionHost = false;

const COPY_FEEDBACK_DURATION_MS = 1200;
const COPY_FAILURE = 'No se pudo copiar — selecciona y copia';
const RESULT_NOTE = 'Valor aproximado. Verifica siempre antes de operar.';
const RESULT_HINT = 'Con los parámetros actuales, puedes operar el siguiente tamaño.';

const SVG_NS = 'http://www.w3.org/2000/svg';

type ZoneQuestionFields =
  | { method: 'distance'; input: HTMLInputElement; unit: HTMLElement }
  | { method: 'prices'; entry: HTMLInputElement; sl: HTMLInputElement };

interface Refs {
  // Zone 1 — structure never changes; fields are synced in place.
  assetTrigger: HTMLButtonElement;
  assetMenu: HTMLElement;
  assetOptions: readonly HTMLButtonElement[];
  symbolValue: HTMLElement;
  symbolMark: HTMLElement;
  symbolBadge: HTMLElement;
  balanceInput: HTMLInputElement;
  riskPctInput: HTMLInputElement;
  riskUsd: HTMLElement;
  /**
   * Companion-only (`null` on the page): the header disclosure that holds the
   * three risk cells there. Both refs are present or both are absent — the
   * trigger without the panel it controls would be an inert control, which
   * this module does not build (see `buildHeader`).
   */
  riskSettingsTrigger: HTMLButtonElement | null;
  riskSettingsPanel: HTMLElement | null;
  // Zone 2 — rebuilt only when the method actually changes.
  questionFieldsContainer: HTMLElement;
  questionFields: ZoneQuestionFields;
  methodOptions: Readonly<Record<Method, HTMLButtonElement>>;
  // Zone 3 — no input lives here; render invalidates its async copy lifecycle before rebuilding.
  answerContainer: HTMLElement;
}

/** Retrieves the active realm used by clipboard and feedback timers, and by D-6's companion adapter. */
export function getMountedWindow(): Window | null {
  return currentWindow;
}

/**
 * Retrieves the live in-memory state of the current mount. D-6's companion
 * adapter reads this immediately before each leg of the host↔companion move
 * — the ONLY narrow accessor this task adds — because `mount()` calls
 * `unmount()` first, which resets `currentState` to `INITIAL_STATE`; reading
 * it here, before that reset, is what carries a typed-but-unpersisted
 * distance/entry/SL across the move (S-1 spike report §4.2). Never mutated
 * by the caller: `LotajeState` fields are all primitives and every write
 * path here (`transitionState`) already replaces the object rather than
 * mutating it in place.
 */
export function getMountedState(): LotajeState {
  return currentState;
}

// ---- icons -----------------------------------------------------------------
/**
 * Inline SVG built through `doc.createElementNS`, never innerHTML and never an
 * Angular template: this module has no framework and no asset pipeline of its
 * own, and the companion realm receives only the stylesheets the adapter
 * copies — an `<img src>` or an icon-font would be a second thing to keep
 * alive across two documents. Every icon is decorative: its meaning is always
 * carried by adjacent text or by the control's accessible name, so all of them
 * are `aria-hidden`.
 */
interface IconShape {
  readonly tag: 'path' | 'circle' | 'line' | 'rect';
  readonly attrs: Readonly<Record<string, string>>;
}

type IconName =
  | 'calculator'
  | 'popout'
  | 'close'
  | 'chevron'
  | 'check'
  | 'settings'
  | 'copy'
  | 'target'
  | 'points'
  | 'prices';

const ICONS: Readonly<Record<IconName, readonly IconShape[]>> = {
  calculator: [
    { tag: 'rect', attrs: { x: '3', y: '3', width: '18', height: '18', rx: '2.5' } },
    { tag: 'line', attrs: { x1: '3', y1: '9', x2: '21', y2: '9' } },
    { tag: 'line', attrs: { x1: '9', y1: '9', x2: '9', y2: '21' } },
    { tag: 'line', attrs: { x1: '15', y1: '9', x2: '15', y2: '21' } },
    { tag: 'line', attrs: { x1: '3', y1: '15', x2: '21', y2: '15' } },
  ],
  popout: [
    { tag: 'path', attrs: { d: 'M10 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4' } },
    { tag: 'path', attrs: { d: 'M14 4h6v6' } },
    { tag: 'line', attrs: { x1: '20', y1: '4', x2: '11', y2: '13' } },
  ],
  close: [
    { tag: 'line', attrs: { x1: '6', y1: '6', x2: '18', y2: '18' } },
    { tag: 'line', attrs: { x1: '18', y1: '6', x2: '6', y2: '18' } },
  ],
  chevron: [{ tag: 'path', attrs: { d: 'M6 9.5 12 15.5 18 9.5' } }],
  check: [{ tag: 'path', attrs: { d: 'M4.5 12.5 9.5 17.5 19.5 7' } }],
  settings: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '3.2' } },
    {
      tag: 'path',
      attrs: {
        d: 'M19.4 14.5a1.6 1.6 0 0 0 .32 1.77l.06.06a1.94 1.94 0 1 1-2.75 2.75l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47v.16a1.94 1.94 0 1 1-3.88 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a1.94 1.94 0 1 1-2.75-2.75l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97h-.16a1.94 1.94 0 1 1 0-3.88h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a1.94 1.94 0 1 1 2.75-2.75l.06.06a1.6 1.6 0 0 0 1.77.32h.08a1.6 1.6 0 0 0 .97-1.47v-.16a1.94 1.94 0 1 1 3.88 0v.09a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.94 1.94 0 1 1 2.75 2.75l-.06.06a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.47.97h.16a1.94 1.94 0 1 1 0 3.88h-.09a1.6 1.6 0 0 0-1.46.97Z',
      },
    },
  ],
  copy: [
    { tag: 'rect', attrs: { x: '9', y: '9', width: '11', height: '11', rx: '2' } },
    {
      tag: 'path',
      attrs: {
        d: 'M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5',
      },
    },
  ],
  target: [
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '8.5' } },
    { tag: 'circle', attrs: { cx: '12', cy: '12', r: '4' } },
    { tag: 'path', attrs: { d: 'M12 11.9h.01' } },
  ],
  points: [{ tag: 'path', attrs: { d: 'M3 12h3.5L9 5l4 14 2.5-7H21' } }],
  prices: [
    { tag: 'line', attrs: { x1: '12', y1: '3', x2: '12', y2: '21' } },
    {
      tag: 'path',
      attrs: {
        d: 'M16.5 7.2C16.5 5.4 14.5 4 12 4S7.5 5.4 7.5 7.2s2 2.7 4.5 3.4 4.5 1.6 4.5 3.4-2 3.2-4.5 3.2-4.5-1.4-4.5-3.2',
      },
    },
  ],
};

function buildIcon(doc: Document, name: IconName, className: string): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const shape of ICONS[name]) {
    const node = doc.createElementNS(SVG_NS, shape.tag);
    for (const [attr, value] of Object.entries(shape.attrs)) node.setAttribute(attr, value);
    svg.appendChild(node);
  }
  return svg;
}

/** The square identity mark beside a ticker: two glyphs of text, tinted per instrument. */
function buildAssetMark(doc: Document, symbol: string): HTMLElement {
  const mark = doc.createElement('span');
  mark.className = 'lotaje-asset-mark';
  mark.setAttribute('aria-hidden', 'true');
  syncAssetMark(mark, symbol);
  return mark;
}

function syncAssetMark(mark: HTMLElement, symbol: string): void {
  const display = assetDisplay(symbol);
  mark.textContent = symbol === '' ? '—' : display.mark;
  mark.dataset['tone'] = symbol === '' ? 'muted' : display.tone;
}

function buildLabel(doc: Document, text: string, htmlFor?: string): HTMLElement {
  const label = doc.createElement(htmlFor === undefined ? 'span' : 'label');
  label.className = 'lotaje-label';
  label.textContent = text;
  if (htmlFor !== undefined) (label as HTMLLabelElement).htmlFor = htmlFor;
  return label;
}

// ---- value sync (never clobber a field mid-edit) -------------------------
/**
 * Mirrors Angular's own property-binding no-op (the v1 page's F1 fix relied
 * on it): only writes `.value` when it actually differs from the desired
 * text. The field the user is CURRENTLY typing into always already holds
 * exactly this text (the event handler copied `input.value` into state
 * moments earlier), so this never disturbs focus or caret position.
 */
function syncValue(input: HTMLInputElement, text: string): void {
  if (input.value !== text) input.value = text;
}

// ---- event handlers (stable module-level identities over live mount state) ----
/**
 * The single choke point for every `LotajeState` change (Task C-2): assign,
 * render, then persist only if an actual CONTEXT field (balance/risk/symbol/
 * method) changed. Typing distance/entry/SL, stepping, Escape, and every
 * D-3/D-4/D-5 UI action never produce a context diff here, so they never
 * write. A write failure never rolls back this already-rendered state —
 * `saveLotajeContext` is best-effort (`./persistence`).
 */
function transitionState(next: LotajeState): void {
  const previous = currentState;
  currentState = next;
  render();
  const contextChanged =
    previous.balanceText !== currentState.balanceText ||
    previous.riskPctText !== currentState.riskPctText ||
    previous.symbolText !== currentState.symbolText ||
    previous.method !== currentState.method;
  if (contextChanged && currentWindow) {
    saveLotajeContext(currentWindow, currentState);
  }
}

function setState(patch: Partial<LotajeState>): void {
  transitionState({ ...currentState, ...patch });
}

function onBalanceInput(e: Event): void {
  setState({ balanceText: (e.target as HTMLInputElement).value });
}
function onRiskPctInput(e: Event): void {
  setState({ riskPctText: (e.target as HTMLInputElement).value });
}

// ---- asset selector (F21-3: a curated listbox, never free text) ------------
/**
 * F21-3: the free-text «Otro símbolo» field is gone. It could name an
 * instrument the registry has no specification for, and the tool then sized it
 * from a name-shape guess — an unfinished behaviour with no way to finish it
 * honestly (the calculation specs come from MT5, not from a text box). The
 * picker now offers exactly the instruments the application owns specs for.
 * The heuristic badge below survives on purpose: a context persisted by an
 * older build can still carry a symbol outside the catalogue, and when it does
 * the provenance must still be declared rather than silently dropped.
 */
function setAssetMenuOpen(open: boolean): void {
  assetMenuOpen = open;
  if (refs) {
    refs.assetTrigger.setAttribute('aria-expanded', String(open));
    refs.assetMenu.hidden = !open;
  }
  syncAssetDismissListener();
}

/**
 * Dismissal on an outside press, shared by the asset menu and the companion's
 * risk-settings disclosure. A capture-phase `pointerdown` on the mounted
 * DOCUMENT — not a `focusout` on the wrapper — because a press on
 * non-focusable page area produces no focus event at all, and because this is
 * deterministic: `.click()` never synthesises `pointerdown`, so the unit suite
 * exercises the keyboard/selection paths without this listener firing
 * incidentally. Registered only while its surface is open, removed the moment
 * it closes, and again on `unmount()` before the realm reference is dropped.
 *
 * `wrapperOf` is a thunk, not an element: both wrappers are rebuilt by every
 * fresh `mount()`, and resolving them at EVENT time keeps this handler's
 * shape identical to every other handler in this file (stable module-level
 * identity over live mount state).
 */
function addOutsidePressHandler(
  wrapperOf: () => Element | null | undefined,
  onOutsidePress: () => void,
): (event: Event) => void {
  const handler = (event: Event): void => {
    const wrapper = wrapperOf();
    const target = event.target as Node | null;
    if (wrapper && target && typeof target.nodeType === 'number' && wrapper.contains(target)) {
      return;
    }
    onOutsidePress();
  };
  currentDoc?.addEventListener('pointerdown', handler, true);
  return handler;
}

function syncAssetDismissListener(): void {
  if (assetMenuOpen && currentDoc && !assetDismissHandler) {
    assetDismissHandler = addOutsidePressHandler(
      () => refs?.assetMenu.parentElement,
      () => setAssetMenuOpen(false),
    );
    return;
  }
  if (!assetMenuOpen) removeAssetDismissListener();
}

function removeAssetDismissListener(): void {
  if (!assetDismissHandler) return;
  currentDoc?.removeEventListener('pointerdown', assetDismissHandler, true);
  assetDismissHandler = null;
}

function focusAssetOption(index: number): void {
  const options = refs?.assetOptions;
  if (!options || options.length === 0) return;
  const wrapped = ((index % options.length) + options.length) % options.length;
  options[wrapped].focus();
}

function activeAssetOptionIndex(): number {
  const options = refs?.assetOptions ?? [];
  const selected = options.findIndex((option) => option.getAttribute('aria-selected') === 'true');
  return selected === -1 ? 0 : selected;
}

function openAssetMenu(index = activeAssetOptionIndex()): void {
  setAssetMenuOpen(true);
  focusAssetOption(index);
}

function closeAssetMenu(returnFocus: boolean): void {
  if (!assetMenuOpen) return;
  setAssetMenuOpen(false);
  if (returnFocus) refs?.assetTrigger.focus();
}

function onAssetTriggerClick(): void {
  if (assetMenuOpen) closeAssetMenu(false);
  else openAssetMenu();
}

function onAssetOptionClick(symbol: string): void {
  if (!Object.prototype.hasOwnProperty.call(GENERATED_ASSETS, symbol)) return;
  setState({ symbolText: symbol });
  closeAssetMenu(true);
}

/**
 * One keydown listener on the wrapper that holds both the trigger and the
 * menu, so trigger-opens-menu and menu-navigation share a single handler and a
 * single removal. `Escape` stops propagating: the root handler (D-5) reads a
 * bare `Escape` as "clear the stop field", which must not also happen when the
 * key's only job was dismissing this menu.
 */
function onAssetSelectKeyDown(event: KeyboardEvent): void {
  if (!refs || event.altKey || event.ctrlKey || event.metaKey) return;
  const onTrigger = event.target === refs.assetTrigger;

  if (event.key === 'Escape') {
    if (!assetMenuOpen) return;
    event.preventDefault();
    event.stopPropagation();
    closeAssetMenu(true);
    return;
  }

  if (event.key === 'Tab') {
    closeAssetMenu(false);
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!assetMenuOpen) {
      openAssetMenu();
      return;
    }
    if (onTrigger) {
      focusAssetOption(event.key === 'ArrowDown' ? 0 : refs.assetOptions.length - 1);
      return;
    }
    const current = refs.assetOptions.indexOf(event.target as HTMLButtonElement);
    if (current === -1) return;
    focusAssetOption(current + (event.key === 'ArrowDown' ? 1 : -1));
    return;
  }

  if ((event.key === 'Home' || event.key === 'End') && assetMenuOpen && !onTrigger) {
    event.preventDefault();
    focusAssetOption(event.key === 'Home' ? 0 : refs.assetOptions.length - 1);
  }
}

// ---- companion risk settings (account size + risk %, behind a disclosure) ----
/**
 * The companion's initial composition is deliberately just activo → modo/
 * campos → resultado: at 320x340 there is no room for the account/risk pair,
 * and a trader who already set them on the page does not need to see them
 * again to size a trade. They are one click away here, in a disclosure
 * ANCHORED to its trigger and absolutely positioned, so opening it can never
 * grow the document and reintroduce the vertical scrollbar the redesign
 * exists to remove.
 *
 * The controls inside are the very same `<input>` elements the page renders
 * in its summary row (`buildRiskFields`), wired to the very same `input`
 * handlers, so editing here is an ordinary `LotajeState` transition: it
 * re-derives the lot figure, persists through `transitionState`'s context
 * diff, and travels back to the page when the companion closes.
 */
function setRiskSettingsOpen(open: boolean): void {
  riskSettingsOpen = open;
  if (refs?.riskSettingsTrigger && refs.riskSettingsPanel) {
    refs.riskSettingsTrigger.setAttribute('aria-expanded', String(open));
    refs.riskSettingsPanel.hidden = !open;
  }
  syncRiskSettingsDismissListener();
}

function syncRiskSettingsDismissListener(): void {
  if (riskSettingsOpen && currentDoc && !riskSettingsDismissHandler) {
    riskSettingsDismissHandler = addOutsidePressHandler(
      () => refs?.riskSettingsPanel?.parentElement,
      () => setRiskSettingsOpen(false),
    );
    return;
  }
  if (!riskSettingsOpen) removeRiskSettingsDismissListener();
}

function removeRiskSettingsDismissListener(): void {
  if (!riskSettingsDismissHandler) return;
  currentDoc?.removeEventListener('pointerdown', riskSettingsDismissHandler, true);
  riskSettingsDismissHandler = null;
}

/**
 * Closes the disclosure and returns focus to the trigger that opened it — the
 * same contract `closeAssetMenu` already honours, and what keeps `Escape` and
 * the outside-press path from stranding focus on a node that just became
 * unreachable (`hidden` removes its contents from the tab order).
 */
function closeRiskSettings(returnFocus: boolean): void {
  if (!riskSettingsOpen) return;
  setRiskSettingsOpen(false);
  if (returnFocus) refs?.riskSettingsTrigger?.focus();
}

function onRiskSettingsTriggerClick(): void {
  if (riskSettingsOpen) {
    closeRiskSettings(false);
    return;
  }
  setRiskSettingsOpen(true);
  refs?.balanceInput.focus();
}

function onDistanceInput(e: Event): void {
  setState({ distanceText: (e.target as HTMLInputElement).value });
}
function onEntryInput(e: Event): void {
  setState({ entryText: (e.target as HTMLInputElement).value });
}
function onSlInput(e: Event): void {
  setState({ slText: (e.target as HTMLInputElement).value });
}

/**
 * The segmented control picks a method rather than flipping one; choosing the
 * already-active mode is a no-op, so P4's "switching CONVERTS, never resets"
 * still runs exactly once per real change.
 */
function onMethodOptionClick(method: Method): void {
  if (currentState.method === method) return;
  transitionState(switchMethod(currentState));
}

/**
 * Radio-group arrow semantics: the group is a single tab stop (roving
 * `tabindex`, see `syncMethodOptions`), and an arrow key moves to the other
 * mode AND selects it, which is what `role="radio"` promises. Without this the
 * roving tabindex would make the unselected mode unreachable from a keyboard.
 */
function onMethodToggleKeyDown(event: KeyboardEvent): void {
  if (!refs || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (
    event.key !== 'ArrowLeft' &&
    event.key !== 'ArrowRight' &&
    event.key !== 'ArrowUp' &&
    event.key !== 'ArrowDown'
  ) {
    return;
  }
  event.preventDefault();
  const next: Method = currentState.method === 'distance' ? 'prices' : 'distance';
  onMethodOptionClick(next);
  refs.methodOptions[next].focus();
}

/**
 * Wired to the «Abrir mini calculadora» trigger. `currentDoc`/`currentWindow`
 * are read at CLICK time (the stable-identity pattern this module already uses
 * for every other handler), never captured at build time — the trigger is
 * rebuilt on every fresh `mount()`, but reading module state here rather
 * than closing over the `doc`/`win` mount() was called with keeps this
 * handler's shape identical to the rest of the file. The trigger stays a real
 * button: Document Picture-in-Picture only opens from a trusted gesture, so
 * there is no route, effect or synthetic click that could replace it.
 */
function onCompanionTriggerClick(): void {
  if (!currentDoc || !currentWindow) return;
  openCompanionWindow(currentDoc, currentWindow);
}

/**
 * Companion-only. Closes the realm this view is currently mounted in, which
 * fires its `pagehide` and drives `./companion-window`'s single teardown path
 * — the same one the window-manager's own close button drives. It is a real
 * window action, not a painted-on control; there is deliberately no minimise
 * button beside it, because no browser API backs one.
 */
function onCompanionCloseClick(): void {
  currentWindow?.close();
}

function stepDistance(direction: -1 | 1, multiplier: 1 | 10): void {
  const parsed = parseDecimal(currentState.distanceText);
  const baseline = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  const candidate = Math.max(0, baseline + direction * multiplier);
  const rounded = Math.round(candidate * 1e8) / 1e8;
  const displayed = Number.isFinite(rounded) ? rounded : candidate;
  setState({ distanceText: String(displayed) });
}

function onRootFocusIn(event: FocusEvent): void {
  if (currentRoot !== event.currentTarget || !refs) return;
  const target = event.target;
  const numericTarget =
    target === refs.balanceInput ||
    target === refs.riskPctInput ||
    (refs.questionFields.method === 'distance'
      ? target === refs.questionFields.input
      : target === refs.questionFields.entry || target === refs.questionFields.sl);
  if (numericTarget) (target as HTMLInputElement).select();
}

function onRootKeyDown(event: KeyboardEvent): void {
  const root = currentRoot;
  if (!root || root !== event.currentTarget || !refs || !currentDoc) return;
  if (event.isComposing || event.defaultPrevented || event.ctrlKey || event.metaKey) {
    return;
  }

  if (event.altKey) {
    // D-7: companion-only shortcuts (product design §§317-319, 322, 501,
    // 546). The page host stays exactly as inert as it was before this task
    // — every combo below is gated on `isCompanionDocument`, never reached
    // otherwise. Deliberately no visual affordance (§546: "atajos por encima
    // de descubribilidad"). `Alt+A` used to open the asset-spec disclosure
    // and went away with it; the risk-settings disclosure that replaced it in
    // the header deliberately did NOT inherit the combo — it has a real,
    // labelled, tab-reachable trigger, which is the discoverable affordance
    // the spec sheet never had.
    if (!isCompanionDocument(currentDoc)) return;
    const key = event.key.toLowerCase();

    if (key === 'm') {
      // The segmented control PICKS a method and its click handler
      // (`onMethodOptionClick`) early-returns when asked to select the
      // already-active one — Alt+M must ALTERNATE, so the target is always
      // computed as the OTHER of the two methods, never the current one.
      // `switchMethod` runs through that same path, so P4's
      // convert-never-reset semantics fire exactly once.
      event.preventDefault();
      const next: Method = currentState.method === 'distance' ? 'prices' : 'distance';
      onMethodOptionClick(next);
      return;
    }

    if (key === 's') {
      event.preventDefault();
      refs.assetTrigger.focus();
      return;
    }

    // Any other Alt combo (browser/OS shortcuts) is left completely alone.
    return;
  }

  if (event.key === 'Escape') {
    // The open disclosure claims Escape first: dismissing an open surface is
    // what the key means while one is showing, and clearing the stop field
    // underneath it at the same time would be two actions for one press. The
    // asset menu handles its own Escape one level down (`onAssetSelectKeyDown`
    // stops propagation) for exactly the same reason.
    if (riskSettingsOpen) {
      event.preventDefault();
      closeRiskSettings(true);
      return;
    }
    if (currentState.method === 'distance') {
      if (currentState.distanceText !== '') setState({ distanceText: '' });
    } else if (currentState.slText !== '') {
      setState({ slText: '' });
    }
    return;
  }

  if (event.key === 'Enter') {
    if (event.shiftKey || currentDoc.activeElement !== event.target) return;
    const editableTarget =
      event.target === refs.balanceInput ||
      event.target === refs.riskPctInput ||
      (refs.questionFields.method === 'distance'
        ? event.target === refs.questionFields.input
        : event.target === refs.questionFields.entry || event.target === refs.questionFields.sl);
    if (!editableTarget) return;

    const copyAction = root.querySelector<HTMLButtonElement>('.lotaje-copy-action');
    if (!copyAction || copyAction.disabled) return;
    event.preventDefault();
    copyAction.click();
    return;
  }

  if (
    (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') ||
    currentState.method !== 'distance' ||
    refs.questionFields.method !== 'distance' ||
    event.target !== refs.questionFields.input ||
    currentDoc.activeElement !== event.target
  ) {
    return;
  }

  event.preventDefault();
  stepDistance(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey ? 10 : 1);
}

// ---- copy feedback lifecycle -----------------------------------------------
function clearFeedbackTimer(): void {
  if (!activeFeedbackTimer) return;
  activeFeedbackTimer.window.clearTimeout(activeFeedbackTimer.id);
  activeFeedbackTimer = null;
}

function clearCurrentCopyFeedback(): void {
  clearFeedbackTimer();
  currentRoot
    ?.querySelector('.lotaje-copy-action--copied')
    ?.classList.remove('lotaje-copy-action--copied');
  const feedback = currentRoot?.querySelector<HTMLElement>('.lotaje-copy-feedback');
  if (feedback) feedback.textContent = '';
}

function invalidateCopyAttempt(): void {
  copyAttemptGeneration += 1;
  clearCurrentCopyFeedback();
}

function isCurrentCopyAttempt(
  capturedMountGeneration: number,
  capturedAttemptGeneration: number,
  mountedWindow: Window,
  button: HTMLButtonElement,
  feedback: HTMLElement,
): boolean {
  return (
    mountGeneration === capturedMountGeneration &&
    copyAttemptGeneration === capturedAttemptGeneration &&
    currentWindow === mountedWindow &&
    currentRoot !== null &&
    currentRoot.contains(button) &&
    currentRoot.contains(feedback)
  );
}

function showCopyFailure(
  capturedMountGeneration: number,
  capturedAttemptGeneration: number,
  mountedWindow: Window,
  button: HTMLButtonElement,
  feedback: HTMLElement,
): void {
  if (
    !isCurrentCopyAttempt(
      capturedMountGeneration,
      capturedAttemptGeneration,
      mountedWindow,
      button,
      feedback,
    )
  ) {
    return;
  }
  clearFeedbackTimer();
  button.classList.remove('lotaje-copy-action--copied');
  feedback.textContent = COPY_FAILURE;
}

function showCopySuccess(
  capturedMountGeneration: number,
  capturedAttemptGeneration: number,
  mountedWindow: Window,
  button: HTMLButtonElement,
  feedback: HTMLElement,
): void {
  if (
    !isCurrentCopyAttempt(
      capturedMountGeneration,
      capturedAttemptGeneration,
      mountedWindow,
      button,
      feedback,
    )
  ) {
    return;
  }

  clearFeedbackTimer();
  button.classList.add('lotaje-copy-action--copied');
  feedback.textContent = 'Copiado';

  const timerId = mountedWindow.setTimeout(() => {
    if (
      !isCurrentCopyAttempt(
        capturedMountGeneration,
        capturedAttemptGeneration,
        mountedWindow,
        button,
        feedback,
      )
    ) {
      return;
    }
    activeFeedbackTimer = null;
    button.classList.remove('lotaje-copy-action--copied');
    feedback.textContent = '';
  }, COPY_FEEDBACK_DURATION_MS);
  activeFeedbackTimer = { window: mountedWindow, id: timerId };
}

function onCopyActionClick(
  button: HTMLButtonElement,
  feedback: HTMLElement,
  payload: string,
): void {
  const mountedWindow = currentWindow;
  if (!mountedWindow || !currentRoot?.contains(button)) return;

  const capturedMountGeneration = mountGeneration;
  const capturedAttemptGeneration = ++copyAttemptGeneration;
  clearCurrentCopyFeedback();

  let write: Promise<void>;
  try {
    // This target-realm call must stay synchronous in the trusted click stack.
    write = mountedWindow.navigator.clipboard.writeText(payload);
  } catch {
    showCopyFailure(
      capturedMountGeneration,
      capturedAttemptGeneration,
      mountedWindow,
      button,
      feedback,
    );
    return;
  }

  void write.then(
    () =>
      showCopySuccess(
        capturedMountGeneration,
        capturedAttemptGeneration,
        mountedWindow,
        button,
        feedback,
      ),
    () =>
      showCopyFailure(
        capturedMountGeneration,
        capturedAttemptGeneration,
        mountedWindow,
        button,
        feedback,
      ),
  );
}

// ---- header ----------------------------------------------------------------
/**
 * `data-lotaje-companion` is stamped by `./companion-window` on the companion
 * document only, so this is the one honest way for a single mounted view to
 * know which surface is currently showing it.
 */
function isCompanionDocument(doc: Document): boolean {
  return doc.documentElement.hasAttribute('data-lotaje-companion');
}

function buildHeader(
  doc: Document,
  companion: boolean,
  riskFields: RiskFields,
): {
  root: HTMLElement;
  riskSettingsTrigger: HTMLButtonElement | null;
  riskSettingsPanel: HTMLElement | null;
} {
  const header = doc.createElement('header');
  header.className = 'lotaje-header';

  const identity = doc.createElement('div');
  identity.className = 'lotaje-header-identity';
  const mark = doc.createElement('span');
  mark.className = 'lotaje-header-mark';
  mark.append(buildIcon(doc, 'calculator', 'lotaje-icon'));
  const title = doc.createElement('h1');
  title.className = 'lotaje-title';
  title.id = 'lotaje-title';
  title.textContent = companion ? 'Calculadora flotante' : 'Calculadora de lotes';
  identity.append(mark, title);

  const actions = doc.createElement('div');
  actions.className = 'lotaje-header-actions';
  if (!companion) {
    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.className = 'lotaje-companion-trigger';
    trigger.append(buildIcon(doc, 'popout', 'lotaje-icon'));
    const label = doc.createElement('span');
    label.textContent = 'Abrir mini calculadora';
    trigger.append(label);
    trigger.addEventListener('click', onCompanionTriggerClick);
    actions.append(trigger);
    header.append(identity, actions);
    return { root: header, riskSettingsTrigger: null, riskSettingsPanel: null };
  }

  // Two controls, in this order: the risk settings the compact composition
  // hides, then the close action. Still no minimise button — nothing in the
  // platform implements one, and an inert control that looks live is worse
  // than no control.
  const settings = doc.createElement('div');
  settings.className = 'lotaje-settings';
  const settingsTrigger = doc.createElement('button');
  settingsTrigger.type = 'button';
  settingsTrigger.className = 'lotaje-settings-trigger';
  settingsTrigger.setAttribute('aria-label', 'Ajustes de riesgo');
  settingsTrigger.setAttribute('aria-expanded', 'false');
  settingsTrigger.setAttribute('aria-controls', 'lotaje-risk-settings');
  settingsTrigger.title = 'Ajustes de riesgo';
  settingsTrigger.append(buildIcon(doc, 'settings', 'lotaje-icon'));
  settingsTrigger.addEventListener('click', onRiskSettingsTriggerClick);

  const settingsPanel = doc.createElement('div');
  settingsPanel.id = 'lotaje-risk-settings';
  settingsPanel.className = 'lotaje-settings-panel';
  settingsPanel.setAttribute('role', 'group');
  settingsPanel.setAttribute('aria-label', 'Ajustes de riesgo');
  settingsPanel.hidden = true;
  settingsPanel.append(riskFields.balanceCell, riskFields.riskCell, riskFields.riskUsdCell);
  settings.append(settingsTrigger, settingsPanel);

  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 'lotaje-companion-close';
  close.setAttribute('aria-label', 'Cerrar la calculadora flotante');
  close.title = 'Cerrar';
  close.append(buildIcon(doc, 'close', 'lotaje-icon'));
  close.addEventListener('click', onCompanionCloseClick);
  actions.append(settings, close);

  header.append(identity, actions);
  return { root: header, riskSettingsTrigger: settingsTrigger, riskSettingsPanel: settingsPanel };
}

// ---- Zone 1 · Contexto ----------------------------------------------------
function buildAssetSelect(
  doc: Document,
  state: LotajeState,
  derived: LotajeDerived,
): { root: HTMLElement } & Pick<
  Refs,
  'assetTrigger' | 'assetMenu' | 'assetOptions' | 'symbolValue' | 'symbolMark' | 'symbolBadge'
> {
  const root = doc.createElement('div');
  root.className = 'lotaje-asset-select';

  const trimmedSymbol = state.symbolText.trim();
  const canonicalSymbol = trimmedSymbol === '' ? '' : resolveAsset(trimmedSymbol).symbol;

  const trigger = doc.createElement('button');
  trigger.type = 'button';
  trigger.id = 'lotaje-asset-trigger';
  trigger.className = 'lotaje-asset-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', 'lotaje-asset-menu');
  trigger.setAttribute('aria-labelledby', 'lotaje-asset-label lotaje-asset-trigger');
  trigger.addEventListener('click', onAssetTriggerClick);

  const symbolMark = buildAssetMark(doc, canonicalSymbol);
  const symbolValue = doc.createElement('span');
  symbolValue.className = 'lotaje-symbol-value';
  symbolValue.textContent = canonicalSymbol === '' ? 'Símbolo' : canonicalSymbol;
  const symbolBadge = doc.createElement('span');
  symbolBadge.className = 'lotaje-symbol-badge';
  symbolBadge.textContent = 'heurística';
  symbolBadge.hidden = !derived.isHeuristic;
  trigger.append(symbolMark, symbolValue, symbolBadge, buildIcon(doc, 'chevron', 'lotaje-caret'));

  const menu = doc.createElement('div');
  menu.id = 'lotaje-asset-menu';
  menu.className = 'lotaje-asset-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', 'Selecciona un activo');
  menu.hidden = true;
  const menuTitle = doc.createElement('p');
  menuTitle.className = 'lotaje-asset-menu-title';
  menuTitle.setAttribute('aria-hidden', 'true');
  menuTitle.textContent = 'Selecciona un activo';
  menu.append(menuTitle);

  const assetOptions: HTMLButtonElement[] = [];
  for (const symbol of Object.keys(GENERATED_ASSETS)) {
    const option = doc.createElement('button');
    option.type = 'button';
    option.className = 'lotaje-asset-option';
    option.setAttribute('role', 'option');
    option.setAttribute('data-symbol', symbol);
    option.setAttribute('aria-selected', String(symbol === canonicalSymbol));
    const optionSymbol = doc.createElement('span');
    optionSymbol.className = 'lotaje-asset-option-symbol';
    optionSymbol.textContent = symbol;
    const optionName = doc.createElement('span');
    optionName.className = 'lotaje-asset-option-name';
    optionName.textContent = assetDisplay(symbol).name;
    option.append(
      buildAssetMark(doc, symbol),
      optionSymbol,
      optionName,
      buildIcon(doc, 'check', 'lotaje-asset-option-check'),
    );
    option.addEventListener('click', () => onAssetOptionClick(symbol));
    menu.append(option);
    assetOptions.push(option);
  }

  root.addEventListener('keydown', onAssetSelectKeyDown);
  root.append(trigger, menu);

  return {
    root,
    assetTrigger: trigger,
    assetMenu: menu,
    assetOptions,
    symbolValue,
    symbolMark,
    symbolBadge,
  };
}

function buildSummaryCell(
  doc: Document,
  modifier: string,
  label: HTMLElement,
  control: Node,
): HTMLElement {
  const cell = doc.createElement('div');
  cell.className = `lotaje-summary-cell lotaje-summary-cell--${modifier}`;
  cell.append(label, control);
  return cell;
}

/**
 * The account/risk trio, built ONCE per mount and placed by the caller: the
 * page appends these three cells to its summary row, the companion hands them
 * to `buildHeader`'s collapsed disclosure. Same elements, same handlers, same
 * `LotajeState` — the two hosts differ in where the cells are attached, never
 * in what they are or what they do.
 */
interface RiskFields {
  readonly balanceCell: HTMLElement;
  readonly riskCell: HTMLElement;
  readonly riskUsdCell: HTMLElement;
  readonly balanceInput: HTMLInputElement;
  readonly riskPctInput: HTMLInputElement;
  readonly riskUsd: HTMLElement;
}

function buildRiskFields(doc: Document, state: LotajeState, derived: LotajeDerived): RiskFields {
  const balanceField = doc.createElement('div');
  balanceField.className = 'lotaje-field lotaje-field-balance';
  const balanceInput = doc.createElement('input');
  balanceInput.id = 'lotaje-balance';
  balanceInput.type = 'text';
  balanceInput.inputMode = 'decimal';
  balanceInput.name = 'balance';
  balanceInput.className = 'ui-input';
  balanceInput.value = state.balanceText;
  balanceInput.addEventListener('input', onBalanceInput);
  const balanceSuffix = doc.createElement('span');
  balanceSuffix.className = 'lotaje-field-suffix';
  balanceSuffix.textContent = 'USD';
  balanceField.append(balanceInput, balanceSuffix);

  const riskField = doc.createElement('div');
  riskField.className = 'lotaje-field lotaje-field-risk';
  const riskPctInput = doc.createElement('input');
  riskPctInput.id = 'lotaje-risk';
  riskPctInput.type = 'text';
  riskPctInput.inputMode = 'decimal';
  riskPctInput.name = 'riskPct';
  riskPctInput.className = 'ui-input';
  riskPctInput.value = state.riskPctText;
  riskPctInput.addEventListener('input', onRiskPctInput);
  const riskSuffix = doc.createElement('span');
  riskSuffix.className = 'lotaje-field-suffix';
  riskSuffix.textContent = '%';
  riskField.append(riskPctInput, riskSuffix);

  // Derived, not editable: no field chrome, accent colour, and its own cell so
  // it stays the honest anchor beside the risk it was computed from (§3.1).
  const riskUsd = doc.createElement('span');
  riskUsd.className = 'lotaje-risk-usd';
  riskUsd.textContent = formatMoney(derived.requestedRiskUsd);

  return {
    balanceCell: buildSummaryCell(
      doc,
      'balance',
      buildLabel(doc, 'Tamaño de cuenta', 'lotaje-balance'),
      balanceField,
    ),
    riskCell: buildSummaryCell(
      doc,
      'risk',
      buildLabel(doc, 'Riesgo por operación', 'lotaje-risk'),
      riskField,
    ),
    riskUsdCell: buildSummaryCell(doc, 'risk-usd', buildLabel(doc, 'Riesgo en USD'), riskUsd),
    balanceInput,
    riskPctInput,
    riskUsd,
  };
}

/**
 * `riskFields` is appended here on the PAGE and is `null` in the companion,
 * where `buildHeader` has already taken the same cells into its disclosure.
 * An element belongs to exactly one parent, so this is a placement decision,
 * not a duplication one.
 */
function buildZoneContext(
  doc: Document,
  state: LotajeState,
  derived: LotajeDerived,
  riskFields: RiskFields | null,
): { root: HTMLElement } & Pick<
  Refs,
  'assetTrigger' | 'assetMenu' | 'assetOptions' | 'symbolValue' | 'symbolMark' | 'symbolBadge'
> {
  const root = doc.createElement('section');
  root.className = 'lotaje-zone lotaje-zone--context';
  root.setAttribute('aria-label', 'Contexto');

  const summary = doc.createElement('div');
  summary.className = 'lotaje-summary';

  // DOM order is the visual order (activo → cuenta → riesgo → riesgo derivado),
  // which is also the tab order product design §7.2 specifies. The `order`
  // divergence the first pass needed is gone: the reference composition puts
  // the instrument first on the page too.
  const assetLabel = buildLabel(doc, 'Activo');
  assetLabel.id = 'lotaje-asset-label';
  const asset = buildAssetSelect(doc, state, derived);
  summary.append(buildSummaryCell(doc, 'asset', assetLabel, asset.root));

  if (riskFields) {
    summary.append(riskFields.balanceCell, riskFields.riskCell, riskFields.riskUsdCell);
  }

  root.append(summary);

  return {
    root,
    assetTrigger: asset.assetTrigger,
    assetMenu: asset.assetMenu,
    assetOptions: asset.assetOptions,
    symbolValue: asset.symbolValue,
    symbolMark: asset.symbolMark,
    symbolBadge: asset.symbolBadge,
  };
}

// ---- Zone 2 · La pregunta --------------------------------------------------
function buildFieldGroup(
  doc: Document,
  modifier: string,
  label: HTMLElement,
  control: Node,
): HTMLElement {
  const group = doc.createElement('div');
  group.className = `lotaje-field-group lotaje-field-group--${modifier}`;
  group.append(label, control);
  return group;
}

function buildZoneQuestionFields(
  doc: Document,
  container: HTMLElement,
  state: LotajeState,
  derived: LotajeDerived,
): ZoneQuestionFields {
  container.innerHTML = '';
  if (state.method === 'distance') {
    // Points mode renders ONE field. There is no reserved Entrada/SL row
    // waiting empty beside it — the grid tracks come from the children that
    // actually exist.
    const distanceControl = doc.createElement('div');
    distanceControl.className = 'lotaje-distance-control';
    const decrement = doc.createElement('button');
    decrement.type = 'button';
    decrement.className = 'lotaje-stop-step';
    decrement.setAttribute('aria-label', 'Disminuir distancia del stop');
    decrement.textContent = '-';
    decrement.addEventListener('click', () => stepDistance(-1, 1));
    const field = doc.createElement('div');
    field.className = 'lotaje-field lotaje-field-stop';
    const input = doc.createElement('input');
    input.id = 'lotaje-distance';
    input.type = 'text';
    input.inputMode = 'decimal';
    input.name = 'distance';
    input.className = 'ui-input';
    input.value = state.distanceText;
    input.addEventListener('input', onDistanceInput);
    const unit = doc.createElement('span');
    unit.className = 'lotaje-field-suffix lotaje-stop-unit';
    unit.textContent = derived.unitLabel;
    field.append(input, unit);
    const increment = doc.createElement('button');
    increment.type = 'button';
    increment.className = 'lotaje-stop-step';
    increment.setAttribute('aria-label', 'Aumentar distancia del stop');
    increment.textContent = '+';
    increment.addEventListener('click', () => stepDistance(1, 1));
    distanceControl.append(decrement, field, increment);
    container.append(
      buildFieldGroup(
        doc,
        'distance',
        buildLabel(doc, 'Distancia', 'lotaje-distance'),
        distanceControl,
      ),
    );
    return { method: 'distance', input, unit };
  }

  const entryField = doc.createElement('div');
  entryField.className = 'lotaje-field lotaje-field-entry';
  const entry = doc.createElement('input');
  entry.id = 'lotaje-entry';
  entry.type = 'text';
  entry.inputMode = 'decimal';
  entry.name = 'entry';
  entry.className = 'ui-input';
  entry.value = state.entryText;
  entry.addEventListener('input', onEntryInput);
  const entrySuffix = doc.createElement('span');
  entrySuffix.className = 'lotaje-field-suffix';
  entrySuffix.textContent = '$';
  entryField.append(entry, entrySuffix);

  const slField = doc.createElement('div');
  slField.className = 'lotaje-field lotaje-field-sl';
  const sl = doc.createElement('input');
  sl.id = 'lotaje-sl';
  sl.type = 'text';
  sl.inputMode = 'decimal';
  sl.name = 'sl';
  sl.className = 'ui-input';
  sl.value = state.slText;
  sl.addEventListener('input', onSlInput);
  const slSuffix = doc.createElement('span');
  slSuffix.className = 'lotaje-field-suffix';
  slSuffix.textContent = '$';
  slField.append(sl, slSuffix);

  container.append(
    buildFieldGroup(doc, 'entry', buildLabel(doc, 'Entrada', 'lotaje-entry'), entryField),
    buildFieldGroup(doc, 'sl', buildLabel(doc, 'SL', 'lotaje-sl'), slField),
  );
  return { method: 'prices', entry, sl };
}

const METHOD_LABELS: Readonly<Record<Method, string>> = {
  distance: 'Distancia',
  prices: 'Precios',
};

/**
 * The companion's mockup names the distance mode «Puntos», and the redesign
 * brief names the two options `Puntos` and `Precios` in the same breath — so
 * that is what the floating window shows. The page keeps «Distancia», which
 * its own brief settled on and which stays accurate for an FX symbol, where
 * the field's unit is pips rather than points. The two labels naming one
 * control differently is a divergence worth closing in one direction or the
 * other; it is recorded here rather than resolved silently, because both
 * spellings are explicitly specified for their own surface.
 */
const COMPANION_METHOD_LABELS: Readonly<Record<Method, string>> = {
  distance: 'Puntos',
  prices: 'Precios',
};

const METHOD_ICONS: Readonly<Record<Method, IconName>> = {
  distance: 'points',
  prices: 'prices',
};

function buildZoneQuestion(
  doc: Document,
  state: LotajeState,
  derived: LotajeDerived,
): { root: HTMLElement } & Pick<
  Refs,
  'questionFieldsContainer' | 'questionFields' | 'methodOptions'
> {
  const root = doc.createElement('section');
  root.className = 'lotaje-zone lotaje-zone--question';
  root.setAttribute('aria-label', 'La pregunta');

  // F21-1: the old single toggle button was a fixed-width control in a row
  // that could not shrink, and it overflowed the companion at its 240 CSS px
  // floor. This is a two-option group whose tracks are `minmax(0, 1fr)` and
  // which restacks with the rest of the calculation area.
  const method = doc.createElement('div');
  method.className = 'lotaje-method';
  const methodLabel = buildLabel(doc, 'Modo');
  methodLabel.id = 'lotaje-method-label';
  const methodToggle = doc.createElement('div');
  methodToggle.className = 'lotaje-method-toggle';
  methodToggle.setAttribute('role', 'radiogroup');
  methodToggle.setAttribute('aria-labelledby', 'lotaje-method-label');
  methodToggle.addEventListener('keydown', onMethodToggleKeyDown);

  const methodLabels = companionHost ? COMPANION_METHOD_LABELS : METHOD_LABELS;
  const methodOptions = {} as Record<Method, HTMLButtonElement>;
  for (const candidate of ['distance', 'prices'] as const) {
    const option = doc.createElement('button');
    option.type = 'button';
    option.className = 'lotaje-method-option';
    option.setAttribute('role', 'radio');
    option.setAttribute('data-method', candidate);
    option.append(buildIcon(doc, METHOD_ICONS[candidate], 'lotaje-icon'));
    const label = doc.createElement('span');
    label.textContent = methodLabels[candidate];
    option.append(label);
    option.addEventListener('click', () => onMethodOptionClick(candidate));
    methodToggle.append(option);
    methodOptions[candidate] = option;
  }
  syncMethodOptions(methodOptions, state.method);
  method.append(methodLabel, methodToggle);

  const questionFieldsContainer = doc.createElement('div');
  questionFieldsContainer.className = 'lotaje-question-fields';
  const questionFields = buildZoneQuestionFields(doc, questionFieldsContainer, state, derived);

  root.append(method, questionFieldsContainer);

  return { root, questionFieldsContainer, questionFields, methodOptions };
}

/**
 * Selection is carried by `aria-checked` for assistive technology and by a
 * filled surface plus a heavier label weight visually — never by the accent
 * colour alone (brief §7).
 */
function syncMethodOptions(
  options: Readonly<Record<Method, HTMLButtonElement>>,
  method: Method,
): void {
  for (const candidate of ['distance', 'prices'] as const) {
    const selected = candidate === method;
    const option = options[candidate];
    option.setAttribute('aria-checked', String(selected));
    // Roving tabindex: the group is one tab stop, arrows move within it.
    option.tabIndex = selected ? 0 : -1;
    option.classList.toggle('lotaje-method-option--selected', selected);
  }
}

// ---- Zone 3 · La respuesta --------------------------------------------------
/**
 * No input lives in Zone 3, so unlike Zones 1-2 it is safe to fully rebuild
 * on every render — there is no focus/caret to preserve.
 *
 * The figure itself is the control (brief §2.4) — there is no separate
 * icon-only action to reach or to disable. The companion adds a DECORATIVE
 * copy glyph inside that same button, which is what the redesign mockup
 * shows; it is `aria-hidden`, has no handler of its own, and changes nothing
 * about the behaviour: click or `Enter` from any editable field still copies
 * the bare two-decimal payload through the mounted realm's clipboard (§7.5).
 */
function buildZoneAnswerBody(doc: Document, container: HTMLElement, derived: LotajeDerived): void {
  container.innerHTML = '';

  const shell = doc.createElement('div');
  shell.className = 'lotaje-copy-shell';
  const feedback = doc.createElement('span');
  feedback.className = 'lotaje-copy-feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  feedback.setAttribute('aria-atomic', 'true');

  if (derived.invalidReason !== null || !Number.isFinite(derived.lots)) {
    // Honest states REPLACE the lot figure — never sit beside it (product
    // design §5.3, brief §6). The `!Number.isFinite(derived.lots)` disjunct
    // (Wave 4 audit L-4) catches an extreme-but-parseable balance (e.g.
    // `1e400`, which overflows to Infinity) that passes every "positive"
    // check yet produces a non-finite lot figure — without it, the hero
    // rendered `formatLots(Infinity) = '—'` on an ENABLED copy button.
    //
    // D-3 disabled-not-hidden: with the glyph removed there is no separate
    // affordance left to disable, and the honest message now occupies the
    // figure's own slot. The no-jump guarantee it protected is unchanged and
    // still comes from `.lotaje-copy-shell`'s `min-height`, not from keeping a
    // dead control on screen.
    const message = doc.createElement('p');
    message.id = 'lotaje-copy-unavailable-reason';
    message.className = 'lotaje-invalid-state';
    message.setAttribute('role', 'alert');
    message.textContent = derived.invalidReason;

    shell.append(message, feedback);
    container.append(shell);
    return;
  }

  const hero = doc.createElement('div');
  hero.className = 'lotaje-hero';
  const copyAction = doc.createElement('button');
  copyAction.type = 'button';
  copyAction.className = 'lotaje-copy-action';
  const payload = formatLots(derived.lots);
  // The accessible name carries the FIGURE as well as the action: with a bare
  // «Copiar lotaje» the number itself never reached the accessibility tree.
  copyAction.setAttribute('aria-label', `Copiar ${payload} lotes`);
  copyAction.title = 'Copiar lotaje';
  const copyContent = doc.createElement('span');
  copyContent.className = 'lotaje-copy-content';
  const lotsValue = doc.createElement('span');
  lotsValue.className = 'lotaje-lots-value';
  lotsValue.textContent = payload;
  const lotsLabel = doc.createElement('span');
  lotsLabel.className = 'lotaje-lots-label';
  lotsLabel.textContent = 'lotes';
  copyContent.append(lotsValue, lotsLabel);
  copyAction.append(copyContent);
  if (companionHost) copyAction.append(buildIcon(doc, 'copy', 'lotaje-copy-glyph'));
  copyAction.addEventListener('click', () => onCopyActionClick(copyAction, feedback, payload));
  hero.append(copyAction);
  shell.append(hero, feedback);
  container.append(shell);

  // The min-lot/rounding warning ACCOMPANIES the figure — never instead of it.
  if (derived.minLotWarning !== null) {
    const warning = doc.createElement('p');
    warning.className = 'lotaje-floor-warning';
    warning.setAttribute('role', 'alert');
    warning.textContent = derived.minLotWarning;
    container.append(warning);
  }
}

/**
 * The companion builds ONE block: the figure, its `lotes` label and the copy
 * action, and nothing else. The page's target mark, «Tamaño de posición»
 * title, explanatory hint and standing note are not merely hidden there —
 * they are never created. At 320x340 each of them is a line of chrome
 * competing with the only number the window exists to show, and a permanent
 * note that cannot be dismissed is the kind of text a trader stops reading
 * after the first session. Honest states (`invalidReason`, `minLotWarning`)
 * are unaffected: they live in the body below and still REPLACE or ACCOMPANY
 * the figure exactly as they do on the page.
 */
function buildZoneAnswer(
  doc: Document,
  derived: LotajeDerived,
  companion: boolean,
): { root: HTMLElement; body: HTMLElement } {
  const root = doc.createElement('section');
  root.className = 'lotaje-zone lotaje-zone--answer';
  root.setAttribute('aria-label', 'La respuesta');

  const result = doc.createElement('div');
  result.className = 'lotaje-result';

  const body = doc.createElement('div');
  body.className = 'lotaje-result-body';
  buildZoneAnswerBody(doc, body, derived);

  if (companion) {
    result.append(body);
    root.append(result);
    return { root, body };
  }

  const mark = doc.createElement('span');
  mark.className = 'lotaje-result-mark';
  mark.append(buildIcon(doc, 'target', 'lotaje-icon'));

  const lede = doc.createElement('div');
  lede.className = 'lotaje-result-lede';
  const title = doc.createElement('h2');
  title.className = 'lotaje-result-title';
  title.textContent = 'Tamaño de posición';
  const hint = doc.createElement('p');
  hint.className = 'lotaje-result-hint';
  hint.textContent = RESULT_HINT;
  lede.append(title, hint);

  const note = doc.createElement('p');
  note.className = 'lotaje-result-note';
  note.textContent = RESULT_NOTE;

  result.append(mark, lede, body, note);
  root.append(result);
  return { root, body };
}

// ---- render ----------------------------------------------------------------
function render(): void {
  if (!refs || !currentDoc) return;
  invalidateCopyAttempt();
  const derived = deriveLots(currentState);

  // Zone 1 — sync in place, never recreated.
  syncValue(refs.balanceInput, currentState.balanceText);
  syncValue(refs.riskPctInput, currentState.riskPctText);
  const trimmedSymbol = currentState.symbolText.trim();
  const canonicalSymbol = trimmedSymbol === '' ? '' : resolveAsset(trimmedSymbol).symbol;
  refs.symbolValue.textContent = canonicalSymbol === '' ? 'Símbolo' : canonicalSymbol;
  syncAssetMark(refs.symbolMark, canonicalSymbol);
  for (const option of refs.assetOptions) {
    option.setAttribute(
      'aria-selected',
      String(option.getAttribute('data-symbol') === canonicalSymbol),
    );
  }
  refs.riskUsd.textContent = formatMoney(derived.requestedRiskUsd);
  refs.symbolBadge.hidden = !derived.isHeuristic;

  // Zone 2 — rebuilt ONLY on an actual method change (a discrete click, never
  // an implicit side effect of typing a keystroke); otherwise synced in place
  // so the field currently being typed into never loses focus/caret.
  if (currentState.method !== refs.questionFields.method) {
    refs.questionFields = buildZoneQuestionFields(
      currentDoc,
      refs.questionFieldsContainer,
      currentState,
      derived,
    );
  } else if (refs.questionFields.method === 'distance') {
    syncValue(refs.questionFields.input, currentState.distanceText);
    refs.questionFields.unit.textContent = derived.unitLabel;
  } else {
    syncValue(refs.questionFields.entry, currentState.entryText);
    syncValue(refs.questionFields.sl, currentState.slText);
  }
  syncMethodOptions(refs.methodOptions, currentState.method);

  // Zone 3 — pending copy work is invalidated above, then the subtree is rebuilt.
  buildZoneAnswerBody(currentDoc, refs.answerContainer, derived);
}

// ---- mount / unmount --------------------------------------------------------
/**
 * Builds the Lotaje view into `doc`. An explicit third argument (including an
 * explicit `undefined`) is guarded per field and used as-is, never consulting
 * storage. An OMITTED third argument loads the persisted context via
 * `loadLotajeContext(win)` (Task C-2), merges it over `INITIAL_STATE`, and
 * runs it through the same per-field guard below — so a missing key,
 * malformed JSON/root, or a read failure all degrade to the identical P2
 * cold-start defaults. Neither path ever writes: the first save happens only
 * after a later actual context transition (see `transitionState`, above).
 * Precedence is decided by call ARITY (`rest.length`), not by the value
 * passed — an explicitly passed `undefined` still counts as "supplied" and
 * bypasses storage.
 * Idempotent: always tears down any previous mount first (see the module doc
 * above). Looks for an existing `#lotaje-mount` container in `doc`; creates one
 * on `doc.body` if none exists.
 */
export function mount(doc: Document, win: Window, ...rest: [LotajeState?]): void {
  unmount();

  let container = doc.getElementById(LOTAJE_MOUNT_ID);
  if (!container) {
    container = doc.createElement('div');
    container.id = LOTAJE_MOUNT_ID;
    doc.body.appendChild(container);
  }
  container.innerHTML = '';

  currentDoc = doc;
  currentWindow = win;
  const initialState: LotajeState | undefined =
    rest.length === 0 ? { ...INITIAL_STATE, ...loadLotajeContext(win) } : rest[0];
  const supplied =
    initialState !== null && typeof initialState === 'object'
      ? (initialState as Partial<Record<keyof LotajeState, unknown>>)
      : {};
  currentState = {
    balanceText:
      typeof supplied.balanceText === 'string' ? supplied.balanceText : INITIAL_STATE.balanceText,
    riskPctText:
      typeof supplied.riskPctText === 'string' ? supplied.riskPctText : INITIAL_STATE.riskPctText,
    symbolText:
      typeof supplied.symbolText === 'string' ? supplied.symbolText : INITIAL_STATE.symbolText,
    method:
      supplied.method === 'distance' || supplied.method === 'prices'
        ? supplied.method
        : INITIAL_STATE.method,
    distanceText:
      typeof supplied.distanceText === 'string'
        ? supplied.distanceText
        : INITIAL_STATE.distanceText,
    entryText:
      typeof supplied.entryText === 'string' ? supplied.entryText : INITIAL_STATE.entryText,
    slText: typeof supplied.slText === 'string' ? supplied.slText : INITIAL_STATE.slText,
  };
  assetMenuOpen = false;
  riskSettingsOpen = false;
  companionHost = isCompanionDocument(doc);

  const balance = parseDecimal(currentState.balanceText);
  const riskPct = parseDecimal(currentState.riskPctText);
  const restored =
    Number.isFinite(balance) &&
    balance > 0 &&
    Number.isFinite(riskPct) &&
    riskPct > 0 &&
    currentState.symbolText.trim() !== '';

  const root = doc.createElement('div');
  root.className = 'lotaje-root';

  const derived = deriveLots(currentState);
  // Built before the header and the context zone because BOTH of them are
  // possible parents for these three cells, and exactly one of them takes
  // ownership (see `RiskFields`).
  const riskFields = buildRiskFields(doc, currentState, derived);
  const header = buildHeader(doc, companionHost, riskFields);
  const zone1 = buildZoneContext(doc, currentState, derived, companionHost ? null : riskFields);
  const zone2 = buildZoneQuestion(doc, currentState, derived);
  const zone3 = buildZoneAnswer(doc, derived, companionHost);

  root.append(header.root, zone1.root, zone2.root, zone3.root);
  container.append(root);
  currentRoot = root;

  refs = {
    assetTrigger: zone1.assetTrigger,
    assetMenu: zone1.assetMenu,
    assetOptions: zone1.assetOptions,
    symbolValue: zone1.symbolValue,
    symbolMark: zone1.symbolMark,
    symbolBadge: zone1.symbolBadge,
    balanceInput: riskFields.balanceInput,
    riskPctInput: riskFields.riskPctInput,
    riskUsd: riskFields.riskUsd,
    riskSettingsTrigger: header.riskSettingsTrigger,
    riskSettingsPanel: header.riskSettingsPanel,
    questionFieldsContainer: zone2.questionFieldsContainer,
    questionFields: zone2.questionFields,
    methodOptions: zone2.methodOptions,
    answerContainer: zone3.body,
  };

  root.addEventListener('focusin', onRootFocusIn);
  root.addEventListener('keydown', onRootKeyDown);

  // On the page, an unrestored context starts on the account field — it is
  // the first thing to fill in. In the companion that field lives inside a
  // COLLAPSED disclosure, where `focus()` is a no-op (a `hidden` subtree is
  // not focusable); the honest first stop there is the asset trigger, which
  // is also the one control an unrestored state is actually missing.
  const initialInput: HTMLInputElement | null = !restored
    ? companionHost
      ? null
      : refs.balanceInput
    : refs.questionFields.method === 'distance'
      ? refs.questionFields.input
      : refs.questionFields.sl;
  const initialFocus: HTMLElement = initialInput ?? refs.assetTrigger;
  initialFocus.focus();
  if (initialInput && doc.activeElement === initialInput) initialInput.select();
}

/**
 * Tears down the mounted view: invalidates pending clipboard settlements,
 * clears the realm-owned feedback timer, explicitly removes D-5's stable root
 * focus/key listeners, removes the root subtree and its descendant listeners,
 * drops every realm/DOM reference, and resets sizing state. No document/window
 * listener is owned here; D-6 separately owns the companion adapter lifecycle.
 * Safe to call when nothing is mounted.
 */
export function unmount(): void {
  mountGeneration += 1;
  copyAttemptGeneration += 1;
  clearCurrentCopyFeedback();
  // Before `currentDoc` is dropped below — it is the realm the listeners are on.
  removeAssetDismissListener();
  removeRiskSettingsDismissListener();
  currentRoot?.removeEventListener('focusin', onRootFocusIn);
  currentRoot?.removeEventListener('keydown', onRootKeyDown);
  if (currentRoot?.parentNode) {
    currentRoot.parentNode.removeChild(currentRoot);
  }
  currentRoot = null;
  refs = null;
  currentDoc = null;
  currentWindow = null;
  currentState = INITIAL_STATE;
  assetMenuOpen = false;
  riskSettingsOpen = false;
  companionHost = false;
}
