# RFC-016 Playbook Amendment Journal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the training loop (TRAINING_WORKFLOW step 7): a session-scoped Journal
that surfaces physical patterns, a Reflection Cabin that reconstructs any single trade
as deterministic frozen scenes, and trader-authored Lessons that amend Playbook rules —
the mirror belongs to the system, the pen belongs to the trader.

**Architecture:** New `lessons` NgRx slice + dedicated `emulador-lessons` IndexedDB DB +
`lessons` Supabase table (per-row LWW, audited `lww_guard()`); additive telemetry kinds
`OrderModified`/`PositionModified` + `lastJump` anchor (D16.B); pure scene/waypoint
computation module; two new routed surfaces (`/journal/:sessionId`,
`/journal/:sessionId/reflect/:tradeId`) rendered per `DESIGN_SYSTEM.md`; the frozen
scene reuses the existing `RenderModel → ChartEngine` path via a slim read-only host.
Engine core untouched; no new capabilities.

**Tech Stack:** Angular 21 standalone + NgRx, raw IndexedDB (telemetry/playbook DB
precedents), Supabase RLS + `lww_guard()`, hand-rolled SVG for visualizations (NO
charting library — no new runtime dependencies), Vitest via `ng test` ONLY.

**Spec of record:** `docs/architecture/rfcs/016-diario-enmiendas-playbook.md` (D16.A–H,
J-1..J-6, supersession note on TKM §6). UX/visual authority: `DESIGN_SYSTEM.md` by
section. Companion artifacts: design spec
`docs/superpowers/specs/2026-07-13-rfc-016-journal-reflection-design.md` and component
architecture `docs/superpowers/specs/2026-07-13-rfc-016-component-architecture.md` —
UI tasks (5–7) MUST be dispatched with both. On conflict: RFC > design spec >
component architecture > this plan.

## Global Constraints

- **Prerequisites:** RFC-015 branch merged to `develop`; scrubber fix
  (`fix/remove-scrubber-seekto-dead-code`, D16.A) merged to `develop`. Task 1 verifies
  both are present in the base (`git log` + zero `seekTo|ReplaySeek|lastSeek` hits)
  before any work.
- **Branch:** `feature/rfc-016-amendment-journal` from `origin/develop`; PR to
  `develop` only.
- **STOP rule (absolute):** pre-existing spec files (develop, incl. RFC-014/015 and the
  scrubber-fix state) are NEVER modified. New tests go in NEW spec files. Verify the
  fresh baseline count in Task 1 and record it in the ledger.
- **Gates per task**, from `emulador/` (all four, fresh output only):
  `npx tsc -p tsconfig.app.json --noEmit` · `npx tsc -p tsconfig.spec.json --noEmit` ·
  `npx ng test --watch=false` (NEVER bare `npx vitest run`) · `npm run lint`
  (0 problems). `npm run build` additionally at branch finalization.
- **Purity:** reducers/domain modules import no IO/clock/random. `Date.now()` /
  `crypto.randomUUID()` only in components/effects — timestamps enter reducers as
  action payload props (identical to `createRule.createdAt`, RFC-015 T1).
- **Vocabulary (N-1):** no `hesitation|honesty|discipline|cheat|score|grade|verdict`
  (or Spanish equivalents) in identifiers, comments, test names, SQL, or UI copy.
  UI copy Spanish; identifiers/comments English. The word "seek" is BANNED in all new
  code (D16.A removed it; the domain term is "management event" — RFC-016 §1).
- **Candle-free (N-5):** import the existing `assertNoCandles`
  (`services/session-sync.mapping.ts`) — never duplicate. Applies to lessons store,
  lesson evidence, SceneSpecs.
- **N-3/J-1:** no Base64, no image blobs, no rasterized anything in any store or model.
- **J-5/J-6:** Journal read models consume exactly ONE session; `journal/**` and
  `reflection/**` dispatch only lessons/navigation actions — never trading/replay/
  telemetry actions.
- **D8:** no shared parameterized factory selectors. Per-trade/per-scene derivation
  lives in component-local computation or single memoized-map selectors.
