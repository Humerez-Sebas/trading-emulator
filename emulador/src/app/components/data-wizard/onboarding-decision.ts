/**
 * Pure decision for the first-launch redirect, kept in its own Angular-free
 * module so it unit-tests under plain vitest (importing the guard would pull in
 * `@angular/router`, which needs the Angular compiler in a non-TestBed env).
 *
 * Only the R2 data source has a wizard, and only when nothing has been ingested
 * yet (the `datasets` cache is empty).
 */
export function needsR2Onboarding(dataSource: 'csv' | 'r2', datasetCount: number): boolean {
  return dataSource === 'r2' && datasetCount === 0;
}
