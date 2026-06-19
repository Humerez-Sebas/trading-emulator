/**
 * Production environment (swapped in by angular.json fileReplacements for the
 * `production` build configuration).
 *
 * `backendUrl: ''` makes every API call same-origin (relative path), which is
 * how the full-stack Docker deploy works: nginx serves this SPA and reverse-
 * proxies the backend routes (/auth, /symbols, /candles, /ingest, /user,
 * /health) to the API container. Same-origin means no CORS and SameSite=Lax
 * cookies just work.
 *
 * For a split deploy (frontend and API on different domains, e.g. Cloudflare
 * Pages + Render), set this to the absolute API URL such as
 * 'https://your-api.onrender.com' and configure the backend with
 * COOKIE_SAMESITE=none, COOKIE_SECURE=true and CORS_ORIGINS=<frontend origin>.
 */
export const environment: {
  backendUrl: string;
  registrationEnabled: boolean;
  offlineOnly: boolean;
  guestModeEnabled: boolean;
  dataSource: 'csv' | 'r2';
  marketDataBaseUrl: string;
} = {
  backendUrl: '',
  registrationEnabled: false,
  offlineOnly: false,
  guestModeEnabled: true,
  // 'csv' keeps the legacy CSV/series-store path; 'r2' switches to the R2/Parquet candles store
  dataSource: 'r2',
  // public base URL of the R2 bucket (manifest.json + parquet served from here).
  // Empty by default; set it for the r2 deployment. Only used when dataSource === 'r2'.
  marketDataBaseUrl: 'https://pub-e67bee09f18745d49ba2ea16e15b537d.r2.dev',
};
