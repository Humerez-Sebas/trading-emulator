# RFC-015/016 audit fixes — implementation plan

Closes the retroactive audit of RFC-015 (PR #40) and RFC-016 (PR #41), which returned NOT PASS
at `develop` @ `d5dbda3` and blocks release PR #61. The findings, with file:line and failure
scenarios, are recorded in `.superpowers/rfc-015-016-audit-fixes/dev-log.md`.

- **Branch:** `feature/rfc-015-016-audit-fixes`, off `origin/develop` @ `d5dbda3`.
- **PR target:** `develop`, whose tip is the head of release PR #61, so merging here updates #61.
- **Run mode:** batched. Task-scoped commits, no per-task audits, one final whole-branch audit.
- **Merge order:** this PR → `develop`, only after the audit PASS; then #61 `develop` → `main`;
  then the back-merge `main` → `develop`.

## Decisions taken for this run

- **D-F1: the rule hotkey stays Alt+digit and reads `ev.code`.** RFC-015 D15.D asserts that digits
  1–9 have no binding, but `interval-dialog.component.ts:100` has opened the TradingView-style
  interval dialog on any bare digit since 2026-06-18 and is mounted on the same page. Bare digits
  would tag a trade and open the dialog at once. The audit's premise of no digit bindings was wrong
  on this point. Alt+digit does not collide with `ALT_TOOL_SHORTCUTS` (KeyR, KeyT, KeyF, KeyM). This
  is a recorded deviation from RFC-015, not a silent one.
- **D-F2: scope is everything the audit asks for.** The `.lessons.json` export and the rule edit UI
  are implemented, not descoped. Low 7 stays ruled no-fix (the auditor's ruling; do not re-litigate).
- **D-F3: frozen lesson evidence is not migrated.** J-3 makes `evidence` immutable, so lessons
  saved before the T5 fix keep their geometry. T5 only corrects what is frozen from now on.

## Rules for every task

- Read `CLAUDE.md` and `docs/engineering/PHILOSOPHY.md`, then the domain docs the kernel's
  context table names. Consult the `context7` MCP before writing or changing Angular code.
- TDD: write the failing test first and record that it failed for the right reason.
- **STOP rule:** pre-existing specs are authority. A task below names the only exceptions it has.
  Anything else that blocks you is reported, not edited.
- No new runtime dependencies. No factory selectors over panel/chart state (D8). No Angular or NgRx
  under `domain/chart/` or `domain/reflection/`. Session and lesson payloads stay candle-free. UI
  copy is Spanish. UI work follows `PRODUCT.md` and `DESIGN.md`. No `*.spec-util.ts` or vitest
  imports in app code.
- Gates, run raw from `emulador/`: `npx tsc -p tsconfig.app.json --noEmit`,
  `npx tsc -p tsconfig.spec.json --noEmit`, `npx ng test --watch=false`, `npm run lint`,
  `npm run format:check`.
- Pathspec commits, one per task, conventional messages.

## Tasks

### Group A: Playbook (RFC-015)

**T1: HIGH-1 + Low 1, hotkey fires on every platform.** `state/playbook/playbook-hotkeys.directive.ts`,
`components/interval-dialog/interval-dialog.component.ts`, and their specs.
- Take the slot from `ev.code` (`Digit1`–`Digit9`), falling back to `ev.key` so existing specs that
  send only `key` stay green. Do not edit those specs; add new ones. Numpad codes are out of scope.
- New spec with a real macOS event shape: `{ code: 'Digit1', key: '¡', altKey: true }` dispatches.
- The interval dialog must ignore key events with `altKey`, `ctrlKey` or `metaKey`. Today Alt+3 on
  Windows and Linux reports `key: '3'`, so it would also open the dialog, and Cmd+1 is hijacked.
- Fix the dead guard: `dialog[open]` never matches, because the app's dialogs are `role="dialog"`
  elements (`ui/modal.component.ts`, `ui/date-picker.component.ts`, `chart.component.ts` date dialog).
- Done when: Alt+digit tags on macOS-shaped and Windows-shaped events, no interval dialog opens, and
  a bare digit still opens the dialog and does not tag.

**T2: MEDIUM-2 + Low 5, edit rules in the panel.** `components/playbook-panel/*`.
- Inline edit of `title` and `statement` per RFC-015 §5 and the design spec §7, dispatching the
  existing `PlaybookActions.updateRule`. Empty titles are rejected the same way creation rejects them.
- Retired rules cannot take a slot: do not offer the slot `<select>` on them.

### Group B: Reflection correctness (RFC-016)

**T3: MEDIUM-5, bounded candle read.** `domain/indexed-db.repository.ts`,
`pages/reflection/frozen-scene-host.component.ts`, their specs and any repository interface or stub.
- Add a range read using `IDBKeyRange.bound([symbol, tf, t0], [symbol, tf, t1])`. The index already
  orders by time, so do not sort. Leave `getCandles` unchanged.
- The frozen scene uses it. **STOP exception:** a frozen-scene spec stub may change only to answer
  the new method; record it as a deviation.

**T4: MEDIUM-3, Journal/Cabin freshness.** `services/journal-data.service.ts`, the journal and
reflection pages, their specs.
- Invalidate per the architecture spec §3 item 1: leaving the `/journal/` area clears the cache;
  moving between Journal and Cabin keeps it.
- A lesson that reaches the store after the model loaded must be visible at save time: saving must
  update the existing lesson, never create a second one for the same trade. Wire `selectLessonsLoaded`
  if that is what it takes. Add a spec for the duplicate scenario.

**T5: MEDIUM-4, initial and at-that-moment geometry.** `domain/reflection/waypoints.ts`,
`domain/reflection/build-scene-spec.ts`, `pages/reflection/waypoint-facts.component.ts`,
`journal-read.models.ts`, their specs.
- Pure helpers: initial SL is the `from` of the trade's earliest `sl` management event, else
  `trade.sl`; SL and TP at time *t* are replayed from those events.
- Use the initial SL for "Riesgo inicial", MAE/MFE in R and the scatter. Use at-that-moment SL/TP for
  each waypoint's `orderGeometry`.
- No SL at entry shows "—", never 0 and never a hard-coded 1R. Do not change `ClosedTrade` or
  `fill-engine.ts`.
- Spec the audit's scenario: long at 1.1000, SL 1.0950, moved to breakeven, closed at 1.1080. The
  Entry shows a 0.0050 risk and the SL at 1.0950, MAE/MFE show values, and the trade stays on the scatter.
- **STOP exception:** a pre-existing spec that pins the wrong final-SL geometry may change only for
  that assertion; record each one as a deviation.

### Group C: Lessons (RFC-016)

**T6: MEDIUM-1, `.lessons.json` export.** The Journal page, its spec.
- A Spanish-labelled action on the Journal exports `lessons-YYYY-MM-DD.lessons.json` with
  `{ version: 1, exportedAt, lessons }`, holding every lesson in the store, following the
  `.playbook.json` pattern in `playbook-panel.component.ts:78`. Pass it through `assertNoCandles`.
- If you extract a shared download helper, the existing `downloadJson` spy in the panel's spec must
  keep working.

**T7: Low 2, raster guard scope.** `services/lessons-db.service.ts`, `state/lessons/lessons.effects.ts`,
their specs.
- The J-1 guard must not scan the trader's free text (`whatHappened`, `repeat`, `avoid`), while a
  raster in `evidence` is still rejected.
- One unwritable lesson must not abort a whole pull: skip it, log it, and continue with the rest and
  the post-merge push.

**T8: Low 4, stale amendment on un-link.** `pages/reflection/reflection-cabin-page.component.ts`,
`state/playbook/playbook.reducer.ts`, `state/playbook/playbook.actions.ts`, their specs.
- Saving a lesson with fewer linked rules removes its id from the un-linked rule's `amendments`,
  stamping the row the same way `amendRule` does.
- Read RFC-016 first. If amendments are append-only by decision, or a J-6 detector blocks the new
  dispatch, stop and report instead of working around it.

### Group D: Documentation

**T9: Low 3, Low 6, Low 7, D-F1.** Spanish, in the RFCs' deviation sections, plus
`docs/architecture/UBIQUITOUS_LANGUAGE.md:759`.
- RFC-015: replace "Sin desviaciones". Record Alt+digit with its reason (D-F1) and correct the D15.D
  premise; the UPDATE `with check` hardening; the `rulesSynced` shape; `[R{slot}]` composed in
  `trading-capability.ts` instead of the mapper (D15.E).
- RFC-016: the export that shipped late; the cache divergence and its fix; rule-link-widget folded
  into lesson-form; Behavior shipping 2 counts; pre-fill modifications excluded from Management; the
  scatter null-skip; the out-of-scope changes that rode #41 (`gridVisible` default, RFC-017 design
  doc, `.agents/skills/architecture-diagrams`, `validate-ci.ps1`); the Low 7 no-fix ruling.

## Definition of done

1. T1–T9 committed, with the ledger recording each commit, test counts and deviations.
2. All gates plus `npm run build` green at the branch tip, with no vitest in the bundle.
3. Whole-branch `branch-auditor` PASS (zero Critical/High/Medium), recorded in the ledger.
4. PR to `develop` carries the evidence. Only then is it merged, by the owner.
