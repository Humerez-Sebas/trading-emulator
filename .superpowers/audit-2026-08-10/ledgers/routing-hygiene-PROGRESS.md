# Agent E — Routing & Agent Hygiene · PROGRESS

Worktree: `C:\Users\78701\Desktop\trading-emulator-routing` · Branch: `agent/routing-hygiene` · Baseline: `a2ca53b` (develop)

## STATUS

**100% COMPLETE.** All 8 brief items plus E3 were independently VERIFIED as genuinely
stale in this worktree (0 refuted) and are now all CORRECTED and committed. The
deliverable `ROUTING_HYGIENE_REPORT.md` is written and committed at the worktree root —
**read it, not this file, for the full BEFORE/AFTER record**; this file is the run log.

| # | Item | State | Commit |
|---|---|---|---|
| 1 | `ROADMAP.md:70` Mastery Block "next sequence" + RFC-020 absent | **DONE** | `2e89ae4` |
| 2 | RFC status headers 017/018/020 stale | **DONE** (+ **019 also stale**, found independently, not in brief) | `dce795a` |
| 3 | `CLAUDE.md:28` UI row omits `DESIGN_SYSTEM.md` | **DONE** | `d3124a0` |
| 4 | `CLAUDE.md:66-67` "Arrow/parquet-dominated" is FALSE | **DONE** | `d3124a0` |
| 5 | `python -m pytest` vs Store stub | **DONE** (3 files: CLAUDE.md, verify-gates.md, README.md) | `d3124a0`, `ef21c5c` |
| 6 | `.superpowers/sdd/progress.md` ledger routing superseded | **DONE** (6 files) | `d3124a0`, `b8cd1d1` |
| 7 | 38 `file:///C:/` links in 4 docs | **DONE** (35 relativized, 3 external labelled HISTORICAL) | `2e89ae4`, `adcc4f4` |
| 8 | Plans have no status banners (0/5) | **DONE** (5/5, banners only — no body rewritten) | `f0ddce2` |
| E3 | `.claude/worktrees/` not in `.claudeignore` | **DONE** (152,368 files de-polluted) | `182bde5` |
| 10 | `ROUTING_HYGIENE_REPORT.md` | **DONE** | `dc8c4c0` |

**Refuted: none.** One brief detail corrected: `docs/engineering/verify-gates.md` does
not exist; the real file is `.claude/commands/verify-gates.md:21`.

**Self-audit of the earlier session's six commits (items 1–6, E3): PASS, no revisions.**
Each was re-diffed against `a2ca53b` and its load-bearing claims re-verified — all 8 cited
merge SHAs resolve with matching PR numbers/dates, all 16 rewritten link targets exist, the
four tracked `.superpowers/` ledgers are as stated, decision O1 is at
`.superpowers/rfc-019/dev-log.md:186`, and the 651.60/219.12 kB figures are corroborated by
the prior audit's raw build output. Nothing was found wrong, incomplete or overreaching.

**Gates:** none run, none claimed. This branch is docs-only — it touches nothing under
`emulador/src/`, no tests and no build config. (`node_modules` is absent here and
`npm install` was deliberately avoided per the CLAUDE.md lockfile-prune rule, so the bundle
figures are inherited measurements, labelled as measured at `a2ca53b`.)

## EVIDENCE SO FAR

### 1 — ROADMAP Mastery Block stale
`docs/architecture/ROADMAP.md:70` heads "Mastery Block: Phases 0-3 (the next development
sequence)"; :78 calls Phase 0 "(current)". Its table lists RFC-014/015/016 as future work.
- Shipped code present: `emulador/src/app/state/{playbook,lessons,journal,telemetry}/`,
  `emulador/src/app/pages/{reflection,journal}/` (all exist).
