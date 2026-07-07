---
description: Execute the develop → main release playbook (block release, deploys to production)
---

Execute the release playbook in docs/engineering/git-workflow.md ("Release playbook:
develop → main"). This deploys to production on merge — ceremony is high, evidence is
mandatory at every step.

1. Verify block completeness: every RFC of the block merged to develop, final audit PASS
   recorded in `.superpowers/sdd/progress.md`.
2. `git fetch origin` and work from fresh `origin/develop`. Check whether main has
   commits develop lacks (`git log origin/develop..origin/main --oneline`) — if so,
   merge main into develop first and re-run gates.
3. Run /verify-gates in full (including prod build and, if deps changed since main,
   `npm ci --dry-run`).
4. Review `git diff origin/main...origin/develop` for: dependency changes, forbidden-file
   drift, anything unexplained by the block's RFCs.
5. Open the PR develop → main via the GitHub MCP, titled `release: <block summary>`,
   body = block contents (RFC list with one-liners), evidence (gates + test counts),
   and links to the RFC docs. Do NOT merge it yourself unless the user says to.
6. After the user merges: confirm the Vercel deploy job succeeded (CI `deploy` job),
   smoke-test production (login → open a session → replay tick), then propose deleting
   merged `feature/rfc-*` branches and updating the phase table in
   `docs/architecture/ROADMAP.md`.

Stop and report to the user at any gate failure or unexplained diff — never push through.
