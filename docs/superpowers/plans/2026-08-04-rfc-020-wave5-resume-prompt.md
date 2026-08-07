# RFC-020 — Wave 5 Resume Prompt (D-6 / D-7 + final audit)

> You are the **orchestrator** resuming a paused SDD run. You do not implement, and you do not audit
> your own dispatches beyond mechanical diff-scans. **This document assumes you remember nothing.**
>
> The owner paused the run on **2026-08-04**, immediately after the six Wave 4 audit Lows were closed.
> Waves 0-4 are complete and audited PASS. Nothing is half-finished. What remains is **Wave 5**
> (D-6 window adapter, D-7 companion shortcuts), the **mandatory whole-branch final audit**, and then
> the PR — which is the owner's call, not yours.

---

## §0 — BOOT

Read in this exact order.

| # | Document | Why |
| :-- | :--- | :--- |
| 1 | `CLAUDE.md` | Kernel: invariants 1-8, the four gates, git rules |
| 2 | `docs/engineering/PHILOSOPHY.md` | §3.1 authority, §5.4-5.7 roles / risk / deviation / STOP |
| 3 | `docs/engineering/sdd-orchestration.md` | Run protocol, ledger, audit taxonomy |
| 4 | `docs/architecture/rfcs/020-lotaje-position-sizer.md` | **Spec.** §1 verdict D.20.1-6, §5 (why the window is not a route), §7.1 frozen boundaries |
| 5 | `docs/superpowers/plans/2026-08-02-rfc-020-lotaje-position-sizer-implementation-plan.md` | **Plan.** §0 C1-C5 bind over RFC prose; **Phase 4** is D-6/D-7 |
| 6 | `.superpowers/rfc-020/dev-log.md` **§§8.5, 16, 17, 18** | §8.5 is the S-1 verdict and its binding consequences; §§16-18 are the current state |
| 7 | **`.superpowers/rfc-020/spike-s1-report.md`** | **Mandatory before briefing D-6.** Read its *undetermined* list in full — seven items, including that every measurement used throwaway browser profiles |
| 8 | `docs/superpowers/specs/2026-08-02-position-sizer-product-design.md` | UX authority, as amended by D-21 (§8.6) and the D-4 extension (§13.3) |
| 9 | `docs/engineering/testing.md` | `ng test` vs bare vitest, the `isolate:false` leak class |

After BOOT you should be able to state, without re-reading: why the companion cannot be a route; why
the clipboard must be called on the **target** window's navigator; and why the in-app Browser pane
cannot decide any of it.

---

## §1 — Measure the resumed tree before anything else

Trust nothing in this document that you can measure. From the repository root:

```
git branch --show-current
git rev-parse HEAD
git rev-list --count origin/main..HEAD
git status --short --branch
git diff --name-status ad80b9f -- ":(glob)emulador/src/**/*.spec.ts"
```

Expected: branch `claude/lotaje-v2-core`; HEAD is the ledger commit whose parent is **`67bf87c`**;
**41 commits** ahead of `origin/main`, none pushed; tracked tree clean with only these four untracked
directories present:

```
.opencode/
.superpowers/calculadora/
.superpowers/rfc-018/
.superpowers/rfc-019/
```

**Never open, search, modify, stage or delete those four.** Every search gets an explicit root
(`emulador/`, `docs/`, `.superpowers/rfc-020/`) or an explicit pathspec. A brief-authoring agent
breached this once with a repository-wide grep (§15.5); it changed nothing, but the deviation is on
the record and must not recur.

The spec diff must show **exactly one `M`** — `calculadora-page.component.spec.ts` — with every
`lotaje/` spec `A`.

Then the four gates, sequential, raw, **no pipes**, from `emulador/`:

```
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npm run lint
npx ng test --watch=false
```

Expected: both tsc exit 0; lint `All files pass linting.`; **84 files / 1191 tests**, exit 0, no
skipped/todo. Any discrepancy is a **STOP** before dispatching. Never `npx vitest run` — no TestBed
env, it always fails. Never run two Angular processes at once: `.angular/cache` and
`node_modules/.vite` are shared, and that race is the documented PR #23 flake mechanism.

---

## §2 — Where the run actually stands

