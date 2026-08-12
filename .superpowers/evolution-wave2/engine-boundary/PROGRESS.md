# Wave 2 / Agent C — Engine Boundary Restoration — PROGRESS

Worktree: `C:\Users\78701\Desktop\trading-emulator-engine-boundary`
Branch: `agent/engine-boundary-restoration`
Base SHA: `894d72be95f8ad4b8d63e629114e486e825b13d7`

## STATUS

RECON COMPLETE — design chosen, implementation not started.

## COMPLETED

- C1 recon: located the migration scaffolding and every consumer (see EVIDENCE).

## IN FLIGHT

- Nothing yet.

## NOT STARTED

- Implementation of the new engine query API.
- TradingCapability placement-preview API.
- `registerCapability` constructor injection.
- Tests + negative probes.
- I1 detector.
- Reports.

## EVIDENCE

Scaffolding (the "bridge"):
- `emulador/src/app/domain/chart/chart-engine.ts:24-30` — `// TODO: Eliminar esta exposición
  directa en RFC-004/RFC-005 una vez que DrawingsCapability y TradingCapability estén
  implementados.` + `get chartApi(): IChartApi` + `get seriesApi(): ISeriesApi<'Candlestick'>`.
- `emulador/src/app/domain/chart/capability.ts:16-20` — the OTHER documented sunset
  condition: `init` was expected to be extended to carry the main series; until then the
  `seriesApi` bridge getter covers that access.

Consumers (raw grep, `emulador/src`, `*.ts`):
- `chart.component.ts:630-631` — the only production reads of both getters.
- `frozen-scene-host.component.ts:298-300` — 3 further `engine.seriesApi` reads (capability
  construction).
- Fakes only: `frozen-scene-host.component.spec.ts:47-48`,
  `reflection-cabin-page.component.spec.ts:18-19`.

## NEGATIVE PROBES

- Not run yet.

## DEAD ENDS & REFUTED HYPOTHESES

- (pending)

## NEXT STEPS

1. `npm ci` in `emulador/`.
2. Implement.

## RESUME BRIEF

Read this file, then `ENGINE_BOUNDARY_RESTORATION_REPORT.md` in the same directory.
