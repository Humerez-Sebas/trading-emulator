# Distance Unit Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Method B size XAU/XAG stops in MT5 points while preserving index-point and FX-pip behaviour.

**Architecture:** MT5 `symbol_info().point` becomes generated registry data. The view-model owns one pure display-distance conversion at the boundary to the sizing kernel; the kernel continues to receive price units only. Its conversion is shared by derivation and Method A/B round trips, preventing a correct lot beside a false risk value.

**Tech Stack:** Python 3, MetaTrader5 Python API, TypeScript, Angular 21, Vitest through `ng test`, Ruff.

## Global Constraints

- Owner decision D.20.5 is binding: FX uses `pipSize`; XAU/XAG uses MT5 `pointSize`; indices and other non-FX use `1` price unit per displayed `pts`.
- `pointSize` comes from `symbol_info().point`; never infer it from `digits` or equate it to `tickSize`.
- Do not modify `position-sizing.ts`, add a unit selector, add dependencies, or duplicate sizing arithmetic.
- Do not access `.opencode/`, `.superpowers/calculadora/`, `.superpowers/rfc-018/`, or `.superpowers/rfc-019/`.
- Another actor owns PR creation. Wait for it to finish; do not amend, create, or edit the PR.
- Use explicit-path commits. The owner authorized a push to the existing PR branch after fresh gates, but a new whole-branch audit remains mandatory before merge.
- Run Angular commands sequentially and never run bare `npx vitest run`.

---

### Task 0: Reconcile the shared branch and preserve the approved handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-08-05-rfc-020-finalization-resume-prompt.md`
- Create: `docs/superpowers/specs/2026-08-05-distance-unit-semantics-design.md`
- Create: `docs/superpowers/plans/2026-08-05-distance-unit-semantics-implementation-plan.md`
- Local-only: `.superpowers/rfc-020/task-f21-2-brief.md`
- Local-only: `.superpowers/rfc-020/task-f21-2-implementation-prompt.md`

**Consumes:** the owner-approved D.20.5 artifacts already present in the shared worktree.

**Produces:** a measured clean baseline and a tracked durable design/plan before code changes.

- [ ] **Step 1: Wait for PR creation, then measure shared state**

Do not start while the PR actor is changing branch state. Once it finishes, run:

```text
git branch --show-current
git rev-parse HEAD
git rev-list --count origin/main..HEAD
git status --short --branch
```

Expected: branch `claude/lotaje-v2-core`. Reconcile any unexpected tracked change with its author; do not revert it. The two local `.superpowers/rfc-020/` handoffs are ignored on purpose and must not be staged.

- [ ] **Step 2: Commit only the durable approved decision artifacts**

```text
git add docs/superpowers/specs/2026-08-05-distance-unit-semantics-design.md docs/superpowers/plans/2026-08-05-distance-unit-semantics-implementation-plan.md docs/superpowers/plans/2026-08-05-rfc-020-finalization-resume-prompt.md
git commit -m "docs(sdd): record F21-2 distance unit decision"
```

Expected: the commit contains exactly the three `docs/` paths. Do not include the ignored brief/prompt or another actor's files.

---

### Task 1: Export and resolve MT5 point size

**Files:**
- Modify: `pipeline/export_symbols.py:69-85,124-137,182-212`
- Modify: `pipeline/tests/test_export_symbols.py:24-50,101-112,155-189`
- Modify: `emulador/src/app/domain/sizing/asset-registry.generated.ts`
- Modify: `emulador/src/app/domain/sizing/asset-registry.ts:36-55,103-137`
- Modify: `emulador/src/app/domain/sizing/asset-registry.spec.ts`

**Consumes:** `symbol_info().point` from the live MT5 terminal.

**Produces:** `AssetSpec.pointSize: number | null`, backed by generated MT5 data for curated symbols and `null` for heuristic symbols.

- [ ] **Step 1: Add failing Python extraction and render assertions**

Extend `SymbolInfoStub` and each realistic fixture with `point`, then assert extraction and generated text:

```python
assert por_simbolo["XAUUSD"].point_size == 0.01
assert "pointSize: 0.01," in contenido
```

- [ ] **Step 2: Run the focused pipeline test and confirm red**

Run: `python -m pytest -q tests/test_export_symbols.py`

Expected: failure because `AssetRecord` does not expose `point_size` and renderer output lacks `pointSize`.

- [ ] **Step 3: Implement direct MT5 export**

Add the raw field and use `info.point`, not a calculated substitute:

