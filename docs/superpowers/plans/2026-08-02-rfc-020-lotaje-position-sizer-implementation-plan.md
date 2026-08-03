# RFC-020 — Implementation Plan: Lotaje (Position Sizer)

**Spec:** `docs/architecture/rfcs/020-lotaje-position-sizer.md`
**Branch / base:** `claude/lotaje-v2-core` (from `origin/main` @ `ad80b9f`)
**Baseline (verified, not claimed):** 78 test files / **1046 tests**, `ng test` on `ad80b9f`
**Language:** English (agent artifact, `CLAUDE.md` §Conventions)

> **§0 corrections are binding over the RFC's prose.** Where this plan and the RFC disagree on a
> mechanical detail, this plan wins; where they disagree on a *decision*, the RFC wins.

---

## §0 Binding corrections

**C1 — The spike is Wave 0, not Wave 5.** Per D.20.1 the framework-free view's only justification
is the second mount, and the second mount is gated on an unresolved platform question. Building the
view before the gate resolves pays the full cost for an unpriced option. The spike touches no
production code and blocks nothing except Task D-1.

**C2 — Curated symbol list is `US30,NAS100,SP500,XAUUSD`.** Not `nasdaq`/`sp500`. Verified against
`pipeline/fill_r2.py:54` and `pipeline/update_r2.py:302`, which both default `HARVEST_SYMBOLS` to
that exact string. Task B-1 reads that same variable rather than hardcoding a second list.

**C3 — No unit toggle anywhere.** D.20.3. The unit suffix is a derived label. Any task that adds a
click handler to it is out of scope.

**C4 — No `storage`-event listener.** D.20.2. Persist-on-change and read-on-mount only. Q2 is
**answered — no**: the page and the companion are never used simultaneously, so the listener is
**cut by owner decision**, not reserved. There is no field and no interface for it; adding one is an
automatic finding. (`.superpowers/rfc-020/dev-log.md` §6.3 is the authority, and distinguishes this
withdrawal from the `v` schema-version field and the profiles schema, which **do** remain reserved
with zero read sites.)

**C5 — `trading.models.ts` becomes a pure re-export.** No consumer edits, no spec edits. That
property *is* the parity proof; if a consumer needs editing, the move was done wrong.

---

## §1 Layer discipline

Tasks are split **strictly by layer**. No task mixes layers.

| Layer | Owns | Never touches |
| :--- | :--- | :--- |
| **A — Domain** | `emulador/src/app/domain/sizing/*` (Shared Kernel), the re-export shim | Any UI, any state, the pipeline |
| **B — Infra** | `pipeline/export_symbols.py`, generated registry artifact, pipeline tests | Any TypeScript behavior |
| **C — State** | Persistence module, method state + conversion, **the cutover** | View markup, pipeline |
| **D — UI** | View, Angular host, tokens, copy, Ficha, focus/shortcuts, window adapter | Kernel math, registry generation |

---

## §2 Risk-ordered phases

| Phase | Tasks | Risk | Gate to proceed |
| :--- | :--- | :--- | :--- |
| **0** | S-1 spike | NONE (no prod code) | — |
| **1** | A-1, B-1 | LOW | Four gates green |
| **2** | C-1 cutover → D-1 view | **HIGH** | Parity proof V3; specs unedited |
| **3** | D-2…D-5, C-2 | LOW–MED | Four gates green |
| **4** | D-6 window adapter, D-7 window shortcuts | **HIGH** | **S-1 verdict = GO** |

Cutover (C-1) runs **before** the view (D-1): the registry must be proven behaviour-preserving
against the *existing* v1 page and its 459 LOC of specs before that page is rewritten. Rewriting
first would destroy the regression net that proves the cutover.

---

## Phase 0

### Task S-1 — Companion-window spike (Layer: none)

**Risk:** NONE — throwaway branch, no production code, no gates.
**Blocks:** D-1, D-6, D-7.

