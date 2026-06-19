import type { DatasetRecord } from '../../services/market-data-db';
import type { Manifest, ManifestTf } from '../../services/market-data/manifest.service';

/**
 * Pure, Angular-free helpers for the Storage Manager so they unit-test under
 * plain vitest. The orchestration that touches IndexedDB / the network lives in
 * `storage-manager.service.ts`.
 */

/** Total bytes the cached datasets occupy (from their manifest `size`). */
export function datasetTotalBytes(datasets: DatasetRecord[]): number {
  return datasets.reduce((sum, d) => sum + (d.size || 0), 0);
}

/**
 * Ids of locally-cached datasets whose etag differs from the current manifest
 * (an update is available). Datasets absent from the manifest are NOT flagged —
 * they are stale-but-removed upstream, not "updatable".
 */
export function updatedDatasetIds(datasets: DatasetRecord[], manifest: Manifest): Set<string> {
  const updated = new Set<string>();
  for (const d of datasets) {
    const tf = d.timeframe.toLowerCase() as ManifestTf;
    const entry = manifest.symbols?.[d.symbol]?.[tf]?.[d.year];
    if (entry && entry.etag !== d.etag) updated.add(d.id);
  }
  return updated;
}

/** Human-readable byte size, e.g. `1.5 MB`. Binary units (1024). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  // whole bytes show no decimals; larger units show one
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}
