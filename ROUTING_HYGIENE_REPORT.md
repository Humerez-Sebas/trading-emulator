# Routing & Agent Hygiene — Report

**Agent E** · branch `agent/routing-hygiene` · baseline `develop` @ `a2ca53b` · 2026-08-12
Worktree: `C:\Users\78701\Desktop\trading-emulator-routing`

**Scope.** Docs-only. Nothing under `emulador/src/` was modified — the branch touches no
production code, no tests and no build config, so **no verification gates were run and
none are claimed**. The single machine-readable behaviour change on this branch is
`.claudeignore`, which affects agent search only, not the build.

**Method.** Correct only statements *proven* stale, with the proof recorded inline. Where a
statement turned out to be a deliberate decision rather than staleness, it was left alone
and is listed in §5. No lint rule or new enforcement mechanism is proposed anywhere in this
work, so no invariant needed classifying as law-vs-constraint.

---

## 1. Corrections applied

### 1.1 `ROADMAP.md` — Mastery Block presented as future work (`2e89ae4`)

**Evidence of staleness.** `docs/architecture/ROADMAP.md:70` headed the section "Mastery
Block: Phases 0-3 (**the next development sequence**)" and marked Phase 0 "(current)",
listing RFC-014/015/016 as work to come. All three had shipped: `e700ecb` (RFC-014,
2026-07-12), `ab3a8e5` (PR #40, RFC-015, 2026-07-15), `1db11b6` (PR #41, RFC-016,
2026-07-18) — all four SHAs resolve in this worktree. Their code exists at
`emulador/src/app/state/{telemetry,playbook,lessons,journal}/` and
`emulador/src/app/pages/{reflection,journal}/`. Separately, `grep -n "020"
docs/architecture/ROADMAP.md` returned no hits: the shipped RFC-020 appeared in no roadmap
table at all.