**Question to answer (the only one no authoritative source resolves):** does
`navigator.clipboard.writeText()` succeed from inside a Document PiP window, and does the result
paste into MT5's F9 volume field?

| Probe | Record |
| :--- | :--- |
| S-1.a | PiP over a maximized MT5, and over MT5 on the second monitor; click MT5 to focus |
| S-1.b | Copy inside the companion → paste into MT5 F9. Test **both** `window.navigator.clipboard` and `pipWindow.navigator.clipboard`; record which throws |
| S-1.c | Decimal separator MT5 accepts in the volume field (answers Q3) |
| S-1.d | A same-origin iframe inside the PiP window renders and is interactive |
| S-1.e | Minimum usable window size vs. the UA size cap |
| S-1.f | Exact Chrome/Edge versions, Windows build, monitor + DPI layout |

**Exit criteria — GO requires S-1.b and S-1.d to pass.** S-1.a/c/e are measurements that shape the
UI, not gates.

**On NO-GO:** D-6/D-7 are cut from the RFC's scope; **D-1 is re-scoped to an Angular view** reusing
`[appInput]`, `ui-dropdown` and TestBed. `domain/sizing/` stays framework-free either way.

**Deliverable:** findings note at `.superpowers/rfc-020/spike-s1-report.md`. No commit to
`emulador/`.

---

## Phase 1 — LOW risk, parallelizable

### Task A-1 — Shared Kernel: `domain/risk` → `domain/sizing` (Layer A)

**Risk:** LOW — mechanical move plus a pure re-export. **No behavior change of any kind.**

| Path | Change |
| :--- | :--- |
| `emulador/src/app/domain/sizing/position-sizing.ts` | **NEW** — receives the four functions from `domain/risk/risk-calculator.ts` (44 LOC) plus `contractSizeFor` and `lotsForRisk` moved out of `state/trading/trading.models.ts:190-215` |
| `emulador/src/app/domain/sizing/position-sizing.spec.ts` | **NEW** — `risk-calculator.spec.ts` (45 LOC) relocated, assertions unchanged |
| `emulador/src/app/state/trading/trading.models.ts` | `contractSizeFor` / `lotsForRisk` bodies removed; replaced by `export { … } from '../../domain/sizing/position-sizing'` |
| `emulador/src/app/pages/calculadora/calculadora-page.component.ts` | Import path only (`domain/risk/risk-calculator` → `domain/sizing/position-sizing`) |
| `emulador/src/app/domain/risk/` | **DELETED** (both files) |

**Nothing else.** Any other file = STOP and report.

**HARD BOUNDARY:** do not touch `trading.reducer.ts`, `selectors.ts`, `chart.component.ts`,
`trade-panel.component.ts`, or any of their specs. They import `contractSizeFor`/`lotsForRisk` from
`state/trading/trading.models` and **must keep compiling unchanged** — that is the proof the
re-export is pure. If any of them needs an edit, the move is wrong: STOP.

**The distance primitive.** Add `lotsForRiskDistance(riskUsd, distanceInPrice, contractSize)` as
the primitive and make `lotsForRisk` a wrapper. **The wrapper keeps its own
`!(balance > 0) || !(riskPct > 0)` guards** — delegating them to a `riskUsd > 0` check is *not*
equivalent: a negative balance with a negative risk % yields a positive `riskUsd`, which today
returns `0` and would start returning a lot figure. Write a spec for exactly that case.

**TDD:** the relocated `position-sizing.spec.ts` must pass before any consumer is touched; then add
the `lotsForRiskDistance` specs (incl. the negative/negative case) and the equivalence spec
`lotsForRisk(b,r,e,sl,cs) === lotsForRiskDistance(riskUsdFor(b,r), |e−sl|, cs)` for positive inputs.

