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
 * §4.1/P4 (distance ⇄ prices; switching CONVERTS, never resets). The host
 * stylesheet supplies the completed context-strip, asset disclosure, hero
 * hierarchy, copy feedback and touch-stepper states. D-5 owns the root-scoped
 * focus and keyboard listeners here. C-2 owns the one centralized
 * post-transition persistence side effect (`transitionState`, below).
 * Deliberately excluded: the companion adapter (D-6) and companion-only Alt
 * shortcuts (D-7).
 */
import { resolveAsset } from '../domain/sizing/asset-registry';
import { GENERATED_ASSETS } from '../domain/sizing/asset-registry.generated';
import { deriveLots, switchMethod, INITIAL_STATE, type LotajeDerived, type LotajeState, type Method } from './sizing-view-model';
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
let symbolDisclosureOpen = false;

const COPY_FEEDBACK_DURATION_MS = 1200;
const COPY_FAILURE = 'No se pudo copiar — selecciona y copia';

type ZoneQuestionFields =
  | { method: 'distance'; input: HTMLInputElement; unit: HTMLElement }
  | { method: 'prices'; entry: HTMLInputElement; sl: HTMLInputElement };

interface AssetValueRefs {
  contractSize: HTMLElement;
  tickSize: HTMLElement;
  pointSize: HTMLElement;
  pipSize: HTMLElement;
  volumeStep: HTMLElement;
  volumeMin: HTMLElement;
  currency: HTMLElement;
  aliases: HTMLElement;
  source: HTMLElement;
}

interface Refs {
  // Zone 1 — structure never changes; fields are synced in place.
  symbolChip: HTMLButtonElement;
  symbolValue: HTMLElement;
  symbolInput: HTMLInputElement;
  symbolSelect: HTMLSelectElement;
  symbolBadge: HTMLElement;
  symbolDisclosure: HTMLElement;
  assetValues: AssetValueRefs;
  balanceInput: HTMLInputElement;
  riskPctInput: HTMLInputElement;
  riskUsd: HTMLElement;
  // Zone 2 — rebuilt only when the method actually changes.
  questionFieldsContainer: HTMLElement;
  questionFields: ZoneQuestionFields;
  methodToggle: HTMLButtonElement;
  // Zone 3 — no input lives here; render invalidates its async copy lifecycle before rebuilding.
  answerContainer: HTMLElement;
}