| | |
|---|---|
| **BEFORE** | `## Mastery Block: Phases 0-3 (the next development sequence)` · rows for RFC-014/015/016 with no status column · Phase 0 tagged "(current)" · no RFC-020 anywhere |
| **AFTER** | `## Mastery Block: Phases 0-3 — DELIVERED (RFC-014..016)` · "**All three phases have shipped.** … This section is now a record of what was delivered, not a plan of what is next." · new **Status** column giving each phase its delivery date + merge SHA · new **Product Track** section registering RFC-020 (PR #54 `b8d220f`, refined by PR #55 `ad69d7d`) · `RFC-014_AND_BEYOND.md` labelled HISTORICAL, superseded by the accepted RFCs |

### 1.2 RFC status headers 017–020 said "pending" for merged work (`dce795a`)

**Evidence of staleness.** Four `Estado` fields claimed unimplemented work whose merge
commits all resolve. RFC-019 was **not in the original brief** — it was found independently
during verification and carried the same defect.

| File:line | BEFORE | AFTER | Merge evidence |
|---|---|---|---|
| `rfcs/017-compositional-panel-sync.md:5` | "…auditoría final de rama **pendiente** antes del PR a `develop`" | "**CURRENT — Implementado (2026-07-26)**, mergeado a `develop` en PR #45 (`4e005d6`)… auditoría final de rama PASS." | `4e005d6` PR #45 |
| `rfcs/018-trade-visibility-refinement.md:5` | "Diseño aprobado — implementación **pendiente**" | "**CURRENT — Implementado (2026-07-27)**… PR #46 (`0e66392`). Bitácora: `.superpowers/rfc-018/dev-log.md` §8." | `0e66392` PR #46 |
| `rfcs/019-pane-guard-cross-tf-forming.md:5` | "Diseño aprobado — implementación **pendiente**" | "**CURRENT — Implementado (2026-07-29)**… PR #47 (`49781f8`). Bitácora: `.superpowers/rfc-019/dev-log.md` §8." | `49781f8` PR #47 |
| `rfcs/020-lotaje-position-sizer.md:5` | "Diseño aprobado tras Design Review — implementación **pendiente**" | "**CURRENT — Implementado (2026-08-05)**, mergeado a `main` en PR #54 (`b8d220f`) y refinado por PR #55 (`ad69d7d`)…" | `b8d220f` PR #54 |

RFC-017's genuine nuances were **preserved, not laundered**: Tasks 7–8 remain marked
superseded by TEDS (see its §6).

### 1.3 `CLAUDE.md` — four corrections (`d3124a0`)

`CLAUDE.md` is PROTECTED. Exactly the four evidence-backed corrections below were made;
nothing was deleted and no scope was broadened.

**(a) `CLAUDE.md:28` — UI routing omitted the actual visual authority.**
Evidence: `DESIGN_SYSTEM.md` exists at repo root (603 lines) and declares at :3-4 that it is
the single source of truth for every visual, interaction and accessibility decision, with
`DESIGN.md` as the base token registry it extends; `rfcs/016…:9` already cites it as
"autoridad única". The kernel routed UI work past it.

- BEFORE: ``| UI/visual work | `PRODUCT.md` (brand, anti-references) + `DESIGN.md` (tokens) |``
- AFTER: ``| UI/visual work | `DESIGN_SYSTEM.md` (**the visual/interaction/a11y authority**) + `DESIGN.md` (the base token registry it extends) + `PRODUCT.md` (brand, anti-references) |``

**(b) `CLAUDE.md:66-67` — the bundle-budget rationale was factually false.**
Evidence, structural (re-verified in this worktree): the only `parquet-wasm` /
`apache-arrow` *value* imports are dynamic and inside a worker —
`emulador/src/app/workers/parquet.worker.ts:45` and `:67` — and the sole static Arrow
reference is an `import type` at `workers/candles-writer.ts:14`, which erases at compile
time. Neither can be in the initial graph. Evidence, measured (raw `npm run build`, EXIT=0,
same baseline, recorded at `.superpowers/audit-2026-08-10/audit-tooling-ci-deps-security.md:89,106,109,126`):
`Arrow-dom` 216.38 kB and `parquet_wasm` 34.19 kB are **lazy** chunks; initial total is
**651.60 kB**, of which `chunk-LMCKOV4N.js` **219.12 kB (33.6%)** is `@supabase/supabase-js`,
pulled in eagerly by the root-provided `auth/supabase.service.ts:2,9-15`. The doc's stated
cause was the one thing measurably *not* responsible.

- BEFORE: "the 648 kB vs 500 kB budget warning is known-accepted, **Arrow/parquet-dominated**"
- AFTER: "measured **651.60 kB** at `a2ca53b`. **The cause is NOT Arrow/parquet:** both are lazy chunks contributing 0 bytes to the initial graph… The largest initial contributor is `@supabase/supabase-js` (219.12 kB, 33.6%)… The warning is tolerated, not explained away — don't let it absorb new growth; re-measure before accepting a bigger number."

**(c) `CLAUDE.md:67` — `python -m pytest` cannot run on this machine.**
Evidence: `python --version` prints the Microsoft Store install ad; `python -c "pass"` and
`python -m pytest --version` both exit **49** without running anything; `py --version` →
Python 3.13.2. The harness already knew — `.claude/settings.json:19` allowlists `Bash(py -m
pytest *)` and every hook at :43/:54/:63/:74 invokes `py`. Only the prose was stale, which
is the worst case: an agent following the kernel gets a silent non-run.

- BEFORE: ``Pipeline changes: `cd pipeline && python -m pytest -q && ruff check . && ruff format --check .` ``
- AFTER: ``Pipeline changes (from `pipeline/`): `py -m pytest -q && …` — **use `py`, not `python`**: on this machine `python` is the Microsoft Store stub, which prints an install ad and exits 49 without ever running your tests.``

**(d) `CLAUDE.md:92` — ledger routing was two layouts out of date.**
Evidence: `git ls-files .superpowers/` returns **four** tracked ledgers
(`rfc-018/dev-log.md`, `rfc-019/dev-log.md`, `rfc-020/dev-log.md`, `sdd/progress.md`), so
"only `progress.md` is tracked" was false. `.superpowers/sdd/progress.md:4` says so in its
own words, and the change is a recorded decision: `.superpowers/rfc-019/dev-log.md:186`
decision **O1**.

- BEFORE: "SDD run artifacts live in `.superpowers/sdd/` (**only `progress.md` is tracked**)."
- AFTER: "**SDD run ledgers:** from RFC-018 onward each run keeps its own tracked ledger at `.superpowers/rfc-XXX/dev-log.md`. `.superpowers/sdd/progress.md` is the older shared ledger — still tracked, but it carries the RFC-017-era record and every run overwrote it."

### 1.4 `python` → `py` in the two other places that command lives (`ef21c5c`)

Same evidence as 1.3(c). The brief named `docs/engineering/verify-gates.md`; that file does
not exist — the real one is `.claude/commands/verify-gates.md`.

| File:line | BEFORE | AFTER |
|---|---|---|
| `.claude/commands/verify-gates.md:21` | ``cd pipeline && python -m pytest -q …`` | ``cd pipeline && py -m pytest -q …`` + the exit-49 explanation |
| `README.md:107` | ``cd pipeline && python -m pytest -q`` | ``cd pipeline && py -m pytest -q`` + a Spanish note (README is user-facing → Spanish, per the language convention) |

The same commit also removed the stale "648 kB budget WARNING is known-accepted" line from
`.claude/commands/verify-gates.md:17`, replacing it with the measured number and the
instruction to **report the actual figure — "a bigger one is a finding, not a
known-accepted constant."**

### 1.5 Ledger routing in the four docs that still pointed at `progress.md` (`b8cd1d1`)

Same evidence as 1.3(d). Every citation now names the per-RFC ledger and keeps the shared
file addressable as history rather than deleting the pointer.

| File:line | BEFORE | AFTER |
|---|---|---|
| `docs/engineering/sdd-orchestration.md:23` | "`.superpowers/sdd/progress.md` — the ledger, the single source of run truth. **Git-tracked** (everything else … is gitignored)." | Two bullets: `rfc-XXX/dev-log.md` as **the** ledger since RFC-018 (decision O1), and `sdd/progress.md` as the **HISTORICAL** shared ledger — "Read it for history; do not write new runs into it." §-heading retitled to match. |
| `docs/engineering/git-workflow.md:59` | "…its final audit is PASS in the ledger (`.superpowers/sdd/progress.md`)." | "…in that RFC's ledger (`.superpowers/rfc-XXX/dev-log.md`; for RFC-017 and earlier, the older shared `.superpowers/sdd/progress.md`)." |
| `docs/engineering/decision-frameworks.md:96` | "Is it run state…? → `.superpowers/sdd/progress.md`" | "→ `.superpowers/rfc-XXX/dev-log.md` (RFC-017 and earlier: `.superpowers/sdd/progress.md`)" |
| `.claude/agents/branch-auditor.md:9` | "read … `.superpowers/sdd/progress.md` for the run you are auditing" | "read … the ledger for the run you are auditing — `.superpowers/rfc-XXX/dev-log.md` (per-RFC since RFC-018; RFC-017 and earlier are in the older shared file)" |
| `.claude/commands/release-develop-main.md:10` | "final audit PASS recorded in `.superpowers/sdd/progress.md`" | "recorded in that RFC's ledger (`.superpowers/rfc-XXX/dev-log.md`; …)" |
| `.claude/commands/sdd-run.md:10` | "BOOT/DISCOVER: read … and `.superpowers/sdd/progress.md`. If no ledger exists … initialize one" | "…read … this run's ledger at `.superpowers/rfc-XXX/dev-log.md` … the older shared `progress.md` is historical — read it, never write new runs into it. If no ledger exists … initialize `.superpowers/rfc-XXX/dev-log.md`" |

### 1.6 Machine-local `file:///C:/` links (`2e89ae4` for ROADMAP, `adcc4f4` for the rest)

**Evidence of staleness.** `grep -rn "file://" --include=*.md` found **38** occurrences
across exactly 4 tracked docs. Every one hard-codes
`C:/Users/78701/Desktop/trading-emulator/…`, so the links resolve only on the owner's
machine, only at that path, and break for every clone, for GitHub's renderer and for any
agent working in a worktree — which is exactly the situation this branch ran in.

35 pointed at repo files and became repository-relative. All **16 distinct targets were
verified to exist** before rewriting.

| Doc | Occurrences | BEFORE | AFTER |
|---|---:|---|---|
| `docs/architecture/TRADER_KNOWLEDGE_MODEL.md` | 27 | `[ROADMAP.md](file:///C:/Users/78701/Desktop/trading-emulator/docs/architecture/ROADMAP.md)` | `[ROADMAP.md](./ROADMAP.md)` |
| `docs/architecture/RFC-014_AND_BEYOND.md` | 12 | `[replay-trading.md](file:///C:/…/docs/engineering/domain/replay-trading.md)` | `[replay-trading.md](../engineering/domain/replay-trading.md)` |
| `docs/architecture/ROADMAP.md` | 4 | idem | idem (done in `2e89ae4`) |
| `docs/architecture/TRAINING_WORKFLOW.md` | 3 | see below | see below |

The 3 in `TRAINING_WORKFLOW.md:91-93` point **outside the repo**, at
`C:/Users/78701/.gemini/antigravity/brain/03df98d6-…/{CURRENT_LIMITATIONS,KNOWN_PAIN_POINTS,FUTURE_IDEAS}.md`.
Verified read-only: that directory still exists on this machine but contains only
`TRAINING_WORKFLOW.md`, `engineering_knowledge_roadmap.md`, `strategic_audit.md`,
`walkthrough.md` — **the three named files are absent**, and they were never versioned here.
Per the brief, **no target was fabricated and no reference was deleted**: each link became
plain text — `` `CURRENT_LIMITATIONS.md` (externo, no disponible) `` — under a
**HISTÓRICO** banner recording where they lived, that they are gone, when that was verified,
and where the live authority is instead (`ROADMAP.md` + `rfcs/`). Each bullet's parenthetical
summary of the content is preserved verbatim.

`grep -rn "file://" --include=*.md docs/ *.md` now returns nothing outside this report's own
prose and `PROGRESS.md`'s evidence quotes.

### 1.7 Status banners on the five largest plans (`f0ddce2`)

**Evidence of staleness.** `grep -rln "^> \*\*Status|^\*\*Status:|^> \*\*Estado"
docs/superpowers/plans/` → **0 hits across all 53 plans**. Every one of the five largest
opens with `> **For agentic workers:** REQUIRED SUB-SKILL: … implement this plan
task-by-task`, with nothing anywhere in the file saying the work already shipped. An agent
handed one of these files has an unqualified instruction to build something that exists.

Taxonomy applied: `CURRENT` / `HISTORICAL` / `SUPERSEDED` / `REMOVED`. Each banner cites its
evidence. **No plan body was rewritten** — the commit is 96 insertions against 5 deletions,
and those 5 deletions are the five "For agentic workers" lines, each re-added with the
suffix *"(Overridden by the STATUS banner above — this instruction no longer applies to this
file.)"*. A historical document stays historical.

