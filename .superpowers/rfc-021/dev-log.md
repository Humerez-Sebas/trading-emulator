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
- **Inert — the CI wiring is inside the cutover commit.** RFC §6 says the cutover is "seguido por
  el cableado de CI"; `ci.yml`, `.npmrc` and the `CLAUDE.md` note landed in the cutover commit
  itself, because without them that commit cannot install its own dependency (audit finding L2).

## §5 — CI on the PR (#70)

`Frontend (lint · tests · build · audit)` pass · `Pipeline (lint · tests)` pass (ruff clean,
pytest 111 passed) · `Vercel` pass (preview deployed, so the token works on Vercel) ·
`Deploy (Vercel · prod)` skipped, as on every PR. No CodeQL check runs on PRs to `develop`.

## §6 — Final audit (`branch-auditor`, fresh context, 2026-11-11)

**Verdict: PASS** — zero Critical, High or Medium. The auditor re-ran all seven gates itself
(same numbers as §2), confirmed the test arithmetic, confirmed the three legacy source files
differ from kernel `v1.0.0` only in import specifiers and one header comment, and ran a seeded
differential fuzz of the pre-extraction sources against the installed package: 200 000 calls
across the eight functions, NaN and infinities included, 0 differences.

| Finding | Severity | Resolution |
| :--- | :--- | :--- |
| L1 — the contract spec pinned no literal for `lotsForRiskDistance`, `riskUsdFor`, `priceDistance`; the calculator's own specs compare against the package, so a kernel bump could change them silently | Low | **Fixed**: one literal test added to `sizing-kernel.contract.spec.ts`, values taken from the pre-extraction spec. Tests 2672 → 2673. |
| L2 — the CI wiring landed in the cutover commit, not after it as RFC §6 says, and §4 did not record it | Low | **Fixed**: recorded in §4. |

Not verified by the auditor: the Vercel preview smoke (below), and that the published `1.0.0`
tarball is a rebuild of tag `v1.0.0` (behaviour equality with the old sources was verified
instead).

## §7 — Vercel preview smoke (RFC §6 item 5) — done 2026-11-11

Preview of this branch (`emulador-git-feature-rfc-021-sizing-kernel-extraction-…vercel.app`),
the owner signed in himself. `/calculadora`, asset US30, account 50 000 USD, risk 1 %, mode
Distancia, 50 pts → "Riesgo en USD $500.00" and **10.00 lotes**. No console error. That is the
owner's reference example (1 % of 50k with a 50-point stop is 10 lots) computed by the deployed
bundle with the package installed by Vercel.

## §8 — Remaining

1. Merge to `develop`. The `develop → main` release is the owner's call.
2. Owner: rotate `NPM_GITHUB_TOKEN` (§4).
