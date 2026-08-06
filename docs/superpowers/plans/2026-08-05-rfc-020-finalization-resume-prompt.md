# RFC-020 — Finalization resume prompt (paste into a cold session)

> **Historic status:** RFC-020 passed its whole-branch audit at `d2838fd`. The owner subsequently
> revoked D.20.5 and approved D.20.6 (gold/non-FX price-unit points) for the existing branch and PR. That work is now dispatchable but the
> historic PASS does not cover it; a new independent whole-branch audit is required after its commits.
>
> **This document assumes you remember nothing.** Trust nothing in it that you can measure.

---

## §0 — Boot

Read in this order. Stop when you can state, without re-reading, why the companion cannot be a route,
why `pipSize ?? 1` makes gold wrong by 100x, and why US30 must nevertheless retain its 1.00 index-point
unit.

| # | Document | Why |
| :-- | :--- | :--- |
| 1 | `CLAUDE.md` | Kernel: invariants 1-8, the four gates, git rules |
| 2 | `docs/engineering/PHILOSOPHY.md` | §3.1 authority, §5.4-5.7 roles / risk / deviation / STOP |
| 3 | `docs/engineering/git-workflow.md` | **Required before the PR.** RFC-020 is a declared product-track exception: it targets **`main`**, not `develop` |
| 4 | `.superpowers/rfc-020/dev-log.md` **§§21-23** | The end of the run: D-6, D-7, the audit's NOT PASS, W5-FIX, and the PASS |
| 5 | `.superpowers/rfc-020/final-audit-report.md` | The verdict itself. §9 is the re-verification; everything above it is the round-1 record, preserved |
| 6 | `docs/superpowers/specs/2026-08-05-distance-unit-semantics-design.md` | Owner-approved D.20.6; D.20.5 revoked |
| 7 | `docs/superpowers/plans/2026-08-05-distance-unit-semantics-implementation-plan.md` | TDD implementation sequence |
| 8 | `.superpowers/rfc-020/task-f21-2-implementation-prompt.md` | Dispatch handoff |
| 9 | `docs/architecture/rfcs/020-lotaje-position-sizer.md` | Only if you need the RFC rationale |

---

## §1 — Measure before you touch anything

```
git branch --show-current
git rev-parse HEAD
git rev-list --count origin/main..HEAD
git status --short --branch
git diff --name-status ad80b9f -- ":(glob)emulador/src/**/*.spec.ts"
```

The historical close-out was 52 commits ahead of `origin/main`, but this is now an active shared branch
with a PR actor and F21-2 documentation/implementation work. Treat the measured SHA, distance, PR and
tracked status as the authority; reconcile unexpected tracked files before acting. The following four
untracked directories remain off-limits:

```
.opencode/
.superpowers/calculadora/
.superpowers/rfc-018/
.superpowers/rfc-019/
```

**Never open, search, modify, stage or delete those four.** Give every search an explicit root
(`emulador/`, `docs/`, `.superpowers/rfc-020/`) or an explicit pathspec.