- **NgRx createFeature:** feature-state fields required; optionals inside row objects
  (`Lesson`).
- **Engine boundary:** `ChartEngine` and `domain/chart/**` gain NOTHING in this RFC
  except (if strictly needed) additive optional RenderModel data fields; no new
  capabilities; no Angular/NgRx imports engine-side.
- **DESIGN_SYSTEM.md §6.5 checklist** is part of DoD for every UI task: 8 interactive
  states, `tabular-nums`, contrast, keyboard map, `prefers-reduced-motion`, density
  profile, IA hierarchy.
- **No new runtime dependencies.** Visualizations are template-driven SVG.
- **Commits:** conventional, task-scoped, pathspec only, trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Baseline + telemetry management events + `lastJump` anchor (D16.B)

**Files:**
- Verify (read-only): scrubber removal present on base; fresh test-count baseline.
- Modify: `state/telemetry/telemetry.models.ts` (+`OrderModified`/`PositionModified`
  kinds + payloads; `TimeElapsedAnchorKind` += `'lastJump'`)
- Modify: `state/telemetry/telemetry.effects.ts` (observe modify actions → append
  events; `advanceDisplay` (+1) handling: if `pausedMs` since previous +1 > 3000 ms,
  retroactively reset the OrderClock anchor to the PREVIOUS +1 instant with kind
  `lastJump` — pause time stays inside the measured window; rapid presses (<3 s) do
  not reset. Inspect the existing OrderClock state machine FIRST and extend it, do not
  rebuild it.)
- Test: NEW spec files only (e.g. `telemetry.management-events.spec.ts`,
  `telemetry.jump-anchor.spec.ts`).

**Interfaces:**
- Consumes: existing telemetry envelope (`seq`, `wallClockMs`, `marketTime`, kind,
  payload), existing `TradingActions.modifyOrder`/`modifyPosition`, replay `+1` action
  (locate the real `advanceDisplay` action name by inspection).
- Produces: `OrderModified { orderRef, field: 'sl'|'tp'|'entry', from, to }`,
  `PositionModified { positionRef, field: 'sl'|'tp', from, to }`; anchor kind
  `'lastJump'`. Task 4's waypoint computation and Task 5's Behavior section consume
  these.

- [ ] Step 1: verify prerequisites (grep + git log) and record fresh baseline.
- [ ] Step 2 (TDD): failing specs — modification events appended with correct payloads
  and NO direction/judgment fields; +1 threshold semantics (≥3 s resets anchor
  retroactively; <3 s does not; window includes pause).
- [ ] Step 3: implement; N-1 grep over new payloads; N-2: no new work on the hot path
  beyond the existing observer pattern.
- [ ] Step 4: gates; pathspec commits (feat + test).

---

### Task 2: Lesson domain + `lessons` slice + `emulador-lessons` DB

**Files:**
- Create: `state/lessons/lessons.models.ts` (`Lesson`, `LessonsState`),
  `lessons.actions.ts`, `lessons.reducer.ts`, `lessons.selectors.ts`,
  `lessons.effects.ts` (hydrate/persist, ROOT_EFFECTS_INIT bootstrap — mirror
  playbook.effects.ts precedent INCLUDING the `onversionchange` DB idiom and
  clientUpdatedAt stamping-in-actions pattern as resolved by the RFC-015 final state)
- Create: `services/lessons-db.service.ts` (dedicated DB `emulador-lessons`, store
  `lessons`, keyPath `id`; `assertNoCandles` on every write; `onversionchange` handler)
- Modify: `app.config.ts` (register feature + effects)
- Test: NEW spec files for reducer/selectors/db/effects.

**Interfaces:**
- Consumes: `PlaybookActions`/`playbookFeature` (for amendment stamping — see below),
  `assertNoCandles`.
- Produces: `Lesson` per RFC-016 §2 (three text fields, `linkedRuleIds`, frozen
  `evidence: SceneSpec[]`, `tradeRefs`, `sessionRef`, `authoredAt`, LWW optionals);
  `LessonsActions` (`hydrate/hydrated/createLesson/updateLesson/lessonsSynced`);
  `selectLessonsBySession` (single memoized map sessionRef → Lesson[], D8-compliant),
  `selectLessonByTradeRef`.
