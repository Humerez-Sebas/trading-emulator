import type { DatasetRecord } from '../../services/market-data-db';
import type { Manifest, ManifestTf } from '../../services/market-data/manifest.service';

/**
 * Pure, Angular-free diffing between the R2 `manifest.json` and the locally
 * downloaded `datasets` IndexedDB store. Produces the per-symbol catalog the
 * Markets R2 hub UI renders (downloaded / update-available per partition).
 */

/** Per-symbol catalog entry: every manifest partition with its local status. */
export interface AssetCatalogEntry {
  symbol: string;
  partitions: {
    tf: ManifestTf;
    partition: string;
    downloaded: boolean;
    updateAvailable: boolean;
  }[];
}

/** Timeframe iteration order within a symbol: m1, then h1, then d1. */
const TF_ORDER: ManifestTf[] = ['m1', 'h1', 'd1'];

/** Uppercase form of a manifest tf, matching `DatasetRecord.timeframe`. */
function toUpperTf(tf: ManifestTf): string {
  return tf.toUpperCase();
}

/**
 * Diffs `manifest` against the locally downloaded `datasets` and returns one
 * {@link AssetCatalogEntry} per manifest symbol, in alphabetical symbol order.
 * Within a symbol, partitions are iterated tf-by-tf in `m1` → `h1` → `d1`
 * order, and ascending by partition key within each tf (year strings for
 * `m1`, the single `"all"` key for `h1`/`d1`).
 *
 * A partition is `downloaded` when a `DatasetRecord` exists with the composite
 * id `${symbol}|${TF}|${partition}` (TF uppercase). `updateAvailable` is true
 * only when downloaded AND the local record's etag differs from the
 * manifest's etag for that partition.
 */
export function buildCatalog(manifest: Manifest, datasets: DatasetRecord[]): AssetCatalogEntry[] {
  const localById = new Map<string, DatasetRecord>();
  for (const d of datasets) localById.set(d.id, d);

  const symbols = Object.keys(manifest.symbols ?? {}).sort();

  return symbols.map((symbol) => {
    const manifestSymbol = manifest.symbols[symbol];
    const partitions: AssetCatalogEntry['partitions'] = [];

    for (const tf of TF_ORDER) {
      const tfPartitions = manifestSymbol[tf];
      if (!tfPartitions) continue;

      const partitionKeys = Object.keys(tfPartitions).sort();
      for (const partition of partitionKeys) {
        const manifestEntry = tfPartitions[partition];
        const localId = `${symbol}|${toUpperTf(tf)}|${partition}`;
        const localRecord = localById.get(localId);

        const downloaded = !!localRecord;
        const updateAvailable = !!localRecord && localRecord.etag !== manifestEntry.etag;

        partitions.push({ tf, partition, downloaded, updateAvailable });
      }
    }

    return { symbol, partitions };
  });
}
