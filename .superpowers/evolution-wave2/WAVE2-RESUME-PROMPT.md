# WAVE 2 — COLD-START RESUME PROMPT

Paste this whole file as the opening prompt of a fresh session. It assumes ZERO
conversational memory. Everything needed is here or reachable from the paths named.

Written mid-wave on purpose: the previous session was killed by a usage limit while five
agents were in flight, so this file is committed BEFORE the wave is finished rather than
at closeout. If it disagrees with a specialist's `PROGRESS.md`, trust the specialist's
ledger for its own track and this file for orchestration.

---

## 0. WHO YOU ARE

You are the Principal Engineering Orchestrator continuing the **Engineering Evolution**
campaign for `trading-emulator`, **Wave 2**. Your job is verification and synthesis, not
fresh investigation.

Canonical repo: `C:\Users\78701\Desktop\trading-emulator`

## 1. FIRST ACTIONS — orient before touching anything

```powershell
git -C C:\Users\78701\Desktop\trading-emulator fetch
git -C C:\Users\78701\Desktop\trading-emulator rev-parse origin/develop
git -C C:\Users\78701\Desktop\trading-emulator worktree list
```

Then read, in this order:
1. `.superpowers/evolution-wave2/WAVE2-STATE.md` on branch `agent/evolution-wave2-base`
   — the authoritative orchestration ledger, including per-agent verification verdicts.
2. Each live track's `.superpowers/evolution-wave2/<track>/PROGRESS.md`, whose RESUME
   BRIEF section is written for exactly your situation.

**Wave 1 baseline:** `develop` @ `a2ca53b44f678dd285cd90f31ee644696664f32a`.
If `develop` has moved, do NOT silently rebase or reinterpret. Reconcile what changed and
report drift before mutating anything.

## 2. THE ONE NUMBER THAT MATTERS

```
WAVE2_BASE_SHA = 894d72be95f8ad4b8d63e629114e486e825b13d7
```

Branch `agent/evolution-wave2-base`, worktree
`C:\Users\78701\Desktop\trading-emulator-wave2-base`. All five specialists branch from
this exact SHA. It is Wave 1's three verified branches merged onto `develop`, and its four
gates are green: **183 test files / 2417 tests, all four gates exit 0**.

Nothing has been pushed to `origin`. `develop` and `main` are untouched. No PR exists.

## 3. STATE OF THE SEVEN TRACKS

| Track | Branch | Status when this was written |
| :--- | :--- | :--- |
| Integration baseline | `agent/evolution-wave2-base` | **GREEN**, gates verified |
| Landing closeout | `agent/landing-product-showcase` | **DONE** @ `161e9f5`, deployed + remotely verified |
| B · multi-symbol | `agent/multisymbol-feasibility` | **DONE** @ `3ae5935`, independently VERIFIED |
| E · clock authority | `agent/clock-authority` | **DONE** @ `cee6cff`, independently VERIFIED |
| A · session sovereignty V2 | `agent/session-sovereignty-v2` | **IN FLIGHT** — highest-severity defect |
| C · engine boundary | `agent/engine-boundary-restoration` | **IN FLIGHT** |
| D · unit semantics | `agent/unit-semantics` | **IN FLIGHT** |

For each IN FLIGHT track, do this FIRST:

```powershell
git -C C:\Users\78701\Desktop\trading-emulator-<worktree> log --oneline 894d72b..HEAD
git -C C:\Users\78701\Desktop\trading-emulator-<worktree> status --porcelain
```

**If `status` is non-empty, commit it before anything else.** All five agents were killed
mid-flight once already and four of them were carrying uncommitted work; A had ~300 lines
of unsaved implementation. Never `git reset` an agent worktree — you would destroy evidence
that cost real budget to produce.

