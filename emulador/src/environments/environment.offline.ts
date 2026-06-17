/**
 * Static, backend-less build (Cloudflare Pages / any static host, $0).
 * `offlineOnly` short-circuits the auth session check straight to guest and
 * makes every backend-only surface use the local IndexedDB catalog instead.
 * Swapped in by angular.json fileReplacements for the `offline` configuration.
 */
export const environment: {
  backendUrl: string;
  registrationEnabled: boolean;
  offlineOnly: boolean;
  guestModeEnabled: boolean;
  dataSource: 'csv' | 'r2';
} = {
  backendUrl: '',
  registrationEnabled: false,
  offlineOnly: true,
  guestModeEnabled: true,
  // 'csv' keeps the legacy CSV/series-store path; 'r2' switches to the R2/Parquet candles store
  dataSource: 'csv',
};
