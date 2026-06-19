import type { OnboardingJob } from '../../services/market-data/data-onboarding.service';
import type { AssetCatalogEntry } from './r2-catalog.logic';

/**
 * Pure, Angular-free job-building for the Markets R2 hub.
 *
 * Translates a catalog entry's partitions into the {@link OnboardingJob}s the
 * {@link DataOnboardingService} runs. `m1` jobs carry the year string as their
 * partition; `h1`/`d1` partitions use the sentinel `'all'`, so their job `year`
 * is always `'all'` (matching `all.parquet`) regardless of the catalog key.
 */

type Partition = AssetCatalogEntry['partitions'][number];

/** A single partition → its onboarding job (h1/d1 always use `year: 'all'`). */
export function partitionToJob(symbol: string, p: Partition): OnboardingJob {
  return { symbol, tf: p.tf, year: p.tf === 'm1' ? p.partition : 'all' };
}

/**
 * Jobs for the partitions a user wants to fetch for one symbol: those not yet
 * downloaded, plus any with an upstream update available (re-download refreshes
 * the stale copy). Returns `[]` when everything is current.
 */
export function buildMissingJobs(entry: AssetCatalogEntry): OnboardingJob[] {
  return entry.partitions
    .filter((p) => !p.downloaded || p.updateAvailable)
    .map((p) => partitionToJob(entry.symbol, p));
}

/** True when a symbol has at least one partition to download or update. */
export function hasPendingPartitions(entry: AssetCatalogEntry): boolean {
  return entry.partitions.some((p) => !p.downloaded || p.updateAvailable);
}
