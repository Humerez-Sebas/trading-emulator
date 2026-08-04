# RFC-020 — Resume prompt #3 (paste into a fresh session)

> You are the **orchestrator** resuming a paused SDD run. You do not implement, and you do not audit
> your own dispatches beyond mechanical diff-scans. **This document assumes you remember nothing.**
>
> The owner paused the run on **2026-08-04**, immediately after Task D-5 committed. Wave 3 is audited
> PASS. Wave 4 Tasks D-2 through D-5 are implemented but deliberately await their single batched
> audit; C-2 is the only remaining Wave 4 implementation. Nothing is half-finished.

---

## §0 — BOOT

Read in this exact order. Do not reorder; later documents override stale earlier prose where stated.

| # | Document | Why |
| :-- | :--- | :--- |
| 1 | `CLAUDE.md` | Kernel: invariants, gates, git rules, context-loading map |
| 2 | `docs/engineering/PHILOSOPHY.md` | Evidence, authority hierarchy, role separation, risk, deviation, STOP |
| 3 | `docs/engineering/sdd-orchestration.md` | Orchestrator/implementer/auditor contracts, ledger, audit taxonomy |
| 4 | `docs/architecture/rfcs/020-lotaje-position-sizer.md` | **Spec.** §1 verdict D.20.1-6 and P1-P8 |
| 5 | `docs/superpowers/plans/2026-08-02-rfc-020-lotaje-position-sizer-implementation-plan.md` | **Plan.** §0 C1-C5 bind over mechanical RFC prose |
| 6 | `docs/superpowers/plans/2026-08-02-rfc-020-sdd-prompt.md` | Original wave sequencing and risk-based batching policy |
| 7 | **`.superpowers/rfc-020/dev-log.md` §§8-15** | **Ledger: single source of run truth.** §14 closes D1-H1; §15 is current Wave 4 state |
| 8 | `docs/superpowers/specs/2026-08-02-position-sizer-product-design.md` | UX authority; apply owner/RFC overrides recorded in the ledger |
| 9 | `docs/engineering/testing.md` | `ng test`, `isolate:false`, cache and evidence discipline |

Read only when the next phase needs them:

- `.superpowers/rfc-020/spike-s1-report.md` before D-6/D-7 and their audit.
- `PRODUCT.md` and `DESIGN.md` before further Layer-D visual work.
- `docs/engineering/domain/data-pipeline.md` for the final audit of existing pipeline changes.

After BOOT, be able to state these facts before dispatching: C-1 was the only task that changed the
emulator sizing path and proved **126 symbols / zero deltas**; D1-H1 was a pip-display/price-unit bug
fixed in the view layer and independently re-audited; C-2 persists only context and must not read `v`
or add storage synchronization.

---

## §1 — Actual pause state

| Fact | Value |
| :--- | :--- |
| Branch | `claude/lotaje-v2-core` |
| Base | `origin/main` @ `ad80b9f` |
| Source parent before handoff | `f0dfdff` — D-5 implementation |
| Expected pause HEAD | Documentation-only commit containing this prompt and ledger §15.4-§15.6; verify `git rev-parse HEAD` and require parent `f0dfdff` |
| Ahead of `origin/main` | Expected **36 commits** after handoff, none pushed; measure rather than trust |
| PR target | **`main`**, declared product-track exception (RFC §6.1 / D.20.5 / owner) |
| Run mode | **WAVED with risk-based review batching** (ledger §8.0.1) |
| Tests | **83 files / 1165 tests**. Original baseline: 78 / 1046 |
| Tree | Tracked clean; only four permanently off-limits untracked directories |

The only tolerated untracked entries are:

```text
.opencode/
.superpowers/calculadora/
.superpowers/rfc-018/
.superpowers/rfc-019/
```

Do not open, search, modify, stage, clean, or delete them. A C-2 planning agent already breached this
boundary once through an over-broad repository grep (ledger §15.5); it changed nothing, but the
deviation is `requires-attention` and must not be repeated. Every search gets an explicit permitted
root such as `emulador/`, `docs/`, or `.superpowers/rfc-020/`.

### Completed and audited PASS