**Boundary detector (new, add to the audit list):**
```
grep -rnE "@angular/|\.\./\.\./state/|\.\./\.\./components/|domain/chart" emulador/src/app/domain/sizing --include=*.ts
```
→ must be empty (spec files included; the kernel is Angular-free on both sides).

**Kernel size discipline (Q1):** math and instrument data only — no formatting, no user-facing copy,
no view helpers.

**Gates:** all four, raw, from `emulador/`. **Tests must not decrease from 1046** and should rise by
the new primitive's specs.

**Commit:**
```
git commit emulador/src/app/domain/sizing/position-sizing.ts \
           emulador/src/app/domain/sizing/position-sizing.spec.ts \
           emulador/src/app/state/trading/trading.models.ts \
           emulador/src/app/pages/calculadora/calculadora-page.component.ts \
           emulador/src/app/domain/risk \
  -m "refactor(rfc-020): move sizing kernel to domain/sizing, re-export from trading.models (D.20.1)"
```

### Task B-1 — Registry generator (Layer B)

**Risk:** LOW — new Python file plus a generated artifact. No TypeScript behavior change: nothing
imports the artifact yet.

| Path | Change |
| :--- | :--- |
| `pipeline/export_symbols.py` | **NEW** — reads `HARVEST_SYMBOLS` (same default as `fill_r2.py:54`), calls `mt5.symbol_info()`, emits the registry |
| `pipeline/tests/test_export_symbols.py` | **NEW** — stubbed `symbol_info`, no live terminal |
| `emulador/src/app/domain/sizing/asset-registry.generated.ts` | **NEW, COMMITTED** — codegen output |
| `emulador/src/app/domain/sizing/asset-registry.ts` | **NEW** — `AssetSpec` type, manual overrides, heuristic fallback, `resolveAsset()` |
| `emulador/src/app/domain/sizing/asset-registry.spec.ts` | **NEW** |

**C2 is binding:** symbols are `US30,NAS100,SP500,XAUUSD`, read from `HARVEST_SYMBOLS`. Never
hardcode a second list.

**Fail loudly:** if `symbol_info()` returns `None` for a requested symbol, raise — do not emit a
partial registry. Precedent: `HistorialTruncado` in `pipeline/mt5_common.py:41-47` is raised rather
than silently uploading a short history.

**Generated-file shape (diff-stability is a requirement):** deterministic key order, one field per
line, symbols sorted, a provenance header (`mt5:<broker>@<ISO-date>`), and no timestamp anywhere
except that header — otherwise every regeneration is a noisy diff.

**`resolveAsset()`** resolves generated → manual → heuristic and always sets `source`. The heuristic
branch **reproduces `contractSizeFor`/`pipSizeFor` exactly**, including evaluation order
(`XAU*`/`XAG*` before `/^[A-Z]{6}$/`).

**Verified fact to encode as a spec:** all four curated symbols resolve to `pipSize === null`
(points). `US30`/`NAS100`/`SP500` are not six letters; `XAUUSD` starts with `XAU`. Assert it — it is
what makes D.20.3 correct.

**Inert:** nothing imports `resolveAsset` yet. `contractSizeFor` is untouched in this task.

**Gates:** four TS gates plus, from `pipeline/`: `python -m pytest -q`, `ruff check .`,
`ruff format --check .`.

**Commit:**
```
git commit pipeline/export_symbols.py pipeline/tests/test_export_symbols.py \
           emulador/src/app/domain/sizing/asset-registry.ts \
           emulador/src/app/domain/sizing/asset-registry.generated.ts \
           emulador/src/app/domain/sizing/asset-registry.spec.ts \
  -m "feat(rfc-020): generate the MT5-sourced asset registry, inert (D.20.4)"
```

---

## Phase 2 — HIGH risk, strictly sequential

### Task C-1 — Registry cutover (Layer C)

**Risk:** **HIGH** — the only task in the run that changes the emulator's sizing.

