import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { WorkspaceDbService } from '../../services/workspace-db.service';
import { needsR2Onboarding } from './onboarding-decision';

/**
 * Routes a first-time user to the Markets R2 data hub on first launch.
 *
 * Checks the `datasets` store: an empty cache means nothing has been
 * downloaded yet, so the user is redirected to `/mercados` (the R2 hub, where
 * data is downloaded); once any dataset exists, the emulator loads normally.
 * The `/mercados` route does NOT carry this guard, so there is no redirect loop.
 */
export const r2OnboardingGuard: CanActivateFn = async () => {
  const db = inject(WorkspaceDbService);
  const router = inject(Router);
  const datasets = await db.listDatasets();
  return needsR2Onboarding(datasets.length) ? router.createUrlTree(['/mercados']) : true;
};
