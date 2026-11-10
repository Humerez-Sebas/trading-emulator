# RFC-015/016 audit fixes — Dev Log

Run ledger for `feature/rfc-015-016-audit-fixes` (off `develop` @ `d5dbda3`, the PR #57 merge).

- **Plan:** `docs/superpowers/plans/2026-11-06-rfc-015-016-audit-fixes-plan.md`
- **RFCs:** `docs/architecture/rfcs/015-playbook-adherencia-reglas.md`, `docs/architecture/rfcs/016-diario-enmiendas-playbook.md`
- **Run mode:** batched (task-scoped commits, one final whole-branch audit).
- **Baseline:** 189 files / 2607 tests, lint clean, build initial 673.94 kB.

Artifact language per `CLAUDE.md` §Conventions: English here, Spanish in the RFCs.

---

## Retroactive audit @ `d5dbda3` (`branch-auditor`, 2026-11-03) — **NOT PASS**

RFC-015 (#40) and RFC-016 (#41) merged without an independent audit. Gates green in the auditor's
own run. Invariant greps clean. Data ownership, RLS and LWW sound at `d5dbda3`; the global IndexedDB
cross-account leak of #40/#41 was fixed later by #57 (`ad0285b`). The orchestrator spot-checked
HIGH-1 and MEDIUM-1 to MEDIUM-5 against `origin/develop`: all present.

### HIGH-1: rule hotkey requires Alt and never fires on macOS (#40, `2da7d87`)
`state/playbook/playbook-hotkeys.directive.ts:26-27` returns unless `ev.altKey`, then checks `ev.key`
in '1'..'9'. Option+digit yields a composed `ev.key` on macOS, so the declaration never fires. Specs
send synthetic `{ key: '3', altKey: true }`. RFC-015 says bare digits and claims "Sin desviaciones".

**Orchestrator correction (2026-11-06):** the audit also stated there are no digit bindings elsewhere.
That is wrong. `components/interval-dialog/interval-dialog.component.ts:100` opens on any bare digit
(since `e4f12c2`, 2026-06-18) on the same page, so RFC-015 D15.D's premise is false and bare digits
would collide. The fix keeps Alt and reads `ev.code` (plan D-F1). The Alt in the implementation was
undocumented, but it was not arbitrary.

### MEDIUM-1: no `.lessons.json` export (#41)
RFC-016 §3 and plan verification step 4 require it. No code exists.

### MEDIUM-2: no UI to edit a rule's title or statement (#40)
RFC-015 §5, design spec §7. `PlaybookActions.updateRule` has zero production dispatch sites.

### MEDIUM-3: Journal/Cabin cache never refreshes (#41)
`services/journal-data.service.ts:139-153` is an app-lifetime Map; the only `clear()` caller is the
Cabin save (`reflection-cabin-page.component.ts:281`). The spec says invalidated on navigation away.
Trades closed after opening the Journal are missing. Rules and lessons are also snapshotted at load,
so a lesson arriving later is missed and the save creates a second lesson for the same trade.

### MEDIUM-4: Cabin uses the final (managed) SL as initial geometry (#41)
`domain/reflection/waypoints.ts:101-114,149,162,214-218`, `domain/reflection/build-scene-spec.ts:61-67`,
`pages/reflection/waypoint-facts.component.ts:119-124`, `journal-read.models.ts:257-259`. `ClosedTrade.sl`
is the SL at close (`fill-engine.ts:105`). SL moved to breakeven gives "Riesgo inicial 0", empty
MAE/MFE, a dropped scatter point, and that geometry frozen into the lesson's `evidence`.

### MEDIUM-5: frozen scene reads the whole candle series per switch (#41)
`pages/reflection/frozen-scene-host.component.ts:331-341` → `domain/indexed-db.repository.ts:73-94`.
Measured: 400k M1 1.2–1.4 s, 1.2M M1 3.7–4.1 s per switch; a bounded key range takes 0.7 ms.

### Lows
1. Hotkey dialog guard dead: `dialog[open]` vs `role="dialog"` modals (#40).
2. J-1 raster guard scans free text; a lesson containing "base64" fails its local write, is still
   pushed, and then aborts every pull at `lessons.effects.ts:175-177` (#41).
3. `[R{slot}]` composed in `trading-capability.ts:25-33,182,217`, contra D15.E (#40). Doc only.
4. Un-linking a rule leaves a stale amendment (#41).
5. A retired rule can take a slot from an active one (`playbook-panel.component.html:65-67`) (#40).
6. RFC deviation sections inaccurate or incomplete (both). Doc only.
7. RFC-016 DoD 4: prettier reformatted 29 pre-existing specs (`e3bb1be`), semantics unchanged.
   **Ruled no-fix** by the auditor (decision-frameworks §6); record it in the RFC-016 deviations only.

---

## Task log

(Entries added by the orchestrator as each dispatch is verified.)

### Group A: T1 + T2 (`sdd-implementer`) — DONE

| Task | Closes | Commit |
| :--- | :--- | :--- |
| T1 | HIGH-1, Low 1 | `93f1120` |
| T2 | MEDIUM-2, Low 5 | `894add4` |

- **Evidence (implementer's run at `894add4`):** tsc app 0, tsc spec 0, `ng test` 190 files / 2621 tests
  (baseline 189 / 2607: +8 T1, +6 T2), lint 0, format 0. Red before green: 6 failures for T1, 5 for T2.
- **Orchestrator diff-scan:** spec files have additions only (0 deleted lines), no pre-existing spec
  assertion changed. No `package.json` or lockfile change. Scope matches the plan's file list.
- **Deviations (inert):** `interval-dialog.component.spec.ts` is new, because none existed. A
  module-level `slotFromEvent` helper was added to the directive.
- **Noted, not fixed (out of scope):** `interval-dialog.component.ts` `isTextEntryTarget` reads
  `target.tagName`, which would throw for a synthetic event dispatched on `document`. Real key events
  target an element.

### Group B: T3 + T4 + T5 (`sdd-implementer`) — DONE

| Task | Closes | Commit |
| :--- | :--- | :--- |
| T3 | MEDIUM-5 | `2aa6d0b` |
| T4 | MEDIUM-3 | `0a56e07` |
| T5 | MEDIUM-4 | `c7a6584` |

- **Evidence (implementer's run at `c7a6584`):** tsc app 0, tsc spec 0, `ng test` 196 files / 2651 tests
  (190 / 2621 before: +30), lint 0, format 0. Red before green reported for all three tasks.
- **Orchestrator diff-scan:** deleted spec lines exist only in `frozen-scene-host.component.spec.ts`
  (19+/8−) and `reflection-cabin-page.component.spec.ts` (4+/1−), and both are repository-stub swaps.
  No `package.json` or lockfile change. `domain/reflection/` has no Angular or NgRx import.
- **Deviations:**
  - *Inert:* the plan's T3 STOP exception named the frozen-scene stub. The Cabin's spec needed the same
    stub line, because the Cabin mounts the frozen host. No assertion changed.
  - *Inert:* the T5 STOP exception was not used; no pre-existing spec pinned the wrong geometry.
  - *Inert:* `sl` is a required number in the model, so "no SL at entry" is handled as `sl <= 0`,
    non-finite, or zero risk distance, giving null risk and "—". `riskDistancePrice` and `riskDistanceR`
    can now be null.
  - *Inert:* T4 uses null-safe local selectors in the Cabin rather than `selectLessonsLoaded`, because
    the Cabin's existing specs run on `provideMockStore()` with no `lessons` slice.
  - *Requires attention:* the plan says the initial SL is the `from` of the earliest `sl` management
    event. The implementer uses `PositionModified` only, because `OrderModified` edits a pending order
    before its fill and the position opens with that edit applied. This matches the fill semantics and
    RFC-016's exclusion of pre-fill modifications from Management; orchestrator accepts it.
- **Follow-up, not in this run:** `components/session-summary/excursion-stats.ts:56-58` and
  `session-summary.component.ts:166-171` (the end-of-session summary, not the Journal) still compute
  MAE/MFE in R against the final SL. Same defect class, different surface, and outside RFC-015/016.

### Group C: T6 + T7 + T8 (`sdd-implementer`) — DONE

| Task | Closes | Commit |
| :--- | :--- | :--- |
| T6 | MEDIUM-1 | `32bbaee` |
| T7 | Low 2 | `a0ad222` |
| T8 | Low 4 | `097f458` |

- **Evidence (implementer's run at `097f458`):** tsc app 0, tsc spec 0, `ng test` 196 files / 2662 tests
  (196 / 2651 before: +2 T6, +2 T7, +7 T8), lint 0, format 0. Red before green reported for all three.
- **Orchestrator diff-scan:** spec files have additions only (0 deleted lines). No `package.json` or
  lockfile change.
- **Deviations:**
  - *Requires attention (T7), orchestrator accepts:* the plan says free text is not scanned. A
    pre-existing spec ("rejects lesson with rasterized content (J-1 guard)") puts
    `data:image/png;base64,ABC123` in `whatHappened` and expects a rejection, and the STOP rule protects
    it. So free text is still refused when it holds a complete image data URI; plain mentions of
    "base64", "blob:" or "data:image" now persist.
  - *Requires attention (T8), orchestrator accepts:* `playbook.effects.ts` and its spec were not in the
    plan's file list. `unamendRule` has to be in the `persist$` and `pushDirty$` lists or the removal is
    neither saved nor synced. RFC-016 §2 says saving adds the id but never declares amendments
    append-only, and no J-6 or P-7 detector blocks the dispatch.
  - *Inert (T6):* `services/download-json.ts` is the shared helper the plan allowed. The Journal resolves
    `Store` lazily through `Injector.get`, because `journal-page.component.spec.ts` provides no store and
    is STOP-protected. It only selects, so J-6 holds, and its class comment was updated.
- **Process deviation:** the implementer loaded the context7 tools but never queried them, which the
  kernel requires before Angular changes. The orchestrator checked afterwards: `/websites/angular_dev/v21`
  documents capturing `inject(Injector)` and calling `injector.get()` for deferred retrieval, while also
  advising class-level capture when possible. T6 uses no other new Angular API.

### Group D: T9 (`sdd-implementer`) — DONE

| Task | Closes | Commit |
| :--- | :--- | :--- |
| T9 | Low 3, Low 6, Low 7 (record), D-F1 (record) | `62191fb` |

- **Scope:** three files under `docs/architecture/`, nothing else.
- **Orchestrator checks of what the implementer took from the brief:** `e4f12c2` is dated 2026-06-18;
  `.agents/skills/architecture-diagrams`, `emulador/validate-ci.ps1` and the RFC-017 doc are all in the
  #41 range; `countManagementEvents` windows on `[openTime, closeTime]`, which is what excludes pre-fill
  edits; `lesson-form.component.ts` holds the rule links (`toggleRule`).
- **Correction to the brief:** `rulesSynced` carries `stamps: { id, syncedAt }[]`, not `syncedAt` alone.
  The RFC-015 entry states the real shape.

### Orchestrator gates at `62191fb` (fresh, raw, Node 24.16)

| Gate | Result |
| :--- | :--- |
| `npx tsc -p tsconfig.app.json --noEmit` | exit 0 |
| `npx tsc -p tsconfig.spec.json --noEmit` | exit 0 |
| `npx ng test --watch=false` | exit 0, **196 files / 2662 tests** |
| `npm run lint` | exit 0, all files pass |
| `npm run format:check` | exit 0 |
| `npm run build` | exit 0, initial **675.13 kB** (baseline 673.94: +1.19 kB), 44 files, no vitest in the bundle |
| `npm audit` | 31 moderate, 0 high or critical |

- **Test progression:** 2607 → 2621 (A) → 2651 (B) → 2662 (C). Files 189 → 190 → 196 → 196.
- **Invariant greps against `origin/develop`:** no factory selector added; no Angular or NgRx under
  `domain/chart/` or `domain/reflection/`; no `spec-util` or vitest import in changed app code; no
  `package.json` or lockfile change; no new `syncPriceScale` line; no change under `CLAUDE.md`,
  `.github/`, `pipeline/` or `supabase/`.

## FINAL-AUDIT ATTENTION flags

- T5 (MEDIUM-4): largest logic change; the geometry must be right for trades with no management
  events, with several SL moves, and with no SL at entry.
- T1 (HIGH-1): this intentionally deviates from RFC-015's wording. Judge it against D-F1. Read
  `slotFromEvent`: the `ev.code` / `ev.key` fallback order is subtle.
- T1: the `[role="dialog"]` guard is page-wide. The implementer checked that the `modal`, `date-picker`
  and chart date dialogs are gated by `@if`, but did not trace the hosts of `prompt-dialog`,
  `confirm-dialog` and `delete-session-dialog`. Confirm none stays mounted on the emulador page.
- T2: "Editar" is also offered on retired rules; the plan only restricted the slot select.
- T4: `journal-data.service.ts` router subscription and its URL test; the local selectors and `onSave`
  guard in `reflection-cabin-page.component.ts`.
- T5: `trade-geometry.ts` replays moves by `seq`, inclusive at `time`, and Entry deliberately uses the
  initial value rather than a replay at `openTime`. `journal-read.models.ts` passes
  `computeExcursionAggregates` trades whose `sl` is replaced by the initial SL (or by `entryPrice` when
  there is none, so they are skipped); a dedicated aggregate may be cleaner.
- T5: `journal-page` still shows lesson marks from the model snapshot, which only matters if lessons
  hydrate while the Journal is open.
- T6: the lazy `Injector.get(Store)` in `exportLessons()`. Judge it against an injected `Store` plus a
  `provideMockStore` in a spec the STOP rule protects.
- T7: `assertNoRasterizedContent` is the one place that departs from the plan. Also check the remaining
  edge: a lesson created locally with a pasted image data URI stays in the store, and `persist$` writes
  the whole store as one batch and swallows the error, so later local saves fail silently while it is
  there. T7 only keeps such a lesson out of the store when it arrives through a pull.
- T7: `upsertSkippingUnwritable` drops skipped lessons from `hydrated`, and its batch-then-fallback order
  keeps the pull spec's single `upsertMany` assertion passing.
- T8: the un-link loop in `onSave` runs against `existing.linkedRuleIds`, from the live store when
  available, else the read model.

---

## Whole-branch re-audit at `e0e7127` (`branch-auditor`, 2026-11-10) — **NOT PASS** (1 Medium)

A `/tmp` wipe interrupted the run. The auditor resumed from its transcript, ran `npm ci` in a recreated
worktree on the same commit, and re-ran every gate fresh.

- **Gates:** tsc app 0, tsc spec 0, `ng test` 196 files / 2662 tests, lint 0, format 0, build initial
  675.13 kB (base `d5dbda3` rebuilt by the auditor: 673.94 kB, +1.19 kB), no vitest in the bundle,
  chunk names identical to the base. `npm audit` 28 moderate (advisory drift, same lockfile).
- **Arithmetic, real suite at each commit:** 2607 → 2615 (T1) → 2621 (T2) → 2625 (T3) → 2630 (T4) →
  2651 (T5) → 2653 (T6) → 2656 (T7) → 2662 (T8) → 2662 (T9). Corrections to this ledger: Group C is
  **+3 T7 / +6 T8**, not +2 / +7; and Group B's "No assertion changed" is inexact, because
  `frozen-scene-host.component.spec.ts` retargets one `not.toHaveBeenCalled()` from `getCandles` to
  `getCandlesInRange` (same meaning, forced by the stub swap).
- **Prior findings:** HIGH-1, MEDIUM-1 to MEDIUM-5 and Lows 1 to 7 are all closed in code, each
  probed through real reducers, effects, IndexedDB or a real Chromium build.

### New findings (file:line at `e0e7127`)
- **M-1 (Medium; from #40 `88485cf`, made to recur by T2 `894add4`):** `playbook-panel.component.html:106`
  sets `<select [value]>` before the `@for` creates its options, so the browser selects "—" for a
  rule that holds a slot; choosing "—" then fires no `change`, so a slot cannot be freed directly.
  Reproduced in Playwright Chromium on the production build. Direction: `[selected]` per option, spec
  for first render and the edit round trip.
- **L-1 (Low, regression from T4 `0a56e07`):** `reflection-cabin-page.component.ts:162-168` returns the
  live store object and `lesson-form.component.ts:155-161` re-seeds the draft on every reference
  change, so a `lessonsSynced` ack or an unchanged `hydrated` overwrites what the trader is typing.
  Direction: `equal` keyed on `id` + `clientUpdatedAt`.
- **L-2 (Low, T7 residual):** a pasted image data URI blocks local persistence (`persist$` writes the
  whole store as one batch and swallows the error) while the UI says it saved; the push skips J-1.
  Direction: refuse at authoring time in `onSave` (Spanish inline error, keep the draft, no dispatch);
  defense in depth: per-lesson `persist$` and the J-1 guard in `pushLessons`.
- **L-3 (Low, T7):** `lessons.effects.ts:184` treats a transient IndexedDB failure (for example
  `QuotaExceededError`) as a guard refusal and drops those rows from the store.
- **L-4 (Low, D-F1 incomplete):** the panel never says the shortcut is Alt/Option+digit; follow the
  drawing tools' `tooltipShortcut` + `aria-keyshortcuts` precedent.
- **L-5 (Low, T1 `93f1120`):** Alt+Shift+digit also tags (`playbook-hotkeys.directive.ts:40`).
- **L-6 (Low, T4):** the hydration-guard toast never clears and its copy misleads.
- **L-7 (Low, docs/ledger):** stale "amendments reserved, zero read sites" in
  `UBIQUITOUS_LANGUAGE.md:741-742`, `DOMAIN_MODEL.md:426`, `playbook.models.ts:13`; RFC-015:170 R1
  not annotated like D15.D; RFC-016:268 "ya no crea una segunda lección" too absolute; the
  `lessons-db.service.ts:139` error text; the RFC-016 T8 note should cite TKM §5.1/§5.2; the two
  ledger corrections above.

### No-fix rulings (auditor, decision-frameworks §6 — do not re-litigate)
1. Low 7 (prettier on 29 pre-existing specs): fixing it would violate STOP; format-only, re-verified.
2. T6's lazy `Injector.get(Store)`: the alternative edits a STOP-protected spec; select-only, J-6 holds.
3. The Cabin's null-safe local selectors: same reason; `?? true` is unreachable in production.
4. The stub swap's retargeted assertion: test-only, same meaning.
5. T5's `withInitialSl` shim into `computeExcursionAggregates`: reuses audited machinery; numbers probed.
6. T5's O(trades × events) cost: 137 / 110 / 55 ms at the 50k-event cap, once per model load.
7. T5 falling back to the final SL without telemetry: specified, documented, accepted (TKM §2.2).
8. Journal marks and rule titles from the load snapshot: explicit T4 scope; saves read the live store.

Not ruled no-fix (production paths): M-1 and L-1 to L-6. L-7 goes in the same wave.

### Outside this branch
- **Session summary on the final SL** (`excursion-stats.ts:56-58`): acceptable to release; pre-existing
  since RFC-014, display-only. Track separately.
- **Owner's empty-chart report:** a session created **without the M1 anchor** always renders empty:
  `layout.reducer.ts:299` builds the fallback panel on `workspace.activeTf ?? 'M1'` (null on a new
  workspace), nothing re-targets it, and M1 cannot be generated from H1/D1. Same code on `main`.
- **Could not verify:** OS-level Option+digit on a real Mac keyboard, other keyboards and browsers,
  RFC-016 DoD 5 in a logged-in browser, real Supabase sync/RLS.

## Run-mode correction (orchestrator, 2026-11-10)

The plan set **batched** mode. `decision-frameworks.md` §8 requires **full** mode (per-task audits) when
a run touches persistence, and T4, T7 and T8 do, so Groups A–D ran against §8 without a recorded
reason. What mitigates it: the re-audit above probed T4, T7 and T8 one by one through the real
reducers, effects and IndexedDB layer, and its findings feed the fix wave. Also recorded: task briefs
were sent inline in the dispatch prompts instead of `.superpowers/sdd/task-N-brief.md`, and PR #62
was opened as a draft before the audit, not after a PASS (`/sdd-run` step 6); both inert.

Fix wave (Group E, plan §"Fix wave"): **batched**, by the owner's explicit decision on 2026-11-10
to save usage. §8 would call for full mode because T12 touches persistence; this is a recorded,
resource-constrained degradation (PHILOSOPHY §5.2). The final narrow re-audit is not skipped. Task
briefs for this wave are written to `.superpowers/sdd/task-E*-brief.md` as `/sdd-run` asks; on this
branch that folder is not gitignored, so they stay untracked and are never committed.

### Group E, dispatch E1: T10 (`sdd-implementer`, brief `.superpowers/sdd/task-E1-brief.md`) — DONE

| Task | Closes | Commit |
| :--- | :--- | :--- |
| T10 | M-1, L-4, L-5 | `3639daa` |

- **Evidence (implementer's run at `3639daa`):** tsc app 0, tsc spec 0, `ng test` 196 files / 2669 tests
  (2662 + 7), lint 0, format 0. Context7 consulted (Angular v21.2.25) before the change.
- **Red before green:** 5 of the 7 new tests failed for the right reason (first render `'' ≠ '3'`,
  the Editar → Cancelar round trip, `aria-keyshortcuts`, the hint copy, Alt+Shift dispatching once).
  Two passed beforehand: the no-slot case, and "choosing — frees the slot", because jsdom sets
  `select.value` by hand; in a real browser no `change` fired. Inert.
- **Orchestrator diff-scan:** 4 files, all in the brief's scope; spec files have additions only; no
  `package.json` or lockfile change. The select drops `[value]`, renders "—" from `slotOptions`, and
  binds `[selected]` per option; the directive adds `ev.shiftKey` to its early return.
  `shortcutSlot` is typed `number | null`, so the `aria-keyshortcuts` null check is sound.
- **Deviation (inert):** for L-4 the implementer used a visible label hint plus `title` and
  `aria-keyshortcuts` instead of `appTooltip`, whose `tooltipShortcut` precedent is for icon buttons.
- **FINAL-AUDIT ATTENTION:** confirm M-1 in a real Chromium production build (slot 3 on load, the
  Editar → Cancelar round trip, then "—" frees the slot); jsdom cannot show the "—" path red. The
  `@for` now tracks by `opt.label`, because "—" has a null value.

### Group E, dispatch E2: T11 + T12 + T13 (`sdd-implementer`, brief `.superpowers/sdd/task-E2-brief.md`) — DONE, one item blocked

| Task | Closes | Commit |
| :--- | :--- | :--- |
| T11 | L-1; L-6 partly (see below) | `f98d75e` |
| T12 | L-2, L-3 | `df659e9` |
| T13 | L-7 (docs and comment; the ledger corrections are recorded above) | `8c28ccb` |

- **Evidence (implementer's run at `8c28ccb`):** tsc app 0, tsc spec 0, `ng test` 201 files / 2689 tests,
  lint 0, format 0. Context7 consulted (`CreateComputedOptions.equal`, v21).
- **Arithmetic (orchestrator, counting new `it(` per commit):** E1 +7, T11 +6, T12 +14, T13 0, so
  2662 → 2669 → 2689. The implementer's "baseline 2670, +19" was off by one at both ends; the
  final count agrees.
- **Red before green:** T11's two draft-kept tests failed first. For T12, 8 behavioural tests failed
  with the implementation stashed (3 Cabin refusals, persist isolation, quota keep, push stamp, the db
  message, `pushLessons`); the rest pin existing behaviour or the pure predicate.
- **Orchestrator diff-scan:** 16 files; spec files have additions only (5 new spec files, 0 deleted
  lines); no `package.json` or lockfile change; `domain/reflection/lesson-raster-guard.ts` has no
  Angular or NgRx import.
- **Blocked (requires attention, owner decision):** L-6's copy. The message now clears once lessons
  load, but its text cannot change: `reflection-cabin-page.lesson-freshness.spec.ts:163` (added by T4
  in this run) pins the exact string, and the STOP rule protects it. Proposed copy: "Aún se están
  cargando tus reflexiones. Espera unos segundos y vuelve a guardar; si persiste, recarga la página."
- **Deviation (inert):** T12 also edited `reflection-cabin-page.component.html` for the inline error,
  outside the brief's file list; the error is an unstyled `<p role="alert">` (no CSS added).
- **FINAL-AUDIT ATTENTION:** `isStorageError` in `lessons.effects.ts` (a `DOMException`, or any error whose
  `name` is not `'Error'`, counts as storage, so a `TypeError` would too) and the `'pull' | 'persist'`
  context in `upsertSkippingUnwritable`; `existingLesson`'s equality keeps the stale object when only
  `syncedAt` differs (the save path spreads it); a draft can carry across two trades that both have no
  lesson (null → null, pre-existing); a refused dirty lesson logs its skip on every push cycle.

### Group E, dispatch E3: L-6 copy (`sdd-implementer`, brief `.superpowers/sdd/task-E3-brief.md`) — DONE

| Task | Closes | Commit |
| :--- | :--- | :--- |
| E3 | L-6 (rest) | `dbd2460` |

- **Owner-authorized STOP exception (2026-11-10):** the owner authorized changing the single assertion
  at `reflection-cabin-page.lesson-freshness.spec.ts:163` (added by T4 in this run), which pinned the
  old copy. It is the only pre-existing spec line changed (orchestrator diff-scan: one deleted line).
- **New copy:** "Aún se están cargando tus reflexiones. Espera unos segundos y vuelve a guardar; si
  persiste, recarga la página."
- **Evidence:** red 2 failed / 10 passed on the two specs with the old constant; green 12 passed. Gates
  at `dbd2460`: tsc 0 / 0, `ng test` 201 files / 2690 tests (2689 + 1), lint 0, format 0.

### Orchestrator gates on the fix wave at `992d4d5` (before E3; fresh, raw, Node 24.16)
tsc 0 / 0, `ng test` 201 files / 2689 tests, lint 0, format 0, build initial 675.92 kB (+0.79 kB over
`e0e7127`), 45 dist files (44 at `e0e7127`), no vitest in the bundle.

Test progression for the run: 2607 → 2662 (Groups A–D) → 2669 (E1) → 2689 (E2) → 2690 (E3).

---

## Narrow re-audit of the fix wave at `9433882` (`branch-auditor`, 2026-11-10) — **PASS ("Ship it")**

Interrupted once by a usage limit and resumed; every gate ran twice, before and after the cutoff,
with identical numbers.

- **Gates:** tsc 0 / 0, `ng test` 201 files / 2690 tests, lint 0, format 0, build initial 675.92 kB
  (+0.79 kB over `e0e7127`), 45 files, no vitest. The 45th file is `chunk-HUELR7MS.js` (246 bytes), an
  ordinary code-split chunk whose only input is `domain/reflection/lesson-raster-guard.ts`; not a new
  chunk type.
- **Arithmetic, real suite per commit:** 2669 (T10) → 2675 (T11) → 2689 (T12) → 2689 (T13) → 2690 (E3),
  matching this ledger. The whole wave deleted exactly one pre-existing spec line, the
  owner-authorized one.
- **Closed:** M-1 (verified in Chromium production builds driven by trusted keyboard input: slot 3 on
  load, the Editar → Cancelar round trip, and "—" now fires `change` and frees the slot), L-1 to L-7.
- **Invariants:** zero diff on forbidden/config files and `domain/chart`; no new selectors,
  dependencies, spec-util or vitest; engine purity, J-6, J-2 and candle-free all hold.
- **Rulings added:** batched mode for the wave stands as the owner's recorded decision; E3's
  assertion change is owner-authorized; the per-lesson fallback's cost under exhausted quota is
  accepted. Rulings 1–8 of the previous report stand.

### Open Lows (none ruled no-fix; they do not block PASS)
- **New Low 1 (pre-existing since RFC-016 T7 `e4d5bb4`, first ships via #61):** a reflection draft
  follows the trader between two trades that both have no lesson (`lesson-form.component.ts:155-161`
  re-seeds only when `existing` changes, and null equals null), so a lesson written about T1 can be
  saved on T2 with T2's evidence frozen into it. Direction: re-seed on trade change; spec it.
- **New Low 2 (T12 `df659e9`):** the inline save error has no CSS (`reflection-cabin-page.component.html:68`,
  unlike `.export-error`) and survives a trade switch (`saveError` is cleared only in `onSave`).
- **New Low 3 (T12):** stale comments in `lessons.effects.ts:200-201` (persist no longer writes one
  batch) and on `isStorageError` (any exception other than a plain guard `Error` is kept).

### Could not verify
Mouse selection of "—" in the native popup, Safari and Firefox, a real Mac keyboard (Option+digit
tagging), the alert's real look, and real Supabase.

### Follow-up dispatch E4: New Lows 1–3 (`sdd-implementer`, brief `.superpowers/sdd/task-E4-brief.md`) — DONE

The owner asked for the three open Lows to be fixed before #62 is marked ready (2026-11-10). Batched
mode, as decided for the wave.

| Task | Closes | Commit |
| :--- | :--- | :--- |
| E4 | New Low 1, New Low 2 | `f05c900` |
| E4 | New Low 3 | `c8578b5` |

- **Change:** `LessonForm` gains a `tradeId` input that its seeding effect also reads, so switching
  between two trades with no lesson re-seeds the draft; the L-1 equality is untouched. The save error
  gets a `.save-error` rule modelled on `.export-error` (`--danger`) and is cleared when the trade
  changes. `lessons.effects.ts`: comments only.
- **Evidence (implementer's run at `c8578b5`):** tsc 0 / 0, `ng test` 202 files / 2692 tests (2690 + 2:
  one new spec file with two cases, both red before the fix), lint 0, format 0.
- **Orchestrator diff-scan:** 6 files, all in the brief's scope; 0 deleted spec lines; no `package.json`
  or lockfile change.
- **Process deviation (inert):** the implementer did not consult context7, which the brief required;
  the change only reads one more `input()` inside an existing `effect()`, as the file already does.
- **FINAL-AUDIT ATTENTION:** the `lesson-form.component.ts` effect now re-runs on `tradeId` or
  `existing`; when both change in one pass it re-seeds once, from the new `existing`.

Test progression for the run: 2607 → 2662 (A–D) → 2669 (E1) → 2689 (E2) → 2690 (E3) → 2692 (E4).

## Narrow re-check of E4 at `3f63bc4` (`branch-auditor`, 2026-11-10) — **PASS ("Ship it"), no findings**

- **Closed:** New Low 1 (typing on t1, then moving to t2 with no lesson, empties the form; t3 shows its
  lesson; back to t2 is empty again), New Low 2 (the refusal renders in `--danger` at 12px in a real
  Chromium production render and is gone after a trade switch), New Low 3 (comments match the code).
- **L-1 still holds:** a sync ack and an unchanged pull cause zero re-seeds; a newer version re-seeds
  once; a successful save re-seeds once with the text the trader typed.
- **Effect:** one re-seed per change, also when `tradeId` and `existing` change in the same pass (from
  the new `existing`).
- **Gates (fresh):** tsc 0 / 0, `ng test` 202 files / 2692 tests, lint 0, format 0, build initial
  675.92 kB (unchanged), 45 files, no vitest. 0 deleted spec lines. Invariant greps clean.
- **Process note for the owner:** context7 was skipped twice in this run (T6 and E4), both inert. Worth
  naming as a pattern.
- **Could not verify:** a real Mac keyboard (Option+digit) and the logged-in app, Safari and Firefox,
  real Supabase.

### Run status
All findings from the retroactive audit, the re-audit and the fix-wave re-audit are closed. PR #62 is
cleared for `develop`. Test progression: 2607 → 2662 → 2669 → 2689 → 2690 → 2692.