| Plan | Verdict | Cited evidence |
|---|---|---|
| `2026-06-16-modo-offline-emulador.md` (71 kB) | **REMOVED** | Superseded by `2026-06-23-retire-fastapi-offline.md`, merged PR #9 `32cb4bb`; load-bearing commits `8e51f1a` *require login — remove guest mode*, `7f3c07a` *drop offline build + dead env flags*, `5e0274a` *remove the offline CSV catalog*. Contradicts `CLAUDE.md:7`. Re-verified at `a2ca53b`: `grep -rn "guestModeEnabled\|offlineOnly" emulador/src/` → **0 hits**, `emulador/angular.json` has no `offline` configuration, and `emulador/src/app/auth/auth.guard.ts:11` reads "Login is required: there is no guest/offline fallback." |
| `2026-07-01-rfc-008-panel-system-layout.md` (62 kB) | **HISTORICAL** | PR #26 `204b261` (2026-07-02); released to `main` in PR #36 `dbaaae1`. `state/layout/layout.reducer.ts` added by `f4b4956`. |
| `2026-07-02-rfc-010-synchronization.md` (60 kB) | **HISTORICAL** | PR #29 `8e89142`; released in `dbaaae1`. Banner also flags that RFC-018 **retired `syncTrades` as a LinkGroup channel** (`62effac`, D18.A), so the channel set in the body is no longer current. |
| `2026-07-03-rfc-011-layout-persistence.md` (73 kB) | **HISTORICAL** | PR #30 `cce9e80`; released in `dbaaae1`. Task 1 `df7a49b` + audit fixes `3c323c3`, `60ac114`, gap fix `75e6a1f`. |
| `2026-07-04-rfc-012-performance.md` (54 kB) | **HISTORICAL** | PR #31 `3844957`; released in `dbaaae1`. Tasks `4ef3930`, `1c60b3c`, `499a48a`, `e480da8`, `df49278`; audit PASS `72618ff`. Banner marks the inline profiling numbers a **snapshot at `3844957`, not a live budget**. |

