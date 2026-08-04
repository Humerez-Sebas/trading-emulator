/**
 * RFC-020 Task D-1 — the Lotaje view. Framework-free: this module and its
 * siblings under `emulador/src/app/lotaje` import nothing from Angular, NgRx,
 * the app's NgRx state tree, its shared UI component library, or the chart
 * engine (RFC §7.1 item 6, grep-checked in the task report). May import
 * `domain/sizing/*` — the Shared Kernel exists for exactly this.
 *
 * `mount(doc, win)` / `unmount()` take their document and window as EXPLICIT
 * arguments and never reference the bare globals `document`/`window`. This is
 * not a style preference: Task D-6 mounts this same view into a Document
 * Picture-in-Picture window, a different realm (`win.navigator !==
 * window.navigator`, measured in the S-1 spike), and a single global
 * reference is what would break that.
 *
 * Builds the three zones of product design §3 and the method-state switch of
 * §4.1/P4 (distance ⇄ prices; switching CONVERTS, never resets). Deliberately
 * NOT built here (later tasks, see the D-1 brief §7): the `--text-hero` token
 * (D-2), the copy action's click handler (D-3), the Ficha del activo (D-4),
 * focus management / select-on-focus / Esc / steppers / Alt-shortcuts (D-5),
 * persistence (C-2).
 */
import { deriveLots, switchMethod, INITIAL_STATE, type LotajeDerived, type LotajeState, type Method } from './sizing-view-model';
import { formatLots, formatMoney } from './format';

