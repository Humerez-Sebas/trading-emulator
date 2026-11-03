# TD Audit — Comments, Documentation Source-of-Truth & Agent Context

Repo: `C:\Users\78701\Desktop\trading-emulator` · branch `develop` @ `a2ca53b`
(HEAD is actually `a2ca53b Merge pull request #56 from Humerez-Sebas/chore/backmerge-main-into-develop`)
Auditor role: Principal Engineer, READ-ONLY. Date: 2026-08-10.
All commands below were run from `C:\Users\78701\Desktop\trading-emulator\emulador\src`
unless the block says `cd /c/Users/78701/Desktop/trading-emulator`.

---

## STATUS

**~85% complete.**

### AREAS COMPLETE
- **(1) Comment noise in non-spec TS** — counts generated, top-11 offenders read and
  bucket-classified mechanically + by hand, quoted examples with line numbers.
  Commented-out-code count generated and resolved (it is ZERO — see F-6).
- **(3) Logging & debug code** — fully enumerated. Result is a non-finding plus one
  small gap (F-7). eslint config read.
- **(6) `.claude/` tooling coherence** — settings.json, all 4 commands, both agents,
  steering.md, and 2 of 4 hooks read. Verdict: coherent, one stale command line (F-9).

### AREAS PARTIAL
- **(2) Spec-file comment noise** — density measured across all 182 spec files, top-20
  offenders ranked, 3 files sampled in depth. NOT done: reading the 3 heaviest
  (`calculadora-page.component.spec.ts` 236/819, `lotaje-view.spec.ts` 193/2433) end to
  end for a per-bucket split like the source files got.
- **(4) Documentation source of truth** — full inventory + cluster totals done; 3
  contradictions found and proved; ~4 RFC/code spot-checks done. NOT done: reading
  RFC-014/015/016/020 bodies against the code (only their *existence* vs ROADMAP was
  checked); no read of `docs/architecture/strategic_audit.md`,
  `engineering_knowledge_roadmap.md`, `RFC-014_AND_BEYOND.md`, `EXPERIENCE_DOMAINS.md`,
  `TEDS_*`, `UBIQUITOUS_LANGUAGE.md`, `DOMAIN_MODEL.md`, `EVENT_STORMING.md`,
  `walkthrough.md`, `TRAINING_WORKFLOW.md` — so the "which docs should be archived"
  list is inventory-level, not content-level.
- **(5) Agent ergonomics** — context-cost measured, token-waste sources enumerated,
  AGENTS.md question answered. NOT done: the "where does feature X live" walkthrough
  was reasoned from the inventory rather than executed as a timed fresh-agent trial.

### AREAS NOT STARTED
- Content-level staleness review of `docs/superpowers/plans/` (53 files, 21,701 lines)
  and `docs/superpowers/specs/` (26 files, 8,855 lines) — the largest doc cluster in the
  repo, and the most likely archive candidate. Only file names/sizes were inspected.
- `pipeline/` comments and docs (Python side) — not touched at all.
- `topbar-hud/` prototype — not inspected.

---

## HARD NUMBERS (with the exact command that produced each)

All from `emulador/src` unless noted.

| Metric | Value | Command basis |
|---|---|---|
| Non-spec TS files | 206 | `find . -name "*.ts" ! -name "*.spec.ts" ! -name "*.spec-util.ts" \| wc -l` |
| Non-spec TS LOC | 33,411 | same find `-exec cat {} + \| wc -l` |
| Non-spec comment lines | 6,535 | same find `-exec grep -hE "^\s*(//\|/\*\|\*)" {} + \| wc -l` |
| Non-spec comment density | **19.6 %** | 6535 / 33411 |
| Spec files | 182 | `find . -name "*.spec.ts" \| wc -l` |
| Spec LOC | 43,337 | `find . -name "*.spec.ts" -exec cat {} + \| wc -l` |
| Spec comment lines | 2,473 | `find . -name "*.spec.ts" -exec grep -hE "^\s*(//\|/\*\|\*)" {} + \| wc -l` |
| Spec comment density | **5.7 %** | 2473 / 43337 |
| Commented-out code blocks | **0** | `grep -rnE "^\s*// *(const\|let\|var\|if ?\(\|return\|this\.\|import \|export \|function \|await )" --include="*.ts" . \| grep -E "(;\|\{\|\}\|\)\s*)$"` → empty. (The loose 27-hit variant is 100 % false positives: prose continuation lines starting with `if`/`for`/`return`.) |
| `console.*` in `emulador/src` | **2** | `grep -rnE "console\." .` → `main.ts:5` (bootstrap catch) + `app/state/telemetry/telemetry.trading.jump-50-profile.spec.ts:243` |
| `debugger` statements | **0** | `grep -rn "debugger" --include="*.ts" . \| wc -l` |
| Empty catch blocks | **0** | `grep -rnE "catch\s*(\([^)]*\))?\s*\{\s*\}" --include="*.ts" .` (56 catch blocks total, none empty) |
| TODO/FIXME/HACK/XXX/@deprecated | **4** | `grep -rnE "(TODO\|FIXME\|HACK\|XXX\|@deprecated)" --include="*.ts" .` |
| Comment lines citing `RFC-NNN` / `RFC §` | **282** (source) + **81** (spec) | `grep -rnE "^\s*(//\|\*\|/\*).*(RFC[- ]?[0-9]{3}\|RFC §)"` |
| Comment lines citing a D-number decision | **186** | `grep -rnE "^\s*(//\|\*\|/\*).*\bD-?[0-9]{1,2}(\.[A-Z])?\b"` |
| Comment lines citing `Task N` | **128** | `grep -rnEi "^\s*(//\|\*\|/\*).*\btask[- ]?[A-D]?-?[0-9]"` |
| Comment lines citing dev-log / task report / spike / `§` | **188** | `grep -rnEi "^\s*(//\|\*\|/\*).*(dev-log\|task report\|spike\|§)"` |
| Tracked markdown files | **151** | `git ls-files "*.md" \| wc -l` (repo root) |
| Tracked markdown lines | **≈48,760** | per-cluster `wc -l` sums, table below |
| Untracked agent markdown | **294** | `find .superpowers .agents .impeccable .opencode -name "*.md" \| wc -l` |
| Markdown inside `.claude/worktrees/` | **286** (excl. node_modules) / **4,749** (incl.) | `find .claude/worktrees -name "*.md" [-not -path "*/node_modules/*"] \| wc -l` |
| TS files inside `.claude/worktrees/` | **990** (excl. node_modules/.angular) | `find .claude/worktrees -name "*.ts" -not -path "*/node_modules/*" -not -path "*/.angular/*" \| wc -l` |
| Total files under `.claude/worktrees/` | **152,368** across 7 dirs | per-dir `find … -type f \| wc -l`: 0 / 28,551 / 279 / 30,995 / 31,012 / 31,055 / 30,476 |
| Barrel files | **1** (`app/components/ui/index.ts`) | `find . -name "index.ts"` |
| Committed generated artifacts | **1** (`app/domain/sizing/asset-registry.generated.ts`, 57 lines) | `find . -name "*generated*"` |
| Shared test fixtures | **1** (`app/testing/fixtures.ts`, 136 lines) | `find . -iname "*fixture*"` |

### Documentation cluster table

Basis: `git ls-files "<dir>/*.md"` filtered to that exact directory, piped to `wc -l`.