| Wave | Tasks | State |
| :--- | :--- | :--- |
| 0 | S-1 spike | **GO** on `documentPictureInPicture` |
| 1 | A-1 `2d943cd`, B-1 `33970ff`, F-1 fix `7d83b1a` | audited **PASS** |
| 2 | C-1 `25a0ec2`, cleanup `04f6db9`, `bf2b211` | audited **PASS**; 126 symbols / **0 divergences** |
| 3 | D-1 `a61ca59`, D1-H1 fix `ea06fb4` | audited **PASS** |
| 4 | D-2 `0f4237e`, D-3 `714b9a8`, D-4 `a4dad35`, D-5 `f0dfdff`, C-2 `5080735`, W4-FIX `67bf87c` | audited **PASS** (0/0/0/6 Low), **all six Lows closed** |
| **5** | **D-6, D-7** | **NOT STARTED — this is your work** |
| — | whole-branch final audit | mandatory, never skipped |
| — | PR to `main` | **owner's call.** Do not push |

Test progression: 1046 (base) → 1053 → 1064 → 1072 → 1071 → 1125 → 1131 → 1140 → 1149 → 1165 → 1188
→ **1191**.

**Individual audit for Wave 5 — no batching.** D-6 is an architecture boundary (`8.0.1`). D-7 may be
audited with it.

---

## §3 — Wave 5, and the facts that constrain it

Read the S-1 report before writing either brief. These are the load-bearing conclusions already in the
ledger, but the report's *undetermined* list is not reproduced here and you must read it yourself.

**Binding, measured, non-negotiable:**

1. **Use `documentPictureInPicture`, never `window.open`.** Both pass the gating probes identically;
   **S-1.a separates them.** The PiP window carries `WS_EX_TOPMOST` (`0x00200108`); MT5's maximized
   main window does not (`0x00000100`), so Win32 z-banding guarantees PiP floats over MT5 regardless
   of focus. A `window.open` popup shares MT5's z-band and vanishes behind it on the first click on
   MT5 — exactly when the tool is being used. PiP also survives the opener tab going
   `visibilityState: hidden`.
2. **The clipboard must be called on the target window's `navigator`.** Calling the opener's from
   inside the companion throws
   `NotAllowedError: Failed to execute 'writeText' on 'Clipboard': Document is not focused.`, because
   once the companion holds focus the opener does not. **This is a latent bug that passes casual
   manual testing and fails in real use** — D-6's audit must check it explicitly. D-3 already
   implemented copy on the mounted target realm; D-6 must not regress it.
3. **Never a route, and never a second Angular bootstrap.** Loading the SPA in a second document fires
   `ROOT_EFFECTS_INIT` → `AuthEffects.init$:24`, `WorkspacesEffects.init$:54` and, chained to
   `sessionResolved`, `SessionSyncEffects:50` — **a second LWW sync actor against Supabase.** RFC §5's
   diagram is the rationale; this repo has already paid once for a sovereignty bug.
4. **Do not assume the requested window size is granted.** PiP floors width at **240 CSS px**, and it
   may remember a user-resized size and override the request. A requested 380×520 was granted exactly
   in the spike, but that is a measurement, not a guarantee.
5. **The in-app Browser pane is not a conformance oracle for window/clipboard APIs.** It is Electron,
   where `documentPictureInPicture` throws `InvalidStateError: Internal error: no window` and
   `window.open` returns `null` — embedder host-policy facts, not web-platform facts. Reporting them
   as the platform's answer would have cut Waves 4 and 5 on a measurement artifact (§8.5.3). Use a
   real browser for PiP conformance.
6. **Never drive the MT5 GUI, F9, trading APIs or keystrokes.** The spike touched MT5 read-only and
   D-6 does not touch it at all.

**Task shape:**

- **D-6 — window adapter.** Mount the *existing* framework-free view into the companion document via
  `mount(doc, win)`; copy the required styles/tokens into that document; tear down every adapter
  resource on `pagehide`; enforce singleton behaviour (re-open focuses the existing window rather than
  spawning a second). Opening requires a **trusted user gesture**. The companion imports nothing from
  `state/*`, `domain/chart/*` or `components/*`.
