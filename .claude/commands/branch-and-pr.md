---
description: Start a correctly-based branch and open its PR to the right target (two-track flow per git-workflow.md)
---

Create a branch and (optionally) open its PR following docs/engineering/git-workflow.md.
Pick the track FIRST — the base, name pattern, and PR target all differ by track. Never
claim a gate passed without fresh evidence (see /verify-gates).

## 1. Classify the work → pick the track

| Work | Branch pattern | Base | PR target |
|---|---|---|---|
| RFC / architectural (governed by an RFC) | `feature/rfc-XXX-<slug>` | `origin/develop` | **develop** |
| Product feature / fix | `claude/<slug>`, `fix/<slug>`, `chore/<slug>` | `origin/main` | **main** |
| Docs | `docs/<slug>` | `origin/main` (or develop if it documents develop-only code) | main / develop |

If unsure whether the work is RFC-governed, check `docs/architecture/ROADMAP.md` and ask —
never default to main for architectural work.

## 2. Branch from a FRESH remote base

- `git fetch origin`
- Branch from `origin/<base>`, NEVER a local branch (local main has been 46 commits stale
  before and produced a diverged branch): `git switch -c <branch> origin/<base>`.
- Check `git status` — never sweep the user's unrelated dirty files (local
  `AlgoritmoEA.mq5`, `.env`, etc.) into this branch.

## 3. Commit

- Conventional, task-scoped messages: `feat(scope):`, `fix(scope):`, `chore(sdd):`.
- Under parallel actors sharing a worktree, use pathspec commits — `git add` / `git commit
  <explicit paths>` only, never `git add -A` (a shared index races otherwise).

## 4. Before opening the PR

- Run `/verify-gates` and capture fresh evidence (tsc app+spec, `ng test` count, lint 0
  problems, format). RFC branches must keep `develop` lint-clean.
- If `package.json`/lockfile changed: `npm ci --dry-run` (npm 11.x silently prunes
  optional-dep entries — see docs/engineering/testing.md).
- Do NOT PR an individual RFC to main. RFC branches only ever target develop; the
  `develop → main` block release is the separate `/release-develop-main` playbook.

## 5. Open the PR (GitHub MCP)

- Use the GitHub MCP; target the branch from the table.
- PR body: what / why, evidence (gate results + test counts), deviations from plan,
  reviewer-attention flags, and the standard generated-with footer.
- Stacked PR (an RFC depends on an unmerged RFC): open against the parent branch, then
  retarget to develop after the parent merges.
- Do not merge it yourself unless the user says to. Branch protection on `main` (required
  CI checks) has no MCP/CLI path — if it blocks, call it out as a human dashboard task.

Report: branch name, base commit, gate evidence, and the PR URL.