| Path | Change |
| :--- | :--- |
| `emulador/src/app/domain/sizing/position-sizing.ts` | `contractSizeFor` → `resolveAsset(s).contractSize`; `pipSizeFor` → `resolveAsset(s).pipSize`. **Signatures unchanged** |
| `emulador/src/app/domain/sizing/position-sizing.spec.ts` | Add one named test per intentional delta |

**Nothing else.** No consumer file, no v1 page, no reducer.

**Parity proof V3 — the gate for this task:**

1. `emulador/src/app/state/trading/trading.models.spec.ts` passes **unmodified**. It asserts
   `contractSizeFor` for XAUUSD→100, XAGUSD→5000, EURUSD→100000, GBPJPY→100000, US30→1, NAS100→1
   and case-insensitivity. Those are the behaviour-preservation assertions.
2. `emulador/src/app/pages/calculadora/calculadora-page.component.spec.ts` (459 LOC) passes
   **unmodified**, including its `contractSizeFor`-derived parity tests.
3. `fill-engine.spec.ts` and `trading.reducer.spec.ts` pass **unmodified**.
4. **Every intentional delta gets its own named test with the reason in the test name.** Expected
   deltas: six-letter non-FX instruments (`BTCUSD`: 100000 → registry/heuristic-correct value) and
   any curated symbol whose MT5 value differs from the heuristic.
5. **`modifyOrder` path check.** `trading.reducer.ts:154` re-sizes *pending* orders from
   `riskPct + contractSize`. Confirm by reading whether a changed contract size can move a restored
   session's pending orders, and **write the finding in the report** — do not assume. Stored
   positions carry their own `lots` and are unaffected.

**STOP rule:** if any pre-existing spec requires editing, that is a behaviour change. Stop and
report; do not edit the spec (PHILOSOPHY §5.7).

**Gates:** all four. Report the exact test-count progression.

**Commit:**
```
git commit emulador/src/app/domain/sizing/position-sizing.ts \
           emulador/src/app/domain/sizing/position-sizing.spec.ts \
  -m "feat(rfc-020): back contractSizeFor/pipSizeFor with the asset registry (D.20.4)"
```

### Task D-1 — The view (Layer D)

**Risk:** **HIGH** — replaces shipped, tested UI.
**Blocked by:** S-1 verdict, C-1.

**Step 1 first, and it is not optional: port the specs before writing the view.**
`calculadora-page.component.spec.ts` is 459 LOC encoding the F1 (DOM decimal entry) and F3
(comma decimal / trailing junk) fixes. Those two fix classes shipped *after* a green suite missed
them. Port the assertions **first**, against the new view, and see them fail; only then write the
view.

| Path | Change |
| :--- | :--- |
| `emulador/src/app/domain/sizing/view/` (GO) or `pages/calculadora/` (NO-GO) | **NEW** — the three zones |
| `emulador/src/app/pages/calculadora/calculadora-page.component.{ts,html,css}` | Becomes a thin host (GO) or the view itself (NO-GO) |
| `emulador/src/app/pages/calculadora/calculadora-page.component.spec.ts` | Ported assertions + new zone specs |

**Behaviour that must survive verbatim** (from the v1 component doc-comment and specs):

- `type="text" inputmode="decimal"`, raw-string signals, **never** written back mid-edit.
- `parseDecimal`: empty → `NaN` (never `0`); comma normalized; whole string to `Number` so trailing
  junk is `NaN`, not a truncated prefix.
- Honest states **replace** the lot figure; the min-lot/rounding warning **accompanies** it.
- The two honest-state messages, verbatim: `'El SL coincide con la entrada.'` and
  `'La cuenta, el riesgo y la entrada deben ser valores positivos.'`
- `lotsForRisk` (via the kernel) is the **only** source of a lot figure in the view.

