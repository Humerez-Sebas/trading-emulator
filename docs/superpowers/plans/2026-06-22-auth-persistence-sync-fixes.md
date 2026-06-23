# Auth Persistence + Sync + Delete Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make Supabase auth+sync actually run on the deployed build, adopt guest sessions into the account on login (with a prompt), and let users delete the active session.

**Architecture:** Fix A is a one-line `vercel.json` build-config change (verified safe because the R2 data path short-circuits the FastAPI surfaces). Fix B adds guest-session adoption on the `authSuccess` login transition via a new effect + two `SessionSyncService` methods + a confirm dialog. Fix C adds a `deleteActiveSession` reducer action and an active-card delete path in the Sesiones page that resets the workspace and propagates the cloud delete.

**Tech Stack:** Angular 21 (standalone + signals), NgRx, `@supabase/supabase-js` v2, Vitest (`ng test`).

**Spec:** `docs/superpowers/specs/2026-06-22-auth-persistence-sync-fixes-design.md` (read it first).

## Global Constraints

- Angular 21 standalone + signals + NgRx; **Spanish** user-facing text; match neighboring files. State/cursor in unix SECONDS; LWW clocks (`clientUpdatedAt`/`syncedAt`) epoch MS.
- Local-first: every mutation writes IndexedDB first; sync is additive and gated to `authStatus()==='authenticated'`; a sync failure must never break the local mutation (try/catch).
- No npm dependencies added. If `emulador/package-lock.json` changes, restore it: `git checkout -- emulador/package-lock.json`.
- CI gates before every commit touching `emulador/` (from `emulador/`): `npm run lint`, `npm run format:check` (or `npm run format`), `npx ng test --no-watch`, `npm run build`. Use Edit/Write, not PowerShell `Set-Content` (mojibake).
- Branch: `claude/supabase-session-sync` (updates PR #8).

---

## Task 1: Fix A — Vercel build uses Supabase auth (config only)

**Files:**
- Modify: `vercel.json` (repo root)

**Interfaces:** none (build config). Produces a deployed build with `offlineOnly:false` so the Supabase session check runs.

- [ ] **Step 1: Edit `vercel.json`** — change `buildCommand` from `"npm run build -- --configuration offline"` to `"npm run build"`. Leave `outputDirectory` (`dist/emulador/browser`), `installCommand`, `rewrites`, and `git` unchanged.
- [ ] **Step 2: Verify the production build succeeds.** From `emulador/`: `npm run build` → "Application bundle generation complete" (a pre-existing bundle-budget WARNING is acceptable; no errors). This is the exact build Vercel will now run.
- [ ] **Step 3: Confirm `offlineOnly` is false in the production env** — `emulador/src/environments/environment.prod.ts` has `offlineOnly: false`, `dataSource: 'r2'`, `backendUrl: ''`, and the Supabase URL/anon key (no change needed; just confirm).
- [ ] **Step 4: Commit.**

```bash
git add vercel.json
git commit -m "fix(deploy): Vercel build uses production config so Supabase auth+sync run (not offline guest mode)"
```

---

## Task 2: Fix C — delete the active session

**Files:**
- Modify: `emulador/src/app/state/trading/trading.actions.ts` (add `deleteActiveSession`)
- Modify: `emulador/src/app/state/trading/trading.reducer.ts` (handle it)
- Modify: `emulador/src/app/state/trading/trading.reducer.spec.ts` (test)
- Modify: `emulador/src/app/pages/sesiones/sesiones-page.component.ts` (`remove()` active branch)
- Modify: `emulador/src/app/pages/sesiones/sesiones-page.component.html` (show "Eliminar" on the active card)
- Modify: `emulador/src/app/pages/sesiones/sesiones-page.component.spec.ts` (test)

**Interfaces:**
- Consumes: `defaultTradingData` + `newId()` (trading); `DialogService.confirm`; `WorkspaceDbService.getMeta/putMeta/addPendingDelete`; `SessionSyncService.flushPendingDeletes`; `authStatus()` signal.
- Produces: `TradingActions.deleteActiveSession()` (emptyProps); the page `remove(card)` now handles `card.id === null`.

- [ ] **Step 1: Add the action.** In `trading.actions.ts`, inside the `events` map add:

```ts
    /** Deletes the ACTIVE/in-progress session: resets it to a fresh empty session. */
    'Delete Active Session': emptyProps(),
```

- [ ] **Step 2: Write the failing reducer test.** In `trading.reducer.spec.ts` add:

```ts
it('deleteActiveSession resets trading to a fresh session, keeps saved sessions, mints a new activeSessionId', () => {
  const start: TradingState = {
    ...makeTradingState(), // helper used elsewhere in this spec
    activeSessionId: 'old-active',
    sessionName: 'Mi plan',
    history: [{ profit: 5 } as never],
    balance: 10500,
    initialBalance: 10000,
    savedSessions: [{ id: 's1', name: 'archivada', createdAt: 1, currentTime: 0, trading: defaultTradingData() }],
  };
  const next = tradingFeature.reducer(start, TradingActions.deleteActiveSession());
  expect(next.history).toEqual([]);
  expect(next.sessionName).toBeNull();
  expect(next.balance).toBe(10000);
  expect(next.activeSessionId).not.toBe('old-active');
  expect(next.activeSessionId).toBeTruthy();
  expect(next.savedSessions.length).toBe(1);
});
```

(If the spec lacks a `makeTradingState()` helper, build the start state with `{ ...initialState, ... }` using the trading `initialState` shape — match how other tests in the file construct state.)

- [ ] **Step 3: Run, verify fail.** `cd emulador && npx vitest run src/app/state/trading/trading.reducer.spec.ts` → FAIL (action/handler missing).

- [ ] **Step 4: Implement the reducer case** in `trading.reducer.ts` (alongside the other `on(...)` handlers; reuse the file's existing `newId()`):

```ts
    on(
      TradingActions.deleteActiveSession,
      (state): TradingState => ({
        ...defaultTradingData(state.initialBalance),
        summaryOpen: false,
        savedSessions: state.savedSessions,
        activeSessionId: newId(),
      }),
    ),
```

- [ ] **Step 5: Run, verify pass.** Same vitest command → PASS.

- [ ] **Step 6: Show "Eliminar" on the active card.** In `sesiones-page.component.html`, the card action menu currently gates delete with `@if (!card.active)`. Add a parallel block so the ACTIVE card also offers delete (same `ui-menu-item--danger` styling, calls `remove(card)`):

```html
    @if (card.active) {
      <div class="ui-menu-sep"></div>
      <button class="ui-menu-item ui-menu-item--danger" (click)="remove(card)">
        <app-trash-icon /> Eliminar
      </button>
    }
```

(Place it adjacent to the existing `@if (!card.active) { ... Eliminar ... }` block.)

- [ ] **Step 7: Implement the active branch in `remove()`.** In `sesiones-page.component.ts`, `remove(card)` currently `if (card.id === null) return;`. Replace that early-return with an active-session delete:

```ts
  async remove(card: SessionCard): Promise<void> {
    if (card.id === null) {
      const ok = await this.dialogs.confirm({
        title: 'Eliminar sesión en curso',
        message: `Se borrará la sesión actual de ${card.symbol}. Esta acción no se puede deshacer.`,
        confirmLabel: 'Eliminar',
        danger: true,
      });
      if (!ok) return;
      const meta = await this.db.getMeta(card.symbol);
      const oldId = meta?.activeSessionId;
      const wasSynced = meta?.activeSyncedAt != null;
      if (card.symbol === this.currentAsset()) {
        this.store.dispatch(TradingActions.deleteActiveSession());
      } else if (meta) {
        meta.trading = defaultTradingData(meta.trading?.initialBalance);
        meta.activeSessionId = newId();
        meta.activeClientUpdatedAt = undefined;
        meta.activeSyncedAt = undefined;
        await this.db.putMeta(meta);
        await this.reload();
      }
      if (this.authStatus() === 'authenticated' && oldId && wasSynced) {
        try {
          await this.db.addPendingDelete({ entity: 'session', id: oldId });
          await this.sync.flushPendingDeletes();
        } catch {
          /* local-first: cloud delete retried on next pull */
        }
      }
      this.flash('Sesión en curso eliminada.');
      return;
    }
    // ... existing archived-card deletion (unchanged) ...
  }
```

(Confirm `ConfirmDialogData` supports `title`/`message`/`confirmLabel`/`danger` — match the existing `confirm-dialog.component.ts` input shape; adjust field names if they differ. `newId()` and `defaultTradingData` are already imported in this component; if not, add the imports.)

- [ ] **Step 8: Write the page test.** In `sesiones-page.component.spec.ts`, follow the existing spec setup (mock `DialogService.confirm` → true, mock `SessionSyncService`, real/mock `WorkspaceDbService`, store mock providing `authStatus`). Assert: deleting an OFF-SCREEN active card (symbol ≠ current) whose meta had `activeSyncedAt` set, when authenticated → `db.getMeta` then `putMeta` with reset trading + a new `activeSessionId`, AND `db.addPendingDelete({entity:'session', id: oldId})` + `sync.flushPendingDeletes()` called; when NOT authenticated → reset happens but no pending-delete/flush; when the dialog returns false → nothing happens.

- [ ] **Step 9: Run the focused spec + verify pass.** `npx vitest run src/app/pages/sesiones/sesiones-page.component.spec.ts`.

- [ ] **Step 10: Gate + commit.** Run all CI gates from `emulador/`. Then:

```bash
git commit -am "feat(sync): delete the active session (reset + propagate cloud delete)"
```

---

## Task 3: Fix B — adopt guest sessions on login (with a prompt)

**Files:**
- Modify: `emulador/src/app/services/session-sync.service.ts` (`countAdoptableSessions`, `markAllAdoptableDirty`)
- Modify: `emulador/src/app/services/session-sync.service.spec.ts` (tests)
- Modify: `emulador/src/app/state/sync/session-sync.effects.ts` (`adoptOnLogin$`; drop `authSuccess` from `login$`)
- Modify: `emulador/src/app/state/sync/session-sync.effects.spec.ts` (tests)

**Interfaces:**
- Consumes: `WorkspaceDbService.listMetas/putMeta`; `isRealSession` (mapping); `DialogService.confirm`; `AuthActions.authSuccess`/`sessionResolved`; `SessionSyncService.pullAndMerge`.
- Produces: `SessionSyncService.countAdoptableSessions(): Promise<number>`, `SessionSyncService.markAllAdoptableDirty(): Promise<void>`; effect `adoptOnLogin$`.

- [ ] **Step 1: Write the failing service tests** in `session-sync.service.spec.ts` (real fake-indexeddb `WorkspaceDbService`): seed two metas — one with a real active session (`activeSessionId` set, real `trading`, `activeSyncedAt` UNSET) and one archived real `SavedSession` with `syncedAt` UNSET, plus one already-synced session (`syncedAt` set) and one non-real default session. Assert `countAdoptableSessions()` returns 2 (only the real never-synced ones). Then `markAllAdoptableDirty()` sets `clientUpdatedAt` on those two (active → `meta.activeClientUpdatedAt`; archived → the SavedSession) and persists, leaving the synced/non-real ones untouched.

- [ ] **Step 2: Run, verify fail.** `npx vitest run src/app/services/session-sync.service.spec.ts` → FAIL.

- [ ] **Step 3: Implement the two methods** in `session-sync.service.ts` (import `isRealSession` from `./session-sync.mapping`):

```ts
  /** Real sessions that have never been pushed from this device (guest work to adopt). */
  async countAdoptableSessions(): Promise<number> {
    const metas = await this.db.listMetas();
    let n = 0;
    for (const meta of metas) {
      if (meta.activeSessionId && meta.trading && isRealSession(meta.trading) && meta.activeSyncedAt == null) n++;
      for (const s of meta.sessions ?? []) {
        if (isRealSession(s.trading) && s.syncedAt == null) n++;
      }
    }
    return n;
  }

  /** Stamp every adoptable session dirty so the next flushDirty uploads it. */
  async markAllAdoptableDirty(): Promise<void> {
    const now = Date.now();
    const metas = await this.db.listMetas();
    for (const meta of metas) {
      let changed = false;
      if (meta.activeSessionId && meta.trading && isRealSession(meta.trading) && meta.activeSyncedAt == null) {
        meta.activeClientUpdatedAt = now;
        changed = true;
      }
      for (const s of meta.sessions ?? []) {
        if (isRealSession(s.trading) && s.syncedAt == null) {
          s.clientUpdatedAt = now;
          changed = true;
        }
      }
      if (changed) await this.db.putMeta(meta);
    }
  }
```

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Write the failing effect tests** in `session-sync.effects.spec.ts`: mock `SessionSyncService` (`countAdoptableSessions`, `markAllAdoptableDirty`, `pullAndMerge`) and `DialogService` (`confirm`). Assert: on `authSuccess`, when `countAdoptableSessions` resolves >0 and `confirm`→true → `markAllAdoptableDirty` then `pullAndMerge` called; when `confirm`→false → `pullAndMerge` called but NOT `markAllAdoptableDirty`; when count===0 → no dialog, `pullAndMerge` called. And `login$` (on `sessionResolved` authenticated) still calls `pullAndMerge`, but `authSuccess` does NOT trigger `login$` a second time (no double pull).

- [ ] **Step 6: Run, verify fail.**

- [ ] **Step 7: Implement** in `session-sync.effects.ts`: inject `DialogService`. Change `login$` from `ofType(authSuccess, sessionResolved)` to `ofType(sessionResolved)` (keep the authenticated filter). Add:

```ts
  adoptOnLogin$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.authSuccess),
        exhaustMap(() =>
          from(
            (async () => {
              try {
                const n = await this.sync.countAdoptableSessions();
                if (n > 0) {
                  const ok = await this.dialogs.confirm({
                    title: 'Guardar sesiones locales',
                    message: `Tienes ${n} sesión(es) local(es). ¿Guardarlas en tu cuenta?`,
                    confirmLabel: 'Guardar',
                  });
                  if (ok) await this.sync.markAllAdoptableDirty();
                }
                await this.sync.pullAndMerge();
              } catch {
                /* local-first: sync resumes on next trigger */
              }
            })(),
          ),
        ),
      ),
    { dispatch: false },
  );
```

(Match `ConfirmDialogData` field names to the actual component. Keep imports: `from` from rxjs, `DialogService`.)

- [ ] **Step 8: Run, verify pass** (full `ng test`).

- [ ] **Step 9: Gate + commit.** All CI gates from `emulador/`. Then:

```bash
git commit -am "feat(sync): adopt guest sessions into the account on login (with prompt)"
```

---

## Self-review (coverage)

- Spec Fix A → Task 1. Fix B → Task 3 (count/markDirty + adoptOnLogin$ + login$ split). Fix C → Task 2 (deleteActiveSession + active remove() + template + cloud propagate).
- Product decisions: login-first/guest-remembered → falls out of Task 1 (no code); ask-on-login → Task 3 dialog; delete-active → Task 2.
- All user text Spanish; sync gated to authenticated + try/catch; no new deps; gates per commit.
