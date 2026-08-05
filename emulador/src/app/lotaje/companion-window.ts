/**
 * RFC-020 Task D-6. Framework-free companion-window adapter. Opens (or
 * focuses) a same-origin companion realm and MOVES the already-mounted
 * `./lotaje-view` into it, then moves it back on teardown. Imports nothing
 * from Angular, NgRx, `state/*`, `components/*` or `domain/chart/*` — only
 * its sibling `./lotaje-view` and `./sizing-view-model` (RFC §7.1 item 6).
 *
 * `mount()`/`unmount()` hold exactly ONE active mount module-wide (see
 * `lotaje-view.ts`'s module doc). There is no "open a second copy" here:
 * opening the companion tears the view out of the host document and hands
 * it to the companion document; closing the companion tears it out of there
 * and hands it back. `getMountedState()` is read at each end of the move,
 * immediately before the `mount()` call that would otherwise reset it
 * (`unmount()` resets to `INITIAL_STATE`) — this is what carries a typed but
 * unpersisted distance/entry/SL across the move (S-1 spike report §4.2).
 *
 * Mechanism preference (S-1 spike, `.superpowers/rfc-020/spike-s1-report.md`):
 * `documentPictureInPicture.requestWindow()` is tried first — it is the only
 * mechanism that carries `WS_EX_TOPMOST` and therefore stays above a
 * maximized MT5, which is the entire product reason this window exists.
 * `window.open('', ...)` is the declared fallback for when the API is absent
 * or the request rejects. Presence of `documentPictureInPicture` does not
 * imply success — both the feature-detect and the promise rejection are
 * handled.
 */
import { getMountedState, LOTAJE_MOUNT_ID, mount, unmount } from './lotaje-view';
import type { LotajeState } from './sizing-view-model';

/**
 * The preferred composition of the polish brief (§2.2): 320x300, comfortably
 * above `documentPictureInPicture`'s measured ~240 CSS px width floor
 * (S-1.e — narrower requests are silently widened, never rejected). It is the
 * PREFERRED size, not the only supported one: the view's own stylesheet
 * restacks down to that floor and up to the full page, so a trader who
 * resizes the companion by hand keeps a usable layout either way.
 */
export const COMPANION_WIDTH = 320;
export const COMPANION_HEIGHT = 300;

interface DocumentPictureInPictureRequestOptions {
  readonly width?: number;
  readonly height?: number;
}

interface DocumentPictureInPictureLike {
  requestWindow(options?: DocumentPictureInPictureRequestOptions): Promise<Window>;
}

/**
 * `documentPictureInPicture` is not yet part of the TypeScript DOM lib
 * shipped with this repo's TS version, so it is read off `window` as
 * `unknown` and shape-checked rather than declared globally — scoped to this
 * one call site rather than a repo-wide ambient `.d.ts` (out of this task's
 * scope table).
 */
function pictureInPictureApi(win: Window): DocumentPictureInPictureLike | null {
  const candidate = (win as unknown as { documentPictureInPicture?: unknown })
    .documentPictureInPicture;
  if (
    candidate !== null &&
    typeof candidate === 'object' &&
    typeof (candidate as { requestWindow?: unknown }).requestWindow === 'function'
  ) {
    return candidate as DocumentPictureInPictureLike;
  }
  return null;
}

// ---- module-level adapter state ------------------------------------------
// Mirrors lotaje-view.ts's own single-mount simplification: one companion
// realm at a time. A second `openCompanionWindow()` call while one is open —
// including a click on the trigger rendered INSIDE the companion itself,
// since the same mounted view renders the same trigger there — focuses the
// existing window instead of spawning another (plan Task D-6, S-1
// undetermined #5).
let companionWindow: Window | null = null;
let hostDocRef: Document | null = null;
let hostWinRef: Window | null = null;
let pagehideHandler: (() => void) | null = null;
let opening = false;

/**
 * Entry point wired to the «Abrir ventana» trigger (`lotaje-view.ts`). Must
 * be invoked synchronously from within a trusted user gesture — the
 * `requestWindow()` call itself happens synchronously in this call stack,
 * even though its result is a promise (mirrors D-3's clipboard call).
 */
export function openCompanionWindow(hostDoc: Document, hostWin: Window): void {
  if (companionWindow && !companionWindow.closed) {
    companionWindow.focus();
    return;
  }
  if (opening) return;
  opening = true;

  const pip = pictureInPictureApi(hostWin);
  if (!pip) {
    openPopup(hostDoc, hostWin);
    return;
  }

  pip
    .requestWindow({ width: COMPANION_WIDTH, height: COMPANION_HEIGHT })
    .then((pipWindow) => attachCompanion(pipWindow, hostDoc, hostWin))
    .catch(() => openPopup(hostDoc, hostWin));
}

