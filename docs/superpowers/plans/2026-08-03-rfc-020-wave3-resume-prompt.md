# RFC-020 — Resume prompt #2 (paste into a fresh Opus 5 session)

> You are the **orchestrator** resuming a paused SDD run. You do not implement, and you do not audit
> your own dispatches beyond mechanical diff-scans. **This document assumes you remember nothing.**
>
> The run was paused by the owner on **2026-08-03**, mid-Wave-3: Task D-1 landed and was audited
> **NOT PASS on one High**; the fix for that High was dispatched and **stopped before it committed
> anything**. Nothing is half-finished — the tree is clean and every decision is committed.

---

## §0 — BOOT

Read in this order. Do not reorder; later documents assume earlier ones.

| # | Document | Why |
| :-- | :--- | :--- |
| 1 | `CLAUDE.md` | Kernel: invariants 1-8, the four gates, git rules |
| 2 | `docs/engineering/PHILOSOPHY.md` | §1.1 evidence, §3.1 authority, §5.4-5.7 roles / risk / deviation / STOP |
| 3 | `docs/engineering/sdd-orchestration.md` | Run protocol, ledger, run modes, audit taxonomy |
| 4 | `docs/architecture/rfcs/020-lotaje-position-sizer.md` | **The spec.** §1 = verdict D.20.1-6; P1-P8 |
| 5 | `docs/superpowers/plans/2026-08-02-rfc-020-lotaje-position-sizer-implementation-plan.md` | **The plan.** §0 corrections C1-C5 bind over the RFC's prose |
| 6 | `docs/superpowers/plans/2026-08-02-rfc-020-sdd-prompt.md` | Original run prompt: wave sequencing, batching, per-wave audit policy |
| 7 | **`.superpowers/rfc-020/dev-log.md` §8 – §13** | **The ledger — the single source of run truth.** §8.4.1, §8.6, §11.4, §12.3, §13.5 all change what the plan says |
| 8 | `docs/superpowers/specs/2026-08-02-position-sizer-product-design.md` | **UX authority.** Needed immediately — the open High is a product-semantics bug |
| 9 | `docs/engineering/testing.md` | `ng test` vs bare vitest, `isolate:false` discipline |

Read only when the task needs it: `.superpowers/rfc-020/spike-s1-report.md` (Wave 5),
`docs/engineering/domain/data-pipeline.md` (pipeline work).

---

## §1 — Where the run actually is

