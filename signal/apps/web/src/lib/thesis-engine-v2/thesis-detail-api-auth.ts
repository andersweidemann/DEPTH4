import type { SupabaseClient } from "@supabase/supabase-js";
import { isDepth4PublicReadMode } from "@/lib/depth4-public-read-mode";
import { getAuthedSupabase } from "@/lib/supabase/auth-from-request";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role-client";

/**
 * `GET /api/theses/[slug]`: cookie session first, then Bearer JWT, else anonymous Supabase client
 * for catalog / public reads.
 */
export async function getSupabaseAndUserIdForThesisDetailApi(
  req: Request,
): Promise<{ supabase: SupabaseClient; userId: string | null }> {
  const auth = await getAuthedSupabase(req);
  if (auth) return { supabase: auth.sb, userId: auth.user.id };
  if (isDepth4PublicReadMode()) {
    const svc = createServiceRoleClient();
    if (svc) return { supabase: svc, userId: null };
  }
  return { supabase: await createClient(), userId: null };
}
