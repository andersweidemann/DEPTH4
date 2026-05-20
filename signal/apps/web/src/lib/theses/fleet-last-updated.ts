import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";
import { createClient } from "@/lib/supabase/server";

const LIVE_STATUSES = ["ready", "watching", "active"] as const;

/** Latest `updated_at` across live surfaced theses (for app footer). */
export async function queryFleetLastUpdatedAt(sb?: SupabaseClient): Promise<string | null> {
  const client = sb ?? createServiceRoleClient() ?? (await createClient());
  const { data, error } = await client
    .from("theses")
    .select("updated_at")
    .in("status", [...LIVE_STATUSES])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.updated_at) return null;
  const iso = String(data.updated_at).trim();
  return iso && !Number.isNaN(Date.parse(iso)) ? iso : null;
}