- Merges: `e700ecb` (RFC-014), `ab3a8e5` PR #40 (RFC-015), `1db11b6` PR #41 (RFC-016).
- RFC-020 (`docs/architecture/rfcs/020-lotaje-position-sizer.md`, merged `b8d220f` PR #54)
  appears in NO roadmap table. `grep -n "020" docs/architecture/ROADMAP.md` → no hits.
- BEFORE/AFTER: **recorded in `ROUTING_HYGIENE_REPORT.md` §1** — corrected, committed.

### 2 — RFC status headers stale
| File:line | Header says | Reality |
|---|---|---|
| `rfcs/017-compositional-panel-sync.md:5` | "auditoría final de rama pendiente antes del PR a `develop`" | merged `4e005d6` PR #45 |
| `rfcs/018-trade-visibility-refinement.md:5` | "Diseño aprobado — implementación pendiente" | merged `0e66392` PR #46 |
| `rfcs/019-pane-guard-cross-tf-forming.md:5` | "Diseño aprobado — implementación pendiente" | merged `49781f8` PR #47 — **NOT in the brief; found independently** |
| `rfcs/020-lotaje-position-sizer.md:5` | "Diseño aprobado tras Design Review — implementación pendiente" | merged `b8d220f` PR #54 |
Model (accurate): `rfcs/014-...:5` = `Estado | Implementado (2026-07-11)`.
- BEFORE/AFTER: **recorded in `ROUTING_HYGIENE_REPORT.md` §1** — corrected, committed.

### 3 — DESIGN_SYSTEM.md unrouted
`CLAUDE.md:28` routes UI work to `PRODUCT.md` + `DESIGN.md` only. `DESIGN_SYSTEM.md`
exists at repo root, 603 lines (`wc -l`), and declares at :3-4 that it is the single
source of truth for every visual, interaction and accessibility decision, with `DESIGN.md`
as the base token registry it extends. RFC-016:9 already cites it as "autoridad única".
- BEFORE/AFTER: **recorded in `ROUTING_HYGIENE_REPORT.md` §1** — corrected, committed.

### 4 — Bundle rationale FALSE (measured)
Structural proof in THIS worktree: the only `parquet-wasm` / `apache-arrow` value imports
are dynamic, inside a worker — `emulador/src/app/workers/parquet.worker.ts:45`
(`await import('parquet-wasm')`) and `:67` (`await import('apache-arrow')`); the sole
static Arrow reference is `import type` at `workers/candles-writer.ts:14`, which erases at
compile time. Therefore neither can be in the initial graph.
Measured build (prior audit raw `npm run build` output, EXIT=0, at this same baseline):
`Arrow-dom` 216.38 kB and `parquet_wasm` 34.19 kB are under **Lazy chunk files**; initial
total **651.60 kB**, of which `chunk-LMCKOV4N.js` **219.12 kB = 33.6%** attributes to
`@supabase/supabase-js`. Eager root cause confirmed here at
`emulador/src/app/auth/supabase.service.ts:2,9-15` — `@Injectable({providedIn:'root'})`
with `createClient(...)` as a field initializer.
(node_modules is absent in this worktree, so no build was re-run here; `npm install` was
deliberately avoided per the CLAUDE.md lockfile-prune rule.)
- BEFORE/AFTER: **recorded in `ROUTING_HYGIENE_REPORT.md` §1** — corrected, committed.

### 5 — `python` is the Microsoft Store stub
```
$ python --version → "Python was not found; run without arguments to install from the Microsoft Store..."
$ py --version     → Python 3.13.2
$ which -a python  → .../WindowsApps/python  (stub, first on PATH)
$ python -c "pass" ; echo $?           → 49
$ python -m pytest --version ; echo $? → 49
```
`.claude/settings.json:19` already allowlists `Bash(py -m pytest *)` and every hook at
:43/:54/:63/:74 invokes `py` — the harness already knows. Only the prose is stale.
Occurrences of `python -m pytest` in tracked, currently-authoritative docs:
`CLAUDE.md:67`, `.claude/commands/verify-gates.md:21`, `README.md:107`.
- BEFORE/AFTER: **recorded in `ROUTING_HYGIENE_REPORT.md` §1** — corrected, committed.

### 6 — Ledger routing superseded
`.superpowers/sdd/progress.md:4` (its own text): "Runs from RFC-018 onward keep their own
durable ledger at `.superpowers/rfc-XXX/dev-log.md`". Confirmed by
`git ls-files .superpowers/` → `rfc-018/dev-log.md`, `rfc-019/dev-log.md`,
`rfc-020/dev-log.md`, `sdd/progress.md`. Stale citations:
`CLAUDE.md:92` ("only `progress.md` is tracked" — false, 4 ledgers are tracked),
`docs/engineering/sdd-orchestration.md:23`, `docs/engineering/git-workflow.md:59`,
`docs/engineering/decision-frameworks.md:96`.
- BEFORE/AFTER: **recorded in `ROUTING_HYGIENE_REPORT.md` §1** — corrected, committed.

### 7 — Machine-specific `file:///C:/` links
38 lines across exactly 4 tracked docs (`grep -rn "file://" --include=*.md`, excluding the
untracked audit dir):
`docs/architecture/TRADER_KNOWLEDGE_MODEL.md` 27 occurrences ·
`docs/architecture/RFC-014_AND_BEYOND.md` 12 · `docs/architecture/ROADMAP.md` 4 ·
`docs/architecture/TRAINING_WORKFLOW.md` 3.
All but 3 point at repo files (rewritable as relative links). The 3 exceptions point at
`C:/Users/78701/.gemini/antigravity/brain/.../{KNOWN_PAIN_POINTS,FUTURE_IDEAS,CURRENT_LIMITATIONS}.md`
— outside the repo, unavailable → label historical, do not fabricate a target.
- BEFORE/AFTER: **recorded in `ROUTING_HYGIENE_REPORT.md` §1** — corrected, committed.

### 8 — Plans carry no status banner
`grep -rln "^> \*\*Status|^\*\*Status:|^> \*\*Estado" docs/superpowers/plans/` → 0 hits
across all 53 plans. The 5 largest (`wc -c | sort -rn`) all open with an imperative
"REQUIRED SUB-SKILL: ... implement this plan task-by-task":
`2026-07-03-rfc-011-layout-persistence.md` (73 kB), `2026-06-16-modo-offline-emulador.md`
(71 kB), `2026-07-01-rfc-008-panel-system-layout.md` (62 kB),
`2026-07-02-rfc-010-synchronization.md` (60 kB), `2026-07-04-rfc-012-performance.md` (54 kB).
`2026-06-16-modo-offline-emulador.md:5-7` still instructs building guest entry + an
offline-only build config — directly contradicting `CLAUDE.md:7` ("Login is required;
there is no guest/offline mode"). Retired by `2026-06-23-retire-fastapi-offline.md`.
- BEFORE/AFTER: **recorded in `ROUTING_HYGIENE_REPORT.md` §1** — corrected, committed.

## WORKTREE CLASSIFICATION

`git worktree list` run read-only from the canonical repo. 152,368 files under
`C:\Users\78701\Desktop\trading-emulator\.claude\worktrees\`. `.claudeignore` exists and is
tracked, but lists no `.claude/` entry, so all of it is agent-greppable.

| Dir under `.claude/worktrees/` | HEAD | Branch | Files | Ancestor of develop? | of main? | Verdict |
|---|---|---|---|---:|---|---|
| `compassionate-villani-d2fc5b` | — | **not registered** | **0** | n/a | n/a | **ORPHAN — empty dir, no `.git`, absent from `git worktree list`** |
| `dreamy-gagarin-afe569` | `f57ed8d` | `docs/demo-data-pwa-plan` | 28,551 | YES | YES | STALE — fully merged |
| `eager-chaum-6000cb` | `0cbed9b` | detached | 279 | no | no | STALE-with-care — commit unreachable, but all 3 of its files are byte-IDENTICAL to develop (`git diff --quiet 0cbed9b develop -- <path>` × 3) |
| `funny-diffie-89d75d` | `cc9891c` | detached | 30,995 | YES | no | STALE — merge commit of PR #23, in develop |
| `jovial-williamson-33d3c1` | `d07e049` | `claude/playback-controller-phase1` | 31,012 | YES | YES | STALE — fully merged |
| `laughing-hofstadter-d9478e` | `30c2219` | detached | 31,055 | YES | YES | STALE — the PR #36 graft commit, in both |
| `sad-feynman-e57266` | `5b4c1a7` | `claude/sad-feynman-e57266` | 30,476 | YES | YES | STALE — fully merged |

Out of scope (not under `.claude/worktrees/`, left untouched): `C:/Users/78701/Desktop/tesm-backmerge`
(`0abaf97` `develop-backmerge`, ancestor of neither — the back-merge landed as PR #56 `a2ca53b`;
owner's call, not agent-prunable), plus the five live `trading-emulator-*` agent worktrees.

### Recommended prune commands — NOT EXECUTED (owner runs these, from the canonical repo)
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

# 3. Optional, only after 2 succeeds — the branches are merged into develop AND main.
git branch -d docs/demo-data-pwa-plan claude/playback-controller-phase1 claude/sad-feynman-e57266
```
Expected effect: 152,368 files removed from the agent-searchable tree.

## DEAD ENDS

- **`docs/engineering/verify-gates.md` does not exist.** The brief named it; the real file
  is `.claude/commands/verify-gates.md`. Corrected rather than created.
- **The 3 external `file:///` targets cannot be repaired.** The directory
  `C:/Users/78701/.gemini/antigravity/brain/03df98d6-…/` still exists on this machine but
  holds only `TRAINING_WORKFLOW.md`, `engineering_knowledge_roadmap.md`,
  `strategic_audit.md`, `walkthrough.md` — the three cited files are gone and were never
  versioned here. Labelled HISTORICAL/external; no target fabricated, no reference deleted.
- **The bundle figure could not be re-measured in this worktree.** `node_modules` is absent
  and `npm install` was deliberately avoided (CLAUDE.md lockfile-prune rule). The prior
  audit's raw `npm run build` output at this same baseline was used instead, and the doc
  states the number as measured *at `a2ca53b`* with an instruction to re-measure.
- **RFC-008 has two merges from the same branch name.** PR #26 (`204b261`) is the RFC-008
  body; PR #28 (`5867ac5`) is later RFC-009 work on a reused branch. The banner cites #26,
  confirmed by `layout.reducer.ts` first appearing in `f4b4956`.

## NEXT STEPS

**None — the run is complete.** Everything in the original ordered list (items 1–10 plus
E3) is done and committed; see §STATUS for the item→commit mapping.

Left deliberately for the owner or a future pass (all recorded in
`ROUTING_HYGIENE_REPORT.md` §5, none is a defect introduced here):

1. **Owner action:** run the worktree prune commands in §WORKTREE CLASSIFICATION. They were
   NOT executed. `30c2219` (the PR #36 ancestry graft) must never be deleted as a commit —
   step 2 removes only its working directory, and the commit stays reachable from both
   branches.
2. **Owner action:** branch protection — neither `main` nor `develop` is protected. No
   MCP/CLI path; human dashboard task.
3. The other 48 plans in `docs/superpowers/plans/` still carry no status banner.
4. `docs/superpowers/plans/task-*-{brief,report,diff}.md` + `progress-ledger.md` are
   committed where they do not belong — already labelled a mistake at
   `docs/engineering/sdd-orchestration.md:35`; deleting files is outside a routing pass.

## RESUME BRIEF

> **The Agent E routing-hygiene run is COMPLETE. There is nothing left to resume.**
> If you are picking this up, your job is to *review or hand off*, not to redo it.
>
> **Where things stand.** Branch `agent/routing-hygiene` in
> `C:\Users\78701\Desktop\trading-emulator-routing`, based on `develop` @ `a2ca53b`,
> carries 11 commits (`f7884e2`, `182bde5`, `dce795a`, `2e89ae4`, `d3124a0`, `ef21c5c`,
> `b8cd1d1`, `adcc4f4`, `f0ddce2`, `dc8c4c0`, plus this PROGRESS.md update). **Nothing has
> been pushed and no PR has been opened** — that is the only remaining action, and it
> belongs to the owner. The full record is `ROUTING_HYGIENE_REPORT.md` at the worktree
> root; this file is the run log behind it.
>
> **What the branch contains.** Docs only — it touches nothing under `emulador/src/`, no
> tests, no build config. **No verification gates were run and none are claimed**; that is
> stated explicitly in the report rather than implied. Nine stale statements were corrected,
> each with the evidence proving staleness recorded inline: the ROADMAP's delivered Mastery
> Block, four RFC status headers, four `CLAUDE.md` corrections, `python`→`py` in three
> files, ledger routing in six files, 38 machine-local `file:///C:/` links, status banners
> on the five largest plans, and `.claudeignore`.
>
> **Constraints that still bind anyone touching this branch.** Never modify
> `C:\Users\78701\Desktop\trading-emulator` (canonical) or any sibling
> `trading-emulator-*` worktree — read-only. Never checkout/merge/rebase `develop`, never
> force-push, never push. Pathspec `git add <paths>`, never `git add -A`. `CLAUDE.md` and
> `.claude/` hooks/`settings.json`/`steering.md` are PROTECTED — only specific
> evidence-backed corrections, never deletions, never broadened scope. Do NOT create
> `AGENTS.md` (a completed audit rejected it) and do not invent a new docs system;
> `docs/engineering/` is the vault. Never rewrite a historical document to pretend it was
> always current — add a banner, never launder the body.
>
> **Two owner actions were deliberately NOT taken** (details in §NEXT STEPS and report §3):
> the worktree prune commands are recommendations only — and `30c2219`, the PR #36 ancestry
> graft, must never be deleted or pruned as a commit; and branch protection for `main` /
> `develop` has no MCP/CLI path and remains a human dashboard task.
>
> **Standing warning, do not relitigate.** The claim that Gold sizing is broken because
> XAUUSD has no `pipSize` is **REFUTED** — D.20.6
> (`.superpowers/rfc-020/dev-log.md:2564-2569`) defines non-FX displayed points as whole
> price units and the code follows it. No doc on this branch states unit semantics; do not
> "correct" any toward the refuted reading.