function openPopup(hostDoc: Document, hostWin: Window): void {
  const popup = hostWin.open('', '', `width=${COMPANION_WIDTH},height=${COMPANION_HEIGHT}`);
  if (!popup) {
    // Blocked or unsupported (e.g. the in-app Electron pane — S-1 §3). Never
    // surfaced as an error: the host view was never torn down, so the trader
    // is exactly where they started.
    opening = false;
    return;
  }
  attachCompanion(popup, hostDoc, hostWin);
}

/** Runs once a companion realm (either mechanism) is actually available. */
function attachCompanion(companionWin: Window, hostDoc: Document, hostWin: Window): void {
  opening = false;

  // Read BEFORE the move: `mount()` below calls `unmount()` first, which
  // resets the host's in-memory state to INITIAL_STATE (§4.2).
  const carriedState: LotajeState = getMountedState();
  const companionDoc = companionWin.document;

  copyStylesheets(hostDoc, companionDoc);
  mirrorTheme(hostDoc, companionDoc);
  // Product design §9.1/§6.3: the companion floats in its own window and
  // carries --elevation-2 on its root; the in-page version stays flat. This
  // attribute is the selector hook for that page-vs-companion CSS split —
  // never present on the host document.
  companionDoc.documentElement.setAttribute('data-lotaje-companion', 'true');

  mount(companionDoc, companionWin, carriedState);

  companionWindow = companionWin;
  hostDocRef = hostDoc;
  hostWinRef = hostWin;

  renderHostPlaceholder(hostDoc, companionWin);

  const onPagehide = (): void => teardownCompanion();
  companionWin.addEventListener('pagehide', onPagehide);
  pagehideHandler = onPagehide;
}

/**
 * The adapter's own teardown, driven exclusively by the companion window's
 * `pagehide` (S-1: observed firing at close in both mechanisms/browsers).
 * Removes the listener this module owns, then moves the view back into the
 * host document carrying whatever was typed in the companion — the same
 * read-before-move discipline as the outward trip.
 */
function teardownCompanion(): void {
  const closingWindow = companionWindow;
  const returningDoc = hostDocRef;
  const returningWin = hostWinRef;

  if (closingWindow && pagehideHandler) {
    closingWindow.removeEventListener('pagehide', pagehideHandler);
  }
  pagehideHandler = null;
  companionWindow = null;
  hostDocRef = null;
  hostWinRef = null;

  if (!returningDoc || !returningWin) {
    unmount();
    return;
  }
  const returningState: LotajeState = getMountedState();
  mount(returningDoc, returningWin, returningState);
}

/**
 * §4.1: while the companion owns the view, the host page shows a trivial
 * placeholder with a «volver» affordance rather than an empty container.
 * Clicking it closes the companion window, which fires `pagehide` there and
 * drives the same teardown path as the user closing it directly — a single
 * teardown mechanism, not two.
 */
function renderHostPlaceholder(hostDoc: Document, companionWin: Window): void {
  const container = hostDoc.getElementById(LOTAJE_MOUNT_ID);
  if (!container) return;
  container.innerHTML = '';

  const placeholder = hostDoc.createElement('div');
  placeholder.className = 'lotaje-companion-placeholder';

  const message = hostDoc.createElement('p');
  message.className = 'lotaje-companion-placeholder-text';
  message.textContent = 'Lotaje está abierto en la ventana acompañante.';

  const returnButton = hostDoc.createElement('button');
  returnButton.type = 'button';
  returnButton.className = 'lotaje-companion-return';
  returnButton.textContent = 'Volver aquí';
  returnButton.addEventListener('click', () => companionWin.close());

  placeholder.append(message, returnButton);
  container.append(placeholder);
}

/**
 * Copies the host document's stylesheets into the (bare) companion document
 * and wraps each sheet's `cssRules` access individually — a cross-origin
 * sheet throws on read, and one throwing sheet must not abort the copy for
 * the rest. A sheet that throws but carries an `href` is re-linked instead
 * (still resolves, just not inlined); a same-document sheet with no `href`
 * and a throwing `cssRules` has nothing left to copy and is skipped.
 */
function copyStylesheets(sourceDoc: Document, targetDoc: Document): void {
  for (const sheet of Array.from(sourceDoc.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules);
      const style = targetDoc.createElement('style');
      style.textContent = rules.map((rule) => rule.cssText).join('\n');
      targetDoc.head.appendChild(style);
    } catch {
      const href = sheet.href;
      if (href) {
        const link = targetDoc.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        targetDoc.head.appendChild(link);
      }
    }
  }
}

/**
 * Mirrors `data-theme` (`app.ts:30`) onto the companion's own
 * `documentElement` — a bare companion document has no theme attribute of
 * its own, so without this it would render against `:root`'s dark-ish
 * fallback regardless of the trader's actual chosen theme.
 */
function mirrorTheme(sourceDoc: Document, targetDoc: Document): void {
  const theme = sourceDoc.documentElement.getAttribute('data-theme');
  if (theme === null) {
    targetDoc.documentElement.removeAttribute('data-theme');
  } else {
    targetDoc.documentElement.setAttribute('data-theme', theme);
  }
}
