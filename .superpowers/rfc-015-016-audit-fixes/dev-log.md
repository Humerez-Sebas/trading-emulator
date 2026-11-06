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

## FINAL-AUDIT ATTENTION flags

- T5 (MEDIUM-4): largest logic change; the geometry must be right for trades with no management
  events, with several SL moves, and with no SL at entry.
- T1 (HIGH-1): this intentionally deviates from RFC-015's wording. Judge it against D-F1. Read
  `slotFromEvent`: the `ev.code` / `ev.key` fallback order is subtle.
- T1: the `[role="dialog"]` guard is page-wide. The implementer checked that the `modal`, `date-picker`
  and chart date dialogs are gated by `@if`, but did not trace the hosts of `prompt-dialog`,
  `confirm-dialog` and `delete-session-dialog`. Confirm none stays mounted on the emulador page.
- T2: "Editar" is also offered on retired rules; the plan only restricted the slot select.
