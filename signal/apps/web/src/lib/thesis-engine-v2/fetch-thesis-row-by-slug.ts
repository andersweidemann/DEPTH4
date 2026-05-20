import type { SupabaseClient } from "@supabase/supabase-js";
import {
  THESIS_ORIGIN_AI,
  THESIS_ORIGIN_USER,
  THESIS_ORIGINS_READABLE_BY_SLUG,
} from "@/lib/thesis-engine-v2/thesis-db-origins";

const THESIS_ROW_BY_SLUG_SELECT =
  "id, slug, title, micro_label, body, scenario_probabilities, status, insider_flow, updated_at, thesis_origin, incentive_analysis, owner_user_id, lifecycle_state, quality_score";

export type ThesisRowBySlug = {
  id: string;
  slug: string;
  title: string;
  micro_label?: string | null;
  body?: unknown;
  scenario_probabilities?: unknown;
  status: string;
  insider_flow?: unknown;
  updated_at?: string | null;
  thesis_origin: string;
  incentive_analysis?: unknown;
  owner_user_id?: string | null;
  lifecycle_state?: string | null;
  quality_score?: number | null;
};

/**
 * Load a user-owned or ai_generated thesis row by slug.
 * Prefers the signed-in user's row when both could match (slug collision).
 */
export async function fetchThesisRowBySlug(
  supabase: SupabaseClient,
  slug: string,
  userId: string | null,
): Promise<ThesisRowBySlug | null> {
  const s = slug.trim();
  if (!s) return null;

  const { data, error } = await supabase
    .from("theses")
    .select(THESIS_ROW_BY_SLUG_SELECT)
    .eq("slug", s)
    .in("thesis_origin", [...THESIS_ORIGINS_READABLE_BY_SLUG]);

  if (error || !data?.length) return null;

  const rows = data as ThesisRowBySlug[];
  if (userId) {
    const owned = rows.find(
      (r) => r.thesis_origin === THESIS_ORIGIN_USER && r.owner_user_id === userId,
    );
    if (owned) return owned;
  }

  const ai = rows.find((r) => r.thesis_origin === THESIS_ORIGIN_AI);
  if (ai) return ai;

  // Anonymous / public read: allow a single readable row when slug is unambiguous.
  if (rows.length === 1) return rows[0]!;
  return null;
}