- **Amendment write (P-7 closure):** saving a lesson with `linkedRuleIds` dispatches
  the (new) `PlaybookActions.amendRule({ ruleId, lessonId })`; its reducer handler
  appends to `PlaybookRule.amendments` idempotently. This is the FIRST sanctioned
  production reader/writer of `amendments` — update the P-7 detector expectation in
  the invariants spec (Task 8).
- Evidence cap: MAX_EVIDENCE_SCENES per lesson (constant, e.g. 5) enforced in the
  action-creating component AND validated in the DB service (reject beyond cap).

- [ ] Step 1 (TDD): failing reducer/selector specs (create/update/no-op unknown id/
  reference identity; per-session selector isolation — two sessions seeded, J-5).
- [ ] Step 2: implement slice; timestamps arrive via action props (purity).
- [ ] Step 3 (TDD): DB service specs — round-trip, overwrite, candle-poison reject
  (P-6 idiom), survival: deleting `emulador-workspaces`/`emulador-telemetry`/
  `emulador-playbook` leaves lessons intact (J-4); no-raster storage-shape test (J-1:
  seed a lesson whose evidence tries to smuggle a `dataUrl`/`base64` field → reject
  or strip per RFC — decide reject, document).
- [ ] Step 4: effects (hydrate$/persist$/bootstrap, error-swallow with stream-alive
  assertion) + `amendRule` handler + registration; gates; commits.

---

### Task 3: Cloud sync — `lessons` SQL + per-row LWW cycle

**Files:**
- Create: `supabase/lessons.sql` (table + 4 owner RLS policies + `lessons_lww`
  trigger on the EXISTING `public.lww_guard()`; `evidence jsonb not null default '[]'`,
  `what_happened/repeat_field/avoid text not null default ''` — NOTE: `repeat` is a
  reserved-ish SQL keyword; column name `repeat_field` (or quoted) — decide by
  checking Postgres 17 reserved list; document the mapping)
- Modify: `supabase/verify_session_rls.sql` (append `lessons` block, existing two-`sub`
  pattern)
- Modify: `services/session-sync.service.ts` (`pushLessons`/`pullLessons`, mapping
  `lessonToDbRow`/`dbRowToLesson`, pure `mergeLessonsPull` — mirror the
  `mergePlaybookPull` final shape from RFC-015 T4 line by line functional)
- Modify: `state/lessons/lessons.effects.ts` (debounced dirty push `auditTime(2000)`,
  pull on the same auth/bootstrap trigger the folders/playbook pull uses)
- Test: NEW `services/lessons-sync.spec.ts` (mapping identity, dirty predicate, LWW
  merge cases incl. pull-never-deletes, evidence jsonb round-trip candle-free).

**Coordination note:** applying `lessons.sql` to the live project is the orchestrator's
job via Supabase MCP (`apply_migration`) — never assumed applied.

- [ ] Steps: SQL verbatim-consistent with RFC §3 → failing sync spec → implement →
  effects wiring → RLS block → gates → 3 pathspec commits (SQL / service+effects /
  spec).

---

### Task 4: Pure scene/waypoint computation + `sharpe` in `computeSessionStats`

**Files:**
- Create: `domain/reflection/scene-spec.ts` (SceneSpec type per TKM §2.1 — candle-free,
  `datasetRefs` not candles), `domain/reflection/waypoints.ts` (pure:
  `(ClosedTrade, TelemetryEvents) → Waypoint[]`)
- Modify: `state/trading/fill-engine.ts` (`computeSessionStats` += `sharpe` — additive)
- Test: NEW `domain/reflection/waypoints.spec.ts`, NEW
  `state/trading/session-stats.sharpe.spec.ts`.

**Waypoint semantics (RFC-016 §4, DESIGN_SYSTEM §4.5):**
- Entry (openTime) · Management (one sub-waypoint per `OrderModified`/
  `PositionModified` in [openTime, closeTime]) · MAE (`tMae`) · MFE (`tMfe`) ·
  Exit (closeTime).