/** Retrieves the active realm used by clipboard and feedback timers, and later by D-6. */
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
function onSymbolInput(e: Event): void {
  setState({ symbolText: (e.target as HTMLInputElement).value });
}
function setSymbolDisclosureOpen(open: boolean): void {
  symbolDisclosureOpen = open;
  if (!refs) return;
  refs.symbolChip.setAttribute('aria-expanded', String(open));
  refs.symbolDisclosure.hidden = !open;
}
function onSymbolChipClick(): void {
  setSymbolDisclosureOpen(!symbolDisclosureOpen);
}
function onSymbolPresetChange(e: Event): void {
  const symbol = (e.target as HTMLSelectElement).value;
  if (!Object.prototype.hasOwnProperty.call(GENERATED_ASSETS, symbol)) return;
  setState({ symbolText: symbol });
  setSymbolDisclosureOpen(false);
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
  transitionState(switchMethod(currentState));
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
  if (
    event.isComposing ||
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return;
  }

  if (event.key === 'Escape') {
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
      event.target === refs.symbolInput ||
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

// ---- Zone 1 · Contexto ----------------------------------------------------
function appendAssetRow(
  doc: Document,
  list: HTMLDListElement,
  field: keyof AssetValueRefs,
  label: string,
): HTMLElement {
  const row = doc.createElement('div');
  row.className = 'lotaje-asset-row';
  row.setAttribute('data-asset-field', field);
  const term = doc.createElement('dt');
  term.textContent = label;
  const value = doc.createElement('dd');
  row.append(term, value);
  list.append(row);
  return value;
}

function buildAssetSheet(doc: Document): { root: HTMLElement; values: AssetValueRefs } {
  const root = doc.createElement('section');
  root.className = 'lotaje-asset-sheet';
  root.setAttribute('aria-labelledby', 'lotaje-asset-sheet-title');
  const title = doc.createElement('h2');
  title.id = 'lotaje-asset-sheet-title';
  title.textContent = 'Ficha del activo';
  const list = doc.createElement('dl');
  const values: AssetValueRefs = {
    contractSize: appendAssetRow(doc, list, 'contractSize', 'Contrato'),
    tickSize: appendAssetRow(doc, list, 'tickSize', 'Tick'),
    pointSize: appendAssetRow(doc, list, 'pointSize', 'Punto'),
    pipSize: appendAssetRow(doc, list, 'pipSize', 'Pip'),
    volumeStep: appendAssetRow(doc, list, 'volumeStep', 'Paso de volumen'),
    volumeMin: appendAssetRow(doc, list, 'volumeMin', 'Volumen mínimo'),
    currency: appendAssetRow(doc, list, 'currency', 'Divisa'),
    aliases: appendAssetRow(doc, list, 'aliases', 'Alias'),
    source: appendAssetRow(doc, list, 'source', 'Procedencia'),
  };
  root.append(title, list);
  return { root, values };
}

function syncAssetValue(target: HTMLElement, value: string): void {
  target.textContent = value;
  target.classList.toggle(
    'lotaje-asset-value--unavailable',
    value === 'No disponible' || value === 'No aplica',
  );
}

function syncAssetSheet(values: AssetValueRefs, symbolText: string): void {
  const resolved = resolveAsset(symbolText.trim());
  const unavailable = 'No disponible';
  syncAssetValue(values.contractSize, String(resolved.contractSize));
  syncAssetValue(values.tickSize, resolved.tickSize === null ? unavailable : String(resolved.tickSize));
  syncAssetValue(
    values.pointSize,
    resolved.digits === null ? unavailable : String(10 ** -resolved.digits),
  );
  syncAssetValue(values.pipSize, resolved.pipSize === null ? 'No aplica' : String(resolved.pipSize));
  syncAssetValue(
    values.volumeStep,
    resolved.volumeStep === null ? unavailable : String(resolved.volumeStep),
  );
  syncAssetValue(
    values.volumeMin,
    resolved.volumeMin === null ? unavailable : String(resolved.volumeMin),
  );
  syncAssetValue(values.currency, resolved.currency || unavailable);
  syncAssetValue(values.aliases, unavailable);
  syncAssetValue(
    values.source,
    resolved.source === 'heuristic' ? 'heurística' : resolved.source,
  );
}

function buildZoneContext(
  doc: Document,
  state: LotajeState,
  derived: LotajeDerived,
): { root: HTMLElement } & Pick<
  Refs,
  | 'symbolChip'
  | 'symbolValue'
  | 'symbolInput'
  | 'symbolSelect'
  | 'symbolBadge'
  | 'symbolDisclosure'
  | 'assetValues'
  | 'balanceInput'
  | 'riskPctInput'
  | 'riskUsd'
> {
  const root = doc.createElement('section');
  root.className = 'lotaje-zone lotaje-zone--context';
  root.setAttribute('aria-label', 'Contexto');

  // DOM order is balance -> risk -> symbol chip/disclosure so the natural tab
  // order reaches the context before the stop. The visual order (symbol chip
  // first) is achieved with CSS `order`, not DOM order — the two deliberately
  // diverge (product design §7.1).
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

  const chip = doc.createElement('button');
  chip.type = 'button';
  chip.className = 'lotaje-symbol-chip';
  chip.setAttribute('aria-expanded', 'false');
  chip.setAttribute('aria-controls', 'lotaje-symbol-disclosure');
  chip.addEventListener('click', onSymbolChipClick);
  const symbolValue = doc.createElement('span');
  symbolValue.className = 'lotaje-symbol-value';
  const trimmedSymbol = state.symbolText.trim();
  symbolValue.textContent = trimmedSymbol === '' ? 'Símbolo' : resolveAsset(trimmedSymbol).symbol;
  const symbolBadge = doc.createElement('span');
  symbolBadge.className = 'lotaje-symbol-badge';
  symbolBadge.textContent = 'heurística';
  symbolBadge.hidden = !derived.isHeuristic;
  chip.append(symbolValue, symbolBadge);

  const symbolDisclosure = doc.createElement('div');
  symbolDisclosure.id = 'lotaje-symbol-disclosure';
  symbolDisclosure.className = 'lotaje-symbol-disclosure';
  symbolDisclosure.hidden = true;
  const picker = doc.createElement('div');
  picker.className = 'lotaje-symbol-picker';
  const presetLabel = doc.createElement('label');
  presetLabel.htmlFor = 'lotaje-symbol-preset';
  presetLabel.textContent = 'Activos';
  const symbolSelect = doc.createElement('select');
  symbolSelect.id = 'lotaje-symbol-preset';
  symbolSelect.name = 'symbolPreset';
  symbolSelect.className = 'ui-input';
  const prompt = doc.createElement('option');
  prompt.value = '';
  prompt.disabled = true;
  prompt.textContent = 'Selecciona un activo';
  symbolSelect.append(prompt);
  for (const symbol of Object.keys(GENERATED_ASSETS)) {
    const option = doc.createElement('option');
    option.value = symbol;
    option.textContent = symbol;
    symbolSelect.append(option);
  }
  symbolSelect.value = Object.prototype.hasOwnProperty.call(GENERATED_ASSETS, trimmedSymbol.toUpperCase())
    ? trimmedSymbol.toUpperCase()
    : '';
  symbolSelect.addEventListener('change', onSymbolPresetChange);
  const symbolLabel = doc.createElement('label');
  symbolLabel.htmlFor = 'lotaje-symbol-input';
  symbolLabel.textContent = 'Otro símbolo';
  const symbolInput = doc.createElement('input');
  symbolInput.id = 'lotaje-symbol-input';
  symbolInput.type = 'text';
  symbolInput.name = 'symbol';
  symbolInput.className = 'ui-input lotaje-symbol-input';
  symbolInput.autocomplete = 'off';
  symbolInput.value = state.symbolText;
  symbolInput.addEventListener('input', onSymbolInput);
  picker.append(presetLabel, symbolSelect, symbolLabel, symbolInput);

  const assetSheet = buildAssetSheet(doc);
  syncAssetSheet(assetSheet.values, state.symbolText);
  symbolDisclosure.append(picker, assetSheet.root);

  root.append(balanceField, riskField, riskUsd, chip, symbolDisclosure);

  return {
    root,
    symbolChip: chip,
    symbolValue,
    symbolInput,
    symbolSelect,
    symbolBadge,
    symbolDisclosure,
    assetValues: assetSheet.values,
    balanceInput,
    riskPctInput,
    riskUsd,
  };
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
    const increment = doc.createElement('button');
    increment.type = 'button';
    increment.className = 'lotaje-stop-step';
    increment.setAttribute('aria-label', 'Aumentar distancia del stop');
    increment.textContent = '+';
    increment.addEventListener('click', () => stepDistance(1, 1));
    distanceControl.append(decrement, field, increment);
    container.append(distanceControl);
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
    // rendered `formatLots(Infinity) = '—'` on an ENABLED copy button,
    // violating D-3's frozen contract (disabled, not hidden, during honest
    // states).
    const message = doc.createElement('p');
    message.id = 'lotaje-copy-unavailable-reason';
    message.className = 'lotaje-invalid-state';
    message.setAttribute('role', 'alert');
    message.textContent = derived.invalidReason;

    const copyAction = doc.createElement('button');
    copyAction.type = 'button';
    copyAction.className = 'lotaje-copy-action lotaje-copy-action--unavailable';
    copyAction.setAttribute('aria-label', 'Copiar lotaje');
    copyAction.setAttribute('aria-describedby', 'lotaje-copy-unavailable-reason');
    copyAction.title = 'Copiar lotaje';
    copyAction.disabled = true;
    const copyAffordance = doc.createElement('span');
    copyAffordance.className = 'lotaje-copy-affordance';
    copyAffordance.setAttribute('aria-hidden', 'true');
    copyAffordance.textContent = '⧉';
    copyAction.append(copyAffordance);

    shell.append(message, copyAction, feedback);
    container.append(shell);
    return;
  }

  const hero = doc.createElement('div');
  hero.className = 'lotaje-hero';
  const copyAction = doc.createElement('button');
  copyAction.type = 'button';
  copyAction.className = 'lotaje-copy-action';
  copyAction.setAttribute('aria-label', 'Copiar lotaje');
  copyAction.title = 'Copiar lotaje';
  const copyContent = doc.createElement('span');
  copyContent.className = 'lotaje-copy-content';
  const lotsValue = doc.createElement('span');
  lotsValue.className = 'lotaje-lots-value';
  const payload = formatLots(derived.lots);
  lotsValue.textContent = payload;
  const lotsLabel = doc.createElement('span');
  lotsLabel.className = 'lotaje-lots-label';
  lotsLabel.textContent = 'lotes';
  copyContent.append(lotsValue, lotsLabel);
  const copyAffordance = doc.createElement('span');
  copyAffordance.className = 'lotaje-copy-affordance';
  copyAffordance.setAttribute('aria-hidden', 'true');
  copyAffordance.textContent = '⧉';
  copyAction.append(copyContent, copyAffordance);
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

// ---- render ----------------------------------------------------------------
function render(): void {
  if (!refs || !currentDoc) return;
  invalidateCopyAttempt();
  const derived = deriveLots(currentState);

  // Zone 1 — sync in place, never recreated.
  syncValue(refs.balanceInput, currentState.balanceText);
  syncValue(refs.riskPctInput, currentState.riskPctText);
  syncValue(refs.symbolInput, currentState.symbolText);
  const trimmedSymbol = currentState.symbolText.trim();
  const canonicalSymbol = resolveAsset(trimmedSymbol).symbol;
  refs.symbolValue.textContent = trimmedSymbol === '' ? 'Símbolo' : canonicalSymbol;
  refs.symbolSelect.value = Object.prototype.hasOwnProperty.call(GENERATED_ASSETS, canonicalSymbol)
    ? canonicalSymbol
    : '';
  refs.riskUsd.textContent = `· ${formatMoney(derived.requestedRiskUsd)}`;
  refs.symbolBadge.hidden = !derived.isHeuristic;
  syncAssetSheet(refs.assetValues, currentState.symbolText);

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
  symbolDisclosureOpen = false;

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
    symbolChip: zone1.symbolChip,
    symbolValue: zone1.symbolValue,
    symbolInput: zone1.symbolInput,
    symbolSelect: zone1.symbolSelect,
    symbolBadge: zone1.symbolBadge,
    symbolDisclosure: zone1.symbolDisclosure,
    assetValues: zone1.assetValues,
    balanceInput: zone1.balanceInput,
    riskPctInput: zone1.riskPctInput,
    riskUsd: zone1.riskUsd,
    questionFieldsContainer: zone2.questionFieldsContainer,
    questionFields: zone2.questionFields,
    methodToggle: zone2.methodToggle,
    answerContainer: zone3,
  };

  root.addEventListener('focusin', onRootFocusIn);
  root.addEventListener('keydown', onRootKeyDown);

  const initialFocus = !restored
    ? refs.balanceInput
    : refs.questionFields.method === 'distance'
      ? refs.questionFields.input
      : refs.questionFields.sl;
  initialFocus.focus();
  if (doc.activeElement === initialFocus) initialFocus.select();
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
  symbolDisclosureOpen = false;
}
