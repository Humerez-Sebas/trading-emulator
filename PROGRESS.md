# Agent E — Routing & Agent Hygiene · PROGRESS

Worktree: `C:\Users\78701\Desktop\trading-emulator-routing` · Branch: `agent/routing-hygiene` · Baseline: `a2ca53b` (develop)

## STATUS

**~30% complete.** All 8 brief items independently VERIFIED as genuinely stale in this
worktree (0 refuted). Corrections not yet applied.

| # | Item | State |
|---|---|---|
| 1 | `ROADMAP.md:70` Mastery Block "next sequence" + RFC-020 absent | VERIFIED — not yet corrected |
| 2 | RFC status headers 017/018/020 stale | VERIFIED (+ **019 also stale**, not in brief) — not yet corrected |
| 3 | `CLAUDE.md:28` UI row omits `DESIGN_SYSTEM.md` | VERIFIED — not yet corrected |
| 4 | `CLAUDE.md:66-67` "Arrow/parquet-dominated" is FALSE | VERIFIED — not yet corrected |
| 5 | `python -m pytest` vs Store stub | VERIFIED (worse than stated) — not yet corrected |
| 6 | `.superpowers/sdd/progress.md` ledger routing superseded | VERIFIED (+ CLAUDE.md:92 "only progress.md is tracked" also false) — not yet corrected |
| 7 | 38 `file:///C:/` links in 4 docs | VERIFIED — not yet corrected |
| 8 | Plans have no status banners (0/5) | VERIFIED — not yet corrected |
| E3 | `.claude/worktrees/` not in `.claudeignore` | VERIFIED — not yet corrected |

**Refuted: none.** One brief detail corrected: `docs/engineering/verify-gates.md` does
not exist; the real file is `.claude/commands/verify-gates.md:21`.

## EVIDENCE SO FAR

### 1 — ROADMAP Mastery Block stale
`docs/architecture/ROADMAP.md:70` heads "Mastery Block: Phases 0-3 (the next development
sequence)"; :78 calls Phase 0 "(current)". Its table lists RFC-014/015/016 as future work.
- Shipped code present: `emulador/src/app/state/{playbook,lessons,journal,telemetry}/`,
  `emulador/src/app/pages/{reflection,journal}/` (all exist).
