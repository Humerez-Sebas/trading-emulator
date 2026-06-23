import { MarketDataRepository } from './market-data.repository';
import { IndexedDbMarketDataRepository } from './indexed-db.repository';

/** Binds the MarketDataRepository token to the R2/IndexedDB implementation. */
export function provideMarketDataRepository() {
  return { provide: MarketDataRepository, useClass: IndexedDbMarketDataRepository };
}
