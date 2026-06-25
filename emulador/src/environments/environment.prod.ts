/**
 * Production environment (swapped in by angular.json fileReplacements for the
 * `production` build configuration). Same shape as the dev environment:
 * Supabase project + public R2 bucket base URL.
 */
export const environment: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  marketDataBaseUrl: string;
} = {
  supabaseUrl: 'https://nfcgfrsxvdvuasbgrxdy.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mY2dmcnN4dmR2dWFzYmdyeGR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5ODAyMjcsImV4cCI6MjA5NzU1NjIyN30.8EbJqNnNSiiFT8x-57HmZCD3eIoGFhQKaXGWBnL45TI',
  // public base URL of the R2 bucket (manifest.json + parquet served from here).
  marketDataBaseUrl: 'https://pub-e67bee09f18745d49ba2ea16e15b537d.r2.dev',
};
