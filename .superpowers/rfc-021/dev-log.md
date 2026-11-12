# RFC-021 — Dev Log

**Run:** Sizing-kernel extraction to `@humerez-sebas/sizing-kernel` (private GitHub Packages)
**Branch:** `feature/rfc-021-sizing-kernel-extraction`, from `origin/develop` @ `5b400e0`
**Date opened:** 2026-11-11
**Language:** English (agent artifact)

This log records the **run**, not the product. Product decisions live in RFC-021
(`docs/architecture/rfcs/021-extraccion-sizing-kernel.md`, D.21.1 – D.21.6).

---

## §1 — Run shape

Single lead session, no implementer subagents: the cutover is type-coupled (every import of
`domain/sizing/*` moves in one commit or nothing compiles), so there was no independent slice to
delegate. Four commits:

| Commit | Content |
| :--- | :--- |
| `docs(rfc-021)` | The RFC (Spanish, repo convention) |
| `refactor(rfc-021)` | Atomic cutover: imports → package, `domain/sizing/` and `pipeline/export_symbols.py` deleted, two detectors added, CI + `.npmrc` token wiring |
| `chore(rfc-021)` | `emulador/package-lock.json` for the new dependency |
| `chore(sdd)` | This ledger |

The kernel itself was extracted with history (`git filter-repo`, 13 original commits) into
`Humerez-Sebas/sizing-kernel`; legacy function bodies are unchanged there (the diff shows import
specifiers only). `v1.0.0` is published and is the exact version pinned here.

## §2 — Verified ground truth (measured on the owner's Mac, 2026-11-11)

All commands run raw from `emulador/`, exit status read directly.

| Gate | Command | Result |
| :--- | :--- | :--- |
| Typecheck app | `npx tsc -p tsconfig.app.json --noEmit` | exit 0 |
| Typecheck spec | `npx tsc -p tsconfig.spec.json --noEmit` | exit 0 |
| Tests | `npx ng test --watch=false` | exit 0 — **202 files / 2672 tests** |
| Lint | `npm run lint` | exit 0 — all files pass |
| Format | `npm run format:check` | exit 0 |
| Prod build | `npm run build` | exit 0 — initial total **676.11 kB** |
| Lockfile | `npm ci --dry-run` | exit 0 |

**Test-count delta against the `5b400e0` baseline (203 files / 2699 tests):** −34 tests in the two
deleted specs (`asset-registry.spec.ts`, `position-sizing.spec.ts` — they now run in the kernel
repo next to 180 golden vectors) and +7 in the new `sizing-kernel.contract.spec.ts`.
2699 − 34 + 7 = 2672.

**Bundle:** the same production build on a clean `5b400e0` worktree also measures
**676.11 kB** initial, chunk for chunk (same raw sizes, different hashes). The extraction adds
0 bytes to the initial graph; the calculator stays a lazy chunk (47.28 kB). The `651.60 kB @
a2ca53b` figure in `CLAUDE.md` predates this branch's base and is stale by 24.51 kB that this run
did not introduce — see §4.

**Lockfile diff:** +10 lines, the one new package entry. No optional-dependency pruning.

**Pipeline gates** (`pytest`, `ruff`) could not run on the Mac (no `pytest`/`ruff` outside the
Wine prefix). They ran on identical content in the previous workspace (111 passed, ruff clean)
and are re-established by the CI `Pipeline` job on the PR; the PR is not mergeable without it.

## §3 — Token wiring (D.21.4) — names and locations only

| Place | Name | State |
| :--- | :--- | :--- |
| Local shell | `NPM_GITHUB_TOKEN` in `~/.zshenv` | set |
| GitHub Actions | repo secret `NPM_GITHUB_TOKEN` | set |
| Vercel | env var `NPM_GITHUB_TOKEN`, all environments | set by the owner |

## §4 — Deviations and flags

- **Needs attention — token rotation.** The token value was printed once into a tool transcript by
  an npm error during the previous session (a stray carriage return in the stored value produced
  the error). It is `read:packages` only, but it should be rotated in the three places of §3.
  Human task.
- **Needs attention — stale bundle baseline in `CLAUDE.md`.** `develop` already measures
  676.11 kB, not 651.60 kB. Not changed in this PR (it is not this RFC's growth and the kernel
  file deserves its own measured edit); whoever touches the budget next should re-attribute the
  24.51 kB.
- **Inert — the lockfile is its own commit, one after the cutover.** The plan was to amend it into
  the cutover commit; the amend was not permitted in this session, so it follows as
  `chore(rfc-021)`. Consequence: the cutover commit alone does not pass `npm ci` (package.json and
  lockfile disagree for exactly one commit) — a bisect across it must skip to the next commit.
  The branch tip, which is what CI and the merge see, is consistent.

## §5 — Remaining

1. CI on the PR: Frontend, Pipeline, CodeQL, Vercel preview.
2. Vercel preview smoke: load `/calculadora`, compute a lot.
3. Independent review (`branch-auditor`), verdict recorded here.
4. Merge to `develop`. The `develop → main` release is the owner's call.
