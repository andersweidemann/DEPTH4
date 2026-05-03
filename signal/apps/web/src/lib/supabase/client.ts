import { createBrowserClient } from "@supabase/ssr";

import { normalizeSupabaseAnonKey, normalizeSupabaseUrl } from "@/lib/supabase/env";

/** Plausible JWT-shaped placeholders so SSG/CI build succeeds; set real values in Vercel. */
const PL = "https://build-placeholder.supabase.co";
const PKEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJidWlsZC1wbGFjZWhvbGRlciJ9.000";

export function createClient() {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) || PL;
  const key = normalizeSupabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || PKEY;
  return createBrowserClient(url, key);
}
