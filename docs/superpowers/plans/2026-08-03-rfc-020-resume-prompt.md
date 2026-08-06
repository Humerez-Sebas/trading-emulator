# RFC-020 — Resume prompt (paste into a cold session)

> You are the **orchestrator** resuming a paused SDD run. You do not implement, and you do not audit
> your own dispatches beyond mechanical diff-scans. This document assumes you remember nothing.
>
> The run was paused by the owner at a usage limit on **2026-08-03**, after Wave 1's implementation
> landed and before Wave 1's audit was dispatched. Nothing is half-finished.

---

## §0 — BOOT

Read in this order. Do not reorder; later documents assume earlier ones.

| # | Document | Why |
| :-- | :--- | :--- |
| 1 | `CLAUDE.md` | Kernel: invariants 1-8, the four gates, git rules |
| 2 | `docs/engineering/PHILOSOPHY.md` | §1.1 evidence, §3.1 authority, §5.4-5.7 roles / risk / deviation / STOP |
| 3 | `docs/engineering/sdd-orchestration.md` | Run protocol, ledger, run modes, audit taxonomy |
| 4 | `docs/architecture/rfcs/020-lotaje-position-sizer.md` | **The spec.** §1 = Design Review verdict D.20.1-6; P1-P8 |
| 5 | `docs/superpowers/plans/2026-08-02-rfc-020-lotaje-position-sizer-implementation-plan.md` | **The plan.** §0 corrections C1-C5 bind over the RFC's prose |
| 6 | `docs/superpowers/plans/2026-08-02-rfc-020-sdd-prompt.md` | The original run prompt: wave sequencing, batching rules, per-wave audit policy |
| 7 | **`.superpowers/rfc-020/dev-log.md` §8 and §9** | **The ledger — the single source of run truth.** §8.4.1 and §8.5 change what the plan says. Read them |
| 8 | `.superpowers/rfc-020/spike-s1-report.md` | The S-1 evidence, incl. the seven undetermined items |
| 9 | `docs/engineering/testing.md` | `ng test` vs bare vitest, isolate:false discipline |

Read only when dispatching the task that needs them: `docs/superpowers/specs/2026-08-02-position-sizer-product-design.md` (any Layer-D task), `docs/engineering/domain/data-pipeline.md` (pipeline work).

---

## §1 — Where the run actually is

