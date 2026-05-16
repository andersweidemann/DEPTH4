import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/supabase/env";

/** Service-role Supabase client for server-only reads/writes that bypass RLS (cron, public catalog reads). */
export function createServiceRoleClient(): SupabaseClient | null {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !service) return null;
  return createSupabaseJsClient(url, service, { auth: { persistSession: false } });
}