### 1.8 `.claudeignore` — in-repo worktree copies were agent-greppable (`182bde5`)

**Evidence.** `.claudeignore` is tracked and lists `.git/`, `node_modules/`, `dist/` etc.
but had **no `.claude/` entry**, while `.claude/worktrees/` holds **152,368 files** across
seven full second copies of the tree. Every agent search therefore returned shadow copies of
`CLAUDE.md`, `ROADMAP.md` and of long-deleted code (e.g. the retired FastAPI `backend/`) as
though current — the exact failure mode this audit exists to fix.

- BEFORE: no `.claude/` entry.
- AFTER: `.claude/worktrees/` added, with a three-line comment explaining *why* (so a future
  reader does not "clean up" the entry).

---

## 2. Documents affected

**Kernel / agent config (PROTECTED — surgical edits only, nothing deleted):** `CLAUDE.md`,
`.claudeignore`, `.claude/commands/verify-gates.md`, `.claude/commands/sdd-run.md`,
`.claude/commands/release-develop-main.md`, `.claude/agents/branch-auditor.md`.
Hooks, `settings.json` and `steering.md` were **not touched**.

**Engineering vault:** `docs/engineering/sdd-orchestration.md`,
`docs/engineering/git-workflow.md`, `docs/engineering/decision-frameworks.md`.

