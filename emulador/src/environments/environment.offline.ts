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
  marketDataBaseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
} = {
  backendUrl: '',
  registrationEnabled: false,
  offlineOnly: true,
  guestModeEnabled: true,
  // 'csv' keeps the legacy CSV/series-store path; 'r2' switches to the R2/Parquet candles store
  dataSource: 'r2',
  // public base URL of the R2 bucket (manifest.json + parquet served from here).
  // Empty by default; set it for the r2 deployment. Only used when dataSource === 'r2'.
  marketDataBaseUrl: 'https://pub-e67bee09f18745d49ba2ea16e15b537d.r2.dev',
  supabaseUrl: 'https://nfcgfrsxvdvuasbgrxdy.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mY2dmcnN4dmR2dWFzYmdyeGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5ODAyMjcsImV4cCI6MjA5NzU1NjIyN30.8EbJqNnNSiiFT8x-57HmZCD3eIoGFhQKaXGWBnL45TI',
};
