import { Timeframe } from '../../models';
import { MarketDataRepository } from '../../domain/market-data.repository';
import { PendingCsv } from './workspaces.actions';

/**
 * Reads each anchor timeframe's cached candles for `symbol` and packs them as
 * the `PendingCsv[]` carried by `switchAsset({ thenLoad })`. Centralizes the
 * read-and-pack that the wizard (`confirmR2`) and the sessions page
 * (`restoreSession`, `dispatchOpen`) all need, so the chart already has data
 * before the replay cursor is positioned (the restore-race fix).
 */
export function loadAnchorCandles(
  repo: MarketDataRepository,
  symbol: string,
  tfs: Timeframe[],
): Promise<PendingCsv[]> {
  return Promise.all(
    tfs.map(async (tf) => ({
      tf,
      candles: await repo.getCandles(symbol, tf),
      fileName: `${symbol.toLowerCase()}_${tf.toLowerCase()}.csv`,
    })),
  );
}