**Architecture:** `docs/architecture/ROADMAP.md`, `docs/architecture/RFC-014_AND_BEYOND.md`,
`docs/architecture/TRADER_KNOWLEDGE_MODEL.md`, `docs/architecture/TRAINING_WORKFLOW.md`, and
RFC headers `017`, `018`, `019`, `020`.

**Plans:** the five named in §1.7.

**Root:** `README.md`, plus the two run artifacts `PROGRESS.md` and this report.

No new docs system was invented and **no `AGENTS.md` was created** — `docs/engineering/` is
the vault; this pass only improved routing into it.

---

## 3. Worktree classification

`git worktree list` and all ancestry checks were run **read-only from the canonical repo**;
nothing there was modified. **152,368 files** live under
`C:\Users\78701\Desktop\trading-emulator\.claude\worktrees\`.

| Dir under `.claude/worktrees/` | HEAD | Branch | Files | Anc. of develop | of main | Verdict |
|---|---|---|---:|---|---|---|
| `compassionate-villani-d2fc5b` | — | **not registered** | **0** | n/a | n/a | **ORPHAN** — empty dir, no `.git`, absent from `git worktree list` |
| `dreamy-gagarin-afe569` | `f57ed8d` | `docs/demo-data-pwa-plan` | 28,551 | YES | YES | STALE — fully merged |
| `eager-chaum-6000cb` | `0cbed9b` | detached | 279 | no | no | **STALE-with-care** — commit unreachable from either branch; all 3 of its files are byte-identical to develop |
| `funny-diffie-89d75d` | `cc9891c` | detached | 30,995 | YES | no | STALE — merge commit of PR #23, already in develop |
| `jovial-williamson-33d3c1` | `d07e049` | `claude/playback-controller-phase1` | 31,012 | YES | YES | STALE — fully merged |
| `laughing-hofstadter-d9478e` | `30c2219` | detached | 31,055 | YES | YES | STALE — **the PR #36 ancestry-graft commit**; reachable from both branches, so removing the worktree cannot orphan it |
| `sad-feynman-e57266` | `5b4c1a7` | `claude/sad-feynman-e57266` | 30,476 | YES | YES | STALE — fully merged |

Out of scope, left untouched: `C:/Users/78701/Desktop/tesm-backmerge` (`0abaf97`
`develop-backmerge`, ancestor of neither — the back-merge landed instead as PR #56
`a2ca53b`; owner's call, not agent-prunable), plus the five live `trading-emulator-*` agent
worktrees.

### Recommended prune commands — **NOT EXECUTED** (for the owner to run)

```sh
cd /c/Users/78701/Desktop/trading-emulator