- Merges: `e700ecb` (RFC-014), `ab3a8e5` PR #40 (RFC-015), `1db11b6` PR #41 (RFC-016).
- RFC-020 (`docs/architecture/rfcs/020-lotaje-position-sizer.md`, merged `b8d220f` PR #54)
  appears in NO roadmap table. `grep -n "020" docs/architecture/ROADMAP.md` → no hits.
- BEFORE/AFTER: pending.

### 2 — RFC status headers stale
| File:line | Header says | Reality |
|---|---|---|
| `rfcs/017-compositional-panel-sync.md:5` | "auditoría final de rama pendiente antes del PR a `develop`" | merged `4e005d6` PR #45 |
| `rfcs/018-trade-visibility-refinement.md:5` | "Diseño aprobado — implementación pendiente" | merged `0e66392` PR #46 |
| `rfcs/019-pane-guard-cross-tf-forming.md:5` | "Diseño aprobado — implementación pendiente" | merged `49781f8` PR #47 — **NOT in the brief; found independently** |
| `rfcs/020-lotaje-position-sizer.md:5` | "Diseño aprobado tras Design Review — implementación pendiente" | merged `b8d220f` PR #54 |
Model (accurate): `rfcs/014-...:5` = `Estado | Implementado (2026-07-11)`.
- BEFORE/AFTER: pending.

### 3 — DESIGN_SYSTEM.md unrouted
`CLAUDE.md:28` routes UI work to `PRODUCT.md` + `DESIGN.md` only. `DESIGN_SYSTEM.md`
exists at repo root, 603 lines (`wc -l`), and declares at :3-4 that it is the single
source of truth for every visual, interaction and accessibility decision, with `DESIGN.md`
as the base token registry it extends. RFC-016:9 already cites it as "autoridad única".
- BEFORE/AFTER: pending.

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
- BEFORE/AFTER: pending.

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
- BEFORE/AFTER: pending.

### 6 — Ledger routing superseded
`.superpowers/sdd/progress.md:4` (its own text): "Runs from RFC-018 onward keep their own
durable ledger at `.superpowers/rfc-XXX/dev-log.md`". Confirmed by
`git ls-files .superpowers/` → `rfc-018/dev-log.md`, `rfc-019/dev-log.md`,
`rfc-020/dev-log.md`, `sdd/progress.md`. Stale citations:
`CLAUDE.md:92` ("only `progress.md` is tracked" — false, 4 ledgers are tracked),
`docs/engineering/sdd-orchestration.md:23`, `docs/engineering/git-workflow.md:59`,
`docs/engineering/decision-frameworks.md:96`.
- BEFORE/AFTER: pending.

### 7 — Machine-specific `file:///C:/` links
38 lines across exactly 4 tracked docs (`grep -rn "file://" --include=*.md`, excluding the
untracked audit dir):
`docs/architecture/TRADER_KNOWLEDGE_MODEL.md` 27 occurrences ·
`docs/architecture/RFC-014_AND_BEYOND.md` 12 · `docs/architecture/ROADMAP.md` 4 ·
`docs/architecture/TRAINING_WORKFLOW.md` 3.
All but 3 point at repo files (rewritable as relative links). The 3 exceptions point at
`C:/Users/78701/.gemini/antigravity/brain/.../{KNOWN_PAIN_POINTS,FUTURE_IDEAS,CURRENT_LIMITATIONS}.md`
— outside the repo, unavailable → label historical, do not fabricate a target.
- BEFORE/AFTER: pending.

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
- BEFORE/AFTER: pending.

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

(To be filled as work proceeds.)

## NEXT STEPS

1. Commit this PROGRESS.md.
2. `.claudeignore` — add `.claude/worktrees/` (biggest search-pollution win, smallest edit).
3. RFC status headers 017/018/019/020 → `Implementado` with merge evidence.
4. `ROADMAP.md` — re-title the Mastery Block as delivered, add RFC-020 row, fix `file:///`.
5. `CLAUDE.md` — the four authorized corrections (UI row, bundle cause, `py`, ledger routing).
6. `.claude/commands/verify-gates.md:21` + `README.md:107` — `python` → `py`.
7. `docs/engineering/{sdd-orchestration,git-workflow,decision-frameworks}.md` — ledger routing.
8. Remaining `file:///C:/` links in the other 3 architecture docs.
9. Status banners on the 5 largest plans (taxonomy `CURRENT`/`HISTORICAL`/`SUPERSEDED`/`REMOVED`).
10. Write `ROUTING_HYGIENE_REPORT.md`, final commit.

## RESUME BRIEF

> You are **Agent E — Routing & Agent Hygiene** on the `trading-emulator` repo.
> Work ONLY in `C:\Users\78701\Desktop\trading-emulator-routing`, branch
> `agent/routing-hygiene`, based on `develop` @ `a2ca53b`. You may READ
> `C:\Users\78701\Desktop\trading-emulator` (canonical) and sibling `trading-emulator-*`
> worktrees but must never modify them. Never checkout/merge/rebase `develop`, never
> force-push, never push. Commit only to your own branch, pathspec `git add <paths>`
> (never `git add -A`), conventional messages.
>
> Read `PROGRESS.md` at your worktree root first — it holds every verification already
> done, with the exact commands and file:line evidence. Do not redo verified work; do
> re-verify anything you are about to edit.
>
> Task: correct only statements PROVEN stale. Small, boring, high-confidence. Do NOT
> create `AGENTS.md` (a completed audit rejected it) and do not invent a new docs system —
> `docs/engineering/` already is the vault; improve routing INTO it. Status taxonomy:
> `CURRENT` / `HISTORICAL` / `SUPERSEDED` / `REMOVED`. Never rewrite a historical document
> to pretend it was always current — add a banner, never launder the body.
> `CLAUDE.md` and `.claude/` hooks/settings/steering.md are PROTECTED: make only the
> specific evidence-backed corrections enumerated in PROGRESS.md §STATUS, nothing else,
> and never delete them. Do NOT prune the canonical repo's worktrees yourself — the
> commands in §WORKTREE CLASSIFICATION are recommendations for the owner to run.
>
> Remaining scope is the ordered list in §NEXT STEPS. Deliverable:
> `ROUTING_HYGIENE_REPORT.md` at the worktree root — each stale statement corrected with
> before/after + the evidence proving staleness, documents affected, the worktree
> classification table + recommended (not executed) prune commands, search-pollution
> reduction, anything found stale but deliberately left alone and why, and commit SHAs.
> Update and commit PROGRESS.md after every unit of work.
