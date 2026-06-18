import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { needsR2Onboarding } from './onboarding-decision';

/**
 * Routes a first-time R2 user to the Data Wizard ("rendered on first launch").
 *
 * For the default `csv` data source this returns `true` immediately, so the
 * existing CSV onboarding flow is completely untouched. For `r2`, it checks the
 * `datasets` store: an empty cache means nothing has been downloaded yet, so the
 * user is redirected to `/data-wizard`; once any dataset exists, the emulator
 * loads normally. The wizard route itself does NOT carry this guard, so there is
 * no redirect loop.
 */
export const r2OnboardingGuard: CanActivateFn = async () => {
  if (environment.dataSource !== 'r2') return true;
  const db = inject(WorkspaceDbService);
  const router = inject(Router);
  const datasets = await db.listDatasets();
  return needsR2Onboarding(environment.dataSource, datasets.length)
    ? router.createUrlTree(['/data-wizard'])
    : true;
};
