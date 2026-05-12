import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { createClient } from "@/lib/supabase/server";

/**
 * `GET /api/theses/[slug]`: prefer Bearer JWT (`authFetch`), fall back to cookie session, else anonymous
 * Supabase client for catalog-only reads.
 */
export async function getSupabaseAndUserIdForThesisDetailApi(
  req: Request,
): Promise<{ supabase: SupabaseClient; userId: string | null }> {
  const auth = await getAuthedSupabase(req);
  if (auth) return { supabase: auth.sb, userId: auth.user.id };
  return { supabase: await createClient(), userId: null };
}