| Cluster | Files | Lines | Apparent status |
|---|---:|---:|---|
| `docs/superpowers/plans/` | 53 | 21,701 | HISTORICAL / IMPLEMENTATION NOTE — biggest cluster, 44 % of all doc lines |
| `docs/superpowers/specs/` | 26 | 8,855 | HISTORICAL (design records per feature) |
| `.superpowers/*/dev-log.md` + `sdd/progress.md` | 4 | 5,926 | RUN LEDGER (historical, but `progress.md` is cited as CURRENT by 3 docs — see F-11) |
| `docs/architecture/` (non-RFC) | 16 | 4,953 | MIXED: CURRENT RULE (ROADMAP, TEDS_*, PRODUCT_PRINCIPLES) + STALE (`strategic_audit.md`, `RFC-014_AND_BEYOND.md`, `engineering_knowledge_roadmap.md`) |
| `docs/architecture/rfcs/` | 21 | 3,932 | RFC PROPOSAL / FROZEN DECISION — canonical |
| Root `*.md` (CLAUDE/PRODUCT/DESIGN/DESIGN_SYSTEM/README) | 5 | 1,008 | CURRENT RULE |
| `docs/engineering/` | 7 | 771 | CURRENT RULE — the vault |
| `docs/superpowers/` (root: master prompts, handoffs) | 4 | 698 | HISTORICAL |
| `docs/engineering/domain/` | 5 | 502 | CURRENT RULE — the vault |
| `.claude/commands/` | 4 | 134 | CURRENT RULE (procedures) |
| `.claude/agents/` | 2 | 72 | CURRENT RULE |
| `.claude/steering.md` | 1 | 32 | CURRENT RULE (auto-injected every prompt) |
| `docs/superpowers/tickets/` | 1 | 46 | HISTORICAL |
| `emulador/README.md` | 1 | 59 | STALE (unmodified Angular CLI boilerplate) |

Ratio: **permanent engineering knowledge (`docs/engineering/**` = 1,273 lines) is 2.6 %
of the documentation corpus**; historical run artifacts (`plans` + `specs` + ledgers +
`superpowers/` root = 37,180 lines) are **76 %**.

### Comment bucket classification — top 11 offenders

Produced by `scratchpad/classify.py` (block-segmentation + keyword heuristics: blocks
≤2 lines → KEEP unless pure process+history narration; 3–6 → REWRITE; 7–14 → MOVE if
process/history-flavoured; >14 → MOVE, or DELETE when both process AND history
keywords fire). Numbers were hand-checked against the excerpts quoted in the findings
and are **±10 %**, not exact.

| File | cmt | KEEP | REWRITE | MOVE | DELETE |
|---|---:|---:|---:|---:|---:|
| `app/lotaje/lotaje-view.ts` | 365 | 20 | 157 | 179 | 9 |
| `app/components/chart/chart.component.ts` | 273 | 115 | 116 | 15 | 27 |
| `app/components/chart/chart-model-mapper.service.ts` | 238 | 18 | 84 | 78 | 58 |
| `app/state/telemetry/telemetry.effects.ts` | 238 | 6 | 26 | 99 | 107 |
| `app/services/session-sync.service.ts` | 217 | 21 | 130 | 39 | 27 |
| `app/state/selectors.ts` | 195 | 39 | 81 | 35 | 40 |
| `app/state/trading/fill-engine.ts` | 165 | 27 | 58 | 44 | 36 |
| `app/lotaje/companion-window.ts` | 149 | 3 | 51 | 64 | 31 |
| `app/state/telemetry/telemetry-anchors.ts` | 131 | 8 | 27 | 58 | 38 |
| `app/state/trading/trading.models.ts` | 115 | 33 | 49 | 0 | 33 |
| `app/pages/sesiones/sesiones-page.component.ts` | 186 | 83 | 87 | 16 | 0 |
| **TOTAL** | **2,272** | **373 (16 %)** | **866 (38 %)** | **627 (28 %)** | **406 (18 %)** |

Read: **~46 % of the comment mass in the ten worst files is either misplaced
(institutional knowledge that belongs in a doc) or deletable.** Two files
(`chart.component.ts`, `sesiones-page.component.ts`) are the healthy pattern and should
be left alone.

### Spec comment density — top offenders

`for f in $(find . -name "*.spec.ts"); do c=$(grep -cE "^\s*(//|/\*|\*)" "$f"); t=$(wc -l < "$f"); echo "$c $t $f"; done | sort -rn`

| File | cmt / LOC | density |
|---|---|---|
| `app/pages/calculadora/calculadora-page.component.spec.ts` | 236 / 819 | 29 % |
| `app/domain/chart/chart-engine.spec.ts` | 92 / 341 | 27 % |
| `app/components/chart/chart-model-mapper.trade-gating.spec.ts` | 65 / 257 | 25 % |
| `app/lotaje/companion-window.spec.ts` | 101 / 647 | 16 % |
| `app/state/trading/ambiguous-kpi.spec.ts` | 63 / 177 | 36 % |
| `app/lotaje/lotaje-view.spec.ts` | 193 / 2433 | 8 % |
| **All specs** | **2,473 / 43,337** | **5.7 %** |

---

## FINDINGS SO FAR

---

### F-1 — Production code is the storage medium for the SDD run process

**Category:** Comments / knowledge placement
**Severity:** High · **Scope:** Systemic (14 files confirmed; 282 + 186 + 128 + 188
comment lines carry RFC / D-number / Task / dev-log references)

**Evidence**
- `app/state/telemetry/telemetry.effects.ts:130` —
  `* FINAL-AUDIT ATTENTION — REVIEW FIX (RFC-014 T5 review, wave 1): the`
  … the block runs to line 194: **65 consecutive comment lines** narrating a reviewer
  finding, the rejected fix, the accepted fix, and a proof about ngrx's
  `queueScheduler` trampoline. `FINAL-AUDIT ATTENTION` is defined in
  `docs/engineering/sdd-orchestration.md` ("Ledger protocol") as a *ledger* marker
  addressed to an auditor — it has been pasted into a production field's doc comment.
- `app/lotaje/companion-window.ts:114` —
  `// L-3 (Wave 5 audit): \`opening\` used to be cleared piecemeal, inside`
  (12 lines). Also `:104`, `:182`, `:218`, `:230` — five separate "Wave 5 audit M-1/L-3"
  blocks in a 320-line file.
- `app/lotaje/lotaje-view.ts:5` — `item 6, grep-checked in task reports).`
- `app/lotaje/lotaje-view.ts:1413-1414` — `design §5.3, brief §6). … (Wave 4 audit L-4)`
- `app/components/chart/chart-model-mapper.service.ts:302` —
  `assume monotonic advance and is explicitly rejected (plan Step 4 / brief §7).`
- `app/domain/chart/chart-engine.ts:41-43` —
  `/** D19.A: set by \`destroy()\` … No other member observed this before Task 3 —
  verified against the real class (chart-engine.ts), not the plan's draft. */`
  (a note about how the *implementer* verified their own work, shipped forever)
- `app/state/telemetry/telemetry-anchors.ts:21` —
  `mechanism was revised in the T5 review fix — see that field's doc`
- `app/state/selectors.ts:310` — `Kept alive with its store wiring below per R18-14`
- `app/state/selectors.ts:423-425` — `Kept alive per R18-14: it may have no production
  consumer left after F3, but dismantling it is TEDS Phase 4 Task 6's declared job, not
  this task's.`
- Spec side: `app/components/chart/chart-model-mapper.trade-gating.spec.ts:15-34` — a
  20-line header whose last sentence is `no assertion was weakened, deleted, or
  skipped — all seven of Task 3's gating guarantees … are still asserted, byte-for-byte
  equivalent in rigor to before.` That is a defence submitted to a reviewer of a PR
  that merged weeks ago.
- `app/components/journal-viz/*.spec.ts` — 8 occurrences of
  `// T6 review fix wave (Finding N): …`

**Observed pattern.** The SDD protocol (`docs/engineering/sdd-orchestration.md`) asks
implementers to flag attention items for the auditor and to document deviations. That
signalling is being written into the source file instead of (or in addition to) the
ledger, and it is never removed after the audit closes. The comments then survive as
permanent narration addressed to a reader who no longer exists.

