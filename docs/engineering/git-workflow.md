# Git Workflow & Release Playbook

Applies PHILOSOPHY §3.4 (reversibility & ceremony) and §5.3 (smallest green step).

## Two-track flow

| Track | Branch pattern | PR target | When |
|---|---|---|---|
| Architectural (RFC) work | `feature/rfc-XXX-<slug>` | `develop` | Anything governed by an RFC |
| Product features / fixes | `claude/<slug>`, `fix/…`, `chore/…` | `main` | Everything else |
| Docs | `docs/<slug>` | `main` (or `develop` if they describe develop-only code) | — |

- `develop` is the integration branch for RFC blocks; `develop → main` happens **only**
  as a whole-block release PR. Never PR an individual RFC to main.
- `develop` is lint-clean (0 problems) — new branches must keep it that way.
- Stacked PRs are allowed when an RFC depends on an unmerged one (RFC-009 stacked on
  RFC-008): open the PR against the parent branch, **retarget to develop after the
  parent merges**.

## Branch hygiene rules

- **Always branch from `origin/<base>`**, never a local branch — local main was once 46
  commits stale and produced a diverged branch.
- Task-scoped commits, conventional messages (`feat(scope):`, `fix(scope):`,
  `chore(sdd):`). Keep task commits even in batched SDD mode — the auditor reviews per
  task.
- **Pathspec commits under parallel actors:** when an orchestrator and implementers share
  a working tree, `git add`/`git commit <explicit paths>` only — a shared index races
  otherwise.
- Never sweep the user's unrelated dirty files (e.g. local `AlgoritmoEA.mq5` edits) into
  a commit. Check `git status` before staging.
- Delete merged feature branches opportunistically; stale branches accumulate fast here.

## PRs

- Use the GitHub MCP for PR creation/updates and repo queries.
- PR body: what/why, evidence (test counts, gates), deviations from plan, and anything
  flagged for reviewer attention. End with the standard generated-with footer.
- CI (`.github/workflows/ci.yml`) runs pipeline (ruff + pytest + pip-audit) and frontend
  (lint + format + `ng test` + build + informational npm audit) on PRs to main and pushes
  to main. Vercel production deploy runs ONLY on push to main after checks pass
  (Vercel's own main auto-deploy is disabled to avoid double deploys; PR previews stay
  native Vercel).
- Branch protection on `main` requires the CI checks. Changing protection rules has no
  MCP/CLI path — it is a human dashboard task; plans must call it out as such.

## Release playbook: develop → main

Ceremony is high because this deploys to production (Vercel) on merge.

1. Confirm every RFC of the block is merged to develop and its final audit is PASS in
   the ledger (`.superpowers/sdd/progress.md`).
2. From fresh `origin/develop`, run ALL gates (tsc app+spec, `ng test`, lint, format,
   prod build) — the release PR re-establishes evidence; it does not inherit it.
3. Diff review develop..main for: forbidden-file drift, dependency changes
   (`package.json`/lockfile — verify `npm ci --dry-run`), and anything main-only that
   develop missed (hotfixes) — if main has commits develop lacks, merge main into
   develop first and re-run gates.
4. Open PR `develop → main` titled as a release (`release: RFC-008..013 multi-chart
   workspace`), body = block summary + evidence + link to RFC docs.
5. After merge: verify the Vercel deploy job succeeded, smoke-test the production URL
   (login → open session → replay tick), then delete merged `feature/rfc-*` branches and
   update `docs/architecture/ROADMAP.md` phase table status.

> Status note (2026-07-06): the RFC-008..013 block is fully merged to develop
> (PR #32 @ `98c49c6`); this release PR is the pending next step.

## Era map (for reading history)

PRs #1–14 are the product era (offline mode → R2 transition → Supabase 3-phase migration
→ playback controller → dock redesign), all targeting main; PRs #15–32 are the RFC era
targeting develop. Docs describing deleted features (offline/guest mode, demo-data PWA)
are historical — check `git log` dates before trusting any pre-Supabase-Phase-3 doc.