**Deletions (P3):** the "Desde lotes" section (`calculadora-page.component.html:147-185`), its
component members (`manualLotsText`, `manualLots`, `manualRiskUsd`, `manualRiskPct`, `onManualLots`)
and its specs. Declared, not silent.

**Also removed:** `app-risk-slider` from this page (product design §7.3). The component itself stays
— the emulator dock still uses it.

**Gates:** all four. **`npm run build`** additionally, watching for new chunk types.

---

## Phase 3 — LOW–MED

### Task D-2 — Zone 1 (context strip) + tokens
`--text-hero` added to `styles.css` scale (44 px page / 36 px compact, never < 32 px), restricted by
comment to one dominant figure per screen. Lot figure uses `--font-mono` + `tabular-nums`, colour
`--text` — **not** `--accent` (DESIGN.md §6 reserves it for interaction). Warnings use `--warning` /
`--warning-subtle`, **never** `--down` (P6).

### Task D-3 — Copy action
Payload is the bare number, dot decimal, two decimals (`2.22`) — no unit, no label, no whitespace.
Separator confirmed by S-1.c. Flash `--accent` for ~1.2 s via `--duration-fast`/`--ease-out`.
Failure is **visible** (`'No se pudo copiar — selecciona y copia'`), never a silent false success.
Disabled — not hidden — during honest states, so the layout does not jump.

### Task D-4 — Ficha del activo + `$/point` guard-rail
Discloses `contractSize`, `tickSize`, `pointSize`, `pipSize`, `volumeStep`, `volumeMin`, currency,
aliases and **provenance with its date**. Contract line adds the resulting position's `$/point`.

### Task D-5 — Focus, select-on-focus, `Esc`, steppers
Initial focus → **stop field** when context is restored; → **Cuenta** on cold start (P2). All numeric
fields select-on-focus. `↑/↓` step by the active unit, `Shift` ×10. Touch steppers under
`@media (hover: none)` only.

### Task C-2 — Persistence (Layer C)
Key `emulador.calculadora`. Per-field shape guard with per-field fallback, mirroring
`loadInitialState` (`settings.reducer.ts:54`); `try/catch` → defaults, and `try/catch` → ignore on
write, mirroring `persistSettings` (`:78`). Reserved `v` field, **zero read sites** — the audit
verifies it stays unread. Persist on change via an effect modelled on `settings.effects.ts:12`.
**Never persist the typed distance.** **No `storage` listener** (C4).

---

## Phase 4 — HIGH, gated on S-1 = GO

### Task D-6 — Window adapter
`window.open('', …)` / `documentPictureInPicture.requestWindow()`, both same-origin; mount the view
into the target document; `pagehide` teardown removing every listener; singleton per host kind
(re-open focuses the existing window). **Never a route** — the RFC §5 diagram is the rationale.
Clipboard is called on the **target window's** `navigator`.

### Task D-7 — Window-only shortcuts
`Alt+M` / `Alt+A` / `Alt+S` in the companion window only. `Enter`, `Esc`, `↑/↓` already exist in
**both** hosts from D-5 (P7 as amended).

---

## §3 Rules binding on every task

- Four gates, raw, from `emulador/`. **Never** `npx vitest run` (no TestBed env — always fails).
  **Never** pipe a gate through `| tail` / `| head`: it swallows the non-zero exit and a real
  failure reads as a pass.
- `npm run lint` must be **0 problems**.
- Pathspec commits only. **Never `git add -A`.**
- Baseline **1046**. Every report states the exact post-task count and the arithmetic.
- No new runtime dependencies: `git diff --stat` on `emulador/package.json` and
  `package-lock.json` must be empty.
- Pre-existing specs are authority. Editing one = behaviour change = **STOP and report**.
- **"Nothing else."** Any file outside a task's scope table = STOP and report.
- Do not touch `.opencode/`, `.superpowers/calculadora/`, `.superpowers/rfc-018/`,
  `.superpowers/rfc-019/`, `docs/superpowers/plans/task-*`.
