import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Public base URL of the R2 bucket the manifest and Parquet files are served
 * from (no trailing slash required). Empty until configured for the r2 data
 * source. Provided as a DI token so `@Injectable` services can take it as a
 * constructor dependency (a bare `string` parameter is not a valid Angular
 * injection token — NG2003), while tests still construct the services
 * directly with `new Service(url)`.
 */
export const MARKET_DATA_BASE_URL = new InjectionToken<string>('MARKET_DATA_BASE_URL', {
  providedIn: 'root',
  factory: () => environment.marketDataBaseUrl,
});