- Dynamic visibility: no management events ⇒ no Management waypoint; `tMae` within
  1 base candle of closeTime ⇒ MAE merges into Exit (same for MFE); never-walked
  trades (mae/mfe sealed 0) ⇒ only Entry/Exit.
- Each waypoint carries its context facts (RFC §4 / design spec): Entry → entry price,
  initial risk distance, elapsed-time-before-order; Management → field, from→to;
  MAE → drawdown at `tMae` in R; MFE → peak favorable in R; Exit → net result, R,
  costs. All physical; no judgment fields (N-1 grep).
- Window derivation for SceneSpec: `[t0, t1]` = waypoint time ± N visible candles at
  the session's base resolution (constant, e.g. 60 candles; exact value from the
  design spec §scene).
- `sharpe = mean(R_i) / sampleStdDev(R_i)`, `null` when n < 2 or stddev = 0; label
  contract "por-trade, sin anualizar" (D16.C.3) — the UI label lives in Task 5.

- [ ] TDD: failing waypoint specs (visibility matrix, merge rules, fact panels,
  determinism: same inputs ⇒ deep-equal output) + sharpe spec (n=0/1, degenerate
  stddev, known-vector) → implement → gates → commits.

---

### Task 5: Journal — routes, read models, sections, tables

**Files:**
- Create: `pages/journal/journal-page.component.{ts,html,css}` + section child
  components per the component architecture doc (performance-grid, rule-performance,
  time-of-day, trades-table, behavior, execution)
- Create: `state/journal/journal-read.models.ts` (pure read-model builders:
  `buildRulePerformanceRows`, `buildTimeOfDayRows`, `buildBehaviorFacts` — session-
  scoped, J-5)
- Modify: `app.routes.ts` (+`/journal/:sessionId` lazy route; inspect existing lazy
  idiom)
- Modify: `pages/sesiones/sesiones-page.component.*` (+ "Reflect" / "Journal" buttons
  per card — TKM §4.5; navigation only, no logic)
- Test: NEW specs for read models + page shell + buttons.

**Binding design requirements (design spec + DESIGN_SYSTEM):** density `compact`
(§2.3 root-class pattern); section order Performance → Execution → Behavior → Rule
Performance → Time of Day → Trades; zone colors §2.1 on headers/left-borders only;
Performance grid: PF, Win Rate, R acum, Balance, Drawdown, Sharpe ("por-trade"), MAE_R,
MFE_R, Trades, Costs — all `tabular-nums`; Rule Performance rows incl. "Sin declarar";
states: `session-without-trades`, `rule-without-trades`, `insufficient-data` (<3
trades) with the exact Spanish copy from the design spec; keyboard map §5.2 (Tab
between sections, ↑↓ rows, Enter → Cabin, Escape → catalog); session loads read-side
WITHOUT opening the practice workspace.

- [ ] TDD read models (incl. J-5 isolation) → page shell + sections → routes + catalog
  buttons → gates → commits.

---

### Task 6: Journal visualizations — scatter, bubble, heatmap (SVG)

**Files:**
- Create: `components/journal-viz/scatter-mae-mfe.component.ts`,
  `bubble-duration-r.component.ts`, `heatmap-trade-calendar.component.ts` (inline SVG,
  standalone, input = prepared view rows, output = `(tradeSelected)` event)
- Modify: journal page to mount them in Execution/Behavior sections per design spec.
- Test: NEW specs per component (DOM-level: point count, click emits tradeId,
  insufficient-data state, aria-labels).

**Binding design requirements:** §4.1 (viz canvas `--viz-grid`, axes `--text-muted`,
tooltip on `--surface-3` anchored to the point, crossfade on data change, no
gradients/3D/shadows); §4.2 scatter (X=MAE_R, Y=MFE_R, origin visible, identity
line dashed, 6px points, rule palette `--rule-1..9`, undeclared `--text-muted`);
§4.3 bubble (X=duration in bars, Y=R, radius ∝ management-event count, 4–20px);
§4.4 heatmap (X=trade sequence, 1 row for single session, diverging R scale);
EVERY element clickable → `/journal/:sessionId/reflect/:tradeId` (D16.F — no dead
charts); `aria-label` describing content (§5.4).

