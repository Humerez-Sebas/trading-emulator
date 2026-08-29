## STATUS

**100% complete.**

**AREAS COMPLETE:** machine-specific links; spec comment buckets; RFC 014/017/018/020 content checks; five-plan archive sample.

**AREAS PARTIAL:** bucket splits are hand classifications with the original +/-10% caveat, not exact semantic measurements.

**AREAS NOT STARTED:** pipeline comment audit; outside the strategic payoff and not required for synthesis.

## FINDINGS SO FAR

The original established that process narration, stale routing metadata, and shadow worktrees dominate agent-context debt.
It also found the permanent engineering vault strong and explicitly rejected adding `AGENTS.md`.
This addendum proves portability/status drift and closes the spec-comment/archive samples.

### F-13 - Machine-specific absolute links are committed in four architecture documents

- **Finding name:** `file:///C:/` documentation links
- **Category:** Documentation portability
- **Severity:** LOW
- **Scope:** repeated, four tracked docs
- **Evidence:** exact command `git grep --count -F "file:///C:/" -- "*.md"` -> `docs/architecture/RFC-014_AND_BEYOND.md:7`, `ROADMAP.md:4`, `TRADER_KNOWLEDGE_MODEL.md:24`, `TRAINING_WORKFLOW.md:3`; total 38 occurrences.
- **Observed pattern:** links encode one Windows checkout and external scratch locations.
- **Why it matters HERE:** architecture docs are intended to brief agents in clean clones and remote environments.
- **Concrete risk:** links fail elsewhere; unavailable external targets look canonical but cannot be opened.
- **Recommended direction:** replace repository targets with relative links; label unavailable external targets as historical references.
- **Migration difficulty:** TRIVIAL
- **Best mechanism:** Documentation cleanup
- **Acceptance condition:** tracked Markdown contains zero `file:///C:/` links.

### F-14 [SEQ] - RFC status headers remain pending after code ships

- **Finding name:** RFC first-screen status drift
- **Category:** Documentation source of truth
- **Severity:** HIGH
- **Scope:** RFC-017/018/020; RFC-014 control
- **Evidence:** RFC-018 says pending at `rfcs/018-trade-visibility-refinement.md:5`, while `layout.models.ts:61-78`, `chart-model-mapper.service.ts:583-618`, and `chart.component.ts:396-419` implement its decisions. RFC-020 says pending at `rfcs/020-lotaje-position-sizer.md:5`, while `lotaje/persistence.ts:27`, `asset-registry.generated.ts:20+`, and `lotaje-view.spec.ts` prove shipment. RFC-017 says final audit pending at `rfcs/017-compositional-panel-sync.md:5`, despite supersession/shipment notes at `:193-218`. RFC-014's implemented status at `rfcs/014-simulacion-alta-fidelidad-telemetria.md:5` is accurate.
- **Observed pattern:** bodies gain detailed notes; first-screen metadata is not closed at merge.
- **Why it matters HERE:** RFC headers decide whether an agent treats text as proposal or deployed contract.
- **Concrete risk:** implemented behavior is re-planned or pending prose is mistaken for live truth during RFC sequencing.
- **Recommended direction:** require status/date/PR update during RFC finalization.
- **Migration difficulty:** TRIVIAL
- **Best mechanism:** Merge checklist convention
- **Acceptance condition:** every RFC header accurately states implemented/pending/superseded and links its merge/successor.

### F-15 - The five largest implementation plans have no historical-status marker

- **Finding name:** Dispatchable-looking historical plans
- **Category:** Agent-context hygiene
- **Severity:** HIGH
- **Scope:** `docs/superpowers/plans/`
- **Evidence:** first-screen sample of the five largest plans found 0/5 status banners: TEDS (1,997 lines), offline mode (1,953), RFC-008 (1,619), RFC-011 (1,031), RFC-010 (1,010). The offline plan still instructs guest/offline creation at `plans/2026-06-16-modo-offline-emulador.md:1-9`, contrary to `CLAUDE.md:7`; retirement is documented elsewhere.
- **Observed pattern:** completed, superseded, and deleted-feature plans remain visually dispatchable.
- **Why it matters HERE:** plans/specs/ledgers are 76% of the documentation corpus and dominate search results.
- **Concrete risk:** a fresh agent executes obsolete architecture against current code.
- **Recommended direction:** add a first-three-lines `CURRENT|HISTORICAL|SUPERSEDED|REMOVED FEATURE` banner and archive retired plans; do not add another root index.
- **Migration difficulty:** LOW mechanically, MEDIUM classification effort
- **Best mechanism:** Convention plus archive cleanup
- **Acceptance condition:** every `docs/superpowers/**` artifact declares status before substantive content.

### F-16 - Comment debt remains concentrated in process narration, including selected specs

- **Finding name:** Hand-checked spec comment buckets
- **Category:** Knowledge placement
- **Severity:** MEDIUM
- **Scope:** three comment-heavy specs plus production control
- **Evidence:** exact comment totals from the original command; hand classification +/-10%: `calculadora-page.component.spec.ts` 236 = KEEP 62 / REWRITE 57 / MOVE 62 / DELETE 55; `chart-engine.spec.ts` 92 = 51 / 26 / 11 / 4; `lotaje-view.spec.ts` 193 = 119 / 45 / 20 / 9. Production control `sesiones-page.component.ts` remains approximately 83 / 87 / 16 / 0 across 186 comments.
- **Observed pattern:** test-mechanism rationale is valuable; audit-defense headers, wave/task history, removed-assertion narratives, and reviewer salutations are not.
- **Why it matters HERE:** boundary-test explanations should survive, but SDD process nouns obscure the mechanism future agents need.
- **Concrete risk:** legitimate invariant documentation becomes indistinguishable from historical advocacy.
- **Recommended direction:** retain setup hazards/regression mechanisms; move task history and deletion accounting to RFC ledgers.
- **Migration difficulty:** MEDIUM
- **Best mechanism:** Focused cleanup plus SDD source-comment convention
- **Acceptance condition:** spec headers explain present mechanics without `Wave N`, auditor defenses, or gitignored-artifact references.

## RESUME BRIEF

- **Role/scope:** read-only comments/docs/agent-context audit at `develop` / `a2ca53b`.
- **Commands/output:** `git grep --count -F "file:///C:/" -- "*.md"` -> 38 in four docs; five largest plans sampled -> 0 status banners.
- **Content checks:** RFC-014 accurate; RFC-017/018/020 status headers stale while implementation spot-checks pass.
- **Dead ends:** do not recreate classifier, recheck commented-out code, add AGENTS.md, or restructure healthy Claude tooling.
- **Remaining steps:** synthesis only; fix existing routing/status metadata rather than adding documentation systems.
- **Digest spec:** <=130 lines with original routing/worktree findings plus F-13-F-16 and the three highest-leverage doc changes.
