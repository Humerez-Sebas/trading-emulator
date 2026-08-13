# Wave 2 - Final Closeout Index

Wave 2 is closed as an evidence campaign. This is an index, not an instruction to resume
implementation or merge branches.

## State

- Canonical `develop` and `origin/develop`: `a2ca53b44f678dd285cd90f31ee644696664f32a`
  at final reconciliation.
- Specialist base: `894d72be95f8ad4b8d63e629114e486e825b13d7`.
- Integration worktree/branch: `trading-emulator-wave2-base` /
  `agent/evolution-wave2-base`.
- No specialist branch was merged, pushed, rebased, squashed, or deployed during final
  closeout. `develop` was never mutated.

## Final Artifacts

1. `WAVE2-SYNTHESIS.md`: authoritative A-K final synthesis, verification matrix, branch
   dispositions, owner decisions, remaining defects, and integration order.
2. `WAVE2-STATE.md`: chronological orchestration ledger, including interruption and final
   A/C acceptance evidence.
3. `WAVE2-CLOSEOUT-RESUME.md`: historical pause handoff; retained as evidence, not current
   status.
4. `TRACK-A-CLOSEOUT-BRIEF.md` and `TRACK-C-CLOSEOUT-BRIEF.md`: resolved review briefs.

## Branch Heads

| Track | Branch | Final head | Disposition |
|---|---|---|---|
| Landing | `agent/landing-product-showcase` | `161e9f5` | Merge separately; deployed to its own Vercel project |
| A session sovereignty | `agent/session-sovereignty-v2` | `2630294` | **MERGE AS-IS**; accepted implementation `498646b` |
| B multi-symbol | `agent/multisymbol-feasibility` | `3ae5935` | **RESEARCH ONLY** |
| C engine boundary | `agent/engine-boundary-restoration` | `66211cc` | **MERGE AS-IS**; accepted implementation `b06fb62` |
| D unit semantics | `agent/unit-semantics` | `1984e5d` | **MERGE AS-IS** |
| E clock authority | `agent/clock-authority` | `cee6cff` | **MERGE AFTER D-E1 through D-E4** |

## Accepted Evidence

- A: independent review `ACCEPTED`, zero Critical/High/Medium; five gates green at
  186 files / 2483 tests; owner/A5/ack/login/v1 mutations restored.
- C: independent review `ACCEPTED`, zero Critical/High/Medium; five gates green at
  185 files / 2450 tests; generic-leak and import mutations restored.
- D: 35 cross-surface tests, four failing mutations and one measured refutation; no arithmetic
  or persisted-key change.
- B/E: independently verified research and executable probes; no unauthorized runtime fix.

## Owner Decisions

- Clock D-E1 through D-E4: trading-day semantics, CSV clock, names, and Spanish copy.
- Multi-symbol scope and RFC identity; view-only panels require no frozen-decision revocation.
- Unit vocabulary and any versioned persisted `ExecutionCosts.pointSize` rename.
- Landing Vercel SSO visibility and first production-target deployment disposition.

## Do Not Reopen

- XAUUSD Lotaje sizing is correct.
- Index `ExecutionCosts.pointSize = 1` is correct.
- Unit differences are vocabulary/transcription, not lot-size arithmetic divergence.
- Pipeline/storage partition reads are correct; `utc-4` winter behavior is intentional.
- Multi-symbol trading remains the frozen non-goal; view-only secondary panels are allowed.
- `syncTimeRange` logical-index transport and F19-2 remain future defects, not closeout work.

For any future integration, begin from current `origin/develop`, reconcile drift, merge only
the chosen branches, and run fresh combined app/spec tsc, full `ng test`, lint, and build. The
individual branch evidence does not prove a combined merge result.