**Why it matters HERE.** The repo's own `PHILOSOPHY.md §6.3` sets the success criterion:
"un agente competente que clone este repo mañana, sin ninguna conversación histórica,
debe poder trabajar al nivel del que se fue." A fresh agent reading
`telemetry.effects.ts` must decode `T5b-i`, `T5b-ii`, `D14.F`, `wave 1`, `task-5-brief.md`
before it can read the *code*, and `task-5-brief.md` is gitignored — it does not exist
in a clean clone. The comment references a document the reader cannot open.

**Concrete risk.** (a) Agents burn context resolving process nouns that resolve to
nothing. (b) Comments encode a *point in time* ("used to", "before Task 3", "the
original design") so they rot the moment the code moves — a future edit that fixes the
code leaves a comment asserting the opposite. (c) Reviewers over-trust prose that reads
authoritative but is unverifiable.

**Recommended direction.** Split the sentence, not the file. Keep the *mechanism*
("clearing on a hand-maintained action list is unsound because `goToTime` has 3
non-arming dispatch sites; two independent invalidation paths guarantee it instead")
inline in ≤6 lines. Move the *narrative* (who found it, in which wave, what the previous
design was, why the auditor's concern was addressed) into
`docs/engineering/domain/replay-trading.md` or the RFC's deviation section. Delete the
salutations (`FINAL-AUDIT ATTENTION`, `grep-checked in task reports`, `verified against
the real class, not the plan's draft`, `byte-for-byte equivalent in rigor to before`)
outright — they carry zero information about the code.

**Migration difficulty.** Medium. Mechanical to *find* (the four greps above), but each
block needs a human/agent judgement call on the keep/move split. ~15 files.

**Best mechanism.** Convention (a rule in `docs/engineering/sdd-orchestration.md`:
"attention flags live in the ledger, never in source; the implementer's final act is to
strip process nouns from the diff") + a one-off Cleanup pass + optionally a lint rule
banning `FINAL-AUDIT` / `Wave N audit` / `task report` / `brief §` in `.ts`.

**Acceptance condition.** `grep -rnEi "FINAL-AUDIT|Wave [0-9] audit|task report|brief §|grep-checked" --include="*.ts" emulador/src` returns 0 hits, and the mechanism each
deleted block described is either still stated in ≤6 lines inline or present in a
`docs/engineering/domain/*.md` section.

---

### F-2 — `lotaje/` ships its RFC inside its own source files

**Category:** Comments / knowledge placement
**Severity:** Medium · **Scope:** Local (3 files, but 514 comment lines)

**Evidence**
- `app/lotaje/lotaje-view.ts:1-57` — a **57-line** module header, the longest leading
  block in the repo (`awk` scan of leading `/**` blocks: 57, then 29, 26, 25, 24). It
  restates the framework-free constraint, the mount-arity contract, the three product
  zones, decision owners D-5/C-2/D-7, and the `data-lotaje-companion` decision tree.
- `app/lotaje/lotaje-view.ts:1723` LOC with **365** comment lines — the single largest
  file and the single largest comment block in the app.
- `app/lotaje/companion-window.ts` — 149 comment lines in 320 LOC (**47 %**). Header
  `:1-25`, then `:29-40`, `:53-59`, `:73-79`, `:86-91`, `:102-125`, `:175-193`,
  `:215-223`, `:228-243`, `:251-257`, `:280-287`, `:307-312`.
- `app/lotaje/companion-window.ts:17` — cites
  `.superpowers/rfc-020/spike-s1-report.md`, which **is gitignored**
  (`git ls-files .superpowers/*` returns only the three `dev-log.md` + `progress.md` +
  three `.gitignore` files). The comment points at a file no clean clone contains.
- The corresponding RFC exists and is the correct home:
  `docs/architecture/rfcs/020-lotaje-position-sizer.md` (440 lines).

**Observed pattern.** The most recent feature has the worst ratio, which suggests the
practice is *accelerating*, not decaying.

**Why it matters HERE.** `PHILOSOPHY.md §2.8` — "la complejidad paga alquiler"; the same
test applies to prose. `decision-frameworks.md §10` already answers where this belongs:
"Is it a decision future work must obey? → RFC / vision doc (D-id)". The rule exists and
is being violated by the newest code.

**Concrete risk.** `lotaje-view.ts` cannot be opened cheaply — reading the first screen
costs ~1.5 kB of prose before the first import. Any agent asked to touch the calculator
pays that toll on every visit.

**Recommended direction.** Reduce the module header to ~10 lines: the two genuinely
load-bearing constraints (explicit `doc`/`win` arguments because a PiP realm is a
different realm; a single module-wide mount) plus a pointer to RFC-020. Move the zone
composition, the companion/page split, and the S-1 spike conclusions into RFC-020 §
sections. Same treatment for `companion-window.ts`.

**Migration difficulty.** Low — 3 files, and RFC-020 already exists to receive it.
**Best mechanism.** Cleanup + Convention.
**Acceptance condition.** No `.ts` file under `emulador/src` has a leading comment block
> 15 lines; `lotaje/` comment density drops below the repo mean (19.6 %).

---

### F-3 — CLAUDE.md's UI/visual context row points at the wrong documents

**Category:** Documentation source of truth · **CONTRADICTION**
**Severity:** High · **Scope:** Systemic (affects every UI task)

**Evidence**
- `CLAUDE.md:28` — `| UI/visual work | \`PRODUCT.md\` (brand, anti-references) +
  \`DESIGN.md\` (tokens) |`
- `DESIGN_SYSTEM.md:1-6` — `# Design System: Trading Emulator` / `The single source of
  truth for every visual, interaction, and accessibility decision in the emulator.
  \`DESIGN.md\` remains the canonical base token registry; this document extends it into
  a complete system…` — **603 lines, and CLAUDE.md never mentions it.**
- `PRODUCT.md:19-22` — `The canonical, consolidated registry of product-level
  anti-references is \`docs/architecture/PRODUCT_PRINCIPLES.md\` §5; this section is the
  brand-level summary.` — so CLAUDE.md sends the agent to PRODUCT.md *for*
  anti-references, and PRODUCT.md immediately forwards it elsewhere (209 lines).
- Also unreferenced from the UI row: `docs/architecture/TEDS_INTERACTION.md` (112),
  `docs/architecture/TEDS_MOTION.md` (159).

**Observed pattern.** An agent that follows CLAUDE.md exactly reads **178 lines**
(PRODUCT 32 + DESIGN 146) and believes it is fully briefed, while the self-declared
visual authority (603 lines) and the self-declared canonical anti-reference registry
(209 lines) go unread. This is not ambiguity an agent can detect — CLAUDE.md's table is
phrased as complete.

**Why it matters HERE.** CLAUDE.md is loaded automatically into every session; the
"Context loading" table is the primary routing mechanism in the repo and is
authoritative by construction. A wrong row is worse than a missing row.

**Concrete risk.** UI work lands that violates DESIGN_SYSTEM's information hierarchy or
motion rules, is caught at audit, and is reworked — or worse, is not caught, because the
auditor used the same table.

**Recommended direction.** Rewrite the row as
`UI/visual work | DESIGN_SYSTEM.md (visual/interaction authority) → DESIGN.md (base
tokens) → docs/architecture/PRODUCT_PRINCIPLES.md §5 (anti-references)`, and reduce
PRODUCT.md's Anti-references section to a pure pointer.

**Migration difficulty.** Trivial (1 table row + 1 paragraph).
**Best mechanism.** Cleanup (doc edit).
**Acceptance condition.** Every root-level `*.md` that declares itself an authority is
reachable from CLAUDE.md's table in one hop.

---

### F-4 — Three canonical docs point the reader at a ledger that was superseded

**Category:** Documentation source of truth · **CONTRADICTION**
**Severity:** Medium · **Scope:** Repeated (3 canonical docs + 1 command)

**Evidence**
- `CLAUDE.md:92` — `SDD run artifacts live in \`.superpowers/sdd/\` (only
  \`progress.md\` is tracked).`
- `docs/engineering/sdd-orchestration.md` ("Artifacts and where they live") —
  `\`.superpowers/sdd/progress.md\` — the ledger, the single source of run truth.
  **Git-tracked** (everything else in \`.superpowers/sdd/\` is gitignored).`
- `docs/engineering/git-workflow.md` (release playbook step 1) — `…its final audit is
  PASS in the ledger (\`.superpowers/sdd/progress.md\`).`
- `.claude/commands/release-develop-main.md:8` — same path.
- `.claude/commands/sdd-run.md` step 1 — same path.
- **Reality**, `.superpowers/sdd/progress.md:1-5` —
  `> **Back-merge note (2026-08-06 …).** … Runs from RFC-018 onward keep their own
  durable ledger at \`.superpowers/rfc-XXX/dev-log.md\`; the next run overwrites this
  file.`
- Confirmed by `git ls-files ".superpowers/*"` →
  `.superpowers/rfc-018/dev-log.md`, `.superpowers/rfc-019/dev-log.md`,
  `.superpowers/rfc-020/dev-log.md`, `.superpowers/sdd/progress.md`.
  `progress.md` still contains the **RFC-017** run and never mentions RFC-018/019/020 as
  runs.

**Observed pattern.** The convention changed at RFC-018 (three runs ago) and the change
was recorded *inside the artifact that was superseded*, never propagated up to the four
documents that route agents to it.

**Concrete risk.** The release playbook's first gate — "verify final audit PASS in the
ledger" — will be executed against a file describing a *different, paused* run
(`progress.md` still reads **"RUN PAUSED here at the owner's request"** for RFC-017),
producing either a false negative that blocks a valid release or a false positive read
of the wrong run.

**Recommended direction.** One-line fix in all four: the ledger is
`.superpowers/rfc-XXX/dev-log.md` for the current run; `.superpowers/sdd/progress.md`
is retained as the pre-RFC-018 archive.
**Migration difficulty.** Trivial. **Best mechanism.** Cleanup + Convention.
**Acceptance condition.** `grep -rn "sdd/progress.md" docs/ .claude/ CLAUDE.md` returns
only lines that describe it as historical.

---

### F-5 — Nothing canonical tells a fresh agent that `main` and `develop` have diverged by ~400 commits

**Category:** Documentation source of truth / agent ergonomics
**Severity:** High · **Scope:** Systemic

**Evidence**
- `docs/architecture/ROADMAP.md` phase table header — `## Fases de Evolución (Ramas de
  Integración) — bloque RFC-001..013, **COMPLETADO**`
- `git log --oneline --merges origin/main -12` → newest merges on `main` are
  `b8d220f #54 claude/lotaje-v2-core`, `ad80b9f #53 claude/calculadora-riesgo`,
  `b8ae481 #52 docs/backmerge-rule`, `35e43da #48`, `5bc2f08 #49`, then jumps straight
  back to `7b5e977 #14`. **No RFC PR (#15–#47) is on `main`.**
- `git branch -a --contains 98c49c6` (the RFC-013 merge cited in git-workflow.md) →
  lists `develop` and feature branches; **`main` is absent.**
- `docs/engineering/git-workflow.md` — `> Status note (2026-07-06): the RFC-008..013
  block is fully merged to develop (PR #32 @ \`98c49c6\`); this release PR is the pending
  next step.` — still accurate, 5 weeks stale, and buried under a release playbook.
- The only unambiguous statement of the divergence is `.superpowers/sdd/progress.md:1154`
  — `\`origin/main\` is ~400 commits behind \`develop\`. Nothing from RFC-014..019 exists
  on this…` — **line 1154 of a 1,656-line run ledger for a different RFC.**
- `ROADMAP.md` also has no row for **RFC-020** (`grep -n "020" docs/architecture/ROADMAP.md`
  → no match) although `docs/architecture/rfcs/020-lotaje-position-sizer.md` exists and
  shipped.
- `ROADMAP.md` Mastery Block still lists RFC-014/015/016 as forward-looking
  ("Drafts for the three RFCs: RFC-014_AND_BEYOND.md … Each RFC graduates to
  `docs/architecture/rfcs/` on acceptance"), while all three already sit in
  `docs/architecture/rfcs/` (`ls docs/architecture/rfcs/` → 014-, 015-, 016-…).

**Why it matters HERE.** This is the single largest fact about the repository's current
state, and it is the one fact the routing docs do not carry. The two-track git flow in
`CLAUDE.md:76-78` only makes sense once you know main ≠ develop; an agent that does not
know will reason about "production behaviour" from `develop` code.

**Concrete risk.** A product fix branched from `origin/main` (per the documented rule)
against a bug an agent reproduced on `develop` may target code that does not exist on
main, or may re-fix something already fixed. The `main↔develop` ancestry damage recorded
elsewhere shows this class of problem already cost real work.

**Recommended direction.** Add a 4-line "Current state" block at the top of CLAUDE.md:
what is on main, what is on develop, what the pending release is. Update the ROADMAP
phase table to mark RFC-014..020 and their branch status; delete or archive the
`RFC-014_AND_BEYOND.md` drafts pointer.
**Migration difficulty.** Low. **Best mechanism.** Cleanup + Convention (a release-day
checklist item already exists in git-workflow.md step 5: "update
`docs/architecture/ROADMAP.md` phase table status" — it just is not being run).
**Acceptance condition.** A fresh agent can answer "is RFC-018 in production?" from
CLAUDE.md + ROADMAP.md alone.

---

### F-6 — Logging/debug hygiene is excellent (non-finding), with one small gap

**Category:** Logging & debug code · **Severity:** Low · **Scope:** N/A

**Evidence**
- `console.*` in all of `emulador/src`: **2 occurrences.**
  `emulador/src/main.ts:5` — `bootstrapApplication(App, appConfig).catch((err) =>
  console.error(err));` (legitimate, framework-idiomatic).
  `emulador/src/app/state/telemetry/telemetry.trading.jump-50-profile.spec.ts:243` —
  a profiling `console.log` in a proof spec (legitimately dev-only).
- `debugger`: 0. Ad-hoc debug flags: none found.
- `catch` blocks: 56, **zero empty** — errors are handled, not swallowed.
- **This is fine.** No cleanup warranted.

**The gap.** `emulador/eslint.config.js` has **no `no-console` rule** (the file was read
in full; rules are limited to `@angular-eslint/directive-selector`,
`@angular-eslint/component-selector`, plus a spec-file override turning off
`no-explicit-any` / `no-empty-function`). The current cleanliness is discipline, not
enforcement. Second-order observation: there is also **no logger service and no
Angular `ErrorHandler`** (`grep -rn "ErrorHandler"` → 0 hits; `find -iname "*logger*"` →
0 hits), so a runtime failure in production is invisible. That is a deliberate-looking
choice for a personal-use app and is *not* recommended as debt to pay — but it should be
a written decision rather than an accident.

**Recommended direction.** Add `'no-console': ['error', { allow: [] }]` to the `**/*.ts`
block with an override permitting it in `**/*.spec.ts` and `src/main.ts`. Cost: ~4 lines.
**Best mechanism.** Lint rule.
**Acceptance condition.** `npm run lint` fails on a newly added `console.log` in app code.

---

### F-7 — Commented-out code: zero. Dead-code markers: two, both self-declared

**Category:** Comments · **Severity:** Low · **Scope:** Local

**Evidence**
- Commented-out code: **0** (strict grep above returned empty). Genuinely clean.
- TODO/FIXME/HACK/XXX/@deprecated total **4**, all located:
  - `app/domain/chart/chart-engine.ts:24` —
    `// TODO: Eliminar esta exposición directa en RFC-004/RFC-005 una vez que
    DrawingsCapability y TradingCapability estén implementados.`
    **STALE**: both capabilities exist —
    `app/domain/chart/capabilities/drawings-capability.ts` and
    `.../trading-capability.ts` (`ls app/domain/chart/capabilities/`). RFC-004 and
    RFC-005 merged long ago. The TODO's precondition was met and the cleanup never
    happened; the `chartApi`/`seriesApi` escape hatches at `chart-engine.ts:25-31` are
    still public and still breach the closed-core invariant's spirit (CLAUDE.md
    invariant #2).
  - `app/state/link-groups/link-groups.models.ts:28` — `@deprecated RFC-018 D18.A —
    read-tolerated, never applied, never re-emitted.` (correct, intentional)
  - `app/state/market/custom-timeframe.ts:23` and `:48` — two `@deprecated` aliases with
    working replacements named. Fine.
- Self-declared dead selector: `app/state/selectors.ts:423-425` says `selectTradeChartView`
  "may have no production consumer left". **Verified**: `grep -rn "selectTradeChartView"`
  → the only non-comment references are `app/state/selectors.ts:427` (definition) and
  `app/state/selectors.spec.ts` (5 test call sites). **It is spec-only code**, exactly
  the pattern `docs/engineering/anti-patterns.md` #7 warns about ("Planning around dead
  code"), and its own comment says dismantling it is a different task's job.

**Concrete risk.** Low individually; the pattern matters because anti-patterns.md #7 is
about being *misled* by a well-named live-looking function, and the repo now contains
one, flagged and left.

**Recommended direction.** Either delete `selectTradeChartView` + its spec block, or
change the comment from "kept alive per R18-14" to a dated, ticketed deferral. Re-open
the `chart-engine.ts:24` TODO as a real decision: remove the escape hatches or document
them as a permanent accepted exception with an invariant note.
**Best mechanism.** Cleanup (selector) + ADR/RFC note (escape hatches).
**Acceptance condition.** No `.ts` symbol in `emulador/src/app` is referenced only by
specs; `grep -rn "TODO" --include="*.ts"` returns 0 or only dated/ticketed entries.

---

### F-8 — `.claude/worktrees/` is 152,368 files of stale repo copies inside the repo

**Category:** Agent ergonomics / token waste
**Severity:** High · **Scope:** Systemic

**Evidence**
- `git worktree list` →
  ```
  .claude/worktrees/dreamy-gagarin-afe569       f57ed8d [docs/demo-data-pwa-plan]
  .claude/worktrees/eager-chaum-6000cb          0cbed9b (detached HEAD)
  .claude/worktrees/funny-diffie-89d75d         cc9891c (detached HEAD)
  .claude/worktrees/jovial-williamson-33d3c1    d07e049 [claude/playback-controller-phase1]
  .claude/worktrees/laughing-hofstadter-d9478e  30c2219 (detached HEAD)
  .claude/worktrees/sad-feynman-e57266          5b4c1a7 [claude/sad-feynman-e57266]
  .claude/worktrees/compassionate-villani-d2fc5b (empty)
  ```
  Branch names date these to the **offline-mode / R2-migration / playback-controller
  era** — i.e. before the entire RFC block.
- Per-directory file counts: 0 / 28,551 / 279 / 30,995 / 31,012 / 31,055 / 30,476 =
  **152,368 files**.
- Excluding `node_modules`: **286 markdown files** and **990 TypeScript files** — full
  stale copies of `docs/`, `CLAUDE.md`, and `emulador/src/app`.
- `dreamy-gagarin-afe569` still contains a `backend/` and `infra/` directory —
  the FastAPI backend that `CLAUDE.md:7` says no longer exists ("Login is required; there
  is no guest/offline mode").
- **`.gitignore`** covers them (`.claude/*` with allow-list exceptions), so git is clean.
- **`.claudeignore` does NOT** — it lists `.git/`, `node_modules/`, `dist/`, `.angular/`,
  `coverage/`, `.agents/`, `.impeccable/`, caches, `datos/`, `*.log` … and **no
  `.claude/worktrees/` entry**. `node_modules/` absorbs most of the mass, but the 286 md
  + 990 ts files are fully visible to agent search.

**Observed pattern.** Every `Grep`/`Glob` an agent runs over the repo root can return a
months-old copy of `CLAUDE.md`, `docs/architecture/ROADMAP.md`, or
`emulador/src/app/**`, indistinguishable in the result list from the live file except by
path prefix.

**Why it matters HERE.** The repository's entire documentation strategy is "the agent
finds the canonical doc". Seven shadow copies of every canonical doc, from an era whose
architecture was explicitly deleted (offline mode, FastAPI backend), directly attacks
that strategy. It is also the only place in this audit where an agent can be *actively
misled* rather than merely slowed.

**Concrete risk.** An agent greps for a rule, hits
`.claude/worktrees/dreamy-gagarin-afe569/CLAUDE.md`, and implements a retired
architecture. Combined with F-5 (no statement of current branch reality), there is no
cheap way for it to notice.

**Recommended direction.** `git worktree remove` / `git worktree prune` all seven
(none is on a live branch — `docs/demo-data-pwa-plan` and
`claude/playback-controller-phase1` are both long merged or abandoned). Then add
`.claude/worktrees/` to `.claudeignore` so future ones never pollute search.
**Migration difficulty.** Trivial — but it is a **deletion**, so it is owner-gated
(and `protect_paths.py` will correctly escalate any `rm` touching `.claude/`).
**Best mechanism.** Cleanup + Tooling (`.claudeignore` entry).
**Acceptance condition.** `find .claude/worktrees -name "*.md" | wc -l` → 0, and
`.claudeignore` contains `.claude/worktrees/`.

---

### F-9 — The documented pipeline gate uses a command that does not work on this machine

**Category:** Documentation / Windows trap
**Severity:** Medium · **Scope:** Repeated (3 places)

**Evidence**
- `which python` → `/c/Users/78701/AppData/Local/Microsoft/WindowsApps/python`
- `python --version` → `Python was not found; run without arguments to install from the
  Microsoft Store, or disable this shortcut from Settings > Apps > Advanced app
  settings > App execution aliases.` (**exit is a stub, not Python**)
- `py --version` → `Python 3.13.2`
- Yet: `CLAUDE.md:67-68` — `Pipeline changes: \`cd pipeline && python -m pytest -q &&
  ruff check . && ruff format --check .\``
- `.claude/commands/verify-gates.md` (last section) — `If the branch touches
  \`pipeline/\`: \`cd pipeline && python -m pytest -q …\``
- `.claude/settings.json` permissions allow **both** `Bash(py -m pytest *)` and
  `Bash(python -m pytest *)` — so the wrong one is pre-approved and will run
  unchallenged.
- The **hooks get it right**: `.claude/settings.json` invokes every hook as
  `py "${CLAUDE_PROJECT_DIR}/.claude/hooks/…"`. So the knowledge exists in the repo — in
  the one place that is not human-readable guidance.
- `docs/engineering/` contains **no Windows/PowerShell/environment document**
  (`ls docs/engineering/` → PHILOSOPHY, testing, anti-patterns, decision-frameworks,
  git-workflow, performance, sdd-orchestration + `domain/`).

**Why it matters HERE.** `decision-frameworks.md §10` states the rule this violates:
"Is it session-scoped agent state? → agent memory (**pointers only — promote anything
durable into the repo**)". The `python`-vs-`py` fact is durable, machine-level, and
currently lives only in agent memory and in a hook's argv.

**Concrete risk.** An agent runs the documented gate, gets a Microsoft Store banner
instead of a test result, and either (a) reports the gate as inconclusive, or (b) —
worse, given the repo's "never mask exit codes" rule exists precisely because this class
of thing happens — misreads it. Also a live example of an *executable* trap that no
document warns about.

**Recommended direction.** Fix the two command strings to `py -m pytest -q`, drop
`Bash(python -m pytest *)` from settings.json's allow-list, and create
`docs/engineering/environment.md` (Windows/PowerShell traps: `py` not `python`; Git Bash
vs PowerShell for the Bash tool; the cp1252/UTF-8 stdout trap that
`.claude/hooks/steering_context.py:12-19` already documents in a code comment; `.angular`
cache deletion for the optimizeDeps race already in `testing.md`).
**Migration difficulty.** Trivial. **Best mechanism.** Cleanup + a new vault doc.
**Acceptance condition.** Every command string in CLAUDE.md and `.claude/commands/`
executes successfully on a clean checkout of this machine.

---

### F-10 — `docs/engineering/` IS the vault, and it is good — but it is 2.6 % of the corpus and has three gaps

**Category:** Documentation source of truth · **Severity:** Medium · **Scope:** Systemic

**Evidence (quality — this is fine).** `PHILOSOPHY.md` (272), `testing.md` (78),
`anti-patterns.md` (113), `decision-frameworks.md` (101), `git-workflow.md` (80),
`sdd-orchestration.md` (79), `performance.md` (48), + `domain/` (502). All eight were
read in full. They are evidence-backed (every anti-pattern names the incident), they
cross-reference each other correctly, and `PHILOSOPHY.md §7` states an explicit
hierarchy: `PHILOSOPHY.md (why) → CLAUDE.md (kernel) → docs/engineering/*.md (playbooks)
→ docs/engineering/domain/*.md`. **This is a genuinely well-built engineering vault; it
does not need replacing.**

**Gap 1 — duplication between `testing.md` and `anti-patterns.md`.** Four of
anti-patterns' 16 entries restate testing.md sections nearly verbatim:
- anti-patterns #2 "Spec utilities imported by app code" ≡ testing.md "Prod-bundle
  contamination probe" (same detection: temp-import from `app.config.ts`, `npm run
  build`, look for expect-type/magic-string chunks).
- anti-patterns #4 ≡ testing.md "isolate:false discipline" item 2 (identical
  `vi.hoisted` + `vi.resetModules()` + dynamic import prescription).
- anti-patterns #5 ≡ testing.md item 1 (`overrideSelector` / `resetSelectors`).
- anti-patterns #6 ≡ testing.md "Lockfile integrity (npm 11.x)" (identical recovery:
  "restore verbatim from origin/main — never regenerate").
Not contradictory, but it doubles the maintenance surface: a future correction applied to
one will silently diverge from the other.

**Gap 2 — no environment/platform doc.** See F-9. Windows traps, the `py`/`python`
split, and the UTF-8-stdout trap live only in code comments and agent memory.

**Gap 3 — no debugging-procedures doc.** `PHILOSOPHY.md §4` gives the *loop* (reproduce →
mechanism → fix at the guaranteeing layer → verify under original conditions → name the
rule) and `testing.md` gives one concrete reproduction recipe (single fork + custom
sequencer + delete `node_modules/.vite`). Missing: how to debug the app itself — the
memory-recorded procedure "jsdom has no layout engine and `/calculadora` needs auth, so
dump real DOM → real stylesheets → fixed-size `overflow:auto` box → measure in browser"
is exactly the kind of hard-won procedure §6.1 says must be externalised, and it is not
in the repo. Same for "the unit suite has no layout engine, so CSS assertions pass
vacuously" — a *testing-validity* trap with no written home.

**Recommended direction.** Keep the vault; add `environment.md` and `debugging.md`; make
`anti-patterns.md` the index and let entries #2/#4/#5/#6 be one-line pointers into
`testing.md` rather than copies.
**Best mechanism.** Convention + two new vault docs.
**Acceptance condition.** Every rule stated in `docs/engineering/` appears exactly once;
`environment.md` and `debugging.md` exist and are routed from CLAUDE.md's table.

---

### F-11 — Agent context cost: 404 lines minimum, 1,500+ for real work, and no `AGENTS.md`

**Category:** Agent ergonomics · **Severity:** Medium · **Scope:** Systemic

**Measured context cost before a *safe* change** (all by `wc -l`):

| Task | Docs an agent must read per CLAUDE.md | Lines |
|---|---|---|
| Baseline (any non-trivial work) | steering.md (auto-injected, 32) + CLAUDE.md (100) + PHILOSOPHY.md (272) | **404** |
| + writing/fixing tests | + testing.md (78) + anti-patterns.md (113) | **595** |
| Panels/layout/sync change | baseline + workspace-panels.md (196) + 008-012 vision (227) | **827** |
| …with its RFC | + `017-compositional-panel-sync.md` (491) | **1,318** |
| UI/visual change (done *correctly*, cf. F-3) | baseline + DESIGN_SYSTEM (603) + DESIGN (146) + PRODUCT (32) + PRODUCT_PRINCIPLES (209) | **1,394** |
| Chart-engine capability | baseline + chart-engine.md (57) + relevant RFC (~33–491) | **494–952** |

That is **before opening a single source file** — and the first source file for a
lotaje/telemetry task is 1,723 / 521 lines at 19–47 % prose.

**Fresh-agent question test** (answered from the docs, with evidence):
- *Where does feature X live?* — **Good.** `CLAUDE.md:3-7` states `emulador/src/app`
  explicitly (and warns against repo-root `src/`); the domain docs name modules.
- *What owns this state?* — **Good.** `PHILOSOPHY.md §2.3` ("un dueño para cada dato") +
  `docs/architecture/DOMAIN_MODEL.md` (581).
- *Which tests matter?* — **Good.** `testing.md` "Test taxonomy" is explicit.
- *What may I change?* — **Good.** CLAUDE.md invariants 1–8 + `PHILOSOPHY.md §3.1`
  authority hierarchy + the STOP rule, all consistent across four documents.
- *How do I run validation?* — **Mostly good, one broken command** (F-9).
- *What traps exist?* — **Partial.** `anti-patterns.md` covers 16; the Windows and
  layout-engine traps are missing (F-10 gaps 2–3).
- *Which doc is canonical vs stale?* — **NO.** This is the failing answer. There is no
  status marker on any document. `docs/superpowers/plans/2026-06-16-modo-offline-emulador.md`
  (1,953 lines) describes offline mode, which `CLAUDE.md:7` says does not exist; nothing
  in the file says so. The only pointer is one sentence at the very end of
  `git-workflow.md` ("Era map"): *"Docs describing deleted features (offline/guest mode,
  demo-data PWA) are historical — check `git log` dates before trusting any
  pre-Supabase-Phase-3 doc."* Requiring `git log` archaeology to establish canonicity is
  the definition of guessing.

**`AGENTS.md`?** Does not exist (`ls AGENTS.md` → no such file; no
`.github/copilot-instructions.md` either). **Recommendation: do NOT add one.** CLAUDE.md
(100 lines) + steering.md (32, auto-injected) + `PHILOSOPHY.md §7`'s hierarchy already
constitute a coherent two-tier index, and `decision-frameworks.md §9` explicitly forbids
speculative tooling ("Only for a workflow that has already recurred ≥2 times"). A third
root index would become the 4th competing entry point and would be the first to rot. The
real fix is F-3 + F-5 (make the existing index correct), not a new index.

**Token-waste inventory (measured).**
- **Not a problem — this is fine:** exactly **1** barrel file, **1** committed generated
  artifact (57 lines, with a correct provenance header at
  `app/domain/sizing/asset-registry.generated.ts:1-3`), **1** shared fixture file (136
  lines). Structurally very lean; no cleanup warranted.
- **Real sources, in order of magnitude:** (1) `.claude/worktrees/` — F-8; (2)
  `docs/superpowers/plans` + `specs` — 79 files / 30,556 lines of historical narrative
  with no status marker, 63 % of the doc corpus; (3) comment mass in the 10 offender
  files — 2,272 lines, ~46 % misplaced or deletable (F-1/F-2); (4) `lotaje-view.ts`
  (1,723) and `chart.component.ts` (1,694) — files an agent cannot partially read
  safely; (5) `.superpowers/rfc-020/dev-log.md` at 2,630 lines is the single largest
  tracked markdown file in the repo, larger than every RFC combined for that feature.

**Recommended direction.** (a) Add a one-line status banner convention to
`docs/superpowers/**`: `> STATUS: HISTORICAL — shipped in PR #NN` or `> STATUS: DESCRIBES
A REMOVED FEATURE`. (b) Move `docs/superpowers/plans|specs` older than the current
release into `docs/superpowers/archive/`, which also removes them from casual glob
results. (c) Do not add AGENTS.md.
**Best mechanism.** Convention (status banner) + Cleanup (archive move).
**Acceptance condition.** Every file under `docs/` states its status in its first 3
lines; a fresh agent can classify any doc as canonical/historical without `git log`.

---

### F-12 — `.claude/` tooling is coherent and well-built (largely a non-finding)

**Category:** Agent tooling · **Severity:** Low · **Scope:** Local

**Evidence.** Read in full: `.claude/settings.json`, `steering.md`,
`commands/{branch-and-pr,release-develop-main,sdd-run,verify-gates}.md`,
`agents/{branch-auditor,sdd-implementer}.md` (listed, 36 lines each),
`hooks/steering_context.py` (head), `hooks/protect_paths.py` (head).

**What is good.**
- `steering.md` (32 lines) is a deliberate, self-documenting compression of CLAUDE.md,
  with the reason stated at `steering.md:3-6` ("Injected verbatim into every prompt …
  Keep it SHORT — every line spends context budget"). The duplication with CLAUDE.md is
  **justified**, not accidental — it is the auto-injected tier.
- `hooks/protect_paths.py:3-14` documents *the incident it exists to prevent* (a subagent
  deleting `fill_r2.py`) and correctly notes that steering text cannot reach subagents but
  a `PreToolUse` hook can. This is `PHILOSOPHY.md §2.7` ("los invariantes deben ser
  ejecutables") actually executed.
- `hooks/steering_context.py:12-19` documents the Windows cp1252 stdout trap and fixes it.
- `decision-frameworks.md §9`'s escalation ladder (doc → command → agent) is respected:
  4 commands, 2 agents, all for workflows that demonstrably recurred.

**The two defects.**
1. `.claude/commands/verify-gates.md` and `release-develop-main.md` carry the two stale
   references already filed as **F-4** (`sdd/progress.md`) and **F-9** (`python -m
   pytest`).
2. `.claude/hooks/__pycache__/` (4 `.pyc` files) sits inside the repo tree. Covered by
   `.gitignore`'s `__pycache__/` so git is clean; noted only for completeness.

**Recommended direction.** Fix the two lines. Otherwise leave this alone — it is the
healthiest subsystem audited.
**Best mechanism.** Cleanup.
**Acceptance condition.** No command file references a path or binary that does not
resolve.

---

## RESUME BRIEF

*(Self-contained. A fresh agent with zero conversation history can paste this and
continue.)*

### (a) Role and remaining scope

You are a Principal Engineer performing a **READ-ONLY** technical-debt audit of
`C:\Users\78701\Desktop\trading-emulator`, branch `develop`, HEAD `a2ca53b`.

**ABSOLUTE RULES.** Read-only on all repository source. The **only** writes permitted are
files under `C:\Users\78701\Desktop\trading-emulator\.superpowers\audit-2026-08-10\`
(untracked, survives session resets). Do not edit, refactor, format, delete, or create
anything else. Every claim needs `path/to/file.ts:line` evidence. Generate counts
mechanically and state the exact command. Separate MEASURED FACT / INTERPRETATION /
RECOMMENDATION. Be critical but do not inflate severity — "this is fine" is a valid
finding. App code is under `emulador/src/app` (NOT repo-root `src/`).

Your role is **Comments, Documentation Source-of-Truth & Agent-Context Auditor**. Six
investigation areas: (1) comment noise in non-spec TS, (2) comment noise in specs,
(3) logging & debug code, (4) documentation source of truth, (5) agent ergonomics,
(6) `.claude/` tooling coherence.

**Deliverable.** Continue this file
(`.superpowers/audit-2026-08-10/audit-comments-docs-agents.md`), keeping the TD-finding
block format: Finding name / Category / Severity (Critical|High|Medium|Low) / Scope
(Local|Repeated|Systemic) / Evidence (multiple `file:line`) / Observed pattern / Why it
matters HERE / Concrete risk / Recommended direction / Migration difficulty / Best
mechanism (Cleanup|Convention|ADR|RFC|Tooling|Lint rule|Test architecture) / Acceptance
condition. Then return a digest of **at most 130 lines** to the caller: top findings with
severity, the hard numbers, the counts table, and 3 highest-leverage recommendations.

### (b) Commands already run — DO NOT re-run these

Run from `C:\Users\78701\Desktop\trading-emulator\emulador\src` (the Bash tool's cwd
resets between calls — always use absolute paths or a leading `cd`).

```
find . -name "*.ts" ! -name "*.spec.ts" ! -name "*.spec-util.ts" | wc -l   → 206
  … -exec cat {} + | wc -l                                                 → 33411
  … -exec grep -hE "^\s*(//|/\*|\*)" {} + | wc -l                          → 6535
find . -name "*.spec.ts" | wc -l                                           → 182
  … -exec cat {} + | wc -l                                                 → 43337
  … -exec grep -hE "^\s*(//|/\*|\*)" {} + | wc -l                          → 2473
grep -rnE "^\s*// *(const|let|var|if ?\(|return|this\.|import |export |function |await )" --include="*.ts" . | grep -E "(;|\{|\}|\)\s*)$"
                                                                           → EMPTY (0 commented-out code lines)
grep -rnE "console\." .                                                    → 2 hits (main.ts:5, jump-50-profile.spec.ts:243)
grep -rn "debugger" --include="*.ts" . | wc -l                             → 0
grep -rnE "catch\s*(\([^)]*\))?\s*\{\s*\}" --include="*.ts" .              → 0 (56 catch blocks total)
grep -rnE "(TODO|FIXME|HACK|XXX|@deprecated)" --include="*.ts" .           → 4 (listed in F-7)
grep -rn "ErrorHandler" --include="*.ts" . ; find . -iname "*logger*"      → 0 / 0
grep -rnE "^\s*(//|\*|/\*).*(RFC[- ]?[0-9]{3}|RFC §)" (non-spec / spec)    → 282 / 81
grep -rnE "^\s*(//|\*|/\*).*\bD-?[0-9]{1,2}(\.[A-Z])?\b" (non-spec)        → 186
grep -rnEi "^\s*(//|\*|/\*).*\btask[- ]?[A-D]?-?[0-9]" (non-spec)          → 128
grep -rnEi "^\s*(//|\*|/\*).*(dev-log|task report|spike|§)" (non-spec)     → 188
find . -name "index.ts"                    → 1 (app/components/ui/index.ts)
find . -name "*generated*"                 → 1 (app/domain/sizing/asset-registry.generated.ts, 57 lines)
find . -iname "*fixture*"                  → 1 (app/testing/fixtures.ts, 136 lines)
which python → WindowsApps stub; python --version → "Python was not found"; py --version → Python 3.13.2
```

From `C:\Users\78701\Desktop\trading-emulator`:
```
git ls-files "*.md" | wc -l                → 151
git ls-files ".superpowers/*"              → 3× .gitignore, 3× rfc-01{8,9}/rfc-020 dev-log.md, sdd/progress.md
git ls-files ".claude/*"                   → 2 agents, 4 commands, 4 hooks, settings.json, steering.md
git worktree list                          → 7 worktrees under .claude/worktrees (listed in F-8)
git log --oneline --merges origin/main -12 → newest = #54, #53, #52, #48, #49, then #14 (NO RFC PRs on main)
git branch -a --contains 98c49c6           → develop + feature branches; main ABSENT
ls docs/architecture/rfcs/                 → 001..020 (21 files incl. the 008-012 vision doc)
grep -n "020" docs/architecture/ROADMAP.md → no match
grep -rn "file:///C:" docs/ *.md | wc -l   → 38 hits in 4 files (ROADMAP, RFC-014_AND_BEYOND, TRADER_KNOWLEDGE_MODEL, TRAINING_WORKFLOW) — machine-specific absolute links; NOT yet written up as a finding, do it
find .claude/worktrees -name "*.md" -not -path "*/node_modules/*" | wc -l  → 286
find .claude/worktrees -name "*.ts"  -not -path "*/node_modules/*" -not -path "*/.angular/*" | wc -l → 990
```

Per-file comment/LOC ranking (top 40 non-spec, top 20 spec) and the bucket classifier are
in the tables above. The classifier script is at
`<session scratchpad>/classify.py` — **it is gone after a session reset; the table in
this report is the durable record. Do not re-run it.**

### (c) Files already read, and the conclusion on each

**Read in full (do not re-read):** `CLAUDE.md` (100) · `.claude/steering.md` (32) ·
`docs/engineering/PHILOSOPHY.md` (272) · `testing.md` (78) · `anti-patterns.md` (113) ·
`decision-frameworks.md` (101) · `git-workflow.md` (80) · `sdd-orchestration.md` (79) ·
`performance.md` (48) · `docs/architecture/ROADMAP.md` (89) · `PRODUCT.md` (32) ·
`.claude/settings.json` · all four `.claude/commands/*.md`.
→ Conclusion: the engineering vault is high quality (F-10); CLAUDE.md's UI row is wrong
(F-3); the ledger path is stale in 4 places (F-4); ROADMAP is stale on RFC-014..020
(F-5); the pipeline gate command is broken (F-9).

**Read partially:** `DESIGN.md` (head 40 — YAML token registry, fine) ·
`DESIGN_SYSTEM.md` (head 45 — declares itself the visual single source of truth) ·
`README.md` (head 50 — accurate, current, good architecture diagram) ·
`emulador/README.md` (head 20 — **unmodified Angular CLI boilerplate**, candidate for
deletion or replacement) · `.superpowers/sdd/progress.md` (head 60 + greps — RFC-017 run,
PAUSED, superseded as the ledger) · `hooks/steering_context.py` + `hooks/protect_paths.py`
(heads — both excellent).

**Source files whose comments were dumped and classified:**
`lotaje/lotaje-view.ts` (head 260 read; comments 1-57 quoted) ·
`lotaje/companion-window.ts` (all 149 comment lines dumped) ·
`state/telemetry/telemetry.effects.ts` (head 140 + all comments dumped) ·
`state/selectors.ts` (all 195 comment lines dumped) ·
`components/chart/chart.component.ts` (first 90 comment lines dumped — **healthy**,
short field-level "why" docs; do not target for cleanup) ·
`state/trading/trading.models.ts` + `fill-engine.ts` (comments dumped — mid-quality,
RFC-14 §-references but tied to real semantics) ·
`domain/chart/chart-engine.ts:10-45` (stale TODO at :24) ·
`components/chart/chart-model-mapper.trade-gating.spec.ts:1-60` (audit-defence header).

**NOT read (the remaining work):** `services/session-sync.service.ts` (217 cmt),
`chart-model-mapper.service.ts` (238 cmt), `state/telemetry/telemetry-anchors.ts`
(131 cmt), `pages/sesiones/sesiones-page.component.ts` (186 cmt) — their bucket numbers
in the table are heuristic-only and want a hand check. Also unread: every doc in
`docs/architecture/` except ROADMAP/PRODUCT_PRINCIPLES-by-reference, and all 79 files in
`docs/superpowers/{plans,specs}`.

### (d) Dead ends and confirmed non-issues — do not spend time here

1. **Commented-out code: ZERO.** The loose regex from the original brief yields 27 hits;
   all 27 are prose continuation lines beginning with `if`/`for`/`return`/`this.`
   (e.g. `session-stats.sharpe.spec.ts:68` → `// variance = (1 + 0 + 1) / 2 = 1`).
   Settled. Do not re-investigate.
2. **Logging: essentially zero.** 2 `console.*`, 0 `debugger`, 0 empty catches. The only
   actionable item is the *absence* of a `no-console` lint rule (F-6).
3. **Structural token waste: absent.** 1 barrel, 1 generated file, 1 fixtures file. No
   giant committed fixtures, no vendored artifacts. This is fine.
4. **`.claude/` tooling: healthy.** Do not propose restructuring it (F-12). The
   steering.md ↔ CLAUDE.md duplication is deliberate and documented in-file.
5. **`AGENTS.md`: do not recommend creating one.** Reasoning and the governing rule
   (`decision-frameworks.md §9`) are in F-11.
6. **Spec comment noise is NOT systemic** — 5.7 % density overall vs 19.6 % in source.
   It concentrates in ~6 files. Do not generalise it into a systemic finding.
7. **`syncPriceScale` reserved-unimplemented invariant HOLDS** — verified:
   `grep -rn "syncPriceScale"` shows only `link-groups.models.ts:9,46,47` (carry-through,
   never defaulted) plus spec assertions. Same for `MAX_PANELS_PER_TAB = 8`
   (`state/layout/layout.models.ts:4`, enforced at `layout.reducer.ts:122,186`). Both
   RFC/code spot-checks PASSED — no finding.

### (e) ORDERED remaining steps

1. **Write up the `file:///C:/...` finding** (already measured: 38 hits across
   `docs/architecture/{ROADMAP,RFC-014_AND_BEYOND,TRADER_KNOWLEDGE_MODEL,TRAINING_WORKFLOW}.md`).
   Machine-specific absolute links that break in any other checkout and are unresolvable
   by an agent reading the doc. Severity Low, Scope Repeated, mechanism Cleanup.
2. **Hand-check the four unread comment-heavy files** (`session-sync.service.ts`,
   `chart-model-mapper.service.ts`, `telemetry-anchors.ts`,
   `sesiones-page.component.ts`) to firm up the bucket table beyond ±10 %. Dump comments
   with `grep -nE "^\s*(//|/\*|\*)" <file>`.
3. **Finish area (2)**: read `pages/calculadora/calculadora-page.component.spec.ts`
   (236/819 = 29 %) and `state/trading/ambiguous-kpi.spec.ts` (63/177 = 36 %) and produce
   a spec-specific bucket split. Hypothesis to test: spec comments are mostly *legitimate*
   (they state the invariant a test defends, which is exactly right) except for the
   audit-defence headers already found (`trade-gating.spec.ts:15-34`,
   `journal-viz/*.spec.ts` "T6 review fix wave").
4. **Spot-check 4 more RFCs against code** (area 4 requirement, 2 of ~6 done). Best
   candidates, in order: `rfcs/017-compositional-panel-sync.md` (D17.A–L vs
   `state/drawings/`), `rfcs/018-trade-visibility-refinement.md` (D18.A–E vs
   `link-groups.models.ts:28` + `chart.component.ts:393-423`),
   `rfcs/014-simulacion-alta-fidelidad-telemetria.md` (D14.A–F vs `selectors.ts:622-823`
   + `fill-engine.ts`), `rfcs/020-lotaje-position-sizer.md` (§7.1 item 6 framework-purity
   claim vs `grep -rn "@angular\|@ngrx" emulador/src/app/lotaje/`).
5. **Sample `docs/superpowers/plans/` for staleness** — do not read all 53. Read the
   first 30 lines of the 5 largest (`2026-07-TEDS-implementation-plan.md` 1997,
   `2026-06-16-modo-offline-emulador.md` 1953, `2026-07-01-rfc-008-panel-system-layout.md`
   1619, `2026-07-03-rfc-011-layout-persistence.md` 1031,
   `2026-07-02-rfc-010-synchronization.md` 1010) and check whether any carries a status
   marker. Expected answer: none does. That converts F-11's archive recommendation from
   inference to measurement.
6. **Finalise** and emit the ≤130-line digest.