The spec diff must show **exactly one `M`** (`calculadora-page.component.spec.ts`), one `D`
(`risk-calculator.spec.ts`, C-1's cutover, audited in Wave 2), and the rest `A`.

Before an F21-2 implementation is dispatched, wait for the PR actor to finish. After the implementation,
the gates run from `emulador/`, sequential, raw, **no pipes** — a pipe swallows the exit code and a real
failure reads as a pass:

```
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npm run lint
npx ng test --watch=false
npm run build
```

Expected: both tsc 0 · lint `All files pass linting.` · **85 files / 1229 tests**, exit 0, none
skipped · build 0 at **612.60 kB** with only the known-accepted initial-bundle budget warning.

Because B-1 changed `pipeline/`, also from `pipeline/`:

```
python -m pytest -q      # 121 passed
ruff check .
ruff format --check .
```

Any discrepancy is a **STOP** before doing anything else. Never `npx vitest run` — no TestBed env, it
always fails. **Never run two Angular processes at once** (`ng serve` + `ng test`): `.angular/cache`
and `node_modules/.vite` are shared, and that race is the documented PR #23 flake mechanism.

---

## §2 — Where the run actually stands

| | |
| :--- | :--- |
| Waves 0-4 | audited **PASS** |
| Wave 5 | complete — V-1 `9900345`, D-6 `21fe8f7`, D-7 `8b5ec2c`, W5-FIX `d2838fd` |
| Owner redesign | `a9fcadd` — authored outside the SDD chain, **accepted** by the final audit as branch content |
| Whole-branch final audit | **PASS ("Ship it")** — 0 Critical / 0 High / 0 Medium / 4 Low, all ruled |
| Tests | 1046 at `ad80b9f` → **1229** |
| Push / PR | PR creation is owned by a parallel agent; F21-2 commits update it only after fresh gates |

Test progression, re-derived commit-by-commit by the auditor: 1046 → 1053 → 1064 → 1064 → 1072 →
**1071** → 1125 → 1131 → 1131 → 1140 → 1149 → 1165 → 1188 → 1191 → 1191 → 1210 → 1219 → 1226 →
**1229**. Both decreases and both zero-deltas are declared and explained in the ledger.

---

## §3 — PR coordination and renewed audit

The PR actor owns opening and editing the PR. The F21-2 implementer must not alter it. Once F21-2 has
fresh gates and explicit-path commits, the owner-authorized push updates the existing PR automatically.
Then dispatch an independent whole-branch audit; the PASS at `d2838fd` is historic evidence, not a
verdict on the new SHA.

If the PR actor needs to create or revise the PR after the renewed audit:

- Target **`main`**, not `develop` — RFC-020 is a declared product-track exception, recorded in the
  ledger. Never PR an individual RFC to `develop`'s block-release flow.
- Use the **GitHub MCP**, not `gh`/`git`, for the PR and any repo settings.
- Measure whether the branch is already pushed. The F21-2 implementer pushes only its fresh,
  owner-authorized verified commits; do not assume a commit count or push state.
- Look for a PR template under `.github/` before writing the body.
- The body should carry: the audit verdict, the test progression, and the four ruled Lows plus the
  owner-facing carry-overs in §4, so none of it is re-litigated in review.
- **Branch protection on `main` has no MCP/CLI path** — it is a human dashboard task. Say so; do not
  attempt it.

---

## §4 — Owner-facing items carried past the PR. None blocks it.

| ID | Item | Status |
| :--- | :--- | :--- |
| **F21-2** | Non-FX distance uses `pipSize ?? 1`; XAUUSD treats entered points as raw price units | **Owner-approved D.20.6.** Forex uses `pipSize`; all non-FX symbols, including XAU/XAG, retain `1.00`. Generated MT5 `pointSize` is Ficha metadata only. Dispatch only through the approved design, plan and handoff |
| **L-2** | The non-finite-lot honest state renders an **empty** `<p role="alert">`. Reachable only when balance/riskPct overflows to `Infinity` (parses fine, and `Infinity > 0` is `true`, so neither guard catches it) | **Owner-escalated: needs one new §8 string.** Reusing `MSG_NON_POSITIVE` would be *false* (for `balance = 1e400` the balance is positive) — the auditor confirmed this independently. **Never invent frozen product copy** |
| **L-4** | «Puntos» label vs the `pips` suffix for FX | Folded into F21-2 |
| **L-1** | `lotaje-view.ts` ⇄ `companion-window.ts` import cycle | Ruled **no-fix** — inert; every cross-reference is in a hoisted `function`, neither module reads the other at module scope. Standing constraint |
| **L-5** | `angular.json` `anyComponentStyle` raised 10/14 → 20/24 kB | Ruled **no-fix** — load-bearing; the sheet is ~19.3 kB optimized, so the old 14 kB *error* would fail the build. Initial-bundle budget untouched |
| — | D1-L1 cold-start copy; `BTCUSD` heuristic `100000` by design (§8.4.2); a registry regeneration re-values open **and realised** P&L (§11.4.3) | Recorded, not scheduled |
| — | `develop` ↔ `main` reunification | A **separate run with its own ledger**. No RFC-020 work touches `develop` |

**F21-2 is now dispatchable:** `.superpowers/rfc-020/task-f21-2-brief.md` records the owner ruling;
`docs/superpowers/specs/2026-08-05-distance-unit-semantics-design.md` and
`docs/superpowers/plans/2026-08-05-distance-unit-semantics-implementation-plan.md` are its durable
design and plan; `.superpowers/rfc-020/task-f21-2-implementation-prompt.md` is the local dispatch
handoff. The owner explicitly authorized the existing branch/PR exception, which must be recorded as
`requires-attention` and followed by a renewed whole-branch audit.

A separate **owner-led design/polish track** covers the calculadora page and the companion toolbar. It
is not part of this run and must not dispatch RFC-020 tasks or edit `.superpowers/rfc-020/dev-log.md`.

---

## §5 — Facts that cost real time to learn. Do not rediscover them.

1. **The unit suite has no layout engine.** `getBoundingClientRect()` returns zeros;
   `scrollWidth`/`clientWidth` are `0`. Any CSS/layout assertion **passes vacuously on unfixed code** —
   this is why V-1 and parts of D-6 shipped with a deliberate zero test delta and browser-measured
   evidence instead, a ruling the final audit upheld. Verify layout in a real browser.
2. **The in-app Claude Browser pane is Electron.** `documentPictureInPicture.requestWindow()` throws
   `InvalidStateError: no window` and `window.open` returns `null` there. Those are **embedder
   host-policy facts, not web-platform facts** — reporting them as the platform's answer would have
   falsely cut this entire wave. Use real Chromium for any window/clipboard conformance.
3. **CDP gotcha:** `Target.setAutoAttach` on a browser-level session **deadlocks**
   `requestWindow()` on this machine. Connect to each target's own WebSocket URL via the `/json`
   endpoint instead.
4. **The clipboard must be called on the *target* window's `navigator`.** The opener's throws
   `NotAllowedError: Document is not focused` once the companion holds focus — a latent bug that
   passes casual manual testing and fails in real use.
5. **There is exactly ONE mount module-wide.** Opening the companion **moves** the view; it never
   duplicates it. Document PiP floors window width at **240 CSS px**.
6. **Auth:** `/calculadora` sits behind `authGuard`. The working pattern is that **the owner signs in
   personally**; `persistSession: true` then carries the session through every later agent-driven page
   load. **An agent may never enter a password or ask for credentials.** Test identity
   `ai-account@gmail.com`.
7. **The lesson M-1 taught:** `companion-window` and `calculadora-page.component` were each well
   tested *independently*, and **nothing crossed them** — so a real lifecycle defect sailed through
   every gate. A test that does not cross the boundary the defect lives on cannot see it, however
   thorough the suite looks.

---

## §6 — Standing rules

Pathspec commits only (`git commit <files> -m …`); never `git add -A`; never `--amend`; **never push
without being asked**. Conventional messages (`feat(rfc-020):`, `fix(rfc-020):`, `chore(sdd):`).
Pre-existing specs are authority. D.20.6 is the explicit owner authorization to replace only the
contradictory XAUUSD distance assertions with named successor assertions; every other pre-existing
assertion remains a **STOP**. Any file outside a brief's scope table is a **STOP**. Every deviation is classified `inert` or
`requires-attention`; **a silent deviation is the one unrecoverable failure mode.** Only `dev-log.md`
is tracked under `.superpowers/rfc-020/` — briefs and reports are local-only by that directory's own
`.gitignore`.

**Stop state:** wait for the PR actor, then dispatch F21-2 from its approved handoff. Do not merge from
the historic PASS; require fresh evidence and an independent audit after the fix.
