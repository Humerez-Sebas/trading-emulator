/* eslint-disable @angular-eslint/prefer-inject -- constructor inject()-defaults keep this service unit-testable via direct construction (new Service(deps)) without TestBed; see services design note. */
import { Injectable } from '@angular/core';
import { Candle, Timeframe } from '../models';
import { WorkspaceDbService } from '../services/workspace-db.service';
import { MarketDataRepository } from './market-data.repository';

/**
 * Wraps the legacy CSV data path: reads candles from the `series` IndexedDB
 * store via {@link WorkspaceDbService}.
 *
 * This is the default (`dataSource: 'csv'`) implementation, preserving the
 * existing behaviour of `workspaces.effects.ts` while the R2 path matures.
 */
@Injectable()
export class CsvMarketDataRepository extends MarketDataRepository {
  constructor(private readonly workspaceDb: WorkspaceDbService) {
    super();
  }

  /** @inheritdoc */
  async getCandles(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
    const workspace = await this.workspaceDb.getWorkspace(symbol);
    return workspace?.series[timeframe] ?? [];
  }
}