| Fact | Value |
| :--- | :--- |
| Branch | `claude/lotaje-v2-core` |
| Base | `origin/main` @ `ad80b9f` |
| HEAD at pause | `31786b9` |
| PR target | **`main`** — declared product-track exception (RFC §6.1 / D.20.5, owner's decision) |
| Run mode | **WAVED with risk-based review batching** (ledger §8.0.1) |
| Tests now | **1064** (79 files). Original baseline **1046** |
| Push | **None so far, and none without the owner.** Branch finalization and the PR are the owner's call |

**Done:** Wave 0 (S-1 spike → **GO**), Wave 1 implementation (A-1 `2d943cd`, B-1 `33970ff`).
**Not done:** Wave 1 audit, Waves 2-5, final whole-branch audit, PR.

**First action on resume:** re-verify the tree yourself before trusting any of the above.

```bash
cd emulador && npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.spec.json --noEmit && npm run lint && npx ng test --watch=false
```

Expect **79 files / 1064 tests**. **Never** pipe a gate through `| tail` or `| head` — it swallows
the non-zero exit and a real failure reads as a pass. **Never** `npx vitest run`: it always fails
(no TestBed env); only `ng test` bootstraps the environment.

---

## §2 — The next action

**Dispatch a `branch-auditor` over Wave 1 — commits `2d943cd` and `33970ff`.**

Batched review for Wave 1 is *permitted* (ledger §8.0.1): both tasks are mechanical, file-disjoint,
and claim no behaviour change. The auditor **re-runs all gates personally**; the ledger's numbers
and the implementer reports are claims, not evidence (PHILOSOPHY §1.1).

Point the auditor at these, which the ledger flagged as FINAL-AUDIT ATTENTION:

1. **`asset-registry.ts:69-85` duplicates the heuristic** instead of importing
   `contractSizeFor`/`pipSizeFor`. Deliberate — importing would create a circular dependency the
   moment C-1 rewires `position-sizing.ts`. The declared tripwire is an equivalence spec in
   `asset-registry.spec.ts`. **Verify that spec exists, covers both functions, and would actually
   fail on drift.** The duplication is only acceptable while the tripwire is real.
2. **`pipeline/export_symbols.py` (257 LOC) talks to a live trading terminal.** Verify by reading
   that it calls only `initialize`, `symbol_info`, `account_info`, `terminal_info`, `shutdown` —
   no trading API of any kind.
3. **The parity property of A-1**: `trading.models.ts` must be a pure re-export and none of
   `trading.reducer.ts`, `selectors.ts`, `chart.component.ts`, `trade-panel.component.ts`,
   `trading.models.spec.ts` may appear in the diff.

Wave exit also requires the boundary grep to be empty:

```bash
grep -rnE "@angular/|\.\./\.\./state/|\.\./\.\./components/|domain/chart" emulador/src/app/domain/sizing --include=*.ts
```

**Then, and only on a green Wave 1 audit, dispatch C-1** (Wave 2, HIGH, individual audit).

---

## §3 — Two corrections the ledger makes to the plan. Do not skip these.

### 3.1 C-1 has **zero** behaviour deltas — do not manufacture one

The plan (Task C-1 §4) expects deltas and names `BTCUSD: 100000 → corrected`. **Measured against the
real registry, no delta exists in either class** (ledger §8.4.1):

- MT5's real contract sizes **match today's name-shape heuristic exactly** for all four curated
  symbols: `US30`/`NAS100`/`SP500` → `1`, `XAUUSD` → `100`.
- Uncurated symbols still fall through `resolveAsset` to the heuristic, which reproduces
  `contractSizeFor`/`pipSizeFor` exactly. `BTCUSD` still resolves to `100000`, unchanged.

So C-1 should come out as a **pure refactor**, parity proof V3 clean, with **zero** named-delta
tests. **C-1 must not add entries to `MANUAL_ASSETS` or alter the heuristic to produce the delta the
plan anticipated** — that would be an unrequested change to the emulator's sizing inside the run's
highest-risk task. C-1 measures, finds zero, reports zero.

C-1 must still answer the `modifyOrder` question by **reading** `trading.reducer.ts:154` (pending
orders re-sized from `riskPct + contractSize`) and writing the finding in its report. With zero
deltas the answer is expected to be "no session can move", but it must be read, not assumed.

### 3.2 S-1 returned **GO** — D-1 is framework-free, Waves 4 and 5 are in scope

Verdict recorded in ledger §8.5, evidence in the spike report. Mechanism: **`documentPictureInPicture`**,
not `window.open` — the PiP window carries `WS_EX_TOPMOST` and floats over MT5 regardless of focus,
while the popup shares MT5's z-band and vanishes behind it on the first click.

Two measured facts that bind Task D-6:

- **The clipboard must be called on the target window's `navigator`.** The opener's navigator throws
  `NotAllowedError: … Document is not focused.` once the companion holds focus. This passes casual
  manual testing and fails in real use.
- **PiP floors width at 240 CSS px**, and may remember a user-resized size and override the request.
  D-6 must not assume the requested size is granted.

**Q3 (S-1.c, the MT5 decimal separator) is still open and gates only D-3's copy payload in Wave 4.**
The 30-second owner probe is in the spike report under `## Owner probe — S-1.c (Q3)`. Indicative
evidence suggests it may differ per terminal (the running WSFunded terminal inherits `en-US` → dot;
a second FTMO terminal has `Language=Spanish`). Do not guess it — if Wave 4 reaches D-3 before the
owner has run the probe, implement the dot payload and flag the assumption in the ledger.

---

## §4 — Remaining waves (from the original prompt, unchanged except as §3 says)

| Wave | Tasks | Risk | Review |
| :--- | :--- | :--- | :--- |
| 2 | **C-1** registry cutover | **HIGH** | **Individual audit. No batching.** Parity proof V3 is the gate |
| 3 | **D-1** the view | **HIGH** | **Individual audit.** Gates + `npm run build` |
| 4 | D-2, D-3, D-4, D-5, C-2 | LOW-MED | **Batched** — one audit for the wave |
| 5 | D-6, D-7 | **HIGH** | **Individual audit.** Unlocked by the GO |
| — | Final whole-branch audit | — | Never skipped. PR ships only on PASS, 0 Critical/High/Medium |

**D-1's internal order is mandatory:** port the 459 LOC of v1 specs **first** and watch them fail
before writing any view code. The F1 (DOM decimal entry) and F3 (comma decimal / trailing junk) bug
classes shipped past a green suite once, because the tests drove signals via `.set()` and never
crossed the DOM. **Ported specs must fire real `input` events.**

D-1 also deliberately deletes shipped, tested code — "Desde lotes"
(`calculadora-page.component.html:147-185` plus `manualLotsText` / `manualLots` / `manualRiskUsd` /
`manualRiskPct` / `onManualLots` and their specs) and `app-risk-slider` from this page. That must
appear in the report **as a declared deletion**, never as an incidental diff.

**Wave 4 bindings:** no `storage`-event listener (C4 / D.20.2 — withdrawn, not reserved); the
reserved `v` field has **zero read sites** and the audit verifies it stays unread; the unit suffix
is a **label, not a control** (C3 / D.20.3) — a click handler on it is an automatic finding.

---

## §5 — Standing rules

- **Pre-existing specs are authority.** Needing to edit one = behaviour changed = **STOP + report**.
- **"Nothing else."** Any file outside a brief's scope table = STOP + report.
- Four gates, raw, from `emulador/`, never piped. `npm run lint` = 0 problems.
- **No new runtime dependencies.** After any `npm install`, `npm ci --dry-run` before committing the
  lockfile (npm 11.x prunes optional-dep entries; local green, CI EUSAGE).
- **Pathspec commits only, never `git add -A`.**
- Every report: commit hash, test-count arithmetic, **raw unpiped gate output**, files touched vs
  scope table, and **every deviation classified `inert` / `requires-attention`**. Silent deviation is
  the one unrecoverable failure mode.
- Do not touch `.opencode/`, `.superpowers/calculadora/`, `.superpowers/rfc-018/`,
  `.superpowers/rfc-019/`, `docs/superpowers/plans/task-*`.
- **`develop` is out of scope for every dispatch** (Q4, delegated to a separate run). Branch
  protection on `main` is a **human dashboard task** (Q5) — do not attempt it.
- **Do not push.** Branch finalization and the PR are the owner's call.
- Owner queue is **closed except Q3**, and Q3 is answered by the owner probe, not by escalation.

### 5.1 Two mechanical lessons from the first session, worth inheriting

1. **The `spec-util` invariant grep as written gives a false positive.** It hits comment prose at
   `state/layout/layout-invariants.ts:10,12`; the only real imports are in `.spec.ts` files, which
   is permitted. Use the precise form and do not let anyone "fix" untouched pre-existing prose:
   ```bash
   grep -rnE "from '.*spec-util'|require\(.*spec-util" emulador/src/app --include=*.ts | grep -v "\.spec\.ts"
   ```
2. **A-1 and B-1 were run sequentially, not in parallel** (ledger §8.2), because two concurrent
   `ng test` runs share `.angular/cache` and `node_modules/.vite` — the optimizeDeps race behind the
   PR #23 flakes — and because concurrent runs destroy attributable test-count arithmetic. Apply the
   same rule to any future "parallel" wave: **file-disjoint is not sandbox-disjoint.**

### 5.2 The Browser pane is not a conformance oracle

The in-app Browser pane is Electron (`Claude/1.24012.9 Chrome/148 Electron/42.7.0`). It throws
`InvalidStateError: Internal error: no window` for `documentPictureInPicture` and returns `null`
from `window.open`. Those are **embedder host-policy facts, not web-platform facts** — believing
them would have cut Waves 4 and 5 on a measurement artifact. For window/clipboard behaviour, drive a
**real browser**.

### 5.3 MT5 is the owner's live trading terminal

Read-only `symbol_info` / `account_info` / `terminal_info` calls are fine — that is what the pipeline
does daily. **Never** drive its GUI, its `F9` order dialog, or any trading API, and never send it
keystrokes. Probes that need the GUI are written up for the owner to run, not executed.