Worktree paths: `-session-sovereignty`, `-engine-boundary`, `-unit-semantics`,
`-multisymbol`, `-clock-authority`, `-wave2-base`, `-landing`, all siblings under
`C:\Users\78701\Desktop\`.

## 4. WHAT IS ALREADY SETTLED — do NOT reinvestigate

Re-opening any of these wastes the budget Wave 2 exists to protect.

- **XAUUSD Lotaje sizing is NOT a bug.** D.20.6 intends whole price units for non-FX.
  `resolveAsset` returns `pipSize = null` for metals and for symbols whose digits defeat the
  6-letter forex regex, so `displayUnitSize = 1`. Never wire `tickSize = 0.01` into Lotaje.
- **Index `ExecutionCosts.pointSize = 1` is CORRECT.** Friction is
  `spreadPoints × pointSize`. NAS100 as shipped = $3.00 = 3.00% of intended risk; the `0.01`
  counterfactual = $0.03. The real defect is the NAME and its false "minimum price
  increment" doc comment.
- **SessionSync V1** (truncated pull read as deletion) is fixed and merged into the baseline.
- **`utc-4` showing the NY open at 10:30 in winter is BY DESIGN** (PR #51). Agent E locked
  it with a passing test. Do not "fix" it.
- **No frozen decision needs revoking for multi-symbol.** The non-goal is titled *"Trading
  multi-simbolo"* and its second sentence endorses view-only secondary-symbol panels
  (`008-012…:39-41`). Verified independently.

## 5. CONFIRMED LIVE DEFECTS — found, not yet fixed

Each was verified by the orchestrator, not merely reported.

1. **Session Sovereignty V2** — HIGH, reachable today. User A's local IndexedDB is not
   user-scoped; user B logs in, RLS legitimately returns `[]`, `mergeByLww` reads absence as
   deletion, A's local sessions are destroyed. Agent A's track.
2. **F19-2, latent** — `resolvePanelCandles(series, timeframe)` at
   `chart-model-mapper.service.ts:464` takes no symbol. Adding a `setPanelSymbol` action
   makes a foreign-symbol panel render the primary's candles *while every guard reports
   healthy*. Panels default to `symbol: ''`, which resolves to primary
   (`layout.trade-predicates.spec.ts:85`), so RFC-018/019 guards have never faced a real
   foreign symbol.
3. **`syncTimeRange` forwards bar indices, not absolute time** — `chart-sync-router.ts:20`
   transports a lightweight-charts `LogicalRange`; `010-synchronization.md:56-58` requires
   *"al mismo rango temporal absoluto"*. Root cause: `PanelRuntime.visibleRange` has zero
   hits repo-wide. **Reachable today cross-timeframe, independent of multi-symbol.**
   Mechanism proved by reading only — reproduce in a browser before fixing.
4. **Clock Class A, 10 sites** — broker-clock epochs formatted as UTC while the default zone
   is `ny`, so the chart shows a trade at `09:30` and these show `16:30`. Constant 7 h,
   season-independent. Worst site: `sesiones-page.component.html:514` prints the literal text
   `UTC` beside a raw broker-clock value. `render-model.ts:3`'s "unix seconds (UTC)" comment
   is false. Agent E left all of it unfixed deliberately — see §6.

## 6. OWNER DECISIONS OUTSTANDING

Nothing below should be decided by an agent.

- **D-E1** — does a journal/session date mean the **trading day** (today's behavior, agrees
  with D1 candles that roll at 17:00 NY) or the **NY calendar day**? Affects 5 render sites,
  2 date pickers, and the names of already-saved sessions; changing it silently re-buckets
  historical journal data. This is why Agent E fixed nothing.
- **D-E2** — which zone should the exported CSV use? Its header claims UTC and the owner may
  have archived copies.
- **D-E3** — rename `hourUtc` / `TimeOfDayRow`? The name appears in a design spec.
- **D-E4** — replacement Spanish wording for the literal "UTC" at
  `sesiones-page.component.html:514`.
- **Vercel** — the landing preview is deployed but `ssoProtection` is ON, so the URL is not
  publicly shareable until the owner changes that project setting. Also,
  `dpl_8DmNELPNkvPpGoViLAt5usDmjfc7` sits on the NEW project's production alias from a first
  deploy that defaulted there; delete or keep.
- **Multi-symbol RFC number** — `023` proposed; reconcile against sibling branches. Promotion
  to a real RFC requires Spanish translation.

## 7. BINDING OWNER DECISIONS FROM THE WAVE 2 MANDATE

- **O-1 / O-2** — NO global 100× rescale. The `pts` problem is semantic; fix it with
  vocabulary, not arithmetic. Preserve existing correct calculations.
- **O-3** — an `ExecutionCosts.pointSize` → `costQuoteUnit` rename requires proven migration
  safety first, because the type may be persisted. No blind rename.
- **O-7** — legacy IndexedDB migration is data-preservation-first: never auto-adopt ambiguous
  legacy data, never auto-discard it, never let user B mutate user A's state. Quarantine
  first; ambiguity must fail safe.
- **O-12** — multi-symbol is RFC-grade research only this wave, no production runtime. The
  landing keeps labelling it a future capability with no date.

## 8. HOW TO WORK HERE

**Gates.** From `<worktree>/emulador`, RAW and UNPIPED — never `| tail`/`| head`, which
swallows the non-zero exit so a failure reads as a pass:

```
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npx ng test --watch=false      # NEVER bare `npx vitest run` — no TestBed env, always fails
npm run lint                    # 0 problems
```

Worktrees do not share `node_modules`; `npm ci` per worktree. Commit BEFORE `npm ci`, a full
suite, or a build. After any `npm install`, run `npm ci --dry-run` before committing a
lockfile.

**Git.** Pathspec commits only (`git commit <paths> -m …`), never `git add -A` — parallel
agents share the repo. Never push, never open a PR, never touch `develop`/`main` without an
explicit instruction.

**Invariants.** `ChartEngine` never imports Angular/NgRx; engine core is closed (new behavior
= new Capability); Market-Data vs User-Workspace separation; candle-free session payloads
(`assertNoCandles`); the D8 factory-selector ban; no `*.spec-util.ts` imports in app code.
`pipeline/**` and `.claude/` are protected — propose, don't overwrite.

**Angular 21** — consult the `context7` MCP for official in-use-version syntax before writing
Signals / `linkedSignal` / `resource()` / standalone code. Don't rely on recall.

**Language** — user-facing docs and UI copy in Spanish; agent artifacts in English.

**Ledgers** live at `.superpowers/evolution-wave2/<track>/PROGRESS.md`. Never a root-level
`PROGRESS.md` — five parallel branches collide there, and it already had to be untangled by
hand once this wave.

## 9. THE TWO LESSONS THAT GOVERN THIS CAMPAIGN

Wave 1 produced both failure modes, and Wave 2 has now reproduced both:

1. **Green tests can hide destructive boundary defects.** A test that never crosses the real
   boundary cannot see the bug. This repo has shipped defects past a fully green suite more
   than once.
2. **Suspicious-looking values are often completely correct.** Never compare a field named X
   against another field named X and declare a bug. Reconstruct the full product that reaches
   user-visible behavior: `spreadPoints × pointSize`, not `pointSize` vs `tickSize`;
   `display distance × display-unit-size`, not "both surfaces say pts".

Therefore: **a finding is only as good as its negative probe.** Agent E's pattern is the model
to copy — defect probes committed as `it.fails` so the suite stays green while the defect
stands, and any genuine fix trips them into a visible failure. It measured 5 failing / 9
passing on the base SHA and reported the exact numbers.

Optimise for mechanism reconstruction, negative evidence, and durable decisions. Not for
diff size or smell-hunting.

## 10. NO-GO WORK

Do not spend Opus budget on: dead-export cleanup, comment cleanup, broad token migration,
OnPush sweeps, formatting, lint autofixes, the Angular 21.2.19 mechanical bump, `npm audit`
housekeeping, CSS budget trimming, or worktree pruning. Do not start Angular 22. Never run
`npm audit fix --force`. Do not introduce a generic repository framework, broad branded types,
a repo-wide strictness sweep, an RxJS→Signals rewrite, or split files by line count.

## 11. WHAT REMAINS

1. Reconcile A, C, D from git the moment they stop — commit anything uncommitted first.
2. Independently verify each surviving claim; classify as CONFIRMED BY INDEPENDENT REVIEW /
   SUPPORTED BUT NOT FULLY PROVEN / REFUTED / OWNER DECISION REQUIRED / DEFERRED.
3. Write `.superpowers/evolution-wave2/WAVE2-SYNTHESIS.md` with sections A–K per the wave
   mandate, and a per-branch disposition: MERGE AS-IS / MERGE AFTER `<condition>` /
   RESEARCH ONLY / DO NOT MERGE.
4. Keep `WAVE2-STATE.md` committed continuously. Wave 1's ledger was untracked and therefore
   unrecoverable; that is the mistake this wave opened by fixing.