- [ ] TDD per component → mount → gates → commits.

---

### Task 7: Reflection Cabin — timeline, frozen scene, lesson form, circular flow

**Files:**
- Create: `pages/reflection/reflection-cabin-page.component.{ts,html,css}` + children
  per component architecture doc (trade-list, waypoint-timeline, frozen-scene-host,
  lesson-form, rule-link-widget)
- Modify: `app.routes.ts` (+`/journal/:sessionId/reflect` and `/reflect/:tradeId`)
- Test: NEW specs (timeline visibility matrix wiring, keyboard map, form dispatch,
  `✎` indicator, breadcrumb/arrow navigation).

**Binding design requirements:** density `comfortable`; 30/70 layout; timeline per
§4.5 (active node `--accent` + ring + dotted connector; inactive
`--timeline-connector`; Management expandable when ≥2 events; 180 ms crossfade;
keyboard `1`–`5`, `↑↓` trades, Tab fields, Enter submit, Escape → Journal); frozen
scene via slim read-only `RenderModel → ChartEngine` host — **integration spike
first**: mount the existing mapper/engine against a static SceneSpec window, confirm
no replay/effects coupling, document the seam in the task report before building the
full page; form fields "¿Qué ocurrió?" / "¿Qué debería repetir?" / "¿Qué debería
evitar?" (visible labels, not placeholders — §5.4); save = `createLesson` +
`amendRule` dispatches + toast + redirect (`reflection-saved` state); `✎` on trades
with an existing reflection; states `scene-loading` (skeleton), `node-without-data`
(absent, not grayed), `reflection-existing` (pre-filled, subtle left border).

- [ ] Spike (frozen scene seam) → TDD components → routes + circular flow (breadcrumb,
  ←/→ trade arrows) → gates → commits.

---

### Task 8: Invariant detectors + documentation closure

**Files:**
- Create: `state/lessons/lessons-invariants.spec.ts` (J-1 storage shape; J-3 evidence
  immutability — mutate source session/telemetry after authoring, lesson deep-equal;
  J-4 composite purge round-trip; J-5 two-session isolation)
- Documented greps (task report + RFC closure): J-2 (`whatHappened|repeat|avoid` read
  sites = display/edit/export/sync only), J-6 (no trading/replay/telemetry dispatches
  under `journal/**`/`reflection/**`), P-7 updated (amendments readers = lessons
  linking only), N-1 over all new schemas incl. SQL, "seek" zero hits in new code.
- Modify: `docs/architecture/TRADER_KNOWLEDGE_MODEL.md` (§3.1 ReplaySeek removed →
  note; §3.2 anchor set update; §6 supersession status note per RFC-016), 
  `docs/architecture/DOMAIN_MODEL.md` (J-invariants section),
  `docs/architecture/UBIQUITOUS_LANGUAGE.md` (Lesson, evento de gestión, waypoint,
  Cabina de Reflexión, Journal, `emulador-lessons`),
  `docs/architecture/rfcs/016-diario-enmiendas-playbook.md` (Estado → Implementado +
  desviaciones).
- [ ] Full gates + `npm run build`; commits (test / docs).

---

## Verification at branch end (orchestrator)

1. Four gates + `npm run build` fresh (auditor re-runs personally).
2. Greps recorded: J-2/J-5/J-6/P-7/N-1 + "seek" ban + no new deps
   (`git diff base..HEAD -- emulador/package.json` empty) + STOP
   (`--name-only '*.spec.ts'` → only NEW files).
3. `DESIGN_SYSTEM.md` §6.5 checklist executed for Journal + Cabin (states, tabular-nums,
   radius caps, contrast, reduced-motion, keyboard, IA hierarchy, density).
4. Browser walkthrough (DoD 5 of the RFC): Journal → click scatter point → Cabin →
   node 3 (MAE) → write 3 fields → link rule → Guardar y volver → `✎` visible →
   `amendments` populated → purge session → lesson intact → export.
5. `lessons.sql` applied via Supabase MCP before merge; PR to `develop`.
