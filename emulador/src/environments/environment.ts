/** Dev environment. The backend URL is the docker-compose default. */
export const environment: {
  backendUrl: string;
  registrationEnabled: boolean;
  offlineOnly: boolean;
  guestModeEnabled: boolean;
  dataSource: 'csv' | 'r2';
} = {
  backendUrl: 'http://localhost:8000',
  // shows/hides the "create account" link; mirrors the backend registration gate
  registrationEnabled: true,
  // build-time mode flags (see environment.offline.ts for the static build)
  offlineOnly: false,
  guestModeEnabled: true,
  // 'csv' keeps the legacy CSV/series-store path; 'r2' switches to the R2/Parquet candles store
  dataSource: 'csv',
};