- Wave 0: S-1 spike → **GO** on `documentPictureInPicture`.
- Wave 1: A-1 `2d943cd`, B-1 `33970ff`; NOT PASS → F-1 `7d83b1a` → re-audit PASS.
- Wave 2: C-1 `25a0ec2`, 126-symbol differential with zero deltas; cleanup `04f6db9`,
  `bf2b211`; audit PASS.
- Wave 3: D-1 `a61ca59` → audit NOT PASS on D1-H1 → fix `ea06fb4` → re-audit
  **PASS ("Ship it")**, 0 Critical / 0 High / 0 Medium / 2 carried Low.

### Wave 4 implemented, not audited

| Task | Commit | Files/tests after | Report |
| :--- | :--- | :--- | :--- |
| D-2 context + hero token | `0f4237e` | 83 / 1131 | `.superpowers/rfc-020/task-d2-report.md` |
| D-3 target-realm copy | `714b9a8` | 83 / 1140 | `.superpowers/rfc-020/task-d3-report.md` |
| D-4 chip + selection + Ficha | `a4dad35` | 83 / 1149 | `.superpowers/rfc-020/task-d4-report.md` |
| D-5 focus + keys + touch steppers | `f0dfdff` | 83 / 1165 | `.superpowers/rfc-020/task-d5-report.md` |

These reports passed orchestrator mechanical scans but remain claims, not audit evidence. The
permitted batched Wave 4 audit occurs only after C-2 lands.

### First action: measure the resumed tree

From `emulador/`, sequential and raw, no pipes and never bare Vitest:

```text
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npm run lint
npx ng test --watch=false
```

Expected: both tsc commands exit 0; lint says `All files pass linting.`; tests report **83 files /
1165 tests**, whole sequence exit 0. Any discrepancy is STOP before C-2. Do not run another agent
concurrently: `.angular/cache` and `node_modules/.vite` are shared.

Also verify:

```text
git branch --show-current
git rev-parse HEAD
git rev-parse HEAD^
git rev-list --count origin/main..HEAD
git status --short --branch
git diff --name-status ad80b9f..HEAD -- "*.spec.ts"
```

The spec diff must contain exactly one `M`:
`emulador/src/app/pages/calculadora/calculadora-page.component.spec.ts`. Lotaje specs remain `A`.

---

## §2 — First implementation: C-2 persistence

**A ready-to-use local brief exists at `.superpowers/rfc-020/task-c2-brief.md`.** Read it critically,
confirm its assumptions against permitted files, and dispatch one `sdd-implementer`. If explicit
model selection exists, use **Terra or Luna**. If only `subagent_type` exists, encode the full role in
a fresh general-agent prompt.

The brief was authored against source HEAD `f0dfdff`. The dispatch HEAD is the documentation handoff
commit measured in §1. Require this to be empty:

```text
git diff --exit-code f0dfdff <DISPATCH_HEAD> -- emulador/src/app
```

Supply the full measured hash; never expand a short hash by guessing.

### C-2 exact contract

- Key: `emulador.calculadora`.
- Persist only raw `balanceText`, `riskPctText`, `symbolText`, and `method`.
- Never persist/restore distance, entry, SL, lots, risk dollars, metadata, disclosure, copy feedback,
  focus, candles, or session data.
- Stored `v: 1` is **reserved with zero read sites**. No validation, branch, migration, destructure,
  indirect access, listener field, or interface read.
- Per-field shape guards and P2 fallback; malformed root/JSON/read degrades to defaults.
- Every `win.localStorage` getter/read/write and JSON operation is inside `try/catch`.
- Omitted third `mount` argument loads context from the **supplied window realm**. An explicit third
  argument wins and reads no storage. Neither path writes on mount.
- One central transition side effect writes once after an actual account/risk/symbol/method change.
  Question input, arrows, steppers, Esc, disclosure, copy, focus, timers, and unmount write nothing.
- No `storage` event listener. C4/D.20.2 withdrew synchronization entirely: no field, interface,
  generation, teardown branch, or reserved machinery.
- No Angular, NgRx, state, components, chart, host, CSS, domain, auth, Supabase, or dependency change.

### Scope and arithmetic

Expected commit scope:

```text
A emulador/src/app/lotaje/persistence.ts
A emulador/src/app/lotaje/persistence.spec.ts
M emulador/src/app/lotaje/lotaje-view.ts
M emulador/src/app/lotaje/lotaje-view.spec.ts
```