```python
@dataclass(frozen=True)
class AssetRecord:
    symbol: str
    contract_size: float
    tick_size: float
    point_size: float
    volume_step: float
    volume_min: float
    digits: int
    currency: str

# In fetch_asset_records(...)
point_size=float(info.point),
```

Emit `readonly pointSize: number;` and `pointSize: ...` beside `tickSize` in `render_ts`.

- [ ] **Step 4: Add failing TypeScript registry assertions**

Assert the resolved, generated values and the heuristic absence:

```ts
expect(resolveAsset('XAUUSD').pointSize).toBe(0.01);
expect(resolveAsset('US30').pointSize).toBe(0.01);
expect(resolveAsset('XAUEUR').pointSize).toBeNull();
```

- [ ] **Step 5: Expose the generated field without changing fallback authority**

Add the property to `AssetSpec`; generated/manual branches obtain it through their record spread and the heuristic branch sets `pointSize: null`.

- [ ] **Step 6: Regenerate, inspect and verify**

Run: `python export_symbols.py`

Before accepting the generated diff, confirm the live registry gives `pointSize: 0.01` for XAUUSD and US30. Stop and report if either value differs. Then run:

```text
python -m pytest -q tests/test_export_symbols.py
ruff check .
ruff format --check .
```

Expected: all commands pass.

- [ ] **Step 7: Commit the independently green data change**

```text
git add pipeline/export_symbols.py pipeline/tests/test_export_symbols.py emulador/src/app/domain/sizing/asset-registry.ts emulador/src/app/domain/sizing/asset-registry.spec.ts emulador/src/app/domain/sizing/asset-registry.generated.ts
git commit -m "feat(sizing): export MT5 point size"
```

### Task 2: Apply D.20.5 at the view-model boundary

**Files:**
- Modify: `emulador/src/app/lotaje/sizing-view-model.ts:76-86,103-114,219-242`
- Modify: `emulador/src/app/lotaje/sizing-view-model.spec.ts:37-97,232-301`

**Consumes:** `AssetSpec.pipSize`, `AssetSpec.pointSize`, `AssetSpec.symbol`, and the unchanged sizing kernel.

**Produces:** a single conversion used by `deriveLots` and `switchMethod` in both directions.

- [ ] **Step 1: Write failing D.20.5 tests**

Keep the existing US30 acceptance case unchanged. Add XAUUSD examples that prove the unit, normalized distance, lot and actual risk together:

```ts
const d = deriveLots(state({ balanceText: '5000', riskPctText: '1', symbolText: 'XAUUSD', distanceText: '10' }));
expect({ unit: d.unitLabel, distance: d.distance, lots: d.lots, risk: d.actualRiskUsd })
  .toEqual({ unit: 'pts', distance: 0.1, lots: 5, risk: 50 });
```

Add the equivalent cases for 14 (`0.14`, `3.57`, `49.98`), 7 (`0.07`, `7.14`, `49.98`) and 8 (`0.08`, `6.25`, `50`).

Add a round trip:

```ts
const fromDistance = switchMethod(state({ symbolText: 'XAUUSD', method: 'distance', entryText: '2650', distanceText: '10' }));
expect(fromDistance.slText).toBe('2649.9');
expect(switchMethod(fromDistance).distanceText).toBe('10');
```

- [ ] **Step 2: Run Angular tests through the supported runner and confirm red**

Run: `npx ng test --watch=false`

Expected: the new XAUUSD distance assertions fail under the existing `pipSize ?? 1` conversion.

- [ ] **Step 3: Implement exactly one unit policy**

Resolve once from the already-resolved asset and pass its multiplier to both conversion directions:

```ts
function priceUnitsPerDisplayUnit(asset: AssetSpec): number {
  if (asset.pipSize !== null) return asset.pipSize;
  if ((asset.symbol.startsWith('XAU') || asset.symbol.startsWith('XAG')) && asset.pointSize !== null) {
    return asset.pointSize;
  }
  return 1;
}
```

Keep `unitLabel` as `pips` only when `pipSize` is non-null, otherwise `pts`. Refactor `convertDistance` to receive this resolved multiplier. Do not modify the kernel or hand-compute risk.

- [ ] **Step 4: Run focused and full TypeScript checks**

Run:

```text
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npx ng test --watch=false
```

Expected: all commands pass and US30 still sizes 50 displayed points as 50 price units.

- [ ] **Step 5: Commit the green conversion change**

```text
git add emulador/src/app/lotaje/sizing-view-model.ts emulador/src/app/lotaje/sizing-view-model.spec.ts
git commit -m "fix(lotaje): size metals in MT5 points"
```