| Fact | Value |
| :--- | :--- |
| Branch | `claude/lotaje-v2-core` |
| Base | `origin/main` @ `ad80b9f` |
| **HEAD** | **`7ad0de6`** (ledger + plan only) |
| Ahead of `origin/main` | **24 commits**, none pushed |
| PR target | **`main`** — declared product-track exception (RFC §6.1 / D.20.5, owner's decision) |
| Run mode | **WAVED with risk-based review batching** (ledger §8.0.1) |
| Tests | **1125** (83 files). Original baseline **1046** |
| Working tree | Clean except four permanently off-limits untracked dirs |

**Complete and audited PASS:** Wave 0 (S-1 spike → **GO**), Wave 1 (A-1 `2d943cd`, B-1 `33970ff`;
NOT PASS → F-1 fix `7d83b1a` → re-audit PASS), Wave 2 (C-1 `25a0ec2`, PASS with a 126-symbol
zero-delta proof; cleanup `04f6db9`, `bf2b211`).

**Wave 3:** D-1 landed (`a61ca59`) and was audited **NOT PASS — 1 High, 3 Low**.

**First action: re-verify the tree yourself.** From `emulador/`, chained raw, **no pipes**:

```bash
cd emulador && npx tsc -p tsconfig.app.json --noEmit && npx tsc -p tsconfig.spec.json --noEmit && npm run lint && npx ng test --watch=false
```

Expect **83 files / 1125 tests**, whole-chain exit 0. **Never** `npx vitest run` — it always fails
(no TestBed env); only `ng test` bootstraps it. **Never** pipe a gate through `| tail` / `| head` —
it swallows the non-zero exit and a real failure reads as a pass.

---

## §2 — The first action: close **D1-H1**

**A ready-to-use brief already exists at `.superpowers/rfc-020/task-d1fix-brief.md`.** Read it,
satisfy yourself it is right, and dispatch an `sdd-implementer` with it. Full analysis: ledger
§13.5.1.

**The defect.** `emulador/src/app/lotaje/sizing-view-model.ts:90` labels the stop field **«pips»**
when the symbol has a pip size, but `:96`/`:109` pass the typed number **straight into
`lotsForRiskDistance(riskUsd, distanceInPrice, contractSize)` with no conversion**. A field labelled
in pips is consumed as price units.

Measured on the committed code (balance `10 000`, risk `1 %`): `EURUSD` + typing `45` renders
**0.01 lots instead of 0.22**, and prints `El mínimo de 0.01 lotes arriesga $45000.00…` against a
true risk of **$4.50** — a **10 000× error in the dangerous direction**, on the figure product design
§3.1 calls *«el ancla honesta de toda la herramienta»*.

**The ruling is already made — do not re-litigate it.** Fix by **conversion**, not by relabelling:
product design §4.2 is frozen and wants pip-denominated entry for FX. `pipSize !== null` → 1 typed
unit = `pipSize` price units; `pipSize === null` → 1 price unit, **unchanged** (the `pts` path is
pinned by the ported acceptance case — if a green test changes colour there, something broke).

**Three sites, and the second is half the defect:** the value handed to `lotsForRiskDistance`;
**`actualRiskUsd` at `:120`**, which feeds the warning's dollar figure — fixing the lot and leaving
the risk is *not* a fix; and `switchMethod` (`:199-217`) in **both** directions. One named helper for
all three, in the view's derivation layer — **never** in `domain/sizing/*` (owner ruling Q1).

**TDD is mandatory**, with the auditor's own cases as the failing tests. **D1-L3 folds into the same
commit**: assert at `calculadora-page.component.spec.ts:217-226` that the min-lot warning
**accompanies** the figure rather than replacing it (§5.3 makes replace-vs-accompany doctrine; only
the replace direction is asserted today).

**Then re-audit** (resume the same auditor if possible, so it re-runs its own reproduction) and, only
on PASS, proceed to Wave 4.

---

## §3 — Testing credentials: an owner decision, and one boundary

**Owner instruction (2026-08-03):** *create a user in Supabase via the MCP and use it for testing —
it will be yours.* The Supabase MCP is connected and this is the owner's own project, so seeding a
dedicated test user is authorised.

**Why this matters.** `/calculadora` sits behind `authGuard` and the repo has **no guest/offline
mode** (`CLAUDE.md`: login is required). D-1 therefore shipped with **no in-browser visual
verification at all** — the run's most UI-heavy task rests on structural assertions alone
(ledger §13.4, §13.5.4). A dedicated test user closes that gap for every remaining Layer-D task
(D-2…D-5, D-6/D-7).

**The boundary, and it is not negotiable:** an agent does not type passwords into login forms. That
is a standing prohibition and the owner's authorisation does not lift it. **Use the session, not the
form:**

1. Create the test user with the Supabase MCP (auth admin / SQL), with a generated credential that is
   **never the owner's own**.
2. Mint a session **server-side** through the MCP and inject the resulting token into `localStorage`
   before navigating — the client already uses `persistSession: true`
   (`emulador/src/app/auth/supabase.service.ts:14`), so a seeded session is exactly what the app
   expects to find.
3. Navigate to `/calculadora` and verify visually.

Record the user's identity (not its secret) in the ledger so the owner can delete it later. **Do not
commit any credential.** If step 2 proves impossible, say so and leave the visual pass as an owner
task — do not fall back to typing a password.

**What the visual pass must actually look at** (the auditor closed everything else structurally —
`.ui-input` is globally themed via `angular.json:33`, and all 27 `var(--token)` references resolve):
the CSS-`order` reflow in Zone 1, whether the figure reads as the hero, suffix/value overlap at the
fixed 88/96 px widths, the 560 px breakpoint, and contrast. *None can break the arithmetic; all can
make it unusable while green.*

---

## §4 — Remaining waves

| Wave | Tasks | Risk | Review |
| :--- | :--- | :--- | :--- |
| 3 (finish) | **D1-H1 fix** + re-audit | **HIGH** | Individual |
| 4 | D-2, D-3, **D-4**, D-5, C-2 | LOW-MED | **Batched** — one audit for the wave |
| 5 | D-6, D-7 | **HIGH** | Individual. Unlocked by the S-1 GO |
| — | Final whole-branch audit | — | **Never skipped.** PR ships only on PASS, 0 Critical/High/Medium |

**Wave 4 bindings, all already decided:**

- **D-3's copy payload is `2.22` — dot, two decimals**, no unit, no label, no whitespace. **Q3 is
  closed by owner decision** (ledger §12.3.1): MT5 uses the dot. **The spike's owner probe must not
  be requested.** No separator logic, no setting.
- **D-4's scope was extended** (plan Task D-4, ledger §13.3/§13.5.3). Besides the Ficha it now owns
  **product design §3.1's pressable chip → selection + free text**, which D-1 left unimplemented.
  **The selection list must not import `components/*`** — the view is framework-free and must mount
  into the PiP window.
- **D-2** adds `--text-hero` to `styles.css`: **44 px page / 36 px compact**, never below 32 px. The
  §14 "open value" is fixed at **36 px** for the companion (owner).
- No `storage`-event listener (C4 / D.20.2 — **withdrawn**, not reserved: no field, no interface).
- The reserved `v` field has **zero read sites**; the audit verifies it stays unread.
- The unit suffix is a **label, not a control** (C3 / D.20.3) — a click handler on it is an automatic
  finding.

**Wave 5 bindings** (from the S-1 spike, ledger §8.5): use **`documentPictureInPicture`**, not
`window.open` — only PiP gets `WS_EX_TOPMOST` and stays above a maximised MT5. **The clipboard must
be called on the target window's `navigator`** — the opener's throws
`NotAllowedError: Document is not focused` once the companion has focus, which passes casual manual
testing and fails in real use. PiP floors width at **240 CSS px** and may override a requested size.

---

## §5 — Open owner-facing items (none block the run)

1. **D1-L1** — cold start shows *«La cuenta, el riesgo y la entrada deben ser valores positivos.»*
   while cuenta and riesgo **are** positive and **no «entrada» field exists** in Method B. §8's
   messages are frozen verbatim, so a third message is a **product decision**, not an implementer's.
2. **`BTCUSD` is not fixed by this RFC** (§8.4.2) — the curated registry does not cover it and the
   heuristic returns the same `100000`. A one-entry `MANUAL_ASSETS` addition if wanted.
3. **A contract-size change re-values every open position immediately** (§11.4.3) — `contractSize`
   feeds `floatingPnl` and `profitOf`/`closeTrade` live. A registry regeneration changes displayed
   and realised P&L without changing a line of code.
4. **The visual pass** (§3 above).
5. **`develop` ↔ `main` reunification** — delegated to a separate run (Q4). Out of scope here.
6. **Branch protection on `main`** — a human dashboard task (Q5). Do not attempt.

---

## §6 — Standing rules

- **Pre-existing specs are authority.** Editing one = behaviour changed = **STOP + report**. The one
  declared exception is `calculadora-page.component.spec.ts`, rewritten by D-1 under RFC §6.2.
- **The `*.spec.ts` invariant:** `git diff --name-status ad80b9f..HEAD -- '*.spec.ts'` must show
  **exactly one `M`** (that file). **Any other `M` is a finding.**
- **"Nothing else."** Any file outside a brief's scope table = **STOP + report**.
- Four gates, raw, from `emulador/`, never piped. `npm run lint` = 0 problems. **`npm run build`** at
  every Layer-D task and at finalization — watch for **new chunk types**, not the known ~612 kB
  Arrow/parquet budget warning.
- **No new runtime dependencies.** After any `npm install`, `npm ci --dry-run` before committing the
  lockfile (npm 11.x prunes optional-dep entries; local green, CI EUSAGE).
- **Pathspec commits only, never `git add -A`.**
- Every report: commit hash, test-count arithmetic, **raw unpiped gate output**, files touched vs.
  scope table, and **every deviation classified `inert` / `requires-attention`.**
- Do not touch `.opencode/`, `.superpowers/calculadora/`, `.superpowers/rfc-018/`,
  `.superpowers/rfc-019/`, `docs/superpowers/plans/task-*`.
- **Do not push.** Branch finalization and the PR are the owner's call.
- **The owner queue is closed.** Escalate nothing; record and continue.

### 6.1 Lessons this run paid for — apply them, do not relearn them

1. **The `spec-util` grep gives a false positive.** Use the precise form; do not "fix" the untouched
   pre-existing comment prose at `state/layout/layout-invariants.ts:10,12`:
   ```bash
   grep -rnE "from '.*spec-util'|require\(.*spec-util" emulador/src/app --include=*.ts | grep -v "\.spec\.ts"
   ```
2. **File-disjoint ≠ sandbox-disjoint.** Concurrent `ng test` runs share `.angular/cache` and
   `node_modules/.vite` (the optimizeDeps race behind the PR #23 flakes) and destroy attributable
   test-count arithmetic. **Any "parallel" wave runs sequentially.**
3. **Comments outlive code — three times in this run** (B-1's `INERT` header, the equivalence-spec
   "tripwire" claim, the "both copies must change together" note). Each asserted an *architectural
   relationship* and was falsified by a cutover **while every gate stayed green. No gate here catches
   a false comment.** Every cutover brief must require re-reading them.
4. **A test that cannot fail is worse than no test** (Wave 1's F-1, and again at C-1). When a task
   removes the thing a tripwire guarded, retire the tripwire in the same commit — a comment
   advertising a dead guard is false reassurance.
5. **Two specs can each be right and still miss the bug between them** (D1-H1). One spec used EURUSD
   with a price-unit distance; another asserted the «pips» label for GBPJPY; the defect lived in the
   gap. When a value carries a *unit*, pin the unit and the value **in the same assertion**.
6. **The Browser pane is not a conformance oracle.** It is Electron —
   `documentPictureInPicture` throws `InvalidStateError` and `window.open` returns `null`. Those are
   embedder host-policy facts, not web-platform facts; believing them would have cut Waves 4 and 5.
   Drive a **real browser** for window/clipboard behaviour.
7. **MT5 is the owner's live trading terminal.** Read-only `symbol_info`/`account_info`/
   `terminal_info` is fine — the pipeline does it daily. **Never** drive its GUI, its `F9` order
   dialog, or any trading API, and never send it keystrokes.