The view spec remains `A` relative to `ad80b9f`; C-2 must not create a second modified pre-existing
spec. Expected arithmetic: **83/1165 → 84/1188** (+1 file, +10 pure tests, +13 integration tests).
The brief requires focused RED/GREEN, conservative build, AST proof `v writes=1; v reads=0`,
no-storage-listener proof, target-realm proof, and one direct four-path pathspec commit:

```text
feat(rfc-020): persist Lotaje context locally (C-2)
```

Required report: `.superpowers/rfc-020/task-c2-report.md`, with raw outputs and every deviation
classified `inert` / `requires-attention`.

### Planning deviation

The brief-author dispatch returned BLOCKED because an over-broad grep observed off-limits matches.
It modified no off-limits file and did not implement C-2. The brief was then read only at its allowed
path and its commit command corrected to direct pathspec form. Carry this process breach into the
Wave 4 audit attention list and never repeat the search behavior.

After C-2 returns, perform only a mechanical scan: parent, four paths, arithmetic, report completeness,
package/kernel/host absence, one-`M`, `v`, and clean tree. Append C-2 to ledger §15 and commit only
that ledger update before audit.

---

## §3 — Wave 4 batched audit

Only after C-2's scan passes, dispatch one independent `branch-auditor`. If model choice exists, the
owner requests **Sol** for audits. The auditor did not implement any Wave 4 task and personally
re-runs evidence.

Audit these implementation commits:

```text
0f4237e  D-2
714b9a8  D-3
a4dad35  D-4
f0dfdff  D-5
<C2_COMMIT>  C-2
```

Ledger commits interleave them; distinguish docs from source rather than using `HEAD~N`. Derive the
source range from D-2 parent `58e275c` through C-2 and verify task scopes/reports/arithmetic.

Independent gates from `emulador/`, sequential and raw:

```text
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npm run lint
npx ng test --watch=false
npm run build
```

Expected post-C2 count: **84/1188**, subject to measured C-2 evidence. Build must have no new chunk
types, production vitest/expect-type/magic-string/spec sentinel, circular warning, or new warning
class beyond the known approximately 612.60 kB initial-budget warning.

### Mandatory attention

1. **D-3 (`714b9a8`, +582/−40):** target navigator, payload, fulfil/reject/synchronous throw,
   out-of-order attempts, render invalidation, realm-owned timer, unmount/remount, no ambient API.
2. **D-4 (`a4dad35`, +621/−33):** closed chip despite hidden DOM input, generated options only,
   Ficha honesty/date, no second sizing path/unit control, D-3 feedback preservation/invalidation,
   listener non-accumulation.
3. **D-5 (`f0dfdff`, +813/−26):** iframe focus evidence, supplied-document realm, physical listener
   removal, no native-control double copy, trusted Enter chain, pip/point stepping, Method-A
   exclusion, `(hover: none)` steppers, D-3/D-4 preservation.
4. **C-2:** target storage realm, excluded fields, explicit-state precedence, write/no-write matrix,
   write-failure correctness, `v` one write/zero reads, zero synchronization machinery.
5. **Visual gap:** structural evidence is not a browser visual pass.
6. **Planning breach:** verify no tracked source/commit contains anything from off-limits paths and
   record it separately from product-code findings.

Verdict taxonomy: Critical / High / Medium / Low. Wave 5 is blocked until **PASS ("Ship it")** with
zero Critical/High/Medium. Lows require written disposition. Findings start a scoped fix/re-audit.

---

## §4 — Current Wave 4 claims and arithmetic

Audit targets, not facts until independently proved:

- D-2: hero 44px page / 36px compact, one consumer; risk dollars `--text-md`.
- D-3: native exact-payload copy on target realm, truthful 1200ms success/failure, disabled honest
  glyph while `.lotaje-hero` remains absent, warning-state copy enabled.
- D-4: collapsed chip; generated selector + free text + nine-row Ficha; point from digits; aliases
  unavailable; full provenance; no unit control.
- D-5: cold/restored focus, numeric select-on-focus, root Esc/Arrow/Enter, one step path, touch
  steppers only under `(hover: none)`, guarded initial-state seam; no persistence yet.