### Task 3: Align Ficha and Angular host coverage

**Files:**
- Modify: `emulador/src/app/lotaje/lotaje-view.ts:867-876`
- Modify: `emulador/src/app/lotaje/lotaje-view.spec.ts:573-619`
- Modify: `emulador/src/app/pages/calculadora/calculadora-page.component.spec.ts:221-260,463-485,560-573`

**Consumes:** generated `AssetSpec.pointSize` and the view-model behaviour from Task 2.

**Produces:** UI evidence that the Ficha and calculator expose the approved semantics.

- [ ] **Step 1: Write failing Ficha and DOM successor tests**

Replace only assertions that encode XAUUSD raw-price distance with named successor assertions. The Ficha must verify the value comes from the generated record:

```ts
expect(fichaPointText).toContain(String(GENERATED_ASSETS['XAUUSD'].pointSize));
```

The calculator test must assert XAUUSD distance `10` produces displayed `pts`, the expected lot and `$50.00` risk, rather than merely checking one isolated value.

- [ ] **Step 2: Run the supported suite and confirm red**

Run: `npx ng test --watch=false`

Expected: Ficha still derives `10 ** -digits` or DOM pins preserve the pre-D.20.5 XAUUSD interpretation.

- [ ] **Step 3: Read the Ficha from the registry**

Use the resolved `pointSize` for generated/manual assets. Do not introduce a second price-unit derivation. If a heuristic asset has no point size, preserve the existing safe Ficha representation rather than fabricating MT5 data.

- [ ] **Step 4: Run all Angular gates**

Run:

```text
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npx ng test --watch=false
npm run lint
npm run build
```

Expected: all pass; only the known accepted build-budget warning may remain.

- [ ] **Step 5: Commit the green UI evidence**

```text
git add emulador/src/app/lotaje/lotaje-view.ts emulador/src/app/lotaje/lotaje-view.spec.ts emulador/src/app/pages/calculadora/calculadora-page.component.spec.ts
git commit -m "fix(lotaje): show MT5 point size in asset details"
```

### Task 4: Record evidence and hand back for audit

**Files:**
- Modify: `.superpowers/rfc-020/dev-log.md`

**Consumes:** green evidence from Tasks 1-3 and the owner-approved D.20.5 design.

**Produces:** an auditable close-out that makes the PR update and renewed audit possible.

- [ ] **Step 1: Record the decision and deviation**

Add the owner ruling, affected pre-existing test successors, MT5 `point` values, commit SHAs, test-count progression, all eight gate outputs, and this classified deviation:

```text
requires-attention: F21-2 landed on the existing RFC-020 PR branch by explicit owner instruction; final PASS at d2838fd predates these commits and requires a new whole-branch audit.
```

- [ ] **Step 2: Validate the original gold symptom in a real browser**

Use a real Chromium session only after the owner has authenticated personally; never request or enter credentials. Select XAUUSD, set account to `5000`, risk to `1`, Method B distance to `10`, and verify all of the following together:

```text
suffix = pts
price distance = 0.10
lot = 5.00
actual risk = $50.00
```

Switch to Method A with entry `2650`; the derived SL must be `2649.9`. Switch back and confirm distance `10`. Record the browser, observed values and result in the ledger. This is the original failure condition; unit tests alone are not its final evidence.

- [ ] **Step 3: Verify the complete pipeline and frontend evidence fresh**

Run, sequentially:

```text
# pipeline/
python -m pytest -q
ruff check .
ruff format --check .

# emulador/
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.spec.json --noEmit
npx ng test --watch=false
npm run lint
npm run build
```

Expected: all commands pass. Report exact counts and build output; do not claim the branch is audited PASS.

- [ ] **Step 4: Commit, push, and request a fresh audit**

```text
git add .superpowers/rfc-020/dev-log.md
git commit -m "chore(sdd): record F21-2 evidence"
git push
```

The existing PR updates from the push. Do not edit the PR while its owner is coordinating it. Request a separate whole-branch audit before merge.

## Plan Self-Review

- **Spec coverage:** Tasks 1-3 cover MT5 provenance, the single conversion, all consumers, Ficha and UI evidence. Task 4 records the approved branch deviation and fresh gates.
- **No placeholders:** every task names paths, expected assertions, commands, interfaces and commit scopes.
- **Type consistency:** `pointSize` originates as generated `number`, becomes `AssetSpec.pointSize: number | null`, and is consumed by one view-model conversion policy.