- **D-7 — companion-only shortcuts.** `Alt+M`, `Alt+A`, `Alt+S`, **in the companion window only**
  (P7 as amended, RFC §3.1). `Enter`, `Esc` and `↑/↓` already exist in **both** hosts from D-5 — do
  not reimplement or duplicate them.

**Scope fences.** No new runtime dependency. `domain/sizing/*` stays untouched. No unit toggle
anywhere (C3 / D.20.3 — a click handler on the unit suffix is an automatic finding). No `storage`
listener or any reservation for one (C4 / §6.3). The reserved `v` keeps **one write, zero reads**. The
branch-wide spec invariant stays at **exactly one `M`**.

---

## §4 — Protocol for each dispatch

1. Write a bounded brief to `.superpowers/rfc-020/task-d6-brief.md` (then `task-d7-brief.md`): scope
   table, invariants with their greps, tests-first ordering, explicit out-of-scope list, and the STOP
   rule. **Verify every premise in the brief against the live tree before dispatching** — a brief is
   an orchestrator artifact, not evidence. Supply the **full** execution HEAD hash; never a short hash.
2. Dispatch one `sdd-implementer`. Gates are the four **plus `npm run build`** (Layer D).
3. On return, run a **mechanical scan only**: direct parent, exact scope, test-count arithmetic
   re-derived by counting `it(`, one-`M` invariant, package/lockfile diffs empty, boundary greps,
   off-limits paths absent, tree clean. Do not audit your own dispatch beyond this.
4. Append the entry to `dev-log.md` §19+ and commit **only the ledger**, pathspec, message
   `chore(sdd): …`.
5. After D-6 and D-7 land, dispatch one independent `branch-auditor` over Wave 5, then the
   **whole-branch final audit**.

Standing rules: pathspec commits only, never `git add -A`, never amend, **never push**. Pre-existing
specs are authority — needing to edit an assertion is a STOP, not a fix. Any file outside a brief's
scope table is a STOP. Every report classifies every deviation `inert` or `requires-attention`; a
silent deviation is the one unrecoverable failure mode.

Precise production `spec-util` detector (the naive one false-positives on comment prose in
`layout-invariants.ts`):

```
grep -rnE "from '.*spec-util'|require\(.*spec-util" emulador/src/app --include=*.ts | grep -v "\.spec\.ts"
```

---

## §5 — The final audit

Runs after Wave 5 and gates the PR. Angular gates **and build**, plus the pipeline gates — because
B-1 changed `pipeline/`:

```
python -m pytest -q
ruff check .
ruff format --check .
```

It re-derives the whole test progression from `ad80b9f`, re-runs every invariant grep, and reads the
attention-flagged diffs line by line. **PASS ("Ship it") with zero Critical/High/Medium is the only
verdict that ships.** Lows may be ruled no-fix **with written reasons** so they are not re-litigated.

---

## §6 — Open items to carry, none blocking Wave 5

1. **The visual pass** — ten items still need human eyes (§17.4), now including **hero centring**
   (`.lotaje-hero` spans columns 1/3 with `justify-self: center` while the shell reserves an 8-18 ch
   feedback column) and **layout stability when the 33-character copy-failure string wraps** (product
   design §7.5 forbids the jump). **The entire clipboard feature is verified only against test
   doubles.** An owner-provisioned test identity `ai-account@gmail.com` exists, but **no agent may
   authenticate**: entering a password to authenticate is a standing prohibition. The workable pattern
   is that the **owner signs in once** in the browser to be driven — `persistSession: true` puts the
   session in that origin's `localStorage`, so every later agent-driven page load is authenticated.
2. **D1-L1** — cold-start copy decision (the §8 messages are frozen verbatim; inventing a third is a
   product decision).
3. **`BTCUSD` stays heuristic `100000`** by design (§8.4.2) — a one-entry `MANUAL_ASSETS` addition if
   the owner ever wants it.
4. **A registry regeneration re-values open and realised P&L**, not merely pending orders (§11.4.3).
5. **`develop` ↔ `main` reunification** is a separate run with its own ledger (Q4). No RFC-020
   dispatch touches `develop`.
6. **Branch protection on `main`** is a human dashboard task (Q5). No MCP/CLI path; do not attempt it.

**Stop state:** the next session starts with §1's measurement, then writes and verifies the D-6 brief,
then dispatches it.