| Milestone | Files | Tests | Delta |
| :--- | ---: | ---: | :--- |
| `ad80b9f` | 78 | 1046 | origin |
| A-1 | 78 | 1053 | +7 |
| B-1 | 79 | 1064 | +11, +1 file |
| C-1 | 79 | 1072 | +8 |
| C-1 cleanup | 79 | 1071 | −1 dead tripwire, pre-declared/audited |
| D-1 | 83 | 1125 | +54, +4 files |
| D1-H1 fix | 83 | 1131 | +6 |
| D-2 | 83 | 1131 | +0 |
| D-3 | 83 | 1140 | +9 |
| D-4 | 83 | 1149 | +9 |
| D-5 | 83 | 1165 | +16 |
| C-2 expected | 84 | 1188 | +23, +1 file |

---

## §5 — Supabase visual-test limitation

The owner authorized a dedicated test user, but the MCP exposes no Auth Admin call/server secret.
`auth.admin.createUser` requires secret/service-role and returns no session; there is no documented
admin session-mint API; `generateLink` still needs Admin secret plus OTP/link consumption; `setSession`
only installs an existing pair. Direct `auth.users` SQL insertion is unsupported for hosted login.

Therefore no user was created and no identity/secret exists to delete. No token, auth SQL write,
form password, or bypass occurred. Do not retry direct Auth-table SQL. The visual pass remains a
non-blocking owner task: Zone 1 CSS order, hero hierarchy, suffix overlap, 560px reflow, contrast.

---

## §6 — Wave 5 and final audit

After Wave 4 PASS: D-6 adapter, D-7 companion shortcuts, then mandatory whole-branch audit. Read the
S-1 report before briefing Wave 5.

- Use **`documentPictureInPicture`**, never `window.open`; only PiP stays topmost over maximized MT5.
- Clipboard remains on target navigator; opener throws `NotAllowedError` when unfocused.
- PiP floors width at 240 CSS px and may override remembered/requested dimensions.
- Never use a route/second Angular bootstrap; that creates duplicate Auth/Workspace/SessionSync actors.
- Mount the existing framework-free view into target document, copy required styles/tokens, teardown
  adapter resources on `pagehide`, and enforce singleton/reopen behavior.
- D-7 owns only companion `Alt+M`, `Alt+A`, `Alt+S`; Enter/Esc/Arrow already come from D-5.
- Use a real browser for PiP conformance; Electron Browser pane is not an oracle.
- Never drive MT5 GUI, F9, trading APIs, or keystrokes.

Final audit runs Angular gates/build and pipeline gates because B-1 changed pipeline:

```text
python -m pytest -q
ruff check .
ruff format --check .
```

No push, PR, or finalization without owner request.

---

## §7 — Open items and standing rules

Owner queue remains closed; record and continue:

1. D1-L1 cold-start copy decision.
2. `BTCUSD` remains heuristic `100000`.
3. Registry contract-size changes re-value open/realized P&L.
4. Authenticated visual pass remains owner work.
5. `develop`↔`main` reunification is a separate run.
6. `main` branch protection is a human dashboard task.

Rules:

- Orchestrator dispatches/owns ledger; never implements or self-audits beyond mechanical scans.
- Use Terra/Luna for implementation and Sol for audit when model choice exists; otherwise encode roles
  in fresh general agents.
- Pre-existing specs are authority. Sole declared rewrite is Calculadora spec; any other `M` is a
  finding.
- Any file outside brief scope is STOP + report.
- Raw gates, no pipes, no bare Vitest, no concurrent Angular processes.
- No runtime dependency; direct pathspec commits only; never `git add -A`, amend, or push.
- Every report includes parent/commit, arithmetic, raw output, scope, and classified deviations.
- Precise production spec-util detector:

```text
grep -rnE "from '.*spec-util'|require\(.*spec-util" emulador/src/app --include=*.ts | grep -v "\.spec\.ts"
```

- Re-read architecture comments after every ownership/cutover change.
- A test that cannot fail is worse than none; unit and value belong in the same assertion.
- Never inspect the four off-limits directories, including via broad search.

**Stop state:** the next fresh session starts with §1 measurement, then C-2, then Wave 4 audit.
