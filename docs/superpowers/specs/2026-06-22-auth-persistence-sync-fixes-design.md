# Auth Persistence + Sync + Delete Fixes — Design

**Date:** 2026-06-22
**Status:** Approved (brainstorming) — ready for implementation plan
**Branch:** `claude/supabase-session-sync` (continues the Phase-2 PR #8; these are post-review fixes)
**Context:** Phase 2 (session sync) shipped to PR #8 but the user, testing on the Vercel preview, found auth doesn't persist across reloads and cross-browser sync doesn't work. Root-caused below.

> Companion plan: `docs/superpowers/plans/2026-06-22-auth-persistence-sync-fixes.md`.

---

## 1. Problem & root causes

The user created a session in Brave and opened Edge on the same `sebas@gmail.com` account; the session didn't sync, and auth didn't survive a reload. Investigation found:

1. **The deployed (Vercel) build runs in `offlineOnly` mode → no auth, no sync.** `vercel.json` builds with `--configuration offline`, which sets `offlineOnly: true`. The startup effect (`auth.effects.ts` `check$`) does `if (environment.offlineOnly) return continueAsGuest()` — it short-circuits the Supabase session check straight to guest. So on the preview there is **no authentication and no sync at all**; every browser is an anonymous local guest. This single flag explains both the "auth not persistent on reload" and "cross-browser sync doesn't work" reports. (In dev, `offlineOnly:false`, Supabase persists the session via `getSession()`.)

2. **Guest → login: local sessions are not adopted.** In guest mode the active session is never marked dirty (`markActiveDirty` only runs when authenticated), so on login `flushDirty` (which pushes only dirty entities) never uploads the guest's work. It stays local-only on that browser.

3. **The active "Sesión en curso" can't be deleted.** The "Eliminar" action is gated to `@if (!card.active)` (archived cards only). Since there's also no visible "archive" action on the card, the user couldn't discover that a session must be archived before it can be deleted.

## 2. Product decisions (from brainstorming)

- **Entry UX:** *Login first, guest remembered.* A non-authenticated visitor with no prior choice lands on `/login` (which already has a "Continuar como invitado" button); a returning guest (`guestPersisted`) resumes guest; an authenticated user enters and persists. This falls out of fix #1 with the **existing** `guestPersisted` logic — no change to the guest-resume behavior.
- **Guest → login:** *Ask at login.* If the guest has local real sessions, prompt *"¿Guardar tus N sesiones locales en tu cuenta?"* (Sí/No). Sí adopts them (push to cloud); No keeps them local.
- **Delete:** *Allow deleting the active session directly* (resets it), removing the hidden "archive-first" requirement.

## 3. Fixes

### Fix A — Enable Supabase auth+sync on the Vercel/static build (config only)

Change `vercel.json` `buildCommand` from `npm run build -- --configuration offline` to `npm run build` (the default `production` configuration → `offlineOnly: false`). `production` already has `backendUrl: ''`, `registrationEnabled: false`, `dataSource: 'r2'`, and the Supabase URL/anon key.

**Why this is safe (verified):** with `dataSource: 'r2'` (set in every environment), the two surfaces that consume the FastAPI backend short-circuit before any backend call:
- `mercados-page.component.ts` constructor: `if (this.isR2) return;` (skips the csv/backend load + `UserSymbolsActions.load`).
- `crear-sesion-page.component.ts` constructor: `if (this.isR2) { void this.loadR2Assets(...); return; }`.
- `user-symbols.effects.ts` `load$` already falls back to `[]` via `catchError`.

So flipping `offlineOnly:false` only changes auth (runs the Supabase session check); the R2 data path is untouched. The legacy `if (offlineOnly) return continueAsGuest()` line and the `environment.offline.ts` config stay in the repo (dormant; removed in Phase 3). `outputDirectory` (`dist/emulador/browser`) is unchanged (both configs share the Angular `outputPath`).

No app-code or unit-test change. Verification is a successful `npm run build` (production) and the Vercel preview rebuild authenticating instead of forcing guest.

### Fix B — Adopt guest sessions on login (with a prompt)

On the explicit login transition (`AuthActions.authSuccess`), before the login pull:
1. Count **adoptable** sessions = real (`isRealSession`) sessions across all local workspaces whose sync clock is unset (active: `activeSyncedAt == null`; archived `SavedSession`: `syncedAt == null`).
2. If the count is ≥ 1, show `DialogService.confirm` titled *"Guardar sesiones locales"* with body *"Tienes N sesión(es) local(es). ¿Guardarlas en tu cuenta?"*.
3. On confirm → stamp `clientUpdatedAt = Date.now()` on every adoptable session (active → `meta.activeClientUpdatedAt`; archived → the `SavedSession`) and persist, so the subsequent `flushDirty` uploads them. On decline → leave them local.
4. Always run `pullAndMerge()` afterward.

New `SessionSyncService` methods: `countAdoptableSessions(): Promise<number>` and `markAllAdoptableDirty(): Promise<void>`. A new `SessionSyncEffects` effect (`adoptOnLogin$`, `ofType(authSuccess)`, injects `DialogService`) owns this flow; `authSuccess` is removed from the existing `login$` (which becomes `sessionResolved`-only) so `pullAndMerge` is not run twice on login. Guest/anonymous/offline are unaffected (no `authSuccess`).

### Fix C — Delete the active session

Show "Eliminar" on the active "Sesión en curso" card (a parallel template block alongside the existing archived `@if (!card.active)`), with the same destructive styling. The Sesiones page `remove(card)` gains an active branch (`card.id === null`):
1. Confirm via `DialogService.confirm` (*"Eliminar sesión en curso"* / *"Se borrará la sesión actual de {symbol}. Esta acción no se puede deshacer."*).
2. Capture the workspace's current `activeSessionId` (the cloud row id) and whether it was synced (`activeSyncedAt != null`) from the meta **before** resetting.
3. Reset the active session: for the current asset, dispatch a new `TradingActions.deleteActiveSession()` (reducer resets trading to `defaultTradingData(state.initialBalance)` + a fresh `activeSessionId`, `savedSessions` unchanged); for an off-screen asset, set `meta.trading = defaultTradingData(...)`, `meta.activeSessionId = newId()`, clear `meta.activeClientUpdatedAt`/`activeSyncedAt`, `putMeta`, `reload`.
4. If authenticated and the old session was synced, propagate the cloud delete: `db.addPendingDelete({ entity: 'session', id: oldActiveSessionId })` then `sync.flushPendingDeletes()` (try/catch, local-first).

The new fresh active session (trading = default) is not real, so `flushDirty` won't push it; any stale active clocks are harmless until overwritten by the next real edit (`markActiveDirty`). Per-symbol drawings are left as-is (drawings are workspace-level, not per-session in this model).

## 4. Testing

- **Fix A:** no unit test (build config); verified by `npm run build` succeeding and the Vercel preview authenticating. Existing `auth.effects.offline.spec.ts` stays valid (the `offline` config still exists/builds).
- **Fix B:** unit tests — `countAdoptableSessions` counts only real, never-synced sessions; `markAllAdoptableDirty` stamps `clientUpdatedAt`; `adoptOnLogin$` shows the dialog when count>0, adopts on confirm, skips on decline, and always pulls; `login$` no longer reacts to `authSuccess` (no double pull).
- **Fix C:** unit tests — `deleteActiveSession` reducer resets trading + mints a new `activeSessionId` + keeps `savedSessions`; the page `remove()` active branch resets the workspace and, when authenticated + previously synced, enqueues a pending-delete + flush; archived `remove()` unchanged.
- CI gates (lint, format, `ng test`, build) green before each commit. No npm dependencies added.

## 5. Rollback

All three fixes live on `claude/supabase-session-sync` (PR #8). Fix A is a one-line `vercel.json` revert. Fixes B/C are additive (a new action + new service methods + a new effect + a template block); reverting the commits restores prior behavior. No schema or data changes.

## 6. Out of scope

- Removing `offlineOnly` / `environment.offline.ts` / the FastAPI paths entirely (Phase 3, branch `claude/retire-fastapi-backend`).
- Clearing per-symbol drawings when deleting a session.
- `.emul` export/import (deferred Phase-2 Task 13).