/**
 * The Angular host (`pages/calculadora/calculadora-page.component.ts`)
 * creates a container element with this id in its own template. If `mount()`
 * doesn't find one in the given document, it creates one on `doc.body` — a
 * deliberate fallback so a bare companion document (Task D-6, which starts
 * with nothing but an empty body) can call `mount(doc, win)` without first
 * having to know about this id.
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

type ZoneQuestionFields =
  | { method: 'distance'; input: HTMLInputElement; unit: HTMLElement }
  | { method: 'prices'; entry: HTMLInputElement; sl: HTMLInputElement };

interface Refs {
  // Zone 1 — structure never changes; fields are synced in place.
  symbolInput: HTMLInputElement;
  symbolBadge: HTMLElement;
  balanceInput: HTMLInputElement;
  riskPctInput: HTMLInputElement;
  riskUsd: HTMLElement;
  // Zone 2 — rebuilt only when the method actually changes.
  questionFieldsContainer: HTMLElement;
  questionFields: ZoneQuestionFields;
  methodToggle: HTMLButtonElement;
  // Zone 3 — no input lives here; safe to rebuild on every render.
  answerContainer: HTMLElement;
}

/** Retrieves the window `mount()` was given, for future tasks (D-3, D-6). Unused by D-1 itself. */
export function getMountedWindow(): Window | null {
  return currentWindow;
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

// ---- event handlers (module-level; always read/write the live module state) ----
function setState(patch: Partial<LotajeState>): void {
  currentState = { ...currentState, ...patch };
  render();
}

function onBalanceInput(e: Event): void {
  setState({ balanceText: (e.target as HTMLInputElement).value });
}
function onRiskPctInput(e: Event): void {
  setState({ riskPctText: (e.target as HTMLInputElement).value });
}
function onSymbolInput(e: Event): void {
  setState({ symbolText: (e.target as HTMLInputElement).value });
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
function onMethodToggleClick(): void {
  currentState = switchMethod(currentState);
  render();
}

// ---- Zone 1 · Contexto ----------------------------------------------------
function buildZoneContext(
  doc: Document,
  state: LotajeState,
  derived: LotajeDerived,
): { root: HTMLElement } & Pick<
  Refs,
  'symbolInput' | 'symbolBadge' | 'balanceInput' | 'riskPctInput' | 'riskUsd'
> {
  const root = doc.createElement('section');
  root.className = 'lotaje-zone lotaje-zone--context';
  root.setAttribute('aria-label', 'Contexto');

  // DOM order is balance -> risk -> symbol so the NATURAL tab order matches
  // product design §7.1/§7.2 ("cuenta -> riesgo -> símbolo -> stop"). The
  // visual order (symbol chip first) is achieved with CSS `order`, not DOM
  // order — the two deliberately diverge (§7.1: "el orden del DOM sirve a la
  // accesibilidad; el foco inicial sirve a la velocidad").
  const balanceField = doc.createElement('div');
  balanceField.className = 'lotaje-field lotaje-field-balance';
  const balanceInput = doc.createElement('input');
  balanceInput.type = 'text';
  balanceInput.inputMode = 'decimal';
  balanceInput.name = 'balance';
  balanceInput.className = 'ui-input';
  balanceInput.setAttribute('aria-label', 'Cuenta (USD)');
  balanceInput.value = state.balanceText;
  balanceInput.addEventListener('input', onBalanceInput);
  const balanceSuffix = doc.createElement('span');
  balanceSuffix.className = 'lotaje-field-suffix';
  balanceSuffix.textContent = 'USD';
  balanceField.append(balanceInput, balanceSuffix);

  const riskField = doc.createElement('div');
  riskField.className = 'lotaje-field lotaje-field-risk';
  const riskPctInput = doc.createElement('input');
  riskPctInput.type = 'text';
  riskPctInput.inputMode = 'decimal';
  riskPctInput.name = 'riskPct';
  riskPctInput.className = 'ui-input';
  riskPctInput.setAttribute('aria-label', 'Riesgo %');
  riskPctInput.value = state.riskPctText;
  riskPctInput.addEventListener('input', onRiskPctInput);
  const riskSuffix = doc.createElement('span');
  riskSuffix.className = 'lotaje-field-suffix';
  riskSuffix.textContent = '%';
  riskField.append(riskPctInput, riskSuffix);

  const riskUsd = doc.createElement('span');
  riskUsd.className = 'lotaje-risk-usd';
  riskUsd.textContent = `· ${formatMoney(derived.requestedRiskUsd)}`;

  const chip = doc.createElement('div');
  chip.className = 'lotaje-symbol-chip';
  const symbolInput = doc.createElement('input');
  symbolInput.type = 'text';
  symbolInput.name = 'symbol';
  symbolInput.className = 'ui-input lotaje-symbol-input';
  symbolInput.setAttribute('aria-label', 'Símbolo');
  symbolInput.placeholder = 'Símbolo';
  symbolInput.value = state.symbolText;
  symbolInput.addEventListener('input', onSymbolInput);
  const symbolBadge = doc.createElement('span');
  symbolBadge.className = 'lotaje-symbol-badge';
  symbolBadge.textContent = 'heurística';
  symbolBadge.hidden = !derived.isHeuristic;
  // No click handler: the chip opens the Ficha del activo (Task D-4). D-1
  // renders it inert on purpose — see the task brief §7.
  chip.append(symbolInput, symbolBadge);

  root.append(balanceField, riskField, riskUsd, chip);

  return { root, symbolInput, symbolBadge, balanceInput, riskPctInput, riskUsd };
}

// ---- Zone 2 · La pregunta --------------------------------------------------
function buildZoneQuestionFields(
  doc: Document,
  container: HTMLElement,
  state: LotajeState,
  derived: LotajeDerived,
): ZoneQuestionFields {
  container.innerHTML = '';
  if (state.method === 'distance') {
    const field = doc.createElement('div');
    field.className = 'lotaje-field lotaje-field-stop';
    const input = doc.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.name = 'distance';
    input.className = 'ui-input';
    input.setAttribute('aria-label', 'Stop (distancia)');
    input.value = state.distanceText;
    input.addEventListener('input', onDistanceInput);
    const unit = doc.createElement('span');
    unit.className = 'lotaje-field-suffix lotaje-stop-unit';
    unit.textContent = derived.unitLabel;
    field.append(input, unit);
    container.append(field);
    return { method: 'distance', input, unit };
  }

  const entryField = doc.createElement('div');
  entryField.className = 'lotaje-field lotaje-field-entry';
  const entry = doc.createElement('input');
  entry.type = 'text';
  entry.inputMode = 'decimal';
  entry.name = 'entry';
  entry.className = 'ui-input';
  entry.setAttribute('aria-label', 'Entrada');
  entry.value = state.entryText;
  entry.addEventListener('input', onEntryInput);
  entryField.append(entry);

  const slField = doc.createElement('div');
  slField.className = 'lotaje-field lotaje-field-sl';
  const sl = doc.createElement('input');
  sl.type = 'text';
  sl.inputMode = 'decimal';
  sl.name = 'sl';
  sl.className = 'ui-input';
  sl.setAttribute('aria-label', 'Stop Loss');
  sl.value = state.slText;
  sl.addEventListener('input', onSlInput);
  slField.append(sl);

  container.append(entryField, slField);
  return { method: 'prices', entry, sl };
}

function buildZoneQuestion(
  doc: Document,
  state: LotajeState,
  derived: LotajeDerived,
): { root: HTMLElement } & Pick<Refs, 'questionFieldsContainer' | 'questionFields' | 'methodToggle'> {
  const root = doc.createElement('section');
  root.className = 'lotaje-zone lotaje-zone--question';
  root.setAttribute('aria-label', 'La pregunta');

  const questionFieldsContainer = doc.createElement('div');
  questionFieldsContainer.className = 'lotaje-question-fields';
  const questionFields = buildZoneQuestionFields(doc, questionFieldsContainer, state, derived);

  const methodToggle = doc.createElement('button');
  methodToggle.type = 'button';
  methodToggle.className = 'lotaje-method-toggle';
  methodToggle.textContent = methodToggleLabel(state.method);
  methodToggle.addEventListener('click', onMethodToggleClick);

  root.append(questionFieldsContainer, methodToggle);

  return { root, questionFieldsContainer, questionFields, methodToggle };
}

function methodToggleLabel(method: Method): string {
  return method === 'distance' ? '⇄ precios' : '⇄ distancia';
}

// ---- Zone 3 · La respuesta --------------------------------------------------
/**
 * No input lives in Zone 3, so unlike Zones 1-2 it is safe to fully rebuild
 * on every render — there is no focus/caret to preserve.
 */
function buildZoneAnswerBody(doc: Document, container: HTMLElement, derived: LotajeDerived): void {
  container.innerHTML = '';

  if (derived.invalidReason !== null) {
    // Honest states REPLACE the lot figure — never sit beside it (product
    // design §5.3, brief §6).
    const message = doc.createElement('p');
    message.className = 'lotaje-invalid-state';
    message.setAttribute('role', 'alert');
    message.textContent = derived.invalidReason;
    container.append(message);
    return;
  }

  const hero = doc.createElement('div');
  hero.className = 'lotaje-hero';
  const lotsValue = doc.createElement('span');
  lotsValue.className = 'lotaje-lots-value';
  lotsValue.textContent = formatLots(derived.lots);
  // The copy glyph is rendered — the affordance is structural to Zone 3 —
  // but it has NO click handler. Wiring the clipboard, the flash, the
  // failure message and the disabled state is Task D-3.
  const copyAffordance = doc.createElement('span');
  copyAffordance.className = 'lotaje-copy-affordance';
  copyAffordance.setAttribute('aria-hidden', 'true');
  copyAffordance.textContent = '⧉';
  const lotsLabel = doc.createElement('span');
  lotsLabel.className = 'lotaje-lots-label';
  lotsLabel.textContent = 'lotes';
  hero.append(lotsValue, copyAffordance, lotsLabel);
  container.append(hero);

  // The min-lot/rounding warning ACCOMPANIES the figure — never instead of it.
  if (derived.minLotWarning !== null) {
    const warning = doc.createElement('p');
    warning.className = 'lotaje-floor-warning';
    warning.setAttribute('role', 'alert');
    warning.textContent = derived.minLotWarning;
    container.append(warning);
  }
}

// ---- render ----------------------------------------------------------------
function render(): void {
  if (!refs || !currentDoc) return;
  const derived = deriveLots(currentState);

  // Zone 1 — sync in place, never recreated.
  syncValue(refs.balanceInput, currentState.balanceText);
  syncValue(refs.riskPctInput, currentState.riskPctText);
  syncValue(refs.symbolInput, currentState.symbolText);
  refs.riskUsd.textContent = `· ${formatMoney(derived.requestedRiskUsd)}`;
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
    refs.methodToggle.textContent = methodToggleLabel(currentState.method);
  } else if (refs.questionFields.method === 'distance') {
    syncValue(refs.questionFields.input, currentState.distanceText);
    refs.questionFields.unit.textContent = derived.unitLabel;
  } else {
    syncValue(refs.questionFields.entry, currentState.entryText);
    syncValue(refs.questionFields.sl, currentState.slText);
  }

  // Zone 3 — always rebuilt (no focus to preserve there).
  buildZoneAnswerBody(currentDoc, refs.answerContainer, derived);
}

// ---- mount / unmount --------------------------------------------------------
/**
 * Builds the Lotaje view into `doc` and starts it at the P2 cold-start state.
 * Idempotent: always tears down any previous mount first (see the module doc
 * above). Looks for an existing `#lotaje-mount` container in `doc`; creates
 * one on `doc.body` if none exists.
 */
export function mount(doc: Document, win: Window): void {
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
  currentState = INITIAL_STATE;

  const root = doc.createElement('div');
  root.className = 'lotaje-root';

  const derived = deriveLots(currentState);
  const zone1 = buildZoneContext(doc, currentState, derived);
  const zone2 = buildZoneQuestion(doc, currentState, derived);
  const zone3 = doc.createElement('section');
  zone3.className = 'lotaje-zone lotaje-zone--answer';
  zone3.setAttribute('aria-label', 'La respuesta');
  buildZoneAnswerBody(doc, zone3, derived);

  root.append(zone1.root, zone2.root, zone3);
  container.append(root);
  currentRoot = root;

  refs = {
    symbolInput: zone1.symbolInput,
    symbolBadge: zone1.symbolBadge,
    balanceInput: zone1.balanceInput,
    riskPctInput: zone1.riskPctInput,
    riskUsd: zone1.riskUsd,
    questionFieldsContainer: zone2.questionFieldsContainer,
    questionFields: zone2.questionFields,
    methodToggle: zone2.methodToggle,
    answerContainer: zone3,
  };
}

/**
 * Tears down the mounted view: removes the root subtree from the DOM (every
 * listener this module attached lives on a descendant of it, so removing it
 * and dropping every reference here is a complete cleanup — D-1 never adds a
 * listener to `doc` or `win` themselves; window-level shortcuts are D-5) and
 * resets module state to cold start. Safe to call when nothing is mounted.
 * D-6 calls this from `pagehide`.
 */
export function unmount(): void {
  if (currentRoot?.parentNode) {
    currentRoot.parentNode.removeChild(currentRoot);
  }
  currentRoot = null;
  refs = null;
  currentDoc = null;
  currentWindow = null;
  currentState = INITIAL_STATE;
}
