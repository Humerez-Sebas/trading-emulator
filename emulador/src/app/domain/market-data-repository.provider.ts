import { WorkspaceDbService } from '../services/workspace-db.service';
import { environment } from '../../environments/environment';
import { MarketDataRepository, pickMarketDataRepository } from './market-data.repository';
import { IndexedDbMarketDataRepository } from './indexed-db.repository';
import { CsvMarketDataRepository } from './csv-legacy.repository';

/**
 * Angular factory provider that binds the `MarketDataRepository` token to
 * the correct implementation based on `environment.dataSource`.
 *
 * Default (`'csv'`) keeps the existing CSV/IndexedDB-series behaviour.
 * Setting `'r2'` switches to the R2/Parquet candles store.
 *
 * Add to the `providers` array in `app.config.ts`:
 * ```ts
 * provideMarketDataRepository()
 * ```
 */
export function provideMarketDataRepository() {
  return {
    provide: MarketDataRepository,
    useFactory: (svc: WorkspaceDbService): MarketDataRepository =>
      pickMarketDataRepository(environment.dataSource, {
        idb: new IndexedDbMarketDataRepository(),
        csv: new CsvMarketDataRepository(svc),
      }),
    deps: [WorkspaceDbService],
  };
}
