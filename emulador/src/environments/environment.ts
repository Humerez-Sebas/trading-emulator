/** Dev environment. The backend URL is the docker-compose default. */
export const environment: {
  backendUrl: string;
  registrationEnabled: boolean;
  offlineOnly: boolean;
  guestModeEnabled: boolean;
  dataSource: 'csv' | 'r2';
  marketDataBaseUrl: string;
} = {
  backendUrl: 'http://localhost:8000',
  // shows/hides the "create account" link; mirrors the backend registration gate
  registrationEnabled: true,
  // build-time mode flags (see environment.offline.ts for the static build)
  offlineOnly: false,
  guestModeEnabled: true,
  // 'csv' keeps the legacy CSV/series-store path; 'r2' switches to the R2/Parquet candles store
  dataSource: 'r2',
  // public base URL of the R2 bucket (manifest.json + parquet served from here).
  // Empty by default; set it for the r2 deployment. Only used when dataSource === 'r2'.
  marketDataBaseUrl: 'https://pub-e67bee09f18745d49ba2ea16e15b537d.r2.dev',
};