# 0. Safety net: keep the one unreachable commit addressable before dropping its ref.
git tag archive/eager-chaum-0cbed9b 0cbed9b

# 1. Remove the empty orphan directory (not a worktree; git does not know about it).
rm -rf .claude/worktrees/compassionate-villani-d2fc5b

# 2. Remove the six registered worktrees (add --force only if a tree is dirty).
git worktree remove .claude/worktrees/dreamy-gagarin-afe569
git worktree remove .claude/worktrees/eager-chaum-6000cb
git worktree remove .claude/worktrees/funny-diffie-89d75d
git worktree remove .claude/worktrees/jovial-williamson-33d3c1
git worktree remove .claude/worktrees/laughing-hofstadter-d9478e
git worktree remove .claude/worktrees/sad-feynman-e57266
git worktree prune

# 3. Optional, only after 2 succeeds — these branches are merged into develop AND main.
git branch -d docs/demo-data-pwa-plan claude/playback-controller-phase1 claude/sad-feynman-e57266
```

**`30c2219` must never be deleted or pruned as a commit.** Step 2 removes only the *working
directory* that has it checked out; the commit itself is an ancestor of both `develop` and
`main` (re-verified), so it stays reachable. Do not run `git gc --prune` against it, and do
not delete the tag from step 0 until `0cbed9b` is confirmed unneeded.

### Search-pollution reduction

- **Already in effect (committed, `182bde5`):** `.claudeignore` now excludes
  `.claude/worktrees/`, removing **152,368 files** from the agent-searchable tree. This
  changes agent search only — no file is deleted and the build is unaffected.
- **Additionally available (owner action):** running the prune commands above removes those
  same 152,368 files from disk, reclaiming the space as well as the search noise.

---

## 4. Correctness of this branch's own prior work

Items 1–6 and E3 were committed in an earlier, interrupted session of this same run and have
now been re-audited by diffing each commit against `a2ca53b` and re-verifying every load-bearing
claim: all 8 cited merge SHAs resolve to real commits with matching PR numbers and dates; all
16 rewritten link targets exist; the `f4b4956`/`e700ecb`/`ab3a8e5`/`1db11b6` attributions hold;
the four tracked `.superpowers/` ledgers are as stated; decision **O1** is at
`.superpowers/rfc-019/dev-log.md:186` as cited; and the 651.60 kB / 219.12 kB figures are
corroborated by the prior audit's raw `npm run build` output at this same baseline. **No
committed correction was found wrong, incomplete, or overreaching, and none was revised.**

The bundle numbers are inherited measurements, not a build run here: `node_modules` is absent
in this worktree and `npm install` was deliberately avoided per the `CLAUDE.md` lockfile-prune
rule. `CLAUDE.md` states them as measured **at `a2ca53b`** and instructs re-measuring rather
than trusting the constant, which is the honest framing.

---

## 5. Found stale-looking, deliberately left alone

1. **`.superpowers/sdd/progress.md:4`** says "the next run overwrites this file", which sits
   oddly beside the per-RFC layout that replaced it. **Left verbatim: it is a run ledger — a
   historical record — and ledgers are never laundered.** The routing docs now steer readers
   around it instead (§1.5).
2. **The frozen non-goals** of the 008-012 vision doc (mono-symbol session, single-level
   grid, no floating panels, no web workers, `syncPriceScale` reserved-unimplemented,
   session-scoped drawings). These are **deliberate decisions, not staleness** — `CLAUDE.md`
   invariant 6 makes them revocable only by an explicit new RFC. Untouched.
3. **`strategic_audit.md` Parts 5/7/9.** `TRADER_KNOWLEDGE_MODEL.md` already labels them
   superseded framings; the routing is correct as-is.
4. **The other 48 plans** in `docs/superpowers/plans/` still carry no status banner. Scope
   here was the five largest. Remaining work, not a defect introduced.
5. **`docs/superpowers/plans/task-*-{brief,report,diff}.md` and `progress-ledger.md`** are
   committed into `plans/` where they do not belong — but
   `docs/engineering/sdd-orchestration.md:35` **already** records this as "a mistake, not a
   convention". Correctly labelled; deleting files is outside a routing pass.
6. **Unit semantics were not touched anywhere.** Per the standing warning, the claim that
   Gold sizing is broken because XAUUSD has no `pipSize` is **REFUTED** — D.20.6
   (`.superpowers/rfc-020/dev-log.md:2564-2569`) defines non-FX displayed points as whole
   price units and the code follows it. No doc was edited toward the refuted reading.
7. **Branch protection.** Neither `main` nor `develop` is protected. This is a genuine open
   issue and **not a docs defect**: it has no MCP/CLI path and is an owner dashboard task. It
   is recorded in the `2026-06-16` plan's banner because branch protection was that plan's
   second half, which — unlike its offline half — was never resolved.
8. **No lint rule or enforcement mechanism is proposed** by this work, so nothing here turns
   stale prose into a permanent rule.

---

## 6. Commits on `agent/routing-hygiene` (baseline `a2ca53b`, in order)

| SHA | Subject |
|---|---|
| `f7884e2` | chore(hygiene): open the routing-hygiene run with a verified evidence ledger |
| `182bde5` | chore(hygiene): stop agent searches scanning in-repo worktree copies |
| `dce795a` | docs(rfcs): mark RFC-017..020 as implemented with their merge evidence |
| `2e89ae4` | docs(roadmap): retitle the delivered Mastery Block and register RFC-020 |
| `d3124a0` | docs(kernel): correct four measurably-stale routing statements in CLAUDE.md |
| `ef21c5c` | docs(gates): use py, not the Store stub, and stop quoting a stale bundle figure |
| `b8cd1d1` | docs(sdd): route run ledgers to .superpowers/rfc-XXX/dev-log.md |
| `adcc4f4` | docs(architecture): replace machine-local file:/// links with repo-relative paths |
| `f0ddce2` | docs(plans): add evidence-backed status banners to the five largest plans |

Plus the two run-artifact commits carrying `ROUTING_HYGIENE_REPORT.md` and the final
`PROGRESS.md` update.

**Nothing was pushed.** No `develop` checkout, merge or rebase; no force-push; no
modification of the canonical repo or of any sibling worktree.
